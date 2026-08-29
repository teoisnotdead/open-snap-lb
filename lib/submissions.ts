import { ObjectId } from "mongodb";
import { submissionsCollection } from "./db";
import { parseStatusToken } from "./tokens";
import type { SubmissionDoc, SubmissionView } from "./types";

/**
 * Busca por `_id`. **Solo para el panel**, que ya está detrás de sesión.
 *
 * Nunca para una ruta pública: los ObjectId llevan un contador incremental, así
 * que desde uno conocido se adivinan los vecinos. Lo público va por
 * `findSubmissionByToken`.
 */
export async function findSubmissionById(id: string): Promise<SubmissionDoc | null> {
  if (!ObjectId.isValid(id)) return null;

  const submissions = await submissionsCollection();
  return submissions.findOne({ _id: new ObjectId(id) });
}

/**
 * Busca por token de consulta. Es la única entrada pública a una petición.
 *
 * Devuelve null tanto si el token está mal formado como si no existe: para
 * quien está del otro lado son el mismo caso, y distinguirlos solo sirve para
 * confirmarle a alguien que un token es válido.
 */
export async function findSubmissionByToken(
  raw: string
): Promise<SubmissionDoc | null> {
  const token = parseStatusToken(raw);
  if (!token) return null;

  const submissions = await submissionsCollection();
  return submissions.findOne({ statusToken: token });
}

/**
 * Pasa un doc a la forma que consume el panel.
 *
 * Las fechas van como ISO string porque un `Date` no cruza el borde de
 * serialización a un client component.
 */
export function toSubmissionView(
  doc: SubmissionDoc,
  candidates?: SubmissionView["candidates"]
): SubmissionView {
  const { _id, createdAt, updatedAt, reviewedAt, editedAt, ...rest } = doc;

  return {
    ...rest,
    id: _id!.toHexString(),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    ...(reviewedAt ? { reviewedAt: reviewedAt.toISOString() } : {}),
    ...(editedAt ? { editedAt: editedAt.toISOString() } : {}),
    ...(candidates?.length ? { candidates } : {}),
  };
}

/**
 * Vista que ve quien tiene el token.
 *
 * Ahora que la llave es un token aleatorio y no un id adivinable, se puede
 * mostrar lo que la persona escribió: le sirve para revisar qué pidió y para
 * entender un rechazo.
 *
 * El CONTACTO sigue afuera igual. No porque el token sea débil, sino porque un
 * token puede terminar en un historial de navegador, en un chat o en una
 * captura, y no hay razón para que un email viaje en esa vista — ya lo tiene
 * quien lo escribió.
 */
export function toPublicStatus(doc: SubmissionDoc) {
  return {
    token: doc.statusToken,
    playerName: doc.playerName,
    status: doc.status,
    ...(doc.twitch ? { twitch: doc.twitch } : {}),
    ...(doc.youtube ? { youtube: doc.youtube } : {}),
    ...(doc.untapped ? { untapped: doc.untapped } : {}),
    ...(doc.allianceTag ? { allianceTag: doc.allianceTag } : {}),
    ...(doc.allianceName ? { allianceName: doc.allianceName } : {}),
    ...(doc.rejectionReason ? { rejectionReason: doc.rejectionReason } : {}),
    createdAt: doc.createdAt.toISOString(),
    ...(doc.reviewedAt ? { reviewedAt: doc.reviewedAt.toISOString() } : {}),
    ...(doc.editedAt ? { editedAt: doc.editedAt.toISOString() } : {}),
    /**
     * Si esta petición se puede editar sola con el código. Lo decide el
     * servidor y no la pantalla: es la misma condición que aplica `PATCH`, y
     * duplicarla en el cliente es pedir que las dos se separen.
     */
    canEdit: doc.status === "approved",
  };
}
