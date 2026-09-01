/**
 * El código de invitación de una alianza: solo lo que es texto puro.
 *
 * Está separado de `lib/alliances.ts` por una razón concreta y no por prolijidad:
 * ese módulo importa la colección de Mongo, y la pantalla del líder —que muestra
 * el código— es un componente de cliente. Importarlo desde ahí arrastraba el
 * driver entero al bundle del navegador y el build se caía buscando `dns` y
 * `child_process`.
 *
 * Acá no hay nada que dependa del servidor. `generateJoinCode` se queda del otro
 * lado, porque usa `node:crypto` y solo corre al aprobar una alianza.
 */

/**
 * Mismo alfabeto Crockford del `statusToken` —sin 0/1/I/L/O/U— porque el código
 * se dicta por voz y se copia a mano. Va escrito de nuevo en vez de importarse
 * de `lib/tokens.ts` justamente para que este archivo no importe nada: es la
 * única forma de garantizar que no arrastre `node:crypto` al cliente.
 *
 * `scripts/test-alliances.ts` verifica que los dos alfabetos coincidan, así que
 * si alguno cambia la prueba lo dice.
 */
export const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * OCHO caracteres, contra los doce del `statusToken`, y la diferencia es
 * funcional: los dos van a circular por el mismo Discord, y `parseStatusToken`
 * exige exactamente 12. Con largos distintos, un código pegado en el campo
 * equivocado se rechaza por estructura —sin tocar la base— y se le puede decir a
 * la persona CUÁL de los dos puso mal. Con largos iguales, ese error da un 404
 * genérico y termina en un mensaje preguntando qué pasó.
 */
export const JOIN_CODE_LENGTH = 8;

/** Para mostrar: `K7M2-QW9X`. Los guiones no se guardan. */
export function formatJoinCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? []).join("-");
}

/**
 * Normaliza lo que la persona pega: acepta guiones, espacios y minúscula.
 * Devuelve null si no puede ser un código, para no ir a la base al pedo.
 */
export function parseJoinCode(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/[\s-]/g, "");
  if (cleaned.length !== JOIN_CODE_LENGTH) return null;
  if (![...cleaned].every((ch) => JOIN_CODE_ALPHABET.includes(ch))) return null;
  return cleaned;
}
