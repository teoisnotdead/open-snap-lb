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
