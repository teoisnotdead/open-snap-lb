import { boardBaselinesCollection, playersCollection } from "./db";
import { fetchLeaderboard, indexByNameKey, disambiguate } from "./leaderboard";
import type { BoardBaselineDoc, MergedLeaderboardRow, PlayerDoc } from "./types";

interface Baseline {
  /** nameKey -> SP de hace un día. Sin los nombres repetidos: ver abajo. */
  scores: Map<string, number>;
  /** Cuándo se tomó. No es exactamente hace 24 h: es la corrida más cercana. */
  takenAt: Date;
}

/**
 * SP de TODO el ladder hace ~24 h.
 *
 * Un solo documento —el baseline más reciente anterior al corte— en vez de una
 * consulta por jugador. Eso es lo que permite mostrar el delta de las 1000
 * filas y no solo de las vinculadas: ver `BoardBaselineDoc`.
 *
 * Devuelve null cuando todavía no hay ninguno de hace un día, que es el estado
 * normal durante las primeras 24 h de vida de la colección.
 *
 * El filtro por `season` es lo que impide el peor número que este sitio podría
 * mostrar. El ladder resetea cada temporada —que arranca el primer martes del
 * mes, no el día 1— y los SP vuelven a empezar de cero. Sin este filtro, la
 * primera corrida que ve la temporada nueva compara contra el baseline de la
 * vieja y le cuelga a TODAS las filas una caída de cinco cifras: el #1 pasaría
 * de 10 408 a 200 y la tabla anunciaría "−10 208" como si se hubiera
 * desplomado, cuando lo único que pasó es que empezó el mes.
 *
 * Que devuelva null durante las primeras 24 h de cada temporada es exactamente
 * lo correcto: no hay contra qué comparar todavía, y la UI muestra un guión.
 */
async function loadBaseline(season: string): Promise<Baseline | null> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const col = await boardBaselinesCollection();

  const doc = await col.findOne<Pick<BoardBaselineDoc, "rows" | "timestamp">>(
    { timestamp: { $lte: cutoff }, season },
    { sort: { timestamp: -1 }, projection: { rows: 1, timestamp: 1 } }
  );

  if (!doc) return null;

  /**
   * Los nombres repetidos se DESCARTAN, no se quedan con el primero.
   *
   * Si "Leaf" ocupaba el #139 y el #161, no sabemos cuál de los dos es el
   * "Leaf" que hoy está en el #145, y restarle el score del que no era da un
   * número inventado con pinta de dato. Mismo criterio que usa el sync con los
   * homónimos: preferimos el guión.
   */
  const scores = new Map<string, number>();
  const repeated = new Set<string>();

  for (const row of doc.rows) {
    if (scores.has(row.n)) repeated.add(row.n);
    else scores.set(row.n, row.s);
  }
  for (const key of repeated) scores.delete(key);

  return { scores, takenAt: doc.timestamp };
}

export interface MergedBoard {
  season: string;
  fetchedAt: Date;
  /** Jugadores en TODO el ladder, no solo los visibles. */
  total: number;
  rows: MergedLeaderboardRow[];
  /**
   * Contra qué momento se calcularon los `delta24h`. `undefined` si todavía no
   * hay baseline: en ese caso ninguna fila tiene delta.
   */
  deltaSince?: Date;
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
  let baseline: Baseline | null = null;
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
            allianceName: 1,
            verified: 1,
            lastRank: 1,
          },
        }
      )
      .toArray();

    /**
     * El baseline NO se filtra por `docs`: cubre el ladder entero, que es
     * justamente el punto. El delta dejó de ser un privilegio de los
     * vinculados.
     */
    baseline = await loadBaseline(board.season);
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

    /**
     * El delta no pasa por `owned`: no necesita saber quién es esta persona ni
     * que haya pedido su ficha, solo cuántos SP tenía esta misma fila ayer.
     *
     * Sí se corta con `ambiguous`, y por la misma razón que el baseline
     * descarta los repetidos: con dos "Leaf" en la tabla no hay forma de saber
     * cuál era cuál.
     */
    const before = ambiguous ? undefined : baseline?.scores.get(row.nameKey);

    return {
      ...row,
      displayName: (owned && doc?.patchedName) || row.playerName,
      twitch: owned ? doc?.twitch : undefined,
      youtube: owned ? doc?.youtube : undefined,
      untapped: owned ? doc?.untapped : undefined,
      alliance: owned ? doc?.alliance : undefined,
      allianceName: owned ? doc?.allianceName : undefined,
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
    ...(baseline ? { deltaSince: baseline.takenAt } : {}),
    enriched,
  };
}
