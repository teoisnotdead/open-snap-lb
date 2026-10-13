import {
  alliancesCollection,
  playersCollection,
  snapshotsCollection,
  submissionsCollection,
} from "./db";
import { disambiguate, indexByNameKey } from "./leaderboard";
import { getClient } from "./mongodb";
import { isValidNameKey, toNameKey } from "./names";
import type { LeaderboardRow, SubmissionDoc } from "./types";

/**
 * Mudar una ficha a otro nombre, con el código como única llave.
 *
 * Existe porque el nombre ES la identidad (ver docs/data-model.md) y el juego
 * deja cambiárselo: quien se renombra queda con una ficha que ya no matchea
 * ninguna fila —sin links, sin tick, sin historial nuevo— y no podía arreglarlo
 * pidiendo otra, porque sus canales siguen tomados por la ficha vieja y la
 * aprobación choca contra ella. La única salida era borrar el documento a mano.
 *
 * NO pasa por la cola, y es la decisión discutible de este archivo. El código
 * prueba que quien pide es la persona que el admin ya aprobó; lo que no prueba
 * es que el nombre nuevo sea suyo, y eso no lo puede probar nadie —no hay IDs—,
 * tampoco quien revisa. Así que la revisión agregaría espera sobre una ficha
 * que mientras tanto está rota, y lo que se hace es acotar cuándo se puede:
 *
 *  - solo si el nombre actual YA NO está en el ladder. Es lo que hace inofensivo
 *    un código filtrado: una ficha que funciona no se puede mover, así que nadie
 *    te la saca de tu fila. Y después de mudarla tampoco se puede volver a mover
 *    mientras el nombre nuevo siga en la tabla;
 *  - solo a un nombre que esté en el ladder ahora y que no tenga ficha ni una
 *    petición pendiente. Dos reclamos sobre el mismo nombre sí son una pregunta
 *    para un humano;
 *  - dejando rastro en la petición (`renamedFrom`, `renamedAt`, `renameCount`),
 *    que el panel muestra.
 *
 * Lo que queda abierto: alguien ya aprobado, cuyo nombre no esté en la tabla,
 * puede mudar su ficha a la fila de otro que no esté vinculado. Se ve en el
 * panel y tiene un contacto guardado detrás. Si alguna vez molesta, la mudanza
 * entera vive en `movePlayer` y mandarla a la cola es cambiar quién la llama.
 */

export type RenameCheck =
  | { ok: true; row: LeaderboardRow }
  | { ok: false; error: string; status: number };

export interface RenameTarget {
  /** El nombre nuevo, tal como lo mandó el cliente. */
  playerName: string;
  /** El puesto de la fila elegida. Solo decide algo si el nombre está repetido. */
  rank?: number;
}

/**
 * Las reglas que se contestan mirando solo el ladder. Pura, para poder probarla
 * con filas inventadas: ver scripts/test-rename.ts.
 */
export function resolveRename(
  rows: LeaderboardRow[],
  from: Pick<SubmissionDoc, "nameKey" | "playerName">,
  target: RenameTarget
): RenameCheck {
  const toKey = toNameKey(target.playerName);
  if (!isValidNameKey(toKey)) {
    return {
      ok: false,
      error: "Nombre inválido. El juego permite hasta 20 caracteres.",
      status: 400,
    };
  }

  // Cambiar solo mayúsculas o espacios no cambia el `nameKey`: el sync ya sigue
  // a esa fila y actualiza el nombre exacto solo.
  if (toKey === from.nameKey) {
    return { ok: false, error: "Tu ficha ya está a ese nombre.", status: 400 };
  }

  const byKey = indexByNameKey(rows);

  const still = byKey.get(from.nameKey);
  if (still?.length) {
    return {
      ok: false,
      error: `Tu ficha sigue en el ladder como "${still[0].playerName}" (#${still[0].rank}), así que no hay nada que mover. Si te acabas de cambiar el nombre, la tabla oficial tarda unos minutos en mostrarlo: prueba de nuevo en un rato.`,
      status: 409,
    };
  }

  const candidates = byKey.get(toKey);
  if (!candidates?.length) {
    return {
      ok: false,
      error: `No encontramos a "${target.playerName.trim()}" en el ladder actual. La ficha solo se puede mover a un nombre que esté en el top 1000 ahora mismo.`,
      status: 404,
    };
  }

  /**
   * La fila más cercana al puesto elegido, no la exacta: entre que se cargó la
   * lista y se apretó el botón alguien pudo subir un lugar, y eso no cambia cuál
   * de los homónimos es esta persona. Sin puesto y con el nombre repetido no se
   * adivina — mismo criterio que el sync.
   */
  const row = disambiguate(candidates, target.rank);
  if (!row) {
    return {
      ok: false,
      error: `Hay ${candidates.length} jugadores con ese nombre en el ladder. Elige tu fila de la lista para que sepamos cuál eres.`,
      status: 409,
    };
  }

  return { ok: true, row };
}

const taken = (name: string) =>
  `"${name}" ya tiene una ficha. Si es tuya, ábrela con el código de esa ficha; si no lo es, escríbenos.`;

/**
 * Valida y muda. Es la única entrada: la ruta solo le pasa el ladder de AHORA.
 *
 * Las dos consultas previas son para poder decir QUÉ pasa; la que de verdad
 * impide pisar la ficha de otro es `uniq_nameKey`, dentro de `movePlayer`.
 */
