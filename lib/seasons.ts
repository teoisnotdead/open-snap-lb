import { playersCollection, seasonResultsCollection } from "./db";
import { fetchSeason } from "./leaderboard";
import type { MergedLeaderboardRow, PlayerDoc, SeasonResultDoc } from "./types";

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

export interface ArchivedBoard {
  season: string;
  rows: MergedLeaderboardRow[];
  /** Jugadores en TODA la temporada, no solo los 1000 archivados. */
  total: number;
  /** Cuándo congelamos esta foto. */
  capturedAt: Date;
}

/**
 * La última temporada cerrada, lista para la tabla.
 *
 * Devuelve null cuando todavía no archivamos ninguna, que es el estado de un
 * despliegue nuevo hasta el primer cambio de temporada.
 *
 * Sale de `seasonResults` y NO de la API, aunque el endpoint oficial todavía
 * sirva el mes anterior. Son dos cosas distintas: la API te da lo que le queda
 * en su ventana de dos meses, y esto es nuestro archivo, que existe justamente
 * para cuando esa ventana se cierre. Leer del archivo es además lo que hace que
 * la página siga funcionando igual dentro de un año.
 */
export async function loadLatestArchivedSeason(): Promise<ArchivedBoard | null> {
  const [season] = await listArchivedSeasons();
  if (!season) return null;

  const col = await seasonResultsCollection();
  const docs = await col
    .find({ season }, { projection: { _id: 0 } })
    .sort({ rank: 1 })
    .toArray();

  if (docs.length === 0) return null;

  /**
   * Los homónimos se cuentan DENTRO de la temporada archivada, no contra el
   * ladder de hoy: "Leaf" pudo estar repetido en julio y ser uno solo ahora, o
   * al revés. Lo que decide si esa fila es ambigua es lo que pasaba entonces.
   */
  const veces = new Map<string, number>();
  for (const d of docs) veces.set(d.nameKey, (veces.get(d.nameKey) ?? 0) + 1);

  /**
   * El enriquecido es un extra: si Mongo falla acá, la tabla se dibuja igual
   * con puesto, nombre y SP, que es el archivo en sí. Mismo criterio que
   * `getMergedLeaderboard`.
   */
  let byKey = new Map<string, PlayerDoc>();
  try {
    const players = await playersCollection();
    const docsPlayers = await players
      .find(
        { nameKey: { $in: [...veces.keys()] } },
        {
          projection: {
            nameKey: 1,
            patchedName: 1,
            twitch: 1,
            youtube: 1,
            untapped: 1,
            alliance: 1,
            allianceName: 1,
            verified: 1,
          },
        }
      )
      .toArray();
    byKey = new Map(docsPlayers.map((d) => [d.nameKey, d]));
  } catch (err) {
    console.error("No se pudo enriquecer la temporada archivada:", err);
  }

  const rows: MergedLeaderboardRow[] = docs.map((d) => {
    const ambiguous = (veces.get(d.nameKey) ?? 0) > 1;
    const doc = byKey.get(d.nameKey);

    /**
     * Con el nombre repetido no mostramos nada, sin intentar desempatar.
     *
     * En la tabla viva el desempate usa `lastRank`, pero acá ese dato es del
     * ladder de HOY y no dice nada sobre quién era quién en una temporada que
     * ya cerró. Preferimos el hueco antes que colgarle el Twitch de alguien a
     * la persona equivocada — mismo criterio que el resto del proyecto.
     */
    const owned = doc !== undefined && !ambiguous;

    return {
      rank: d.rank,
      playerName: d.playerName,
      nameKey: d.nameKey,
      score: d.score,
      displayName: (owned && doc?.patchedName) || d.playerName,
      twitch: owned ? doc?.twitch : undefined,
      youtube: owned ? doc?.youtube : undefined,
      untapped: owned ? doc?.untapped : undefined,
      alliance: owned ? doc?.alliance : undefined,
      allianceName: owned ? doc?.allianceName : undefined,
      verified: owned ? doc?.verified === true : false,
      ambiguous,
      // Una temporada congelada no tiene "últimas 24 h". La columna no va.
      delta24h: undefined,
    };
  });

  return { season, rows, total: docs[0].total, capturedAt: docs[0].capturedAt };
}
