import { ObjectId } from "mongodb";
import { alliancesCollection, playersCollection } from "@/lib/db";
import { apiError, json, readJson, requireAdminAuth } from "@/lib/api";
import { getAdminSession } from "@/lib/admin-auth";
import { parseAllianceName } from "@/lib/socials";

export const dynamic = "force-dynamic";

const MAX_REASON = 300;

interface Body {
  action?: "approve" | "reject";
  reason?: string;
  /**
   * Nombre corregido al aprobar.
   *
   * Existe porque el backfill elige el nombre canónico con una heurística —el
   * más frecuente— y puede equivocarse, y porque quien pide una alianza la
   * puede escribir mal. Corregir acá es más barato que rechazar y pedir de
   * nuevo, y es EL momento en que un humano está mirando el dato.
   */
  name?: string;
}

/**
 * POST /api/admin/alliances/[id] — aprueba o rechaza una alianza.
 *
 * Aprobar la vuelve elegible en el selector del formulario. **No le pone
 * líder ni código**: eso es reclamar el liderazgo, que es otra afirmación con
 * su propia validación (ver docs/alliances.md).
 *
 * Si al aprobar se corrige el nombre, el cambio se propaga a los jugadores que
 * ya tenían ese tag publicado. Es la contracara de haber denormalizado
 * `players.allianceName`: la lectura del leaderboard se ahorra un join, y el
 * precio se paga acá, en una escritura rara y sobre pocos documentos.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminAuth();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  if (!ObjectId.isValid(id)) return apiError("Id inválido.", 404);

  const body = await readJson<Body>(req);
  const action = body?.action;

  if (action !== "approve" && action !== "reject") {
    return apiError("`action` tiene que ser 'approve' o 'reject'.");
  }

  const reason = body?.reason?.trim();
  if (action === "reject" && !reason) {
    return apiError("Al rechazar hace falta un motivo: es lo que ve quien pidió.");
  }
  if (reason && reason.length > MAX_REASON) {
    return apiError(`El motivo no puede pasar de ${MAX_REASON} caracteres.`);
  }

  let name: string | undefined;
  if (body?.name?.trim()) {
    const parsed = parseAllianceName(body.name.trim());
    if (!parsed.ok) return apiError(`name: ${parsed.error}`);
    name = parsed.value;
  }

  try {
    const alliances = await alliancesCollection();
    const doc = await alliances.findOne({ _id: new ObjectId(id) });
    if (!doc) return apiError("No existe esa alianza.", 404);

    if (doc.status !== "pending") {
      return apiError(`Esa alianza ya está ${doc.status}.`, 409);
    }

    const now = new Date();
    const session = await getAdminSession();

    await alliances.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: action === "approve" ? "approved" : "rejected",
          ...(name ? { name } : {}),
          ...(action === "reject" ? { rejectionReason: reason } : {}),
          reviewedAt: now,
          reviewedBy: session?.user ?? "admin",
          updatedAt: now,
        },
      }
    );

    /**
     * Propagación del nombre corregido. Solo si CAMBIÓ: un `updateMany` que no
     * cambia nada igual escribe, y no hay razón para tocar los documentos de
     * los jugadores porque un admin apretó aprobar.
     */
    let propagated = 0;
    if (action === "approve" && name && name !== doc.name) {
      const players = await playersCollection();
      const res = await players.updateMany(
        { alliance: doc.tag },
        { $set: { allianceName: name, updatedAt: now } }
      );
      propagated = res.modifiedCount;
    }

    return json({
      ok: true,
      tag: doc.tag,
      name: name ?? doc.name,
      status: action === "approve" ? "approved" : "rejected",
      propagated,
    });
  } catch (err) {
    console.error("POST /api/admin/alliances/[id] falló:", err);
    return apiError("No se pudo procesar la alianza.", 500);
  }
}
