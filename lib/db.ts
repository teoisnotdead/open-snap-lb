import type { Collection, IndexDescription } from "mongodb";
import { getDb } from "./mongodb";
import type { PlayerDoc, SnapshotDoc, SubmissionDoc } from "./types";

export const COLLECTIONS = {
  players: "players",
  snapshots: "snapshots",
  submissions: "submissions",
} as const;

export async function playersCollection(): Promise<Collection<PlayerDoc>> {
  const db = await getDb();
  return db.collection<PlayerDoc>(COLLECTIONS.players);
}

export async function snapshotsCollection(): Promise<Collection<SnapshotDoc>> {
  const db = await getDb();
  return db.collection<SnapshotDoc>(COLLECTIONS.snapshots);
}

export async function submissionsCollection(): Promise<Collection<SubmissionDoc>> {
  const db = await getDb();
  return db.collection<SubmissionDoc>(COLLECTIONS.submissions);
}

/**
 * Índice único parcial sobre un campo social.
 *
 * La condición `verified: true` es lo que pide el plan: dos cuentas no pueden
 * reclamar el mismo canal, pero solo una vez verificadas. El `$type: "string"`
 * es imprescindible: sin él, todos los docs verificados que NO tienen ese
 * campo entrarían al índice como `null` y chocarían entre sí, y solo un
 * jugador podría estar verificado sin Twitch.
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

  // Buscar por código al confirmar la prueba de propiedad.
  { key: { verificationCode: 1 }, name: "verification_code", sparse: true },
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

  await players.createIndexes(PLAYER_INDEXES);
  await snapshots.createIndexes(SNAPSHOT_INDEXES);
  await submissions.createIndexes(SUBMISSION_INDEXES);
}
