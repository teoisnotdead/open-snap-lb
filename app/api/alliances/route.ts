import { apiError, json } from "@/lib/api";
import { listApprovedAlliances } from "@/lib/alliances";

export const dynamic = "force-dynamic";

/**
 * GET /api/alliances — las alianzas aprobadas.
 *
 * Alimenta el selector del formulario, que es lo que reemplaza al input de
 * texto libre donde hoy cada persona escribe el nombre de su alianza como se
 * le ocurre. Ese input es el bug: la misma alianza termina publicada con tres
 * nombres distintos (ver docs/alliances.md).
 *
 * Es PÚBLICA a propósito. Los tags ya se ven en la tabla del leaderboard, así
 * que la lista no revela nada nuevo; lo único que no puede salir de acá es el
 * `joinCode`, y por eso la respuesta se arma campo por campo en
 * `listApprovedAlliances` en vez de devolver los documentos.
 */
export async function GET() {
  try {
    const alliances = await listApprovedAlliances();
    return json({ count: alliances.length, alliances });
  } catch (err) {
    console.error("GET /api/alliances falló:", err);
    return apiError("No se pudieron leer las alianzas.", 500);
  }
}
