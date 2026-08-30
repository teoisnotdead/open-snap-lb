import type { Collection, IndexDescription } from "mongodb";
import { getDb } from "./mongodb";
import type {
  PlayerDoc,
  SnapshotDoc,
  SubmissionDoc,
  SeasonResultDoc,
  BoardBaselineDoc,
  BoardDailyDoc,
} from "./types";

export const COLLECTIONS = {
  players: "players",
  snapshots: "snapshots",
  submissions: "submissions",
  seasonResults: "seasonResults",
  boardBaselines: "boardBaselines",
  boardDailies: "boardDailies",
} as const;

export async function playersCollection(): Promise<Collection<PlayerDoc>> {
  const db = await getDb();
  return db.collection<PlayerDoc>(COLLECTIONS.players);
}

export async function snapshotsCollection(): Promise<Collection<SnapshotDoc>> {
  const db = await getDb();
  return db.collection<SnapshotDoc>(COLLECTIONS.snapshots);
}

export async function seasonResultsCollection(): Promise<Collection<SeasonResultDoc>> {
  const db = await getDb();
  return db.collection<SeasonResultDoc>(COLLECTIONS.seasonResults);
}

export async function submissionsCollection(): Promise<Collection<SubmissionDoc>> {
  const db = await getDb();
  return db.collection<SubmissionDoc>(COLLECTIONS.submissions);
}

export async function boardBaselinesCollection(): Promise<Collection<BoardBaselineDoc>> {
  const db = await getDb();
  return db.collection<BoardBaselineDoc>(COLLECTIONS.boardBaselines);
}

export async function boardDailiesCollection(): Promise<Collection<BoardDailyDoc>> {
  const db = await getDb();
  return db.collection<BoardDailyDoc>(COLLECTIONS.boardDailies);
}

/**
 * Índice único parcial sobre un campo social.
 *
 * Dos cuentas no pueden reclamar el mismo canal. La condición `verified: true`
 * quedó de cuando había aprobados sin verificar; hoy toda aprobación verifica,
 * así que el filtro cubre a `players` entero. Se deja igual porque describir
 * exactamente a quién aplica el único no cuesta nada y no obliga a recrear el
 * índice.
 *
 * El `$type: "string"` es imprescindible: sin él, todos los docs que NO tienen
 * ese campo entrarían al índice como `null` y chocarían entre sí, y solo un
 * jugador podría estar sin Twitch.
 */
function uniqueSocialIndex(field: "twitch" | "youtube" | "untapped"): IndexDescription {
  return {
    key: { [field]: 1 },
    name: `uniq_${field}_verified`,
    unique: true,
    partialFilterExpression: {
      verified: true,
      [field]: { $type: "string" },
    },
  };
}

export const PLAYER_INDEXES: IndexDescription[] = [
  // Identidad. Reemplaza al `uid` del plan original.
  { key: { nameKey: 1 }, name: "uniq_nameKey", unique: true },

  uniqueSocialIndex("twitch"),
  uniqueSocialIndex("youtube"),
  uniqueSocialIndex("untapped"),

  // Para listar creators / filtrar la tabla por verificados.
  { key: { verified: 1, lastRank: 1 }, name: "verified_rank" },
];

/**
 * Cuánto se guarda de baselines del ladder.
 *
 * El delta necesita el de hace 24 h, así que el mínimo útil es un día. Se
 * guardan tres para tener margen: si el cron se cae una noche entera, al volver
 * todavía hay contra qué comparar en vez de mostrar guiones en las 1000 filas.
 * Más allá de eso no sirven — no son un archivo histórico, para eso están
 * `snapshots` y `seasonResults`.
 */
export const BASELINE_TTL_HOURS = 72;

export const BOARD_BASELINE_INDEXES: IndexDescription[] = [
  /**
   * La query del delta: el baseline más reciente ANTERIOR al corte de 24 h.
   * Un solo documento, así que el índice es un `sort` + `limit 1`.
   */
  { key: { timestamp: -1 }, name: "by_time" },

  /**
   * Borrado automático. Es lo que vuelve constante el costo de esta colección:
   * sin TTL, un doc de 35 KB por hora son ~300 MB al año, que en el M0 sí se
   * notan.
   */
  {
    key: { timestamp: 1 },
    name: "ttl_timestamp",
    expireAfterSeconds: BASELINE_TTL_HOURS * 3600,
  },

  // Idempotencia: si el Action reintenta la corrida, no se guarda dos veces.
  { key: { syncId: 1 }, name: "uniq_sync", unique: true },
];

