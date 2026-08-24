import { submissionsCollection } from "@/lib/db";
import { fetchLeaderboard, LeaderboardError } from "@/lib/leaderboard";
import { apiError, json } from "@/lib/api";
import { findSubmissionByToken } from "@/lib/submissions";
import { checkClaim, findSquatConflict } from "@/lib/verification";

export const dynamic = "force-dynamic";

/**
 * POST /api/submissions/[token]/proof — busca el código en el ladder en vivo y,
 * si aparece en la cuenta reclamada, marca la petición como propiedad
 * comprobada.
 *
 * Sigue sin publicar nada: solo agrega el sello. La aprobación la da un humano
 * desde el panel.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const doc = await findSubmissionByToken(token);
  if (!doc) return apiError("No encontramos ninguna petición con ese código.", 404);

  if (doc.status !== "pending") return apiError("Esa petición ya fue revisada.", 409);
  if (doc.proofVerified) return json({ ok: true, proofVerified: true });

  if (!doc.verificationCode || !doc.verificationExpiresAt) {
    return apiError("No hay un código pendiente. Pedí uno primero.", 404);
  }
  if (doc.verificationExpiresAt <= new Date()) {
    return apiError("El código venció. Pedí uno nuevo.", 410, { expired: true });
  }

  const code = doc.verificationCode;
  const nameKey = doc.nameKey;

  try {
    // `revalidate: false` es crítico: con la respuesta cacheada podríamos estar
    // mirando el nombre viejo y rechazar una prueba legítima.
    const board = await fetchLeaderboard({ revalidate: false });

    /**
     * Se busca por CÓDIGO, no por nameKey: al agregarse el código al nombre, el
     * nameKey cambió y ya no coincide con el reclamado.
     *
     * Y se juntan TODAS las filas que lo contengan, no solo la primera: 5
     * caracteres pueden aparecer por casualidad en el nombre de otro, y quedarse
     * con la primera coincidencia haría fallar a un jugador legítimo.
     */
    const needle = code.toLowerCase();
    const matches = board.rows.filter((r) => r.playerName.toLowerCase().includes(needle));

    if (matches.length === 0) {
      return apiError(
        "Todavía no vemos el código en el leaderboard. El sitio oficial tarda unos minutos en actualizar: esperá un poco y reintentá.",
        404,
        { retryable: true }
      );
    }

    let claimed: (typeof matches)[number] | null = null;
    let lastReason = "";
    for (const row of matches) {
      const claim = checkClaim(row.playerName, code, nameKey);
      if (claim.ok) {
        claimed = row;
        break;
      }
      lastReason = claim.reason ?? "";
    }

    if (!claimed) {
      return apiError(lastReason || "El código no coincide con esa cuenta.", 403);
    }

    // Defensa contra la ocupación de nombre: ver findSquatConflict.
    const squatter = findSquatConflict(board.rows, nameKey);
    if (squatter) {
      return apiError(
        `Hay otra cuenta llamada "${squatter.playerName}" en el leaderboard ahora mismo, así que no podemos confirmar que esta sea la tuya. Si es un homónimo, contanos en la nota de la petición.`,
        409
      );
    }

    const now = new Date();
    const submissions = await submissionsCollection();
    await submissions.updateOne(
      { _id: doc._id },
      {
        $set: {
          proofVerified: true,
          proofVerifiedAt: now,
          // Semilla de desambiguación para el sync; se copia a `players` al
          // aprobar. Ver docs/data-model.md.
          proofRank: claimed.rank,
          updatedAt: now,
        },
        $unset: { verificationCode: "", verificationExpiresAt: "" },
      }
    );

    return json({ ok: true, proofVerified: true, rank: claimed.rank });
  } catch (err) {
    if (err instanceof LeaderboardError) return apiError(err.message, err.status);
    console.error("POST /api/submissions/[token]/proof falló:", err);
    return apiError("No se pudo comprobar la propiedad.", 500);
  }
}
