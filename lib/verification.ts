import { randomInt } from "node:crypto";
import { toNameKey, MAX_NAME_LENGTH } from "./names";

/**
 * Verificación de propiedad de cuenta.
 *
 * El jugador pide un código, lo pega en su nombre de perfil dentro del juego, y
 * nosotros lo buscamos en el ladder en vivo. Poder cambiar ese nombre es la
 * prueba de que controla la cuenta.
 */

/**
 * Alfabeto estilo Crockford base32: sin 0/1 ni I/L/O/U. El jugador tiene que
 * tipear esto a mano en el cliente del juego mirándolo desde otra pantalla, así
 * que se sacan los caracteres que se confunden entre sí (O/0, I/L/1) — y la U,
 * que además evita que salgan palabras desafortunadas.
 */
export const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * 5 caracteres. Es un compromiso con el límite duro de 20 chars del nombre de
 * perfil: tiene que entrar junto a algo del nombre real. 30^5 ≈ 24.3M
 * combinaciones, de sobra para un código de un solo uso con vencimiento.
 */
export const CODE_LENGTH = 5;

/** Ventana de validez. Generosa a propósito: ver nota sobre CloudFront abajo. */
export const CODE_TTL_MINUTES = 60;

export function generateCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export function codeExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + CODE_TTL_MINUTES * 60_000);
}

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
 * Tiene que ser DISTINTO del código de verificación, y la razón es importante:
 * ese código va en el nombre del perfil, o sea que aparece en el leaderboard
 * público. Es secreto para nadie. Usarlo también para consultar el estado
 * regalaría el acceso a cualquiera que mire la tabla.
 *
 * Y tiene que ser aleatorio en vez del ObjectId de Mongo, que es
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Saca el código del nombre y devuelve lo que quedó, ya normalizado. */
export function stripCode(name: string, code: string): string {
  const re = new RegExp(escapeRegExp(code), "gi");
  return toNameKey(name.replace(re, " "));
}

export interface ClaimCheck {
  ok: boolean;
  reason?: string;
}

/**
 * ¿La fila encontrada con el código corresponde de verdad al jugador reclamado?
 *
 * Este chequeo es lo que cierra el agujero de secuestro: sin él, alguien podría
 * pedir un código para "Sizer", pegarlo en el nombre de SU propia cuenta, y
 * confirmar — con lo que marcaríamos verificado a "Sizer" con las redes del
 * atacante. Encontrar el código prueba control de *alguna* cuenta; hay que
 * probar que es la cuenta reclamada.
 *
 * La comparación es por prefijo y no por igualdad por el tope de 20 caracteres:
 * un jugador con el nombre ya al límite tiene que recortarlo para que le entre
 * el código, así que "Nishijima Enj" + código es un match legítimo de
 * "Nishijima Enjoyer XY".
 */
export function checkClaim(
  foundName: string,
  code: string,
  claimedNameKey: string
): ClaimCheck {
  const stripped = stripCode(foundName, code);

  if (stripped.length === 0) {
    return {
      ok: false,
      reason:
        "Tu nombre quedó siendo solo el código. Dejá también parte de tu nombre real para poder identificarte.",
    };
  }

  if (stripped.length < 2) {
    return {
      ok: false,
      reason: "Dejá al menos 2 caracteres de tu nombre real junto al código.",
    };
  }

  if (claimedNameKey === stripped || claimedNameKey.startsWith(stripped)) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: `El código apareció en "${foundName}", que no coincide con el jugador que estás reclamando.`,
  };
}

/**
 * ¿Hay otra cuenta ocupando el nombre reclamado en este mismo momento?
 *
 * `checkClaim` prueba que quien puso el código controla una cuenta cuyo nombre,
 * sin el código, es el reclamado. Lo que NO puede probar es que sea la MISMA
 * cuenta de siempre: alguien que se renombra "730" pasa ese chequeo igual de
 * bien que el dueño, y confirmando se lleva puestas las redes del otro.
 *
 * El delator es que el ladder siga mostrando una fila con el nombre pelado.
 * Cuando el dueño legítimo se renombra, su fila deja de decir "730" y pasa a
 * decir "730 FR5AD": las dos formas no pueden coexistir, porque son la misma
 * cuenta y el ladder trae una fila por cuenta. Verlas a la vez significa que hay
 * dos cuentas distintas en juego, y no tenemos con qué distinguir cuál es la
 * buena.
 *
 * El falso negativo posible es un homónimo genuino: dos personas llamadas "730"
 * y una queriendo verificarse. Preferimos rechazarla antes que arriesgarnos a
 * entregarle la fila —y las redes— a la persona equivocada, el mismo criterio
 * que usa el sync con los nombres repetidos.
 *
 * Devuelve la fila en conflicto, o null si el camino está limpio.
 */
export function findSquatConflict<T extends { nameKey: string }>(
  rows: T[],
  claimedNameKey: string
): T | null {
  return rows.find((r) => r.nameKey === claimedNameKey) ?? null;
}

/**
 * Instrucciones a medida para el jugador: cuántos caracteres tiene que liberar
 * para que el código le entre en el nombre.
 */
export function buildInstructions(playerName: string, code: string) {
  // El código va separado por un espacio.
  const needed = CODE_LENGTH + 1;
  const available = MAX_NAME_LENGTH - playerName.length;
  const mustTrim = Math.max(0, needed - available);

  const suggested =
    mustTrim > 0
      ? `${playerName.slice(0, playerName.length - mustTrim)} ${code}`
      : `${playerName} ${code}`;

  return {
    code,
    suggestedName: suggested,
    /** Cuántos caracteres del nombre actual hay que sacrificar. */
    charsToTrim: mustTrim,
    maxNameLength: MAX_NAME_LENGTH,
    expiresInMinutes: CODE_TTL_MINUTES,
    steps: [
      `Entrá a Marvel Snap y cambiá tu nombre de perfil a: ${suggested}`,
      mustTrim > 0
        ? `Ojo: el juego permite ${MAX_NAME_LENGTH} caracteres, así que hay que recortar ${mustTrim} de tu nombre actual.`
        : `Alcanza con agregar " ${code}" al final de tu nombre.`,
      "Volvé acá y tocá Confirmar. El leaderboard oficial tarda unos minutos en reflejar el cambio, así que puede que tengas que reintentar.",
      "Cuando quede verificado podés volver a tu nombre de siempre.",
    ],
  };
}
