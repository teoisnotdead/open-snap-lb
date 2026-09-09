/**
 * La llave del overlay: solo lo que es texto puro.
 *
 * Separado por la misma razón que `lib/join-code.ts` y no por prolijidad: quien
 * necesita reconocer una llave es también el componente cliente que la muestra,
 * y cualquier archivo que toque Mongo o `node:crypto` arrastra el driver al
 * bundle del navegador. `generateOverlayKey` se queda del otro lado, en
 * `lib/players.ts`.
 */

/**
 * El mismo alfabeto Crockford del `statusToken` y del `joinCode`. Escrito de
 * nuevo, otra vez, para que este archivo no importe NADA — es la única forma de
 * garantizar que no arrastre `node:crypto` al cliente.
 *
 * Acá el motivo del alfabeto es más débil que en los otros dos: esta llave no
 * se dicta por voz, se copia y se pega en OBS. Se usa igual porque el día que
 * alguien la lea de una captura para reescribirla a mano, la O y el 0 van a
 * seguir siendo la O y el 0.
 */
export const OVERLAY_KEY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * DIECISÉIS caracteres: ni 12 como el `statusToken` ni 8 como el `joinCode`.
 *
 * Los tres largos distintos es el mismo truco que explica `lib/join-code.ts`:
 * los tres códigos circulan por el mismo Discord, y con largos distintos uno
 * pegado en el campo equivocado se rechaza por estructura —sin ir a la base— y
 * se le puede decir a la persona CUÁL de los tres puso mal.
 *
 * Que sea el más largo de los tres no es simetría: es el único que viaja en una
 * URL, o sea el único al que se le pueden tirar intentos automatizados desde
 * afuera. 30^16 ≈ 4.3 × 10^23.
 */
export const OVERLAY_KEY_LENGTH = 16;

/**
 * Normaliza lo que venga en la URL. Devuelve null si no puede ser una llave,
 * para no ir a la base al pedo con cada bot que pasee por /overlay/algo.
 *
 * Acepta minúsculas porque una URL pasa por manos que la escriben en minúscula
 * sin pensarlo —un chat que la "corrige", alguien que la retipea— y el alfabeto
 * no tiene ningún par que se distinga solo por la caja.
 */
export function parseOverlayKey(input: string): string | null {
  const cleaned = input.trim().toUpperCase();
  if (cleaned.length !== OVERLAY_KEY_LENGTH) return null;
  if (![...cleaned].every((ch) => OVERLAY_KEY_ALPHABET.includes(ch))) return null;
  return cleaned;
}
