import type { ObjectId } from "mongodb";

/**
 * Modelo de datos.
 *
 * Decisión de Fase 0 (ver docs/leaderboard-api.md §6): la API oficial solo
 * devuelve `rank`, `playerName` y `score`. No hay uid, ni región, ni cardback,
 * ni title. Por eso la identidad de un jugador es su NOMBRE normalizado
 * (`nameKey`), no un uid — y no dependemos de ninguna fuente externa.
 */

/** Una fila cruda tal como la devuelve el endpoint oficial. */
export interface RawLeaderboardRow {
  /** OJO: la API lo manda 0-indexed. Lo normalizamos a 1-indexed al entrar. */
  rank: number;
  playerName: string;
  score: number;
}

export interface RawLeaderboardResponse {
  offset: number;
  limit: number;
  total: number;
  results: RawLeaderboardRow[];
}

/** Fila ya normalizada para uso interno. `rank` acá SIEMPRE es 1-indexed. */
export interface LeaderboardRow {
  rank: number;
  playerName: string;
  nameKey: string;
  score: number;
}

/** Las tres redes que soportamos. */
export type SocialField = "twitch" | "youtube" | "untapped";

export interface PlayerDoc {
  _id?: ObjectId;

  /**
   * Clave de identidad. Nombre normalizado (NFC + trim + lowercase).
   * Índice único. Reemplaza al `uid` del plan original.
   */
  nameKey: string;

  /** Último nombre exacto visto en el ladder, con mayúsculas y espacios reales. */
  playerName: string;

  /** Override manual de display, equivalente al patches.json del original. */
  patchedName?: string;

  /** Handles sociales. Se guardan normalizados en minúscula (ver lib/socials.ts). */
  twitch?: string;
  youtube?: string;
  /** URL completa del perfil de Untapped: no podemos construirla nosotros. */
  untapped?: string;

  /**
   * Tag de alianza, en mayúsculas (ej. "JOB").
   *
   * Lo declara el jugador: la API oficial no expone alianzas (ver
   * docs/leaderboard-api.md §3), así que no hay forma de leerlo ni de
   * verificarlo. Queda vacío para todo el que no lo haya cargado.
   */
  alliance?: string;

  verified: boolean;
  verifiedAt?: Date;

  /** Código pendiente de verificación (corto: entra en los 20 chars del nombre). */
  verificationCode?: string;
  verificationExpiresAt?: Date;

  /**
   * Denormalizado desde el último sync. Sirve para dos cosas:
   *  - desambiguar nombres duplicados en el ladder (elegimos la fila cuyo rank
   *    esté más cerca del último conocido);
   *  - pintar la ficha del jugador sin tocar `snapshots`.
   */
  lastSeenAt?: Date;
  lastRank?: number;
  lastScore?: number;
  peakRank?: number;
  peakScore?: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Append-only: un doc por jugador por corrida de sync.
 * Sin `cardback` ni `title` — no existen en la API (ver docs/leaderboard-api.md §3).
 * `score` sí está, y es lo que grafica recharts.
 */
export interface SnapshotDoc {
  _id?: ObjectId;
  nameKey: string;
  /** Nombre exacto en el momento del snapshot; deja ver cambios de nombre. */
  playerName: string;
  timestamp: Date;
  /** 1-indexed. */
  rank: number;
  score: number;
  /** Temporada derivada del `month` consultado, formato "YYYY-MM". */
  season: string;
  /** Identifica la corrida de cron; hace el sync idempotente ante reintentos. */
  syncId: string;
}

/** Lo que devuelve GET /api/leaderboard: fila viva + merge con `players`. */
export interface MergedLeaderboardRow extends LeaderboardRow {
  /** `patchedName` si existe, si no `playerName`. */
  displayName: string;
  twitch?: string;
  youtube?: string;
  untapped?: string;
  /** Tag declarado por el jugador; vacío para la mayoría. */
  alliance?: string;
  verified: boolean;
  /** true si el ladder tiene más de una fila con este mismo nameKey. */
  ambiguous: boolean;
  /**
   * Cambio de SP en las últimas 24 h. `undefined` cuando no lo sabemos —
   * solo guardamos historial de los jugadores vinculados, así que la enorme
   * mayoría de las filas no lo tiene. La UI muestra un guión, no un cero:
   * "no sabemos" y "no se movió" son cosas distintas.
   */
  delta24h?: number;
}
