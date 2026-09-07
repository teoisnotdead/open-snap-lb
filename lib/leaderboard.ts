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
  /** Cuándo PEDIMOS los datos. Para hablar de frescura sirve `dataAt`, no esto. */
  fetchedAt: Date;
  /**
   * Cuándo el ORIGEN generó estos datos, según su header `Date`.
   *
   * Es la única de las dos fechas que dice algo sobre qué tan viejos son los
   * números. Ver `originDate`.
   */
  dataAt: Date;
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

/** Mes calendario anterior a uno dado, manejando el cambio de año. */
function monthBefore({ year, month }: { year: number; month: number }) {
  const d = new Date(Date.UTC(year, month - 2, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/**
 * Qué tabla está corriendo AHORA: **el mes del calendario, y nada más**.
 *
 * Acá vivió durante un tiempo una inferencia equivocada: que la tabla cambiaba
 * con la temporada del juego, o sea el primer martes del mes a las 19:00 UTC, y
 * que entre el día 1 y ese martes la tabla vigente era todavía la del mes
 * anterior.
 *
 * Es falso, y se midió: el 1 de septiembre de 2026 a las 18:50 UTC —diez
 * minutos ANTES de ese supuesto arranque— la página oficial ya mostraba
 * "September 2026", vacía. Si se guiara por el primer martes habría seguido
 * mostrando agosto. El selector de la tabla oficial son meses de calendario; la
 * temporada del juego es otra cosa y no manda acá.
 *
 * El daño de la inferencia vieja no se veía este mes, donde el primer martes
 * cayó el día 1. En octubre de 2026 el primer martes es el 6: habríamos servido
 * la tabla de septiembre como si fuera la vigente durante SEIS DÍAS, mientras la
 * oficial ya mostraba octubre.
 *
 * Lo que se pierde al sacarla: entre el día 1 y el primer jugador en Infinito,
 * la tabla del mes viene vacía y no hay forma de distinguir ese vacío del de una
 * falla. Se acepta, porque es exactamente lo que muestra la página oficial — y
 * porque la home ya tiene un estado que lo dice con todas las letras en vez de
 * dibujar una tabla en cero.
 */
function liveSeason(now: Date): { year: number; month: number } {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

interface FetchOpts {
  /** Segundos de cache. 0 / no-store para los chequeos de verificación. */
  revalidate?: number | false;
}

interface MonthResponse {
  body: RawLeaderboardResponse;
  /** Ver `LeaderboardFetchResult.dataAt`. */
  dataAt: Date;
}

/**
 * Cuándo generó el origen esta respuesta, según su header `Date`.
 *
 * Existe porque entre el origen y la página hay DOS cachés y ninguna es
 * nuestra de punta a punta: el CloudFront de marvelsnap (TTL medido en más de
 * 3,5 min — ver docs/leaderboard-api.md) y el Data Cache de Next, que además
 * sirve la copia vieja mientras revalida de fondo. Marcar la hora con
 * `new Date()` en el render dice cuándo se dibujó la página, no de cuándo son
 * los números: con eso la cabecera anunciaba "Sincronizado recién" encima de
 * datos de varios minutos atrás, que es peor que no decir nada.
 *
 * El `Date` sirve justamente porque las dos capas lo dejan intacto:
 *  - CloudFront preserva el del origen y cuenta el tiempo aparte, en `Age`.
 *    Medido: tres hits seguidos con `Date: 19:07:22` y `Age: 67`. Por eso NO
 *    se le resta `Age` — sería descontar el mismo tiempo dos veces.
 *  - Next guarda los headers en la entrada de caché y los replica al leerla
 *    (`headers: Object.fromEntries(...)` en server/lib/patch-fetch.js).
 *
 * Sin header, o con uno que no parsea, cae a `new Date()`: es la lectura
 * optimista de antes, y para un dato de presentación es mejor que un hueco.
 */
function originDate(res: Response): Date {
  const header = res.headers.get("date");
  if (!header) return new Date();

  const parsed = new Date(header);
  if (Number.isNaN(parsed.getTime())) return new Date();

  // Un origen con el reloj adelantado daría "generado en el futuro", y de ahí
  // salen los "hace -2 min". Preferimos capear en ahora.
  const now = new Date();
  return parsed > now ? now : parsed;
}

async function fetchMonth(
  year: number,
  month: number,
  opts: FetchOpts
): Promise<MonthResponse> {
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

  return { body: parsed, dataAt: originDate(res) };
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
    res: MonthResponse,
    season: { year: number; month: number }
  ): LeaderboardFetchResult => ({
    rows: res.body.results.map(normalizeRow),
    season: seasonLabel(season.year, season.month),
    total: res.body.total,
    fetchedAt: now,
    dataAt: res.dataAt,
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

  const res = await fetchMonth(parsed.year, parsed.month, {
    revalidate: opts.revalidate ?? false,
  });

  if (res.body.results.length === 0) {
    throw new LeaderboardError(
      `La API no devolvió filas para ${season}. Puede que ya no la sirva.`,
      404
    );
  }

  return {
    rows: res.body.results.map(normalizeRow),
    season,
    total: res.body.total,
    fetchedAt: new Date(),
    dataAt: res.dataAt,
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
