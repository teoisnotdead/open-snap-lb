/** Espacio fino de no separación: agrupa los miles sin ensanchar la columna. */
const THIN = " ";

/**
 * 10169 -> "10 169".
 *
 * No usamos `toLocaleString` porque el separador cambia según el locale del
 * servidor (punto en es-AR, coma en en-US) y la tabla quedaría distinta entre
 * el render del servidor y el del cliente.
 */
export function formatScore(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

/** Los primeros nueve puestos van con cero adelante para no romper la columna. */
export function formatRank(rank: number): string {
  return rank < 10 ? `0${rank}` : String(rank);
}

/** Delta con signo explícito y el menos tipográfico, no el guión ASCII. */
export function formatDelta(delta: number): string {
  if (delta === 0) return "0";
  return delta > 0 ? `+${formatScore(delta)}` : `−${formatScore(-delta)}`;
}

type Lang = "en" | "es";

/** "12 min ago" / "hace 12 min". Acepta un `now` porque también corre en cliente. */
export function formatRelative(
  date: Date | string,
  lang: Lang = "en",
  now: Date = new Date()
): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const mins = Math.floor((now.getTime() - then.getTime()) / 60_000);
  const es = lang === "es";

  if (mins < 1) return es ? "recién" : "just now";
  if (mins < 60) return es ? `hace ${mins} min` : `${mins} min ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return es ? `hace ${hours} h` : `${hours} h ago`;

  const days = Math.floor(hours / 24);
  if (es) return days === 1 ? "hace 1 día" : `hace ${days} días`;
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

const MONTHS: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
};

/** "23 Aug" / "23 ago" — etiquetas del eje X de la gráfica. */
export function formatShortDate(date: Date | string, lang: Lang = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return lang === "es"
    ? `${d.getDate()} ${MONTHS.es[d.getMonth()]}`
    : `${MONTHS.en[d.getMonth()]} ${d.getDate()}`;
}

/** "Aug 23 2026 · 14:30" / "23 ago 2026 · 14:30" */
export function formatDateTime(date: Date | string, lang: Lang = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatShortDate(d, lang)} ${d.getFullYear()} · ${hh}:${mm}`;
}
