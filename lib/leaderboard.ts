import type {
  LeaderboardRow,
  RawLeaderboardResponse,
  RawLeaderboardRow,
} from "./types";
import { toNameKey, toDisplayName } from "./names";

const BASE = "https://marvelsnap.com/wp-json/api/v1/leaderboard";

/**
 * `region` va hardcodeado a "global" a propósito. La Fase 0 midió que el
 * parámetro se ignora por completo... salvo `region=asia`, que hace que
 * WordPress escupa warnings de PHP en crudo antes del JSON y rompa el parseo.
 * Nunca se construye desde input del usuario.
 */
const REGION = "global";

export interface LeaderboardFetchResult {
  rows: LeaderboardRow[];
  /** "YYYY-MM" del mes que realmente respondió. */
  season: string;
  /** Total de jugadores en el ladder (mucho mayor que rows.length). */
  total: number;
  fetchedAt: Date;
}

class LeaderboardError extends Error {
  constructor(message: string, readonly status: number = 502) {
    super(message);
    this.name = "LeaderboardError";
  }
}

export { LeaderboardError };

function seasonLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Hora UTC a la que arranca una temporada nueva.
 *
 * Medido: la temporada de septiembre 2026 arrancó el martes 1 a las 15:00 de
 * Chile, que con GMT-4 son las 19:00 UTC. El 6 de septiembre Chile pasa a
 * GMT-3 y el arranque se lee como las 16:00 locales — o sea, las mismas 19:00
 * UTC. Lo que se mueve es el reloj de Chile, no el del juego.
 *
 * ATENCIÓN, esto es una inferencia y no un dato confirmado: si el ancla real
 * fuera hora del Pacífico (Second Dinner es de EE.UU.), el 1 de noviembre de
 * 2026 —cuando allá terminan su horario de verano— este número tendría que
 * pasar a 20. Hay que mirar ese día. Si falla, se corrige acá y en ningún
 * otro lado.
 */
const SEASON_START_HOUR_UTC = 19;

