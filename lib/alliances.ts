import { randomInt } from "node:crypto";
import { alliancesCollection, playersCollection } from "./db";
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from "./join-code";
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
 * Genera un código de invitación. Vive de este lado y no en `lib/join-code.ts`
 * porque usa `node:crypto`, y ese módulo tiene que poder importarse desde el
 * cliente — la pantalla del líder muestra el código.
 */
export function generateJoinCode(): string {
  let out = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    out += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return out;
}

// Reexportadas para que quien ya importaba de acá no tenga que saber del corte.
export { JOIN_CODE_LENGTH, formatJoinCode, parseJoinCode } from "./join-code";

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

  /**
   * Si hace falta el código del líder para entrar.
   *
   * Es lo mismo que tener líder, y va como campo aparte igual porque es lo que
   * la UI necesita saber: si pedir el código o no. Que hoy coincidan es una
   * consecuencia —solo una alianza con líder tiene código— y no algo en lo que
   * el formulario deba apoyarse.
   *
   * Una alianza SIN líder queda abierta, y no es un descuido: no hay nadie que
   * pueda responder por quién pertenece a ella, así que exigir un código sería
   * pedir algo que nadie puede dar. Es también el incentivo para reclamarla.
   */
  requiresCode: boolean;
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
        { projection: { tag: 1, name: 1, leaderNameKey: 1, joinCode: 1 } }
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
    requiresCode: Boolean(d.joinCode),
  }));
}

/** Una alianza aprobada por su tag. El tag ya tiene que venir normalizado. */
export async function findAllianceByTag(tag: string): Promise<AllianceDoc | null> {
  const alliances = await alliancesCollection();
  return alliances.findOne({ tag, status: "approved" });
}

/**
 * La alianza que lidera el dueño de este `statusToken`, o un motivo.
 *
 * La credencial del líder es su propio token de seguimiento: no hay un tercer
 * secreto. La decisión y su costo —un token filtrado pasa a poder tocar también
 * la alianza— están en docs/alliances.md. Lo que la hace aceptable es que el
 * daño es reversible: a un expulsado se lo puede readmitir.
 *
 * Vive acá y no en cada ruta por el mismo motivo que `parseProfileFields`: si
 * cada una resolviera el permiso por su cuenta, alcanzaría con que UNA lo
 * hiciera distinto para que se pueda expulsar sin liderar.
 */
export async function findLedAlliance(
  tag: string,
  statusToken: string | undefined
): Promise<{ ok: true; alliance: AllianceDoc } | { ok: false; error: string; status: number }> {
  if (!statusToken?.trim()) {
    return { ok: false, error: "Falta tu código de seguimiento.", status: 401 };
  }

  const { findSubmissionByToken } = await import("./submissions");
  const sub = await findSubmissionByToken(statusToken.trim());

  /**
   * Un token inexistente, uno de una petición no aprobada y uno de alguien que
   * no lidera esta alianza dan TODOS el mismo 403.
   *
   * Distinguirlos convertiría esta ruta en un oráculo: con un token cualquiera
   * se podría averiguar si existe, si está aprobado y qué alianza lidera. El
   * mensaje es peor para depurar y es lo correcto para una ruta pública.
   */
  const alliance = await findAllianceByTag(tag);
  if (!sub || sub.status !== "approved" || !alliance || alliance.leaderNameKey !== sub.nameKey) {
    return { ok: false, error: "No lideras esa alianza.", status: 403 };
  }

  return { ok: true, alliance };
}

/**
 * Los miembros publicados de una alianza: quiénes tienen ese tag en `players`.
 *
 * No hay una lista de miembros guardada en la alianza —la membresía vive en
 * `players.alliance`— así que esto ES la lista. Ver `AllianceDoc`.
 */
export async function listAllianceMembers(
  tag: string
): Promise<{ nameKey: string; playerName: string; lastRank?: number }[]> {
  const players = await playersCollection();
  return players
    .find(
      { alliance: tag },
      { projection: { nameKey: 1, playerName: 1, patchedName: 1, lastRank: 1 } }
    )
    .sort({ lastRank: 1 })
    .toArray()
    .then((docs) =>
      docs.map((d) => ({
        nameKey: d.nameKey,
        playerName: d.patchedName ?? d.playerName,
        lastRank: d.lastRank,
      }))
    );
}
