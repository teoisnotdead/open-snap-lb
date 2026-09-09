/**
 * El token de seguimiento: solo lo que es texto puro.
 *
 * Está separado de `lib/tokens.ts` por la misma razón concreta que separa
 * `lib/join-code.ts` de `lib/alliances.ts`, y no por prolijidad: ese módulo usa
 * `node:crypto` para generar, y el panel de admin —que ahora muestra el token
 * para poder reenviárselo a quien lo perdió— es un componente de cliente.
 * Cualquier camino desde el navegador hasta `node:crypto` rompe el build.
 *
 * Acá no hay nada que dependa del servidor. `generateStatusToken` se queda del
 * otro lado.
 */

/**
 * Alfabeto estilo Crockford base32: sin 0/1 ni I/L/O/U. El token se dicta, se
 * copia a mano y se retoma días después, así que se sacan los caracteres que se
 * confunden entre sí (O/0, I/L/1) — y la U, que además evita que salgan
 * palabras desafortunadas.
 */
export const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Longitud del token de consulta. 30^12 ≈ 5.3 × 10^17 combinaciones: probar
 * tokens al azar no es una estrategia.
 */
export const STATUS_TOKEN_LENGTH = 12;

/** Se muestra en grupos de 4 para que se pueda dictar o copiar sin perderse. */
const STATUS_TOKEN_GROUP = 4;

/** Formato para mostrar: `K7M2-QW9X-4RTF`. Los guiones no se guardan. */
export function formatStatusToken(token: string): string {
  return (token.match(new RegExp(`.{1,${STATUS_TOKEN_GROUP}}`, "g")) ?? []).join("-");
}

/**
 * Normaliza lo que el usuario pega: acepta guiones, espacios y minúscula.
 * Devuelve null si no puede ser un token, para no ir a la base al pedo.
 */
export function parseStatusToken(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/[\s-]/g, "");
  if (cleaned.length !== STATUS_TOKEN_LENGTH) return null;
  if (![...cleaned].every((ch) => ALPHABET.includes(ch))) return null;
  return cleaned;
}
