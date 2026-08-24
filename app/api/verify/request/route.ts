import { playersCollection } from "@/lib/db";
import { fetchLeaderboard, indexByNameKey, LeaderboardError } from "@/lib/leaderboard";
import { apiError, json, readJson } from "@/lib/api";
import { toNameKey, isValidNameKey } from "@/lib/names";
import { buildInstructions, codeExpiry, generateCode } from "@/lib/verification";

export const dynamic = "force-dynamic";

interface Body {
  playerName?: string;
}

/**
 * POST /api/verify/request
 *
 * Genera (o reutiliza) un código corto para que el jugador lo pegue en su
 * nombre de perfil dentro del juego.
 */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  const rawName = body?.playerName?.trim();

  if (!rawName) {
    return apiError("Falta `playerName`.");
  }

  const nameKey = toNameKey(rawName);
  if (!isValidNameKey(nameKey)) {
    return apiError(
      "Nombre inválido. El juego permite hasta 20 caracteres."
    );
  }

  try {
    // Exigimos que el jugador exista en el ladder antes de crearle un doc.
    // Si no, cualquiera podría llenar `players` de basura.
    const board = await fetchLeaderboard({ revalidate: 60 });
    const matches = indexByNameKey(board.rows).get(nameKey);

    if (!matches || matches.length === 0) {
      return apiError(
        `No encontramos a "${rawName}" en el top ${board.rows.length} actual. Solo se puede vincular una cuenta que esté en el leaderboard.`,
        404
      );
    }

    const players = await playersCollection();
    const existing = await players.findOne({ nameKey });
    const now = new Date();

    // Si ya tiene un código vigente devolvemos el mismo, en vez de rotarlo.
    // Rotar dejaría inservible el nombre que el jugador quizá ya cambió.
    const stillValid =
      existing?.verificationCode &&
      existing.verificationExpiresAt &&
      existing.verificationExpiresAt > now;

    const code = stillValid ? existing.verificationCode! : generateCode();
    const expiresAt = stillValid ? existing.verificationExpiresAt! : codeExpiry(now);

    await players.updateOne(
      { nameKey },
      {
        $set: {
          playerName: matches[0].playerName,
          verificationCode: code,
          verificationExpiresAt: expiresAt,
          updatedAt: now,
        },
        $setOnInsert: { verified: false, createdAt: now },
      },
      { upsert: true }
    );

    return json({
      ok: true,
      playerName: matches[0].playerName,
      nameKey,
      expiresAt: expiresAt.toISOString(),
      alreadyVerified: existing?.verified === true,
      /** Más de una fila con este nombre: se avisa para que no se confunda. */
      ambiguous: matches.length > 1,
      ...buildInstructions(matches[0].playerName, code),
    });
  } catch (err) {
    if (err instanceof LeaderboardError) {
      return apiError(err.message, err.status);
    }
    console.error("POST /api/verify/request falló:", err);
    return apiError("No se pudo generar el código.", 500);
  }
}
