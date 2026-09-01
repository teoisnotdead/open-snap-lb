import { ObjectId } from "mongodb";
import { apiError, json, readJson } from "@/lib/api";
import { playersCollection, submissionsCollection } from "@/lib/db";
import { findSocialConflict } from "@/lib/players";
import { parseProfileFields, SOCIAL_FIELDS } from "@/lib/profile-fields";
import { findSubmissionByToken, toPublicStatus } from "@/lib/submissions";
import type { ProfileFieldsInput } from "@/lib/profile-fields";
import type { PlayerDoc, SubmissionDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/submissions/[token] — estado de una petición.
 *
 * Sin cuentas ni notificaciones, esta ruta es la única forma que tiene el
 * solicitante de saber cómo quedó. La llave es el token aleatorio que se le
 * entregó al enviar, no el `_id`: ver `generateStatusToken`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const doc = await findSubmissionByToken(token);
    if (!doc) return apiError("No encontramos ninguna petición con ese código.", 404);
    return json(toPublicStatus(doc));
  } catch (err) {
    console.error("GET /api/submissions/[token] falló:", err);
    return apiError("No se pudo leer la petición.", 500);
  }
}

/** Campos que el jugador edita solo. El contacto NO está: ver abajo. */
const EDITABLE = ["twitch", "youtube", "untapped", "allianceTag"] as const;

