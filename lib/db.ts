import type { Collection, IndexDescription } from "mongodb";
import { getDb } from "./mongodb";
import type { PlayerDoc, SnapshotDoc } from "./types";

export const COLLECTIONS = {
  players: "players",
  snapshots: "snapshots",
} as const;

export async function playersCollection(): Promise<Collection<PlayerDoc>> {
  const db = await getDb();
  return db.collection<PlayerDoc>(COLLECTIONS.players);
}

export async function snapshotsCollection(): Promise<Collection<SnapshotDoc>> {
  const db = await getDb();
  return db.collection<SnapshotDoc>(COLLECTIONS.snapshots);
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

  // Limpieza de códigos de verificación vencidos: Mongo borra el CAMPO... no.
  // TTL borra el DOCUMENTO, así que acá NO va un TTL (borraría al jugador).
  // El vencimiento se chequea en la ruta de confirm contra verificationExpiresAt.
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

  await players.createIndexes(PLAYER_INDEXES);
  await snapshots.createIndexes(SNAPSHOT_INDEXES);
}
