import type { MergedLeaderboardRow } from "./types";

/**
 * Si este jugador pidió su ficha y se la dieron.
 *
 * El overlay está limitado a los vinculados, y el motivo es de cuota antes que
 * de producto: cada capa abierta es una consulta por minuto contra las
 * invocaciones de Vercel, y sin este corte cualquiera puede apuntar un overlay
 * a cualquier fila del top 1000 y hacer correr esa cuenta. Pedir que la persona
 * haya pasado por la revisión manual acota quién puede hacerlo a gente que ya
 * conocemos.
 *
 * **Ante un error de base devuelve `true`, no `false`.** Va al revés que el resto
 * del proyecto —donde sin configuración se cierra— porque acá no se protege
 * nada secreto: el ladder es público y las filas ya salen de la API oficial, no
 * de Mongo. Fallar cerrado dejaría la capa de un stream en vivo en negro
 * durante un hipo de la base, que es mucho peor que servir unas filas públicas
 * de más.
 *
 * El import va adentro para que `windowAround` y `clampRows` se puedan probar
 * sin arrastrar el driver de Mongo. Mismo recurso que usa `lib/api.ts` con
 * `admin-auth`.
 */
export async function isLinked(nameKey: string): Promise<boolean> {
  try {
    const { playersCollection } = await import("./db");
    const players = await playersCollection();
    return (await players.countDocuments({ nameKey }, { limit: 1 })) > 0;
  } catch (err) {
    console.error("No se pudo verificar si el jugador está vinculado:", err);
    return true;
  }
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
