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
   * Cuenta revisada y aprobada por un admin.
   *
   * Antes eran dos cosas: estar en `players` significaba "aprobado" y
   * `verified` significaba "probó que controla la cuenta" pegando un código en
   * su nombre de perfil. Se unificaron. Aprobar ya implica que un humano miró
   * quién pide qué y le dio por buena la identidad, y sostener dos niveles de
   * confianza sobre el mismo acto no le decía nada a nadie.
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
 * Ese ojo humano es también toda la verificación que hay. Existió un paso
 * automático —un código que el jugador pegaba en su nombre dentro del juego— y
 * se sacó: si el admin ya decidió que la petición es legítima, la prueba no
 * cambiaba la decisión, solo agregaba un flujo que la mayoría abandonaba a
 * mitad de camino.
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
  extends Omit<SubmissionDoc, "_id" | "createdAt" | "updatedAt" | "reviewedAt"> {
  id: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  /**
   * Filas del ladder vivo que tienen este nombre, resueltas al vuelo.
   *
   * Van TODAS y no solo la primera: con un nombre repetido, cuál de las filas
   * es decide a quién se le pegan los links, y esa elección ahora la hace el
   * admin al aprobar. Antes la resolvía el código de verificación.
   *
   * Vacío si el ladder oficial no respondió: revisar no puede depender de eso.
   */
  candidates?: { rank: number; score: number; playerName: string }[];
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

/**
 * Cierre de una temporada: una fila por jugador del top 1000, congelada.
 *
 * Existe porque la API oficial solo sirve el mes corriente y el anterior. Sin
 * esto, cuando una temporada sale de esa ventana **desaparece para siempre** —
 * ni nosotros ni nadie puede reconstruir quién terminó dónde. Es el único dato
 * del proyecto que no admite recuperarse después.
 *
 * A diferencia de `snapshots`, que solo cubre a los jugadores vinculados, acá
 * quedan los 1000, hayan pedido su ficha o no.
 */
export interface SeasonResultDoc {
  _id?: ObjectId;
  /** "YYYY-MM". */
  season: string;
  /** 1-indexed. Único dentro de la temporada: es la clave de idempotencia. */
  rank: number;
  playerName: string;
  nameKey: string;
  score: number;
  /** Jugadores en TODO el ladder de esa temporada, no solo los 1000 visibles. */
  total: number;
  capturedAt: Date;
}

/**
 * Foto comprimida del ladder entero en una corrida de sync.
 *
 * Existe para una sola cosa: poder mostrar el Δ 24 h de **todos**, no solo de
 * los jugadores vinculados. Para eso no hace falta una serie temporal por
 * jugador —lo que guarda `snapshots`— sino un único valor por fila de hace un
 * día, y eso entra en un documento por corrida.
 *
 * Un doc por jugador por hora para los 1000 serían ~8.8 M docs y ~2.2 GB al
 * año, cuatro veces el M0 entero. Así son ~35 KB por corrida y, con el TTL,
 * menos de 3 MB en régimen para siempre. Ver docs/data-model.md.
 */
export interface BoardBaselineDoc {
  _id?: ObjectId;
  /** Misma corrida que los `snapshots` de esa hora. Único. */
  syncId: string;
  /**
   * Momento de la corrida. Lleva el índice TTL: estos docs se borran solos.
   * A diferencia de `seasonResults`, acá no hay nada que preservar — es un
   * punto de comparación de un día, no un archivo histórico.
   */
  timestamp: Date;
  season: string;
  /** Jugadores en TODO el ladder, no solo los 1000 de `rows`. */
  total: number;
  /**
   * Una entrada por FILA del ladder, en orden de rank.
   *
   * Las claves son de una letra a propósito: con 1000 entradas, `nameKey` y
   * `score` completos agregan ~14 KB por documento sin decir nada que este
   * comentario no diga. `n` es el nameKey y `s` el score.
   *
   * Se guardan todas las filas, incluidos los nombres repetidos, en vez de un
   * mapa nameKey → score: colapsarlos escondería la ambigüedad justo donde
   * importa, que es al decidir si podemos atribuirle un delta a alguien.
   */
  rows: { n: string; s: number }[];
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
   * Cambio de SP en las últimas 24 h, para CUALQUIER fila del ladder: sale del
   * baseline del ladder entero (`BoardBaselineDoc`), no del historial por
   * jugador, así que no depende de que la persona se haya vinculado.
   *
   * Sigue siendo `undefined` en tres casos honestos: todavía no hay un baseline
   * de hace un día, el jugador no estaba en el top 1000 entonces, o su nombre
   * está repetido y no sabemos cuál fila era cuál. La UI muestra un guión, no un
   * cero: "no sabemos" y "no se movió" son cosas distintas.
   */
  delta24h?: number;
}