export async function renamePlayer(
  from: Pick<SubmissionDoc, "nameKey" | "playerName">,
  rows: LeaderboardRow[],
  target: RenameTarget
): Promise<RenameCheck> {
  const check = resolveRename(rows, from, target);
  if (!check.ok) return check;
  const { row } = check;

  const players = await playersCollection();
  if (await players.findOne({ nameKey: row.nameKey }, { projection: { _id: 1 } })) {
    return { ok: false, error: taken(row.playerName), status: 409 };
  }

  const submissions = await submissionsCollection();
  const contested = await submissions.findOne(
    { nameKey: row.nameKey, status: "pending" },
    { projection: { _id: 1 } }
  );
  if (contested) {
    return {
      ok: false,
      error: `Hay una petición pendiente por "${row.playerName}" esperando revisión. Hasta que se resuelva no se puede mover una ficha a ese nombre.`,
      status: 409,
    };
  }

  const moved = await movePlayer(from, row);
  if (moved === "taken") return { ok: false, error: taken(row.playerName), status: 409 };
  if (moved === "missing") {
    return {
      ok: false,
      error:
        "Tu petición figura aprobada pero no encontramos tu ficha publicada. Escríbenos para que lo revisemos.",
      status: 409,
    };
  }

  return check;
}

/** Corta la transacción desde adentro sin que parezca una falla de Mongo. */
class MoveAbort extends Error {}

/**
 * Lleva todo lo que cuelga de un `nameKey` a otro, o nada.
 *
 * Es la única transacción del proyecto, y lo es porque es la única escritura
 * que no puede quedar a medias. Si la ficha se mudara y la petición no, el
 * código seguiría apuntando al nombre viejo — que queda libre, así que el día
 * que otro lo vincule ese código editaría la ficha de un desconocido.
 *
 * Lo que se muda:
 *  - `players`: la ficha, con su `overlayKey`. La URL pegada en OBS sigue
 *    andando sin tocar nada, porque nunca dependió del nombre.
 *  - `submissions`: TODAS las aprobadas de ese nombre, no solo la del código que
 *    se usó. Cada una es una llave de esta misma ficha, y dejar alguna atrás es
 *    el agujero de arriba.
 *  - `alliances`: el liderazgo, y también el veto. Un expulsado que se cambia el
 *    nombre sigue expulsado, y el nombre que deja no hereda el castigo.
 *  - `snapshots`: el historial horario, que es de la cuenta y no del nombre.
 *    Cada punto conserva el `playerName` que tenía, así que el cambio se ve.
 *
 * Lo que NO: `boardDailies`, `boardBaselines` y `seasonResults` son fotos del
 * ladder tal como fue. Ahí esa fila se llamaba como se llamaba.
 */
export async function movePlayer(
  from: Pick<SubmissionDoc, "nameKey" | "playerName">,
  row: LeaderboardRow,
  now: Date = new Date()
): Promise<"moved" | "taken" | "missing"> {
  const client = await getClient();
  const [players, submissions, alliances, snapshots] = await Promise.all([
    playersCollection(),
    submissionsCollection(),
    alliancesCollection(),
    snapshotsCollection(),
  ]);

  const to = row.nameKey;

  try {
    await client.withSession((session) =>
      session.withTransaction(async () => {
        const res = await players.updateOne(
          { nameKey: from.nameKey },
          {
            $set: {
              nameKey: to,
              playerName: row.playerName,
              /**
               * Pisado, no sembrado como en la aprobación: el `lastRank` que
               * había es del nombre viejo, y con el nuevo repetido en el ladder
               * `disambiguate` elegiría la fila de un homónimo por cercanía a un
               * puesto que ya no significa nada. `lastScore` no se toca, por lo
               * mismo que allá: es del sync.
               */
              lastRank: row.rank,
              updatedAt: now,
            },
            // Era el override de display del nombre VIEJO: si se queda, la fila
            // nueva se muestra con el nombre que la persona acaba de dejar.
            $unset: { patchedName: "" },
          },
          { session }
        );
        if (res.matchedCount === 0) throw new MoveAbort();

        await submissions.updateMany(
          { nameKey: from.nameKey, status: "approved" },
          {
            $set: {
              nameKey: to,
              playerName: row.playerName,
              renamedFrom: from.playerName,
              renamedAt: now,
              updatedAt: now,
            },
            $inc: { renameCount: 1 },
          },
          { session }
        );

        await alliances.updateMany(
          { leaderNameKey: from.nameKey },
          { $set: { leaderNameKey: to, updatedAt: now } },
          { session }
        );
        await alliances.updateMany(
          { bannedNameKeys: from.nameKey },
          { $set: { "bannedNameKeys.$": to, updatedAt: now } },
          { session }
        );

        /**
         * Si el nombre nuevo ya tiene puntos —los dejó una ficha que existió y
         * se borró— el historial viejo se queda donde está. Mezclarlos chocaría
         * con `uniq_player_sync` en las horas que compartan, y eso abortaría la
         * mudanza entera por un dato que no es de esta persona.
         */
        const occupied = await snapshots.countDocuments({ nameKey: to }, { limit: 1, session });
        if (occupied === 0) {
          await snapshots.updateMany(
            { nameKey: from.nameKey },
            { $set: { nameKey: to } },
            { session }
          );
        }
      })
    );
  } catch (err) {
    if (err instanceof MoveAbort) return "missing";

    /**
     * Alguien aprobó ese nombre entre la consulta previa y esto. Se mira el
     * nombre del índice, como en el insert de `submissions`: cualquier otro
     * E11000 acá es un bug y tiene que verse como tal.
     */
    const e = err as { code?: number; message?: string };
    if (e.code === 11000 && e.message?.includes("uniq_nameKey")) return "taken";
    throw err;
  }

  return "moved";
}
