import { getMergedLeaderboard } from "@/lib/merge";
import { LeaderboardError } from "@/lib/leaderboard";
import { apiError, json } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/leaderboard
 *
 * Ranking en vivo del endpoint oficial, mergeado con lo nuestro: nombre
 * patcheado, redes y estado de verificación. La página usa `getMergedLeaderboard`
 * directamente; esta ruta existe para consumo externo.
 */
export async function GET() {
  try {
    const board = await getMergedLeaderboard(60);

    return json({
      season: board.season,
      fetchedAt: board.fetchedAt.toISOString(),
      /** Jugadores en todo el ladder; `rows` es solo el top 1000 que sirve la API. */
      total: board.total,
      /**
       * Contra qué momento se calcularon los `delta24h`. No es exactamente
       * hace 24 h: es la corrida de sync más cercana anterior a ese corte.
       * Ausente mientras no haya ninguna, que es cuando ninguna fila trae delta.
       */
      ...(board.deltaSince ? { deltaSince: board.deltaSince.toISOString() } : {}),
      count: board.rows.length,
      rows: board.rows,
    });
  } catch (err) {
    if (err instanceof LeaderboardError) {
      return apiError(err.message, err.status);
    }
    console.error("GET /api/leaderboard falló:", err);
    return apiError("No se pudo obtener el leaderboard.", 500);
  }
}
