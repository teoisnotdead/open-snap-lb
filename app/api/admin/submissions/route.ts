import { submissionsCollection } from "@/lib/db";
import { apiError, json, requireAdminAuth } from "@/lib/api";
import { fetchLeaderboard, indexByNameKey } from "@/lib/leaderboard";
import { toSubmissionView } from "@/lib/submissions";
import type { SubmissionStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: SubmissionStatus[] = ["pending", "approved", "rejected"];
const MAX_ROWS = 200;

/** GET /api/admin/submissions?status=pending — la cola de revisión. */
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
    const submissions = await submissionsCollection();
    const docs = await submissions
      .find({ status })
      // Pendientes: las más viejas primero, que son las que llevan esperando.
      // Ya revisadas: las más recientes primero, que es lo que se consulta.
      .sort({ createdAt: status === "pending" ? 1 : -1 })
      .limit(MAX_ROWS)
      .toArray();

    /**
     * El rank actual se resuelve al vuelo y no se guarda: es contexto para
     * decidir, no un dato de la petición. Si el ladder no responde, el panel
     * tiene que seguir funcionando — revisar no depende de eso.
     */
    let rankByKey = new Map<string, number>();
    try {
      const board = await fetchLeaderboard({ revalidate: 60 });
      const index = indexByNameKey(board.rows);
      rankByKey = new Map(
        [...index.entries()].map(([key, rows]) => [key, rows[0].rank])
      );
    } catch (err) {
      console.error("El panel no pudo leer el ladder; sigo sin ranks:", err);
    }

    return json({
      status,
      count: docs.length,
      truncated: docs.length === MAX_ROWS,
      submissions: docs.map((d) => toSubmissionView(d, rankByKey.get(d.nameKey))),
    });
  } catch (err) {
    console.error("GET /api/admin/submissions falló:", err);
    return apiError("No se pudo leer la cola.", 500);
  }
}
