/**
 * Normalización de nombres de jugador.
 *
 * Es la pieza más delicada del modelo: `nameKey` es nuestra clave primaria,
 * así que tiene que ser estable y reproducible. Todo lo que hacemos acá está
 * motivado por rarezas reales medidas contra el ladder en vivo
 * (ver docs/leaderboard-api.md §3):
 *
 *  - 8 de los top 1000 tienen espacios al principio o al final ("Butt   ").
 *  - 72 tienen caracteres no-ASCII (coreano, japonés, emoji), que pueden venir
 *    en distintas formas Unicode según cómo los tipeó el jugador.
 *  - El juego trunca a 20 caracteres.
 */

/** Tope de caracteres que el juego permite en el nombre de perfil. */
export const MAX_NAME_LENGTH = 20;

/**
 * Convierte un nombre a su clave de identidad.
 *
 * NFC para que dos formas Unicode del mismo glifo colapsen, colapso de
 * espacios internos, trim, y lowercase.
 *
 * Sobre el lowercase: hace que "Leaf" y "leaf" sean el mismo jugador, lo que
 * técnicamente son cuentas distintas en el juego. Lo aceptamos a propósito —
 * el ladder ya trae nombres duplicados exactos (hoy: "Leaf", "Jay", "I AM"),
 * así que la ambigüedad hay que manejarla igual, y a cambio el formulario de
 * vinculación perdona que el jugador tipee mal las mayúsculas.
 */
export function toNameKey(playerName: string): string {
  return playerName
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Limpia un nombre para mostrarlo, sin tocar la identidad.
 * Solo recorta los espacios de los bordes: el interior se respeta porque es
 * parte del nombre elegido por el jugador.
 */
export function toDisplayName(playerName: string): string {
  return playerName.normalize("NFC").trim();
}

/** Un nameKey vacío no puede identificar a nadie. */
export function isValidNameKey(nameKey: string): boolean {
  return nameKey.length > 0 && nameKey.length <= MAX_NAME_LENGTH;
}
