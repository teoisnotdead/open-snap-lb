import type { MergedLeaderboardRow } from "./types";

/**
 * Este módulo tiene que quedarse PURO: nada de Mongo, nada de `next/*`.
 *
 * Lo importan tres cosas con requisitos incompatibles — el componente cliente
 * que muestra las medidas, las rutas del servidor, y `scripts/test-overlay.ts`.
 * El gate por vinculación vivió acá un rato y rompió el build del cliente:
 * aunque el `import("./db")` era perezoso, el bundler igual resolvía mongodb y
 * terminaba pidiendo `child_process` en el navegador. Vive en `lib/players.ts`.
 */

/**
 * Las medidas de la capa, en píxeles.
 *
 * Son un ESPEJO de `overlay.css` —`.ov-card { width }` y el alto de `.ov-row`—
 * y están acá porque OBS pide el tamaño a mano: hay que poder decírselo al
 * streamer en la ficha sin que el número se desfase del CSS la próxima vez que
 * alguien toque un padding. `scripts/test-overlay.ts` fija la fórmula contra
 * los valores medidos en el navegador.
 */
export const OVERLAY_WIDTH = 340;
const ROW_HEIGHT = 36;

/**
 * Alto real de la tarjeta. El +1 es el borde inferior.
 *
 * Sirve para verificar contra el CSS, no para dárselo a nadie: ver
 * `obsHeight`.
 */
export function cardHeight(rows: number): number {
  return rows * ROW_HEIGHT + 1;
}

/**
 * Lo que conviene poner de alto en OBS: la tarjeta más 9 px de holgura.
 *
 * El valor exacto NO alcanza, comprobado en OBS: con 181 —el alto medido para
 * cinco filas— la última quedaba cortada, y 190 entra bien. No importa de dónde
 * salen esos píxeles (redondeo de CEF, la fuente cargando distinto): lo que
 * importa es que sobrar no se nota, porque el resto queda transparente, y
 * faltar se descubre al aire.
 */
export function obsHeight(rows: number): number {
  return rows * ROW_HEIGHT + 10;
}

/** Filas del overlay. Cinco entran en cualquier layout de stream sin tapar el juego. */
export const DEFAULT_ROWS = 5;
export const MIN_ROWS = 3;
export const MAX_ROWS = 11;

export interface OverlayWindow {
  rows: MergedLeaderboardRow[];
  /** El puesto del jugador dueño del overlay, para pintarlo distinto. */
  selfRank: number;
  /** true si el nombre está repetido en el ladder y hubo que elegir por puesto. */
  ambiguous: boolean;
}

export function clampRows(raw: string | null): number {
  // `Number(null)` y `Number("")` dan 0, que es un entero válido y se recortaría
  // a MIN_ROWS. Sin este corte, no pasar el parámetro daba 3 filas y no 5.
  if (!raw) return DEFAULT_ROWS;

  const n = Number(raw);
  if (!Number.isInteger(n)) return DEFAULT_ROWS;
  return Math.min(MAX_ROWS, Math.max(MIN_ROWS, n));
}

/**
 * La ventana de filas alrededor de un jugador, pegada a los bordes del ladder.
 *
 * Centrada mientras se pueda y corrida cuando no: el #1 no tiene a nadie
 * arriba, así que en vez de mostrar dos huecos muestra cuatro filas hacia
 * abajo. Lo mismo espejado en el #1000. El overlay siempre ocupa el mismo alto,
 * que es lo que importa cuando está compuesto sobre el juego — una ventana que
 * cambia de tamaño al subir de puesto correría todo lo demás de la pantalla.
 *
 * `pinnedRank` desempata los nombres repetidos. Sin él nos quedamos con la
 * primera fila, que para un homónimo sería la persona equivocada; por eso el
 * resultado marca `ambiguous` y la UI lo dice en vez de fingir certeza.
 */
export function windowAround(
  all: MergedLeaderboardRow[],
  nameKey: string,
  size = DEFAULT_ROWS,
  pinnedRank?: number
): OverlayWindow | null {
  const matches = all
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row.nameKey === nameKey);

  if (matches.length === 0) return null;

  /**
   * Se separa el "fijado y encontrado" del "fijado a secas". Un `rank` que no
   * corresponde a ninguna fila —el streamer subió de puesto y no actualizó la
   * URL, o se equivocó al escribirlo— cae a la primera coincidencia, y eso
   * sigue siendo una fila que puede no ser la suya. Contarlo como resuelto
   * apagaría el aviso justo en el caso en que más hace falta.
   */
  const fijada =
    pinnedRank === undefined
      ? undefined
      : matches.find(({ row }) => row.rank === pinnedRank);

  const chosen = fijada ?? matches[0];

  /**
   * El corte se calcula sobre el ÍNDICE del array y no sobre el rank. Son lo
   * mismo mientras el ladder venga completo y en orden, pero apoyarse en el
   * rank haría que un hueco en la respuesta oficial —una fila faltante, un
   * empate numerado raro— desplazara la ventana sin que se note.
   */
  const half = Math.floor(size / 2);
  const last = Math.max(0, all.length - size);
  const start = Math.min(Math.max(chosen.i - half, 0), last);

  return {
    rows: all.slice(start, start + size),
    selfRank: chosen.row.rank,
    ambiguous: matches.length > 1 && !fijada,
  };
}
