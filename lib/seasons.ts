import { seasonResultsCollection } from "./db";
import { fetchSeason } from "./leaderboard";
import type { SeasonResultDoc } from "./types";

/**
 * Archivo de temporadas cerradas.
 *
 * La API oficial solo sirve el mes corriente y el anterior — junio 2026 ya
 * devuelve `invalid_month`. Cuando una temporada sale de esa ventana desaparece
 * y no hay forma de reconstruirla. Esto la congela antes de que pase.
 */

export interface ArchiveResult {
  season: string;
  inserted: number;
  duplicates: number;
  total: number;
}

/** ¿Ya está archivada? Una sola lectura contra el índice `uniq_season_rank`. */
export async function isSeasonArchived(season: string): Promise<boolean> {
  const col = await seasonResultsCollection();
  const one = await col.findOne({ season }, { projection: { _id: 1 } });
  return one !== null;
}

/**
 * Congela una temporada entera.
 *
 * Idempotente por el índice único {season, rank}: repetir la llamada no
 * duplica nada. Un E11000 acá no es un fallo, es la garantía funcionando —
 * igual que en el sync.
 */
export async function archiveSeason(season: string): Promise<ArchiveResult> {
  // `revalidate: false`: un archivo se escribe una vez y queda para siempre,
  // así que no puede salir de una respuesta cacheada de hace unos minutos.
  const board = await fetchSeason(season, { revalidate: false });
  const capturedAt = new Date();

  const docs: SeasonResultDoc[] = board.rows.map((row) => ({
    season,
    rank: row.rank,
    playerName: row.playerName,
    nameKey: row.nameKey,
    score: row.score,
    total: board.total,
    capturedAt,
  }));

  const col = await seasonResultsCollection();

  let inserted = 0;
  try {
    // `ordered: false` para que un choque puntual no aborte el resto.
    const res = await col.insertMany(docs, { ordered: false });
    inserted = res.insertedCount;
  } catch (err) {
    const e = err as { code?: number; result?: { nInserted?: number }; writeErrors?: unknown[] };
    if (e.code === 11000 || Array.isArray(e.writeErrors)) {
      inserted = e.result?.nInserted ?? 0;
    } else {
      throw err;
    }
  }

  return {
    season,
    inserted,
    duplicates: docs.length - inserted,
    total: board.total,
  };
}

export interface PlayerSeason {
  season: string;
  rank: number;
  score: number;
  playerName: string;
  total: number;
}

/**
 * Cómo terminó un jugador en cada temporada archivada.
 *
 * SIN USO HOY, a propósito: el sitio muestra solo el mes corriente y el
 * anterior, que es lo que ya da la API oficial. No es código muerto — es la
 * lectura del archivo, lista para cuando se quiera mostrar. El archivado sigue
 * corriendo igual, porque una temporada que no se guarda hoy no se puede
 * recuperar mañana.
 *
 * Sirve para CUALQUIERA del top 1000, haya pedido su ficha o no — a diferencia
 * de `snapshots`, que solo cubre a los aprobados.
 *
 * Con nombres repetidos devuelve las dos filas de esa temporada. Es correcto y
 * es honesto: no sabemos cuál es cuál, y elegir una sería inventar.
 */
export async function findPlayerSeasons(nameKey: string): Promise<PlayerSeason[]> {
  const col = await seasonResultsCollection();
  const rows = await col
    .find(
      { nameKey },
      { projection: { _id: 0, season: 1, rank: 1, score: 1, playerName: 1, total: 1 } }
    )
    .sort({ season: -1, rank: 1 })
    .limit(60)
    .toArray();

  return rows as PlayerSeason[];
}

/** Temporadas archivadas, de la más nueva a la más vieja. */
export async function listArchivedSeasons(): Promise<string[]> {
  const col = await seasonResultsCollection();
  const seasons = await col.distinct("season");
  return seasons.sort().reverse();
}
