import { apiError, json } from "@/lib/api";
import { findSubmissionByToken, toPublicStatus } from "@/lib/submissions";

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
