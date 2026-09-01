import { submissionsCollection } from "@/lib/db";
import { fetchLeaderboard, indexByNameKey, LeaderboardError } from "@/lib/leaderboard";
import { apiError, json, readJson } from "@/lib/api";
import { toNameKey, isValidNameKey } from "@/lib/names";
import { generateStatusToken } from "@/lib/tokens";
import { CONTACT_PARSERS } from "@/lib/socials";
import { parseProfileFields, type ProfileFieldsInput } from "@/lib/profile-fields";
import type { SubmissionDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

const CONTACT_FIELDS = ["discord", "email"] as const;

const MAX_NOTE = 500;

interface Body extends ProfileFieldsInput {
  playerName?: string;
  discord?: string;
  email?: string;
  note?: string;
}

/**
 * POST /api/submissions — crea una petición para aparecer en la tabla.
 *
 * NO publica nada: deja un documento en `pending` para que un admin lo revise.
 * El motivo está en `SubmissionDoc`: casi nada de lo que se pide acá es
 * verificable contra la API oficial, así que el único filtro posible —y toda la
 * verificación que hay— es el ojo humano del panel.
 */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  const rawName = body?.playerName?.trim();

  if (!rawName) return apiError("Falta `playerName`.");

  const nameKey = toNameKey(rawName);
  if (!isValidNameKey(nameKey)) {
    return apiError("Nombre inválido. El juego permite hasta 20 caracteres.");
  }

  // --- parseo de todo ANTES de tocar la base ---

  /**
   * Los campos de perfil se validan con la misma función que la edición por
   * código (`PATCH /api/submissions/[token]`), incluida la regla de "algo que
   * publicar": lo que no se puede pedir tampoco se puede colar editando.
   */
  const profile = await parseProfileFields(body, { nameKey });
  if (!profile.ok) return apiError(profile.error);
  const { socials, allianceTag, allianceName } = profile.fields;

  const contact: Partial<Record<(typeof CONTACT_FIELDS)[number], string>> = {};
  for (const field of CONTACT_FIELDS) {
    const value = body?.[field]?.trim();
    if (!value) continue;
    const parsed = CONTACT_PARSERS[field](value);
    if (!parsed.ok) return apiError(`${field}: ${parsed.error}`);
    contact[field] = parsed.value!;
  }

  const note = body?.note?.trim();
  if (note && note.length > MAX_NOTE) {
    return apiError(`La nota no puede pasar de ${MAX_NOTE} caracteres.`);
  }

  // Ya hay algo que publicar —lo garantiza `parseProfileFields`—, pero además
  // hace falta alguna forma de contactarte: si hay que rechazar o repreguntar
  // no existe otro canal, porque no hay cuentas ni notificaciones en el sitio.
  if (Object.keys(contact).length === 0) {
    return apiError("Dejá al menos un contacto (Discord o email) para poder responderte.");
  }

  try {
    // Anti-basura: solo se puede pedir por una cuenta que esté en el ladder.
    const board = await fetchLeaderboard({ revalidate: 60 });
    const matches = indexByNameKey(board.rows).get(nameKey);

    if (!matches || matches.length === 0) {
      return apiError(
        `No encontramos a "${rawName}" en el top ${board.rows.length} actual. Solo se puede pedir por una cuenta que esté en el leaderboard.`,
        404
      );
    }

    const now = new Date();
    const doc: SubmissionDoc = {
      statusToken: generateStatusToken(),
      nameKey,
      playerName: matches[0].playerName,
      ...socials,
      ...(allianceTag ? { allianceTag } : {}),
      ...(allianceName ? { allianceName } : {}),
      ...contact,
      ...(note ? { note } : {}),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    const submissions = await submissionsCollection();

    /**
     * Dos índices únicos pueden tirar E11000 acá y significan cosas opuestas:
     * `uniq_pending_per_player` es un error del usuario (ya pidió), mientras que
     * `uniq_status_token` es mala suerte nuestra y se arregla reintentando. El
     * mensaje de Mongo trae el nombre del índice, que es lo único que permite
     * distinguirlos — sin eso le diríamos "ya pediste" a alguien que no pidió.
     */
    for (let attempt = 0; ; attempt++) {
      try {
        await submissions.insertOne(doc);
        break;
      } catch (err) {
        const e = err as { code?: number; message?: string };
        if (e.code !== 11000) throw err;

        if (e.message?.includes("uniq_status_token")) {
          // 30^12 hace esto prácticamente imposible; si igual pasa, otro token.
          if (attempt >= 2) throw err;
          doc.statusToken = generateStatusToken();
          continue;
        }

        return apiError(
          "Ya hay una petición pendiente para esa cuenta. Si perdiste tu código de seguimiento, escribinos.",
          409
        );
      }
    }

    return json(
      {
        ok: true,
        /** La llave de seguimiento. Es lo único con lo que puede volver. */
        token: doc.statusToken,
        nameKey,
        playerName: matches[0].playerName,
        status: "pending",
        /**
         * Aviso para la UI. Con varias filas homónimas el admin tiene que
         * elegir cuál es al aprobar, así que conviene que la nota lo aclare.
         */
        ambiguous: matches.length > 1,
      },
      201
    );
  } catch (err) {
    if (err instanceof LeaderboardError) return apiError(err.message, err.status);
    console.error("POST /api/submissions falló:", err);
    return apiError("No se pudo registrar la petición.", 500);
  }
}
