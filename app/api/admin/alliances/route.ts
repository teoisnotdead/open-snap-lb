import { alliancesCollection } from "@/lib/db";
import { apiError, json, requireAdminAuth } from "@/lib/api";
import type { SubmissionStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: SubmissionStatus[] = ["pending", "approved", "rejected"];
const MAX_ROWS = 200;

/**
 * GET /api/admin/alliances?status=pending — la cola de alianzas.
 *
 * Mismo contrato que la cola de peticiones, con otra entidad: es la misma
 * pantalla y el mismo gesto. La diferencia es la escala — acá se revisa una vez
 * por alianza, no una vez por jugador que la declara, que es toda la ganancia
 * operativa de haberla convertido en entidad.
 *
 * Devuelve `members` para poder decidir: una alianza pedida que ya tiene diez
 * jugadores con ese tag publicado es muy distinta de una que no tiene ninguno.
 */
export async function GET(req: Request) {
  const unauthorized = await requireAdminAuth();
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const raw = url.searchParams.get("status") ?? "pending";
  const status = STATUSES.includes(raw as SubmissionStatus)
    ? (raw as SubmissionStatus)
    : null;

  if (!status) return apiError(`status inválido. Usá: ${STATUSES.join(", ")}`);

  try {
    const alliances = await alliancesCollection();
    const docs = await alliances
      .find({ status })
      // Igual que la otra cola: pendientes más viejas primero, revisadas más
      // recientes primero.
      .sort({ createdAt: status === "pending" ? 1 : -1 })
      .limit(MAX_ROWS)
      .toArray();

    const { playersCollection } = await import("@/lib/db");
    const players = await playersCollection();
    const counts = await players
      .aggregate<{ _id: string; n: number }>([
        { $match: { alliance: { $in: docs.map((d) => d.tag) } } },
        { $group: { _id: "$alliance", n: { $sum: 1 } } },
      ])
      .toArray();
    const byTag = new Map(counts.map((c) => [c._id, c.n]));

    return json({
      status,
      count: docs.length,
      truncated: docs.length === MAX_ROWS,
      alliances: docs.map((d) => ({
        id: String(d._id),
        tag: d.tag,
        name: d.name,
        members: byTag.get(d.tag) ?? 0,
        hasLeader: Boolean(d.leaderNameKey),
        // El contacto SÍ va acá: es la razón de ser del panel, y esta ruta ya
        // está detrás de la sesión de admin.
        discord: d.discord,
        email: d.email,
        status: d.status,
        rejectionReason: d.rejectionReason,
        createdAt: d.createdAt.toISOString(),
        reviewedAt: d.reviewedAt?.toISOString(),
        reviewedBy: d.reviewedBy,
      })),
    });
  } catch (err) {
    console.error("GET /api/admin/alliances falló:", err);
    return apiError("No se pudo leer la cola de alianzas.", 500);
  }
}
