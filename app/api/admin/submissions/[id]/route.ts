import { ObjectId } from "mongodb";
import { playersCollection, submissionsCollection } from "@/lib/db";
import { apiError, json, readJson, requireAdminAuth } from "@/lib/api";
import { getAdminSession } from "@/lib/admin-auth";
import { fetchLeaderboard, indexByNameKey } from "@/lib/leaderboard";
import { findSocialConflict } from "@/lib/players";
import { SOCIAL_FIELDS } from "@/lib/profile-fields";
import { findSubmissionById, toSubmissionView } from "@/lib/submissions";
import type { LeaderboardRow, SocialField } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_REASON = 300;

interface Body {
  action?: "approve" | "reject";
  reason?: string;
  /** Puesto elegido cuando el nombre está repetido en el ladder. */
  rank?: number;
}

/**
 * Qué fila del ladder es esta petición.
 *
 * Con un nombre único no hay nada que decidir. Con varias filas homónimas hay
 * que elegir, y la elección importa: es la semilla `lastRank` que después usan
 * `disambiguate` en cada sync y el merge en cada render de la tabla. Sin ella,
 * un aprobado homónimo nunca muestra sus links ni acumula historial, porque no
 * sabemos cuál de las dos filas es.
 *
 * Antes esto lo resolvía el código de verificación, que devolvía el rank exacto
 * de la fila que había probado control. Al sacarlo, la decisión pasa a donde ya
 * estaba el criterio humano.
 *
 * Devuelve la fila elegida, `null` si no hay ninguna (se cayó del top 1000: se
 * aprueba igual, ya se resolverá cuando vuelva) o un error para el admin.
 */
function resolveRow(
  rows: LeaderboardRow[],
  chosen: number | undefined
): { row: LeaderboardRow | null } | { error: string } {
  if (rows.length === 0) return { row: null };
  if (rows.length === 1) return { row: rows[0] };

  if (chosen === undefined) {
    const list = rows.map((r) => "#" + r.rank + " (" + r.score + " SP)").join(", ");
    return {
      error: `Hay ${rows.length} jugadores con ese nombre en el ladder: ${list}. Elegí cuál es antes de aprobar.`,
    };
  }

  const row = rows.find((r) => r.rank === chosen);
  if (!row) {
    return {
      error: `El puesto #${chosen} ya no corresponde a ese nombre. Recargá la cola y volvé a elegir.`,
    };
  }

  return { row };
}

/**
 * POST /api/admin/submissions/[id] — aprueba o rechaza una petición.
 *
 * Aprobar es lo único que escribe en `players`, o sea lo único que publica algo.
 * Toda la ruta de entrada pública termina en un documento `pending` y nada más.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminAuth();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const body = await readJson<Body>(req);
  const action = body?.action;

  if (action !== "approve" && action !== "reject") {
    return apiError('`action` tiene que ser "approve" o "reject".');
  }

  const reason = body?.reason?.trim();
  const chosenRank =
    typeof body?.rank === "number" && Number.isInteger(body.rank) && body.rank > 0
      ? body.rank
      : undefined;

  // Rechazar sin motivo deja al solicitante sin nada que hacer con la
  // respuesta, y a vos sin memoria de por qué lo rechazaste.
  if (action === "reject" && !reason) {
    return apiError("Indicá el motivo del rechazo.");
  }
  if (reason && reason.length > MAX_REASON) {
    return apiError(`El motivo no puede pasar de ${MAX_REASON} caracteres.`);
  }

  try {
    const doc = await findSubmissionById(id);
    if (!doc) return apiError("Esa petición no existe.", 404);
    if (doc.status !== "pending") {
      return apiError(`Esa petición ya está ${doc.status}.`, 409);
    }

    const session = await getAdminSession();
    const now = new Date();
    const submissions = await submissionsCollection();

    if (action === "reject") {
      await submissions.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: "rejected",
            rejectionReason: reason,
            reviewedAt: now,
            reviewedBy: session?.user ?? "admin",
            updatedAt: now,
          },
        }
      );

      const updated = await findSubmissionById(id);
      return json({ ok: true, submission: toSubmissionView(updated!) });
    }

    // --- aprobar ---

    /**
     * El ladder se lee sin cache: si el admin eligió un puesto sobre una cola
     * que se renderizó hace unos minutos, hay que validarlo contra lo que hay
     * AHORA, no contra una respuesta guardada.
     *
     * Que no responda no puede bloquear la revisión —el panel tiene que andar
     * igual—, así que en ese caso se aprueba sin semilla de rank. Lo único que
     * se pierde es la desambiguación de un homónimo, y eso se puede rehacer.
     */
    let ladderRows: LeaderboardRow[] | null = null;
    try {
      const board = await fetchLeaderboard({ revalidate: false });
      ladderRows = indexByNameKey(board.rows).get(doc.nameKey) ?? [];
    } catch (err) {
      console.error("No se pudo leer el ladder al aprobar; sigo sin rank:", err);
    }

    let seedRank: number | undefined;
    if (ladderRows) {
      const resolved = resolveRow(ladderRows, chosenRank);
      if ("error" in resolved) return apiError(resolved.error, 409);
      seedRank = resolved.row?.rank;
    }

    const players = await playersCollection();

    const socials: Partial<Record<SocialField, string>> = {};
    for (const f of SOCIAL_FIELDS) if (doc[f]) socials[f] = doc[f];

    // El índice único ya cubre este caso, pero se pregunta antes para que el
    // admin lea "ese canal ya está asignado a X" en vez de un E11000, que no
    // dice a quién. Misma comprobación que hace la edición por código.
    const conflict = await findSocialConflict(socials, doc.nameKey);
    if (conflict) {
      return apiError(
        `Ese canal ya está asignado a "${conflict.playerName}". Revisá cuál de los dos corresponde antes de aprobar.`,
        409
      );
    }

    try {
      await players.updateOne(
        { nameKey: doc.nameKey },
        {
          $set: {
            playerName: doc.playerName,
            ...socials,
            ...(doc.allianceTag ? { alliance: doc.allianceTag } : {}),
            ...(doc.allianceName ? { allianceName: doc.allianceName } : {}),
            /**
             * Aprobar ES verificar. Esto copiaba `proofVerified`, y podía haber
             * aprobados sin tick; hoy el criterio es uno solo: si un humano
             * revisó la petición y la aceptó, ya dio por buena la identidad.
             */
            verified: true,
            verifiedAt: now,
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );

      /**
       * `lastRank` es SEMILLA, no dato: se escribe solo si todavía no hay uno.
       * Si el jugador ya venía trackeado, el sync tiene un valor más fresco y
       * pisarlo con el rank de la aprobación sería retroceder. Va en un update
       * aparte porque `$setOnInsert` no cubre el caso "el doc ya existe pero
       * este campo no".
       */
      if (seedRank !== undefined) {
        await players.updateOne(
          { nameKey: doc.nameKey, lastRank: { $exists: false } },
          { $set: { lastRank: seedRank } }
        );
      }
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        return apiError(
          "Choque de índice único al escribir el jugador: ese canal ya pertenece a otra cuenta.",
          409
        );
      }
      throw err;
    }

    await submissions.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: "approved",
          reviewedAt: now,
          reviewedBy: session?.user ?? "admin",
          updatedAt: now,
        },
      }
    );

    const updated = await findSubmissionById(id);
    return json({ ok: true, submission: toSubmissionView(updated!) });
  } catch (err) {
    console.error("POST /api/admin/submissions/[id] falló:", err);
    return apiError("No se pudo procesar la revisión.", 500);
  }
}
