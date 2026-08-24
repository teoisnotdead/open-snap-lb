import { submissionsCollection } from "@/lib/db";
import { apiError, json } from "@/lib/api";
import { findSubmissionByToken } from "@/lib/submissions";
import { buildInstructions, codeExpiry, generateCode } from "@/lib/verification";

export const dynamic = "force-dynamic";

/**
 * POST /api/submissions/[token]/code — emite (o reutiliza) el código de prueba.
 *
 * El código dejó de ser el portón: ahora es un SELLO opcional. Quien lo
 * completa llega al panel marcado como propiedad comprobada y se aprueba sin
 * discusión; quien no, se revisa a mano igual. Por eso se emite acá y no al
 * crear la petición: el que nunca va a probar nada no necesita uno.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const doc = await findSubmissionByToken(token);
  if (!doc) return apiError("No encontramos ninguna petición con ese código.", 404);

  if (doc.status !== "pending") {
    return apiError("Esa petición ya fue revisada.", 409);
  }
  if (doc.proofVerified) {
    return apiError("Esa petición ya tiene la propiedad comprobada.", 409);
  }

  const now = new Date();

  /**
   * Si ya hay uno vigente se devuelve el MISMO, no uno nuevo. Rotarlo dejaría
   * inservible el nombre que el jugador quizá ya se cambió en el juego.
   */
  const stillValid =
    doc.verificationCode && doc.verificationExpiresAt && doc.verificationExpiresAt > now;

  const code = stillValid ? doc.verificationCode! : generateCode();
  const expiresAt = stillValid ? doc.verificationExpiresAt! : codeExpiry(now);

  if (!stillValid) {
    const submissions = await submissionsCollection();
    await submissions.updateOne(
      { _id: doc._id },
      {
        $set: {
          verificationCode: code,
          verificationExpiresAt: expiresAt,
          updatedAt: now,
        },
      }
    );
  }

  return json({
    ok: true,
    expiresAt: expiresAt.toISOString(),
    ...buildInstructions(doc.playerName, code),
  });
}
