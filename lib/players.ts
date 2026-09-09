import { randomInt } from "node:crypto";
import type { Filter } from "mongodb";
import { playersCollection } from "./db";
import { OVERLAY_KEY_ALPHABET, OVERLAY_KEY_LENGTH } from "./overlay-key";
import { SOCIAL_FIELDS } from "./profile-fields";
import type { PlayerDoc, SocialField } from "./types";

/**
 * ¿Alguno de estos canales ya es de otra cuenta?
 *
 * El índice único parcial de `players` ya impide el choque, pero un E11000 no
 * dice A QUIÉN pertenece el canal, y esa es justamente la información que sirve
 * —al admin para decidir a cuál de los dos le corresponde, y al jugador para
 * entender que se equivocó de handle. Así que se pregunta antes, y el índice
 * queda como red de contención ante una carrera entre dos escrituras.
 *
 * `self` es el `nameKey` de la cuenta que está escribiendo: sus propios valores
 * no son un choque consigo misma, que es el caso normal al editar.
 */
export async function findSocialConflict(
  socials: Partial<Record<SocialField, string>>,
  self: string
): Promise<PlayerDoc | null> {
  const claimed = SOCIAL_FIELDS.filter((f) => socials[f]).map(
    (f) => ({ [f]: socials[f] }) as Filter<PlayerDoc>
  );
  if (claimed.length === 0) return null;

  const players = await playersCollection();
  return players.findOne({ nameKey: { $ne: self }, $or: claimed });
}

/**
 * Una llave de overlay nueva. Vive acá y no en `lib/overlay-key.ts` porque usa
 * `node:crypto`, y ese archivo lo importa un componente cliente.
 */
export function generateOverlayKey(): string {
  let out = "";
  for (let i = 0; i < OVERLAY_KEY_LENGTH; i++) {
    out += OVERLAY_KEY_ALPHABET[randomInt(OVERLAY_KEY_ALPHABET.length)];
  }
  return out;
}

/**
 * El jugador dueño de esta llave, o null.
 *
 * Es la única entrada al overlay. Una llave mal formada y una que no existe
 * devuelven lo mismo a propósito, igual que con el `statusToken`: distinguirlas
 * le confirmaría a quien prueba al azar que acertó el formato.
 *
 * Acá se falla CERRADO, y es un cambio respecto de cómo funcionaba el overlay
 * antes. El corte anterior —`isLinked`, que ya no existe— devolvía `true` ante
 * un error de base a propósito, porque no protegía nada: el ladder es público y
 * la URL era adivinable de todos modos. Esta consulta sí es la puerta, y una
 * puerta que se abre sola cuando Mongo tose no es una puerta.
 *
 * El costo es real y conocido: durante una caída de la base, las capas abiertas
 * en OBS muestran el aviso en vez de las filas. Se recuperan solas en el
 * refresco siguiente, que es cada 60 s.
 */
export async function findPlayerByOverlayKey(key: string): Promise<PlayerDoc | null> {
  const players = await playersCollection();
  return players.findOne({ overlayKey: key });
}

/**
 * La llave de este jugador, generándola si todavía no tiene.
 *
 * Esto ES la migración, y por eso no hay script de backfill: los jugadores
 * aprobados antes de que existiera el campo se la ganan la primera vez que
 * abren su página de código, que es exactamente el momento en que la necesitan.
 * Un script tendría que acordarse de correrlo alguien.
 *
 * El reintento es por el choque de `uniq_overlay_key`. Con 30^16 no va a pasar
 * nunca, pero el mismo criterio se aplica en el insert de `submissions` y en la
 * rotación del `joinCode`: un duplicado no reintentado sería un 500 por mala
 * suerte pura.
 */
export async function ensureOverlayKey(nameKey: string): Promise<string | null> {
  const players = await playersCollection();

  const existing = await players.findOne({ nameKey }, { projection: { overlayKey: 1 } });
  if (!existing) return null;
  if (existing.overlayKey) return existing.overlayKey;

  for (let attempt = 0; attempt < 3; attempt++) {
    const overlayKey = generateOverlayKey();
    try {
      /**
       * El filtro incluye `overlayKey: { $exists: false }` y no solo el
       * `nameKey`: si dos pestañas de la misma persona entran a la vez, la
       * segunda no pisa la llave que acaba de escribir la primera —lo que le
       * rompería el OBS a alguien que quizá ya copió la URL.
       */
      const res = await players.updateOne(
        { nameKey, overlayKey: { $exists: false } },
        { $set: { overlayKey, updatedAt: new Date() } }
      );

      if (res.modifiedCount === 1) return overlayKey;

      // Perdimos la carrera: la llave buena es la que quedó escrita.
      const now = await players.findOne({ nameKey }, { projection: { overlayKey: 1 } });
      return now?.overlayKey ?? null;
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }

  return null;
}
