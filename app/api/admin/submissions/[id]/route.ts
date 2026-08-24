import { ObjectId, type Filter } from "mongodb";
import { playersCollection, submissionsCollection } from "@/lib/db";
import { apiError, json, readJson, requireAdminAuth } from "@/lib/api";
import { getAdminSession } from "@/lib/admin-auth";
import { findSubmissionById, toSubmissionView } from "@/lib/submissions";
import type { PlayerDoc, SocialField } from "@/lib/types";

export const dynamic = "force-dynamic";

const SOCIAL_FIELDS: SocialField[] = ["twitch", "youtube", "untapped"];
const MAX_REASON = 300;

interface Body {
  action?: "approve" | "reject";
  reason?: string;
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
          $unset: { verificationCode: "", verificationExpiresAt: "" },
        }
      );

      const updated = await findSubmissionById(id);
      return json({ ok: true, submission: toSubmissionView(updated!) });
    }

    // --- aprobar ---
    const players = await playersCollection();

    /**
     * El índice único de las redes solo aplica a `verified: true`, así que no
     * frena a dos aprobados sin prueba que declaren el mismo canal. Lo chequeamos
     * explícitamente: que el mismo Twitch aparezca en dos filas es exactamente
     * el tipo de error que este panel existe para evitar.
     */
    const claimed = SOCIAL_FIELDS.filter((f) => doc[f]).map(
      (f) => ({ [f]: doc[f] }) as Filter<PlayerDoc>
    );

    if (claimed.length > 0) {
      const conflict = await players.findOne({
        nameKey: { $ne: doc.nameKey },
        $or: claimed,
      });

      if (conflict) {
        return apiError(
          `Ese canal ya está asignado a "${conflict.playerName}". Revisá cuál de los dos corresponde antes de aprobar.`,
          409
        );
      }
    }

    const socials: Partial<Record<SocialField, string>> = {};
    for (const f of SOCIAL_FIELDS) if (doc[f]) socials[f] = doc[f];

    try {
      await players.updateOne(
        { nameKey: doc.nameKey },
        {
          $set: {
            playerName: doc.playerName,
            ...socials,
            ...(doc.allianceTag ? { alliance: doc.allianceTag } : {}),
            ...(doc.allianceName ? { allianceName: doc.allianceName } : {}),
            // El tick refleja la prueba de propiedad, no la aprobación.
            verified: doc.proofVerified,
            ...(doc.proofVerified ? { verifiedAt: doc.proofVerifiedAt ?? now } : {}),
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true }
      );

      /**
       * `lastRank` es SEMILLA, no dato: se escribe solo si todavía no hay uno.
       * Si el jugador ya venía trackeado, el sync tiene un valor más fresco y
       * pisarlo con el rank de la prueba sería retroceder. Va en un update
       * aparte porque `$setOnInsert` no cubre el caso "el doc ya existe pero
       * este campo no".
       */
      if (doc.proofRank !== undefined) {
        await players.updateOne(
          { nameKey: doc.nameKey, lastRank: { $exists: false } },
          { $set: { lastRank: doc.proofRank } }
        );
      }
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        return apiError(
          "Choque de índice único al escribir el jugador: ese canal ya pertenece a otra cuenta verificada.",
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
        $unset: { verificationCode: "", verificationExpiresAt: "" },
      }
    );

    const updated = await findSubmissionById(id);
    return json({ ok: true, submission: toSubmissionView(updated!) });
  } catch (err) {
    console.error("POST /api/admin/submissions/[id] falló:", err);
    return apiError("No se pudo procesar la revisión.", 500);
  }
}
