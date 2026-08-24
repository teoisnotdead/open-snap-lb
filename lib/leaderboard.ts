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

/** Mes calendario con offset hacia atrás, manejando el cambio de año. */
function monthWithOffset(offset: number): { year: number; month: number } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
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
 * Trae el ladder vivo.
 *
 * La API solo sirve el mes actual y el anterior. A principio de mes el mes
 * corriente puede venir vacío, así que caemos al anterior — igual que hace el
 * sitio original.
 */
export async function fetchLeaderboard(
  opts: FetchOpts = {}
): Promise<LeaderboardFetchResult> {
  for (const offset of [0, 1]) {
    const { year, month } = monthWithOffset(offset);

    try {
      const data = await fetchMonth(year, month, opts);

      if (data.results.length === 0 && offset === 0) {
        continue; // mes recién arrancado y todavía sin datos
      }

      return {
        rows: data.results.map(normalizeRow),
        season: seasonLabel(year, month),
        total: data.total,
        fetchedAt: new Date(),
      };
    } catch (err) {
      const isMonthProblem =
        err instanceof LeaderboardError && err.status === 400;
      if (isMonthProblem && offset === 0) {
        continue; // probamos el mes anterior
      }
      throw err;
    }
  }

  throw new LeaderboardError(
    "Ni el mes actual ni el anterior devolvieron datos."
  );
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
