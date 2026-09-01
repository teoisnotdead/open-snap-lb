import { randomInt } from "node:crypto";
import { alliancesCollection, playersCollection } from "./db";
import { ALPHABET } from "./tokens";
import type { AllianceDoc } from "./types";

/**
 * La alianza como entidad: lecturas y el código de invitación.
 *
 * El porqué de todo esto está en docs/alliances.md. El resumen es que la
 * alianza era texto libre copiado en cada jugador, así que la misma alianza se
 * mostraba escrita de varias formas, y no había forma de que nadie respondiera
 * por quién pertenece a cuál.
 */

/**
 * Longitud del código de invitación.
 *
 * OCHO, contra los doce del `statusToken`, y la diferencia es funcional: los
 * dos códigos van a circular por el mismo Discord, y `parseStatusToken` exige
 * exactamente 12 caracteres. Con largos distintos, un código pegado en el campo
 * equivocado se rechaza por estructura —sin tocar la base— y se le puede decir
 * a la persona CUÁL de los dos puso mal. Con largos iguales, ese error termina
 * en un 404 genérico y en un mensaje preguntando qué pasó.
 *
 * 30^8 ≈ 6.6 × 10^11. Es menos que el token de estado, y está bien que lo sea:
 * el token es la llave de UNA ficha y es el único factor; el código solo suma
 * pertenencia a una alianza sobre una identidad que ya validó un humano.
 */
export const JOIN_CODE_LENGTH = 8;

/** Mismo alfabeto Crockford del `statusToken`: ver el porqué en lib/tokens.ts. */
export function generateJoinCode(): string {
  let out = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

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
  if (![...cleaned].every((ch) => ALPHABET.includes(ch))) return null;
  return cleaned;
}

/** Una alianza tal como la ve el público. Sin `joinCode`, obviamente. */
export interface AlliancePublic {
  tag: string;
  name: string;
  /** Jugadores publicados con este tag. */
  members: number;
  /**
   * Si alguien la reclamó y un admin se lo aprobó.
   *
   * La UI lo necesita para distinguir dos cosas que se ven igual: una alianza a
   * la que se puede entrar con su código, y una que salió del backfill y a la
   * que no se puede entrar hasta que alguien la reclame. Va como booleano y no
   * como el `nameKey` del líder porque para eso alcanza.
   */
  hasLeader: boolean;
}

/**
 * Las alianzas aprobadas, con cuántos miembros publicados tiene cada una.
 *
 * El conteo sale de `players` y no de un contador guardado en la alianza: la
 * membresía vive en `players.alliance` y un contador denormalizado sería el
 * mismo dato en dos lugares. `players` solo tiene a los jugadores APROBADOS
 * —no a los 1000 del ladder— así que agrupar la colección entera es barato.
 */
export async function listApprovedAlliances(): Promise<AlliancePublic[]> {
  const [alliances, players] = await Promise.all([
    alliancesCollection(),
    playersCollection(),
  ]);

  const [docs, counts] = await Promise.all([
    alliances
      .find(
        { status: "approved" },
        { projection: { tag: 1, name: 1, leaderNameKey: 1 } }
      )
      .sort({ tag: 1 })
      .toArray(),
    players
      .aggregate<{ _id: string; n: number }>([
        { $match: { alliance: { $exists: true, $ne: null } } },
        { $group: { _id: "$alliance", n: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const byTag = new Map(counts.map((c) => [c._id, c.n]));

  return docs.map((d) => ({
    tag: d.tag,
    name: d.name,
    members: byTag.get(d.tag) ?? 0,
    hasLeader: Boolean(d.leaderNameKey),
  }));
}

/** Una alianza aprobada por su tag. El tag ya tiene que venir normalizado. */
export async function findAllianceByTag(tag: string): Promise<AllianceDoc | null> {
  const alliances = await alliancesCollection();
  return alliances.findOne({ tag, status: "approved" });
}
