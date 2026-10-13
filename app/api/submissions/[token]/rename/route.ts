import { apiError, json, readJson } from "@/lib/api";
import { fetchLeaderboard, LeaderboardError } from "@/lib/leaderboard";
import { renamePlayer } from "@/lib/rename";
import { findSubmissionByToken, toPublicStatus } from "@/lib/submissions";

export const dynamic = "force-dynamic";

interface Body {
  playerName?: string;
  /** El puesto de la fila elegida. Desempata un nombre repetido. */
  rank?: number;
}

/**
 * POST /api/submissions/[token]/rename — el jugador muda su ficha al nombre que
 * tiene ahora en el juego.
 *
 * Es la otra escritura pública que publica sin pasar por el panel, junto con el
 * `PATCH` de al lado, y la única que toca la identidad. Por qué no vuelve a la
 * cola, y qué la acota a cambio, está en `lib/rename.ts`.
 *
 * Acá solo se resuelve quién pide y contra qué ladder se valida.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await readJson<Body>(req);

  const playerName = body?.playerName?.trim();
  if (!playerName) return apiError("Falta `playerName`.");

  const rank =
    typeof body?.rank === "number" && Number.isInteger(body.rank) && body.rank > 0
      ? body.rank
      : undefined;

  try {
    const doc = await findSubmissionByToken(token);

    // Mismo silencio que en GET y PATCH: un código mal formado y uno
    // inexistente dan lo mismo.
    if (!doc) return apiError("No encontramos ninguna petición con ese código.", 404);

    if (doc.status !== "approved") {
      return apiError(
        doc.status === "pending"
          ? "Tu petición todavía está en revisión: no hay una ficha publicada que mover."
          : "Esta petición no fue aprobada, así que no hay ficha que mover. Envía una nueva con tu nombre actual.",
        409
      );
    }

    /**
     * Sin cache, igual que al aprobar y por el mismo motivo: las dos reglas que
     * hacen segura esta ruta —el nombre viejo ya no está, el nuevo sí— se
     * contestan contra el ladder de AHORA.
     *
     * Y al revés que al aprobar, si el ladder no responde no se sigue sin él:
     * allá era contexto para una decisión humana, acá es la puerta.
     */
    const board = await fetchLeaderboard({ revalidate: false });

    const result = await renamePlayer(doc, board.rows, { playerName, rank });
    if (!result.ok) return apiError(result.error, result.status);

    const updated = await findSubmissionByToken(token);
    return json({ ok: true, ...toPublicStatus(updated!) });
  } catch (err) {
    if (err instanceof LeaderboardError) return apiError(err.message, err.status);
    console.error("POST /api/submissions/[token]/rename falló:", err);
    return apiError("No se pudo mover la ficha.", 500);
  }
}
