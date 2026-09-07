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
    // Sin caché nuestro, por lo mismo que la home: ver el comentario largo en
    // app/[lang]/page.tsx.
    const board = await getMergedLeaderboard(false);

    return json({
      season: board.season,
      /** Cuándo lo pedimos nosotros. Para frescura mirá `dataAt`. */
      fetchedAt: board.fetchedAt.toISOString(),
      /**
       * Cuándo generó el origen estos números, de su header `Date`. Puede
       * quedar varios minutos atrás de `fetchedAt` sin que nada esté mal: hay
       * un CloudFront de por medio que no es nuestro. Ver `originDate`.
       */
      dataAt: board.dataAt.toISOString(),
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