/** Mes calendario anterior a uno dado, manejando el cambio de año. */
function monthBefore({ year, month }: { year: number; month: number }) {
  const d = new Date(Date.UTC(year, month - 2, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * Cuándo arranca la temporada de un mes: el PRIMER MARTES, a las 19:00 UTC.
 *
 * No es el día 1. En octubre de 2026 el primer martes es el 6, así que del 1
 * al 6 la temporada que corre es todavía la de septiembre.
 */
export function seasonStart(year: number, month: number): Date {
  const d = new Date(Date.UTC(year, month - 1, 1, SEASON_START_HOUR_UTC));
  // getUTCDay(): 0 domingo, 2 martes.
  d.setUTCDate(d.getUTCDate() + ((2 - d.getUTCDay() + 7) % 7));
  return d;
}

/**
 * Qué temporada está corriendo AHORA, que no siempre es el mes del calendario.
 *
 * Esta es la única función del proyecto que sabe cuándo cambia una temporada, y
 * existe por una razón concreta: entre el día 1 y el primer martes, pedirle el
 * mes corriente a la API devuelve vacío, y ese vacío es indistinguible del de
 * una temporada recién arrancada donde nadie llegó a Infinito. La diferencia
 * solo la da el calendario.
 */
function liveSeason(now: Date): { year: number; month: number } {
  const calendar = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  if (now >= seasonStart(calendar.year, calendar.month)) return calendar;
  return monthBefore(calendar);
}

interface FetchOpts {
  /** Segundos de cache. 0 / no-store para los chequeos de verificación. */
  revalidate?: number | false;
}

async function fetchMonth(
  year: number,
  month: number,
  opts: FetchOpts
): Promise<RawLeaderboardResponse> {
  // `year` se manda por fidelidad al contrato aunque la API lo ignore.
  const url = `${BASE}?month=${month}&year=${year}&region=${REGION}`;

  const res = await fetch(url, {
    headers: { accept: "application/json" },
    ...(opts.revalidate === false
      ? { cache: "no-store" as const }
      : { next: { revalidate: opts.revalidate ?? 60 } }),
  });

  const text = await res.text();

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // Pasa si alguna vez vuelve el bug de los warnings de PHP.
    throw new LeaderboardError(
      `La API respondió algo que no es JSON (HTTP ${res.status}): ${text.slice(0, 120)}`
    );
  }

  if (typeof data === "object" && data !== null && "code" in data) {
    const err = data as { code: string; message?: string };
    throw new LeaderboardError(
      `La API rechazó el request: ${err.code} — ${err.message ?? ""}`,
      err.code === "invalid_month" ? 400 : 502
    );
  }

  const parsed = data as RawLeaderboardResponse;
  if (!Array.isArray(parsed?.results)) {
    throw new LeaderboardError("La API no devolvió un array `results`.");
  }

  return parsed;
}

/** Normaliza una fila cruda. La API manda `rank` 0-indexed; acá pasa a 1-indexed. */
function normalizeRow(raw: RawLeaderboardRow, index: number): LeaderboardRow {
  const playerName = toDisplayName(raw.playerName ?? "");
  return {
    // Usamos el índice y no `raw.rank`: el orden del array es la fuente de
    // verdad, y así no dependemos de que sigan mandando `rank` bien.
    rank: index + 1,
    playerName,
    nameKey: toNameKey(raw.playerName ?? ""),
    score: raw.score,
  };
}

/**
 * Trae el ladder de la temporada que está corriendo.
 *
 * Pide UNA temporada, la que `liveSeason` dice que corre ahora, y devuelve lo
 * que haya — incluido `rows: []`.
 *
 * Ese array vacío es un estado con significado, no un fallo: la temporada
 * arrancó y todavía nadie llegó a Infinito. Antes esta función caía al mes
 * anterior cuando el corriente venía vacío, y eso escondía el arranque de
 * temporada detrás del ladder viejo durante horas o días. La home ahora lo
 * dice con todas las letras.
 *
 * El fallback que SÍ queda es para el desfase de relojes: cerca del cambio de
 * mes la API puede todavía no considerar "actual" al mes que nosotros
 * calculamos, y responde `invalid_month`. Eso es un problema de ventana, no de
 * temporada, y ahí el mes anterior es la respuesta correcta.
 */
export async function fetchLeaderboard(
  opts: FetchOpts = {},
  now: Date = new Date()
): Promise<LeaderboardFetchResult> {
  const live = liveSeason(now);

  const build = (
    data: RawLeaderboardResponse,
    season: { year: number; month: number }
  ): LeaderboardFetchResult => ({
    rows: data.results.map(normalizeRow),
    season: seasonLabel(season.year, season.month),
    total: data.total,
    fetchedAt: now,
  });

  try {
    return build(await fetchMonth(live.year, live.month, opts), live);
  } catch (err) {
    if (!(err instanceof LeaderboardError) || err.status !== 400) throw err;

    const previous = monthBefore(live);
    return build(await fetchMonth(previous.year, previous.month, opts), previous);
  }
}

/** "2026-07" -> { year: 2026, month: 7 }. Devuelve null si no tiene esa forma. */
export function parseSeason(season: string): { year: number; month: number } | null {
  const m = season.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;

  return { year, month };
}

/** "2026-01" -> "2025-12". */
export function previousSeason(season: string): string | null {
  const parsed = parseSeason(season);
  if (!parsed) return null;

  const d = new Date(Date.UTC(parsed.year, parsed.month - 2, 1));
  return seasonLabel(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

/**
 * La temporada que corre ahora, como etiqueta.
 *
 * Pasa por `liveSeason` y no por el mes del calendario: entre el día 1 y el
 * primer martes son cosas distintas, y devolver el mes corriente ahí sería una
 * trampa para quien la use.
 */
export function currentSeason(now: Date = new Date()): string {
  const { year, month } = liveSeason(now);
  return seasonLabel(year, month);
}

/**
 * Trae un mes CONCRETO, sin el fallback al anterior.
 *
 * `fetchLeaderboard` existe para "dame el ladder vivo" y por eso cae al mes
 * previo cuando el corriente todavía está vacío. Para archivar hace falta lo
 * contrario: pedir exactamente el mes que se quiere y que falle si no está,
 * porque guardar el mes equivocado bajo la etiqueta de otro corrompe el archivo
 * de forma silenciosa y para siempre.
 */
export async function fetchSeason(
  season: string,
  opts: FetchOpts = {}
): Promise<LeaderboardFetchResult> {
  const parsed = parseSeason(season);
  if (!parsed) throw new LeaderboardError(`Temporada inválida: "${season}"`, 400);

  const data = await fetchMonth(parsed.year, parsed.month, {
    revalidate: opts.revalidate ?? false,
  });

  if (data.results.length === 0) {
    throw new LeaderboardError(
      `La API no devolvió filas para ${season}. Puede que ya no la sirva.`,
      404
    );
  }

  return {
    rows: data.results.map(normalizeRow),
    season,
    total: data.total,
    fetchedAt: new Date(),
  };
}

/**
 * Índice nameKey -> filas. Puede haber más de una: hoy mismo el top 1000 tiene
 * nombres repetidos ("Leaf", "Jay", "I AM"), así que esto NO es un Map 1:1.
 */
export function indexByNameKey(
  rows: LeaderboardRow[]
): Map<string, LeaderboardRow[]> {
  const map = new Map<string, LeaderboardRow[]>();
  for (const row of rows) {
    const list = map.get(row.nameKey);
    if (list) list.push(row);
    else map.set(row.nameKey, [row]);
  }
  return map;
}

/**
 * Elige qué fila corresponde a un jugador cuando su nombre está repetido.
 *
 * Con una sola fila no hay nada que decidir. Con varias usamos el último rank
 * conocido y elegimos la más cercana; si nunca lo vimos, devolvemos null en vez
 * de adivinar, porque pegarle los links de Twitch al jugador equivocado es
 * peor que no mostrarlos.
 */
export function disambiguate(
  candidates: LeaderboardRow[],
  lastRank?: number
): LeaderboardRow | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (lastRank === undefined) return null;

  return candidates.reduce((best, row) =>
    Math.abs(row.rank - lastRank) < Math.abs(best.rank - lastRank) ? row : best
  );
}
