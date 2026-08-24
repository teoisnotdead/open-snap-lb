import { playersCollection, snapshotsCollection } from "./db";
import { fetchLeaderboard, indexByNameKey, disambiguate } from "./leaderboard";
import type { MergedLeaderboardRow, PlayerDoc } from "./types";

/**
 * SP de cada jugador hace ~24 h, para calcular el delta.
 *
 * Tomamos el snapshot más reciente ANTERIOR al corte. Si un jugador no tiene
 * ninguno (recién vinculado, o no se movió en más de un día) queda fuera del
 * mapa y su delta es `undefined` — que la UI muestra como guión.
 */
async function scoresADayAgo(nameKeys: string[]): Promise<Map<string, number>> {
  if (nameKeys.length === 0) return new Map();

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const snapshots = await snapshotsCollection();

  const rows = await snapshots
    .aggregate<{ _id: string; score: number }>([
      { $match: { nameKey: { $in: nameKeys }, timestamp: { $lte: cutoff } } },
      { $sort: { nameKey: 1, timestamp: -1 } },
      { $group: { _id: "$nameKey", score: { $first: "$score" } } },
    ])
    .toArray();

  return new Map(rows.map((r) => [r._id, r.score]));
}

export interface MergedBoard {
  season: string;
  fetchedAt: Date;
  /** Jugadores en TODO el ladder, no solo los visibles. */
  total: number;
  rows: MergedLeaderboardRow[];
  /**
   * false cuando Mongo no respondió y las filas van "peladas" (sin links,
   * alianzas, verificados ni delta). El ranking sigue siendo correcto.
   */
  enriched: boolean;
}

/**
 * Ladder en vivo + datos de `players`.
 *
 * Vive acá y no dentro de la route handler porque la página del leaderboard
 * también lo necesita: un server component llamando a nuestra propia ruta HTTP
 * sería un salto de red de ida y vuelta contra nosotros mismos.
 */
export async function getMergedLeaderboard(
  revalidate: number | false = 60
): Promise<MergedBoard> {
  const board = await fetchLeaderboard({ revalidate });
  const rowsByKey = indexByNameKey(board.rows);

  /**
   * El ranking es público y no depende de nuestra base: si Mongo no responde
   * seguimos sirviendo la tabla sin links ni alianzas, en vez de tirar la
   * página entera. Es la diferencia entre "el sitio anda a medias" y "el sitio
   * está caído" cuando el problema es solo nuestro enriquecimiento.
   */
  let docs: PlayerDoc[] = [];
  let yesterday = new Map<string, number>();
  let enriched = true;

  try {
    // Solo los players que aparecen en el ladder de ahora: el $in va contra el
    // índice único de nameKey.
    const nameKeys = [...new Set(board.rows.map((r) => r.nameKey))];
    const players = await playersCollection();
    docs = await players
      .find(
        { nameKey: { $in: nameKeys } },
        {
          projection: {
            nameKey: 1,
            patchedName: 1,
            twitch: 1,
            youtube: 1,
            untapped: 1,
            alliance: 1,
            verified: 1,
            lastRank: 1,
          },
        }
      )
      .toArray();

    // Solo pedimos historial de los jugadores que efectivamente trackeamos.
    yesterday = await scoresADayAgo(docs.map((d) => d.nameKey));
  } catch (err) {
    console.error("Mongo no respondió; sirvo el ladder sin enriquecer:", err);
    enriched = false;
  }

  const byKey = new Map<string, PlayerDoc>(docs.map((d) => [d.nameKey, d]));

  const rows: MergedLeaderboardRow[] = board.rows.map((row) => {
    const candidates = rowsByKey.get(row.nameKey) ?? [row];
    const ambiguous = candidates.length > 1;
    const doc = byKey.get(row.nameKey);

    // Con nombres repetidos, los datos van solo a la fila que corresponde.
    const owned =
      doc !== undefined &&
      disambiguate(candidates, doc.lastRank)?.rank === row.rank;

    const before = owned ? yesterday.get(row.nameKey) : undefined;

    return {
      ...row,
      displayName: (owned && doc?.patchedName) || row.playerName,
      twitch: owned ? doc?.twitch : undefined,
      youtube: owned ? doc?.youtube : undefined,
      untapped: owned ? doc?.untapped : undefined,
      alliance: owned ? doc?.alliance : undefined,
      verified: owned ? doc?.verified === true : false,
      ambiguous,
      delta24h: before === undefined ? undefined : row.score - before,
    };
  });

  return {
    season: board.season,
    fetchedAt: board.fetchedAt,
    total: board.total,
    rows,
    enriched,
  };
}
