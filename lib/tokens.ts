import { randomInt } from "node:crypto";

/**
 * Token de consulta de una petición.
 *
 * Este archivo fue `lib/verification.ts`, cuando la propiedad de la cuenta se
 * probaba pegando un código en el nombre de perfil dentro del juego. Ese flujo
 * ya no existe: el tick de verificado lo da el admin al aprobar la petición
 * (ver `SubmissionDoc`). Lo único que sobrevive es el token, que nunca tuvo
 * nada que ver con la verificación — es la llave de seguimiento.
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

/**
 * Token para consultar el estado de una petición.
 *
 * Tiene que ser aleatorio en vez del ObjectId de Mongo, que es
 * timestamp + valor por proceso + CONTADOR INCREMENTAL: dos peticiones seguidas
 * difieren en el último dígito, así que quien manda una puede leer las de al
 * lado probando ids vecinos.
 */
export function generateStatusToken(): string {
  let out = "";
  for (let i = 0; i < STATUS_TOKEN_LENGTH; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

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