export const BOARD_DAILY_INDEXES: IndexDescription[] = [
  /**
   * Idempotencia del día, y a la vez la razón de que exista el campo `day`.
   *
   * El cron corre cada hora: sin este único, la segunda corrida del día
   * guardaría una segunda foto y en un mes habría 24 puntos por jornada, que
   * es exactamente el volumen que esta colección existe para no tener.
   */
  { key: { day: 1 }, name: "uniq_day", unique: true },

  /**
   * La serie de un jugador se arma recorriendo los docs en orden de tiempo.
   * NO hay índice por jugador y no puede haberlo: el nameKey vive dentro de
   * `rows`, y indexar un array de 1000 entradas por documento costaría más que
   * la colección entera. El filtrado lo hace la agregación, en el servidor.
   */
  { key: { timestamp: 1 }, name: "by_time" },

  // Deliberadamente SIN TTL. Ver `BoardDailyDoc`: esto es el archivo que
  // `boardBaselines` no es.
];

export const SEASON_RESULT_INDEXES: IndexDescription[] = [
  /**
   * La tabla de una temporada, y la clave de idempotencia.
   *
   * El único por temporada es el PUESTO, no el nombre: dentro de un mismo mes
   * hay nombres repetidos —hoy "Leaf" aparece dos veces en el top 1000— y un
   * único sobre {season, nameKey} rechazaría al segundo, dejando el archivo
   * incompleto justo en el caso ambiguo. El puesto sí es único.
   */
  { key: { season: 1, rank: 1 }, name: "uniq_season_rank", unique: true },

  // El historial de temporadas de un jugador, para su ficha.
  { key: { nameKey: 1, season: -1 }, name: "player_seasons" },
];

export const SUBMISSION_INDEXES: IndexDescription[] = [
  /**
   * La llave pública. Única porque una colisión le mostraría a alguien la
   * petición de otro — improbable con 30^12, pero el índice lo vuelve imposible
   * en vez de improbable, y cuesta nada.
   */
  { key: { statusToken: 1 }, name: "uniq_status_token", unique: true },

  // La cola del panel: pendientes primero, más viejas arriba.
  { key: { status: 1, createdAt: 1 }, name: "queue" },

  // Historial por jugador, y para encontrar la petición vigente de un nombre.
  { key: { nameKey: 1, createdAt: -1 }, name: "by_player" },

  /**
   * Una sola petición PENDIENTE por nombre.
   *
   * Sin esto, cualquiera puede llenar la cola con cien peticiones del mismo
   * jugador y el panel queda inusable. El filtro parcial es lo que permite que
   * sí existan varias aprobadas/rechazadas históricas del mismo nombre: solo
   * las pendientes compiten por el índice.
   */
  {
    key: { nameKey: 1 },
    name: "uniq_pending_per_player",
    unique: true,
    partialFilterExpression: { status: "pending" },
  },
];

export const SNAPSHOT_INDEXES: IndexDescription[] = [
  // Query principal: el histórico de un jugador para la gráfica de recharts.
  { key: { nameKey: 1, timestamp: -1 }, name: "player_history" },

  // Idempotencia: si GitHub Actions reintenta una corrida, el mismo par
  // (jugador, corrida) no se puede insertar dos veces.
  { key: { nameKey: 1, syncId: 1 }, name: "uniq_player_sync", unique: true },

  // Para inspeccionar o revertir una corrida entera.
  { key: { syncId: 1 }, name: "by_sync" },
];

/**
 * Crea los índices. Es idempotente: `createIndexes` ignora los que ya existen
 * con la misma definición. Se corre con `npm run db:indexes`.
 */
export async function ensureIndexes(): Promise<void> {
  const players = await playersCollection();
  const snapshots = await snapshotsCollection();
  const submissions = await submissionsCollection();
  const seasonResults = await seasonResultsCollection();
  const baselines = await boardBaselinesCollection();
  const dailies = await boardDailiesCollection();

  await players.createIndexes(PLAYER_INDEXES);
  await snapshots.createIndexes(SNAPSHOT_INDEXES);
  await submissions.createIndexes(SUBMISSION_INDEXES);
  await seasonResults.createIndexes(SEASON_RESULT_INDEXES);
  await baselines.createIndexes(BOARD_BASELINE_INDEXES);
  await dailies.createIndexes(BOARD_DAILY_INDEXES);
}
