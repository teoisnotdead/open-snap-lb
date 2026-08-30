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

/**
 * Si este jugador pidió su ficha y se la dieron.
 *
 * Vive acá y no en `lib/overlay.ts` porque ese módulo lo importa un componente
 * cliente: cualquier camino hacia el driver de Mongo, aunque sea un
 * `await import()`, termina con el bundler pidiendo `child_process` en el
 * navegador.
 *
 * El overlay está limitado a los vinculados, y el motivo es de cuota antes que
 * de producto: cada capa abierta es una consulta por minuto contra las
 * invocaciones de Vercel, y sin este corte cualquiera puede apuntar un overlay
 * a cualquier fila del top 1000 y hacer correr esa cuenta.
 *
 * **Ante un error de base devuelve `true`, no `false`.** Va al revés que el
 * resto del proyecto —donde sin configuración se cierra— porque acá no se
 * protege nada secreto: el ladder es público y las filas ya salen del
 * leaderboard oficial, no de Mongo. Fallar cerrado dejaría la capa de un stream
 * en vivo en negro durante un hipo de la base, que es mucho peor que servir
 * unas filas públicas de más.
 */
export async function isLinked(nameKey: string): Promise<boolean> {
  try {
    const players = await playersCollection();
    return (await players.countDocuments({ nameKey }, { limit: 1 })) > 0;
  } catch (err) {
    console.error("No se pudo verificar si el jugador está vinculado:", err);
    return true;
  }
}
