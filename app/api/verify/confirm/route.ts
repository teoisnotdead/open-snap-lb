import { playersCollection } from "@/lib/db";
import { fetchLeaderboard, LeaderboardError } from "@/lib/leaderboard";
import { apiError, json, readJson } from "@/lib/api";
import { toNameKey, isValidNameKey } from "@/lib/names";
import { checkClaim } from "@/lib/verification";
import { SOCIAL_PARSERS, parseAlliance } from "@/lib/socials";
import type { SocialField } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  playerName?: string;
  twitch?: string;
  youtube?: string;
  untapped?: string;
  alliance?: string;
}

const SOCIAL_FIELDS: SocialField[] = ["twitch", "youtube", "untapped"];

/**
 * POST /api/verify/confirm
 *
 * Busca el código en el ladder EN VIVO y, si aparece en la cuenta reclamada,
 * marca al jugador como verificado y guarda sus redes.
 */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  const rawName = body?.playerName?.trim();

  if (!rawName) return apiError("Falta `playerName`.");

  const nameKey = toNameKey(rawName);
  if (!isValidNameKey(nameKey)) return apiError("Nombre inválido.");

  // Parseo y canonicalización de las redes antes de tocar la base.
  const socials: Partial<Record<SocialField, string>> = {};
  for (const field of SOCIAL_FIELDS) {
    const value = body?.[field]?.trim();
    if (!value) continue;

    const parsed = SOCIAL_PARSERS[field](value);
    if (!parsed.ok) {
      return apiError(`${field}: ${parsed.error}`);
    }
    socials[field] = parsed.value!;
  }

  if (Object.keys(socials).length === 0) {
    return apiError("Indica al menos una red (twitch, youtube o untapped).");
  }

  // La alianza es opcional y NO cuenta como red: sin al menos un canal no hay
  // nada que reclamar, y el tag por sí solo no identifica a nadie.
  let alliance: string | undefined;
  const rawAlliance = body?.alliance?.trim();
  if (rawAlliance) {
    const parsed = parseAlliance(rawAlliance);
    if (!parsed.ok) return apiError(`alliance: ${parsed.error}`);
    alliance = parsed.value;
  }

  try {
    const players = await playersCollection();
    const player = await players.findOne({ nameKey });

    if (!player?.verificationCode || !player.verificationExpiresAt) {
      return apiError(
        "No hay un código pendiente para ese jugador. Pedí uno primero.",
        404
      );
    }

    if (player.verificationExpiresAt <= new Date()) {
      return apiError("El código venció. Pedí uno nuevo.", 410);
    }

    const code = player.verificationCode;

    // `revalidate: false` es crítico: con la respuesta cacheada podríamos estar
    // mirando el nombre viejo y rechazar una verificación legítima.
    const board = await fetchLeaderboard({ revalidate: false });

    // Buscamos por CÓDIGO, no por nameKey: al agregar el código al nombre, el
    // nameKey del jugador cambió y ya no coincide con el que reclamó.
    //
    // Juntamos TODAS las filas que contengan el código, no solo la primera.
    // Los códigos no son únicos a nivel global (son 30^5 y de un solo uso), y
    // además una secuencia de 5 caracteres puede aparecer por casualidad en el
    // nombre de otro. Quedarnos con la primera coincidencia haría fallar a un
    // jugador legítimo por culpa de un homónimo.
    const needle = code.toLowerCase();
    const matches = board.rows.filter((r) =>
      r.playerName.toLowerCase().includes(needle)
    );

    if (matches.length === 0) {
      return apiError(
        "Todavía no vemos el código en el leaderboard. El sitio oficial tarda unos minutos en actualizar: esperá un poco y reintentá.",
        404,
        { retryable: true }
      );
    }

    // Que el código exista prueba control de ALGUNA cuenta; el checkClaim
    // prueba que es la cuenta reclamada. Sin eso, cualquiera podría verificar
    // el nombre de otro poniendo el código en el suyo.
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

    const now = new Date();

    try {
      await players.updateOne(
        { nameKey },
        {
          $set: {
            ...socials,
            ...(alliance ? { alliance } : {}),
            // Conservamos el nombre SIN el código: el código es temporal y el
            // jugador va a volver a su nombre de siempre apenas confirme.
            playerName: player.playerName,
            verified: true,
            verifiedAt: now,
            updatedAt: now,
          },
          $unset: { verificationCode: "", verificationExpiresAt: "" },
        }
      );
    } catch (err) {
      // El índice único parcial sobre los campos sociales.
      if ((err as { code?: number }).code === 11000) {
        return apiError(
          "Ese canal ya está reclamado por otra cuenta verificada. Si es tuyo, abrí un issue.",
          409
        );
      }
      throw err;
    }

    return json({
      ok: true,
      verified: true,
      nameKey,
      playerName: player.playerName,
      ...socials,
      ...(alliance ? { alliance } : {}),
    });
  } catch (err) {
    if (err instanceof LeaderboardError) {
      return apiError(err.message, err.status);
    }
    console.error("POST /api/verify/confirm falló:", err);
    return apiError("No se pudo confirmar la verificación.", 500);
  }
}
