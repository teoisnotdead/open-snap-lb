import { getMergedLeaderboard } from "@/lib/merge";
import { clampRows, windowAround } from "@/lib/overlay";
import { toNameKey } from "@/lib/names";
import { apiError, json } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/overlay/[nameKey]?rows=5&rank=284
 *
 * Las pocas filas alrededor de un jugador, para que el overlay de OBS se
 * refresque sin volver a bajar el ladder entero.
 *
 * Existe separado de `/api/leaderboard` por el volumen: un overlay abierto
 * durante un stream de seis horas son ~360 peticiones, y devolver 1000 filas
 * cada vez para mostrar cinco es tirar ~100 MB por transmisión. Acá van cinco.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ nameKey: string }> }
) {
  const { nameKey: raw } = await ctx.params;
  const nameKey = toNameKey(decodeURIComponent(raw));
  if (!nameKey) return apiError("Falta el nombre del jugador.");

  const params = new URL(req.url).searchParams;
  const size = clampRows(params.get("rows"));
  const pinned = Number(params.get("rank"));

  try {
    /**
     * Los mismos 60 s de cache que la home. El overlay pregunta cada minuto,
     * así que en el peor caso muestra datos de dos minutos — y el ladder
     * oficial no se mueve más rápido que el cron que lo lee, que es horario.
     */
    const board = await getMergedLeaderboard(60);
    const win = windowAround(
      board.rows,
      nameKey,
      size,
      Number.isInteger(pinned) && pinned > 0 ? pinned : undefined
    );

    if (!win) return apiError("Ese jugador no está en el top 1000.", 404);

    return json({
      season: board.season,
      selfRank: win.selfRank,
      ambiguous: win.ambiguous,
      rows: win.rows.map((r) => ({
        rank: r.rank,
        displayName: r.displayName,
        score: r.score,
        delta24h: r.delta24h,
        verified: r.verified,
      })),
    });
  } catch (err) {
    console.error("GET /api/overlay/[nameKey] falló:", err);
    return apiError("No se pudo armar el overlay.", 500);
  }
}
