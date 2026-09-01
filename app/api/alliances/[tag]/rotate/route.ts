import { apiError, json, readJson } from "@/lib/api";
import { findLedAlliance, generateJoinCode } from "@/lib/alliances";
import { alliancesCollection } from "@/lib/db";
import { formatJoinCode } from "@/lib/join-code";
import { parseAlliance } from "@/lib/socials";

export const dynamic = "force-dynamic";

interface Body {
  statusToken?: string;
}

/**
 * POST /api/alliances/[tag]/rotate — el líder cambia el código de invitación.
 *
 * Es la herramienta para cuando el código se filtró: corta a los que todavía no
 * entraron. **NO expulsa a los que ya están adentro**, y eso es deliberado: la
 * membresía es un estado, no una sesión. Si rotar vaciara la alianza sería un
 * botón que nadie se anima a tocar, o sea lo mismo que no tenerlo, justo el día
 * que hace falta.
 *
 * Por eso rotar y expulsar son dos herramientas distintas y no una: expulsar es
 * quirúrgico y no molesta a nadie más; rotar es contra desconocidos y le cambia
 * el código a todos. Ver docs/alliances.md.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tag: string }> }
) {
  const { tag: rawTag } = await params;
  const parsedTag = parseAlliance(rawTag);
  if (!parsedTag.ok) return apiError("Tag inválido.", 404);

  const body = await readJson<Body>(req);

  try {
    const led = await findLedAlliance(parsedTag.value!, body?.statusToken);
    if (!led.ok) return apiError(led.error, led.status);

    const alliances = await alliancesCollection();

    /**
     * Reintento ante el choque de `uniq_join_code`. Con 30^8 no va a pasar casi
     * nunca, pero un duplicado no reintentado le devolvería un 500 al líder por
     * mala suerte pura — el mismo criterio que usa el insert de `submissions`
     * con `uniq_status_token`.
     */
    for (let attempt = 0; attempt < 3; attempt++) {
      const joinCode = generateJoinCode();
      try {
        await alliances.updateOne(
          { tag: led.alliance.tag },
          { $set: { joinCode, joinCodeRotatedAt: new Date(), updatedAt: new Date() } }
        );
        return json({ ok: true, joinCode, formatted: formatJoinCode(joinCode) });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }

    return apiError("No se pudo generar un código nuevo. Prueba de nuevo.", 500);
  } catch (err) {
    console.error("POST /api/alliances/[tag]/rotate falló:", err);
    return apiError("No se pudo rotar el código.", 500);
  }
}