/**
 * PATCH /api/submissions/[token] — el jugador corrige sus propios datos.
 *
 * Es la única escritura pública que publica algo sin pasar por el panel, y se
 * apoya entera en una decisión que ya se tomó: aprobar la petición fue el
 * momento en que un humano dio por buena la identidad de quien la mandó. Nada
 * de lo que se puede tocar acá vuelve a poner eso en duda —un handle de Twitch
 * y un nombre de alianza son datos declarados, tan indemostrables el día de la
 * edición como el día de la aprobación—, así que mandarlos de nuevo a la cola
 * solo agregaría espera sin agregar certeza. Mientras tanto los datos viejos
 * siguen publicados, que es el costo real de no tener esta ruta.
 *
 * De ahí las tres condiciones: hace falta el código, la petición tiene que
 * estar `approved`, y solo se tocan los campos que ya eran públicos.
 *
 * El CONTACTO queda afuera. No es un dato del perfil sino la forma de llegar a
 * la persona si algo hay que repreguntar o revertir, y un código puede terminar
 * en una captura o en un historial compartido: dejar que quien lo tenga cambie
 * el Discord de destino convertiría una fuga en un secuestro silencioso de la
 * ficha. Para cambiarlo hay que escribir, y ahí hay un humano mirando.
 *
 * El body REEMPLAZA el bloque entero: lo que no venga se borra. Es lo que hace
 * un formulario que se abre con los valores actuales y se manda completo, y
 * evita tener que inventar una diferencia entre "no lo mandé" y "lo quiero
 * vacío" — que, sobre un form HTML, son el mismo request.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await readJson<ProfileFieldsInput>(req);

  if (!body || typeof body !== "object") {
    return apiError("Body inválido.");
  }

  try {
    const doc = await findSubmissionByToken(token);

    // Mismo silencio que en GET: un código mal formado y uno inexistente dan lo
    // mismo, para no confirmarle a nadie que un código existe.
    if (!doc) return apiError("No encontramos ninguna petición con ese código.", 404);

    if (doc.status !== "approved") {
      return apiError(
        doc.status === "pending"
          ? "Tu petición todavía está en revisión. Vas a poder editarla cuando se apruebe."
          : "Esta petición no fue aprobada, así que no hay nada publicado para editar. Envía una nueva.",
        409
      );
    }

    /**
     * Se valida DESPUÉS de encontrar la petición, y no antes como haría el
     * instinto de rechazar barato: `parseProfileFields` necesita el `nameKey`
     * para aplicar el veto de la alianza, y acá es donde se sabe cuál es.
     *
     * Sin ese dato, esta ruta —que es justamente la que usaría alguien recién
     * expulsado— sería el agujero por el que volver a entrar.
     */
    const parsed = await parseProfileFields(body, {
      nameKey: doc.nameKey,
      currentAllianceTag: doc.allianceTag,
    });
    if (!parsed.ok) return apiError(parsed.error);
    const { socials, allianceTag, allianceName } = parsed.fields;

    const conflict = await findSocialConflict(socials, doc.nameKey);
    if (conflict) {
      return apiError(
        `Ese canal ya está asignado a "${conflict.playerName}". Si es tuyo, escríbenos: hay que resolverlo a mano.`,
        409
      );
    }

    const players = await playersCollection();
    const now = new Date();

    /**
     * `$unset` de lo que no vino. Sin esto no habría forma de SACARSE un canal:
     * el `$set` solo pisa lo que mandás, así que un Twitch cargado por error
     * quedaría publicado para siempre.
     */
    const unsetPlayer: Record<string, ""> = {};
    for (const f of SOCIAL_FIELDS) if (!socials[f]) unsetPlayer[f] = "";
    if (!allianceTag) unsetPlayer.alliance = "";
    if (!allianceName) unsetPlayer.allianceName = "";

    let res;
    try {
      res = await players.updateOne(
        { nameKey: doc.nameKey },
        {
          $set: {
            ...socials,
            ...(allianceTag ? { alliance: allianceTag } : {}),
            ...(allianceName ? { allianceName } : {}),
            updatedAt: now,
          } as Partial<PlayerDoc>,
          ...(Object.keys(unsetPlayer).length > 0 ? { $unset: unsetPlayer } : {}),
        }
        /**
         * Sin `upsert`, a diferencia de la aprobación: acá el documento TIENE
         * que existir. Si no existe, algo se rompió antes —una aprobación a
         * medias, un borrado manual— y crear uno nuevo publicaría una ficha
         * verificada que nadie revisó.
         */
      );
    } catch (err) {
      // El índice único, cubriendo la carrera entre el chequeo de arriba y esto.
      if ((err as { code?: number }).code === 11000) {
        return apiError(
          "Ese canal acaba de quedar asignado a otra cuenta. Recarga y revisa.",
          409
        );
      }
      throw err;
    }

    if (res.matchedCount === 0) {
      console.error(
        `PATCH /api/submissions: la petición ${doc._id} está aprobada pero no hay jugador con nameKey "${doc.nameKey}".`
      );
      return apiError(
        "Tu petición figura aprobada pero no encontramos tu ficha publicada. Escríbenos para que lo revisemos.",
        409
      );
    }

    /**
     * La petición se actualiza también, y no solo por prolijidad: es lo que ve
     * el jugador en "lo que pediste" y lo que ve el panel al revisar el
     * historial. Si solo escribiéramos `players`, las dos pantallas mostrarían
     * datos que ya no son los publicados.
     */
    const unsetSubmission: Record<string, ""> = {};
    for (const f of EDITABLE) {
      const value = f === "allianceTag" ? allianceTag : socials[f];
      if (!value) unsetSubmission[f] = "";
    }
    // `allianceName` no es editable: se deriva del tag. Se va con él.
    if (!allianceTag) unsetSubmission.allianceName = "";

    const submissions = await submissionsCollection();
    await submissions.updateOne(
      { _id: new ObjectId(doc._id) },
      {
        $set: {
          ...socials,
          ...(allianceTag ? { allianceTag } : {}),
          ...(allianceName ? { allianceName } : {}),
          editedAt: now,
          updatedAt: now,
        } as Partial<SubmissionDoc>,
        $inc: { editCount: 1 },
        ...(Object.keys(unsetSubmission).length > 0 ? { $unset: unsetSubmission } : {}),
      }
    );

    const updated = await findSubmissionByToken(token);
    return json({ ok: true, ...toPublicStatus(updated!) });
  } catch (err) {
    console.error("PATCH /api/submissions/[token] falló:", err);
    return apiError("No se pudieron guardar los cambios.", 500);
  }
}
