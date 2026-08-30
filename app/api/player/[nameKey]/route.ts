import { playersCollection } from "@/lib/db";
import { loadHistory } from "@/lib/history";
import { apiError, json } from "@/lib/api";
import { toNameKey } from "@/lib/names";

export const dynamic = "force-dynamic";

/**
 * GET /api/player/[nameKey]?season=YYYY-MM
 *
 * Perfil + histórico. Es lo que alimenta la gráfica de recharts de la Fase 3.
 * No estaba en el plan original, pero sin esto la vista de detalle no tiene de
 * dónde leer.
 *
 * El historial sale de `loadHistory`, la MISMA fuente que la ficha web: es
 * diario para cualquier jugador del ladder y horario desde que se vinculó. Que
 * la API y la página leyeran de distinto lado fue un bug esperando a pasar —
 * cada punto trae `daily` para que quien consuma esto sepa qué resolución
 * tiene en la mano.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ nameKey: string }> }
) {
  const { nameKey: raw } = await ctx.params;
  const nameKey = toNameKey(decodeURIComponent(raw));

  if (!nameKey) return apiError("Falta el nombre del jugador.");

  try {
    const players = await playersCollection();
    /**
     * Sin proyección: `players` ya es la colección pública. Acá se excluía el
     * código de verificación, que dejó de existir; el contacto del solicitante
     * nunca vivió acá sino en `submissions`.
     */
    const player = await players.findOne({ nameKey });

    const history = await loadHistory(nameKey);

    if (!player && history.length === 0) {
      return apiError("No tenemos datos de ese jugador todavía.", 404);
    }

    return json({
      player: player
        ? {
            nameKey: player.nameKey,
            playerName: player.playerName,
            displayName: player.patchedName ?? player.playerName,
            twitch: player.twitch,
            youtube: player.youtube,
            untapped: player.untapped,
            /* Declarados por el jugador, no leídos del ladder: la API oficial
               no expone alianzas. Faltaban acá aunque `/api/leaderboard` ya los
               devolvía, así que la ficha pública decía menos que la tabla. */
            alliance: player.alliance,
            allianceName: player.allianceName,
            verified: player.verified,
            lastRank: player.lastRank,
            lastScore: player.lastScore,
            peakRank: player.peakRank,
            peakScore: player.peakScore,
            lastSeenAt: player.lastSeenAt,
          }
        : null,
      history,
      count: history.length,
    });
  } catch (err) {
    console.error("GET /api/player/[nameKey] falló:", err);
    return apiError("No se pudo obtener el jugador.", 500);
  }
}
