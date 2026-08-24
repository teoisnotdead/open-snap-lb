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

  /** Nombre largo de la alianza. Tan indemostrable como el tag. */
  allianceName?: string;

  /**
   * Propiedad de la cuenta comprobada con el código en el nombre.
   *
   * OJO con la semántica: estar en `players` significa "aprobado por un admin";
   * `verified` significa "probó que controla la cuenta". Son cosas distintas y
   * el tick de la tabla representa SOLO la segunda. Fusionarlas degradaría el
   * tick a "alguien le creyó".
   */
  verified: boolean;
  verifiedAt?: Date;

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

/** Estados de una petición en la cola de revisión. */
export type SubmissionStatus = "pending" | "approved" | "rejected";

/**
 * Una petición para aparecer en la tabla con links, alianza y demás.
 *
 * El modelo es de PETICIÓN, no de reclamo: entrar acá no publica nada. Un admin
 * revisa y recién entonces se escribe en `players`. El motivo es que casi nada
 * de lo que se pide acá es verificable — la API oficial no expone alianzas, ni
 * canales, ni forma de contacto — así que el único filtro posible es el ojo
 * humano.
 *
 * El código en el nombre sigue existiendo, pero cambió de rol: ya no es el
 * portón que publica, es un SELLO opcional (`proofVerified`) que le dice al
 * admin "esta persona probó que controla la cuenta". Con él, aprobar es
 * trámite; sin él, hay que mirar con cuidado.
 */
export interface SubmissionDoc {
  _id?: ObjectId;

  /**
   * Token de consulta. Aleatorio y único: es la ÚNICA llave con la que el
   * público toca esta petición.
   *
   * No se usa el `_id` para eso porque los ObjectId llevan un contador
   * incremental, así que son adivinables desde uno conocido. Ver
   * `generateStatusToken`. El `_id` queda para el panel, que ya está detrás de
   * sesión.
   */
  statusToken: string;

  /** Cuenta reclamada, normalizada. No es único: puede haber histórico. */
  nameKey: string;
  /** Nombre exacto tal como figuraba en el ladder al momento de pedir. */
  playerName: string;

  twitch?: string;
  youtube?: string;
  untapped?: string;

  /** Tag corto, en mayúsculas (ej. "JOB"). */
  allianceTag?: string;
  /** Nombre largo de la alianza. */
  allianceName?: string;

  /**
   * DATOS DE CONTACTO — PRIVADOS.
   *
   * Nunca pueden salir por una ruta pública: son datos personales de terceros.
   * Existen para que el admin pueda repreguntar o avisar un rechazo, y viven
   * solo en `submissions`; al aprobar NO se copian a `players`, que es la
   * colección que sí se sirve en público.
   */
  discord?: string;
  email?: string;

  /** Texto libre del solicitante. Se muestra solo en el panel. */
  note?: string;

  /** ¿Completó el flujo del código? Es el sello, no el permiso. */
  proofVerified: boolean;
  proofVerifiedAt?: Date;
  /**
   * Rank de la fila que probó control. Semilla de desambiguación para el sync
   * (ver docs/data-model.md): sin esto, un homónimo queda trabado para siempre.
   */
  proofRank?: number;

  /** Código pendiente (corto: tiene que entrar en los 20 chars del nombre). */
  verificationCode?: string;
  verificationExpiresAt?: Date;

  status: SubmissionStatus;
  /** Se le muestra al solicitante si vuelve a consultar; obligatorio al rechazar. */
  rejectionReason?: string;
  reviewedAt?: Date;
  reviewedBy?: string;

  createdAt: Date;
  updatedAt: Date;
}

/** Lo que el panel de admin manda al navegador. Sin `_id` crudo. */
export interface SubmissionView
  extends Omit<SubmissionDoc, "_id" | "createdAt" | "updatedAt" | "proofVerifiedAt" | "reviewedAt" | "verificationExpiresAt"> {
  id: string;
  createdAt: string;
  updatedAt: string;
  proofVerifiedAt?: string;
  reviewedAt?: string;
  /** Rank actual en el ladder, resuelto al vuelo para que el admin lo vea. */
  currentRank?: number;
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
  /** Nombre largo de la alianza. Se muestra como tooltip del tag. */
  allianceName?: string;
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
