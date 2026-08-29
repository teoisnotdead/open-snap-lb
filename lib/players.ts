import type { Filter } from "mongodb";
import { playersCollection } from "./db";
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
