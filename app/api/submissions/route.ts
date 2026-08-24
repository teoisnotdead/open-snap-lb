import { submissionsCollection } from "@/lib/db";
import { fetchLeaderboard, indexByNameKey, LeaderboardError } from "@/lib/leaderboard";
import { apiError, json, readJson } from "@/lib/api";
import { toNameKey, isValidNameKey } from "@/lib/names";
import { generateStatusToken } from "@/lib/verification";
import {
  SOCIAL_PARSERS,
  CONTACT_PARSERS,
  parseAlliance,
  parseAllianceName,
} from "@/lib/socials";
import type { SocialField, SubmissionDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

const SOCIAL_FIELDS: SocialField[] = ["twitch", "youtube", "untapped"];
const CONTACT_FIELDS = ["discord", "email"] as const;

const MAX_NOTE = 500;

interface Body {
  playerName?: string;
  twitch?: string;
  youtube?: string;
  untapped?: string;
  allianceTag?: string;
  allianceName?: string;
  discord?: string;
  email?: string;
  note?: string;
}

/**
 * POST /api/submissions — crea una petición para aparecer en la tabla.
 *
 * NO publica nada: deja un documento en `pending` para que un admin lo revise.
 * Es el cambio de modelo respecto de la versión anterior, donde verificar el
 * código publicaba directo. El motivo está en `SubmissionDoc`: casi nada de lo
 * que se pide acá es verificable contra la API oficial.
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
  const socials: Partial<Record<SocialField, string>> = {};
  for (const field of SOCIAL_FIELDS) {
    const value = body?.[field]?.trim();
    if (!value) continue;
    const parsed = SOCIAL_PARSERS[field](value);
    if (!parsed.ok) return apiError(`${field}: ${parsed.error}`);
    socials[field] = parsed.value!;
  }

  const contact: Partial<Record<(typeof CONTACT_FIELDS)[number], string>> = {};
  for (const field of CONTACT_FIELDS) {
    const value = body?.[field]?.trim();
    if (!value) continue;
    const parsed = CONTACT_PARSERS[field](value);
    if (!parsed.ok) return apiError(`${field}: ${parsed.error}`);
    contact[field] = parsed.value!;
  }

  let allianceTag: string | undefined;
  if (body?.allianceTag?.trim()) {
    const parsed = parseAlliance(body.allianceTag.trim());
    if (!parsed.ok) return apiError(`allianceTag: ${parsed.error}`);
    allianceTag = parsed.value;
  }

  let allianceName: string | undefined;
  if (body?.allianceName?.trim()) {
    const parsed = parseAllianceName(body.allianceName.trim());
    if (!parsed.ok) return apiError(`allianceName: ${parsed.error}`);
    allianceName = parsed.value;
  }

  // Un nombre de alianza sin tag es dato huérfano: la tabla muestra el tag.
  if (allianceName && !allianceTag) {
    return apiError("Si indicás el nombre de la alianza, indicá también el tag.");
  }

  const note = body?.note?.trim();
  if (note && note.length > MAX_NOTE) {
    return apiError(`La nota no puede pasar de ${MAX_NOTE} caracteres.`);
  }

  // Tiene que haber algo que publicar...
  if (Object.keys(socials).length === 0 && !allianceTag) {
    return apiError("Indicá al menos una red o el tag de tu alianza.");
  }

  // ...y alguna forma de contactarte, porque si hay que rechazar o repreguntar
  // no existe otro canal: no hay cuentas ni notificaciones en el sitio.
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
      proofVerified: false,
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
        /** Aviso para la UI: con varias filas homónimas, conviene la prueba. */
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
