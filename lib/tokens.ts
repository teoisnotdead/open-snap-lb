import { randomInt } from "node:crypto";
import { ALPHABET, STATUS_TOKEN_LENGTH } from "./status-token";

/**
 * Generación del token de consulta de una petición.
 *
 * Este archivo fue `lib/verification.ts`, cuando la propiedad de la cuenta se
 * probaba pegando un código en el nombre de perfil dentro del juego. Ese flujo
 * ya no existe: el tick de verificado lo da el admin al aprobar la petición
 * (ver `SubmissionDoc`). Lo único que sobrevive es el token, que nunca tuvo
 * nada que ver con la verificación — es la llave de seguimiento.
 *
 * Acá quedó SOLO lo que necesita `node:crypto`. El alfabeto, el formato y el
 * parseo se fueron a `lib/status-token.ts` para que los pueda usar el panel,
 * que corre en el navegador. No se re-exportan desde acá a propósito: un
 * re-export dejaría el camino al `node:crypto` abierto y volvería a romper el
 * build del cliente en cuanto alguien importara "solo el formato".
 */
export function generateStatusToken(): string {
  let out = "";
  for (let i = 0; i < STATUS_TOKEN_LENGTH; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}
