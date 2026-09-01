import { apiError, json, readJson } from "@/lib/api";
import { findLedAlliance } from "@/lib/alliances";
import { alliancesCollection, playersCollection, submissionsCollection } from "@/lib/db";
import { parseAlliance } from "@/lib/socials";

export const dynamic = "force-dynamic";

interface Body {
  /** La credencial del líder: su propio token de seguimiento. */
  statusToken?: string;
  /** A quién. Normalizado, tal como sale de la lista de miembros. */
  nameKey?: string;
  action?: "kick" | "unban";
}

/**
 * POST /api/alliances/[tag]/members — el líder expulsa o readmite.
 *
 * Es una escritura pública sobre la ficha de OTRA persona, que no existía en el
 * sistema: hasta ahora solo el propio jugador (con su token) o un admin podían
 * tocar un `players`. Queda acotada a dos campos —`alliance` y `allianceName`—
 * no toca identidad, canales ni contacto, y solo alcanza a alguien que
 * efectivamente tiene el tag de esta alianza.
 *
 * Es **reversible**, y de eso depende que la decisión de usar el `statusToken`
 * como credencial del líder sea aceptable: un token filtrado puede vaciar una
 * alianza, pero no destruir nada — `unban` deshace, y los expulsados vuelven a
 * entrar con el código.
 *
 * Expulsar deja rastro sobre la PERSONA (`bannedNameKeys`) y no sobre el código.
 * Sin esa lista, expulsar no expulsaría a nadie: el echado todavía tiene el
 * código y vuelve a entrar en diez segundos. Y la alternativa —que expulsar
 * forzara a rotar— le cambia el código a todos los demás para sacar a uno, un
 * precio con el que nadie echa a nadie nunca. Ver docs/alliances.md.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ tag: string }> }
) {
  const { tag: rawTag } = await params;
  const parsedTag = parseAlliance(rawTag);
  if (!parsedTag.ok) return apiError("Tag inválido.", 404);

  const body = await readJson<Body>(req);
  const action = body?.action;
  if (action !== "kick" && action !== "unban") {
    return apiError("`action` tiene que ser 'kick' o 'unban'.");
  }

  const target = body?.nameKey?.trim();
  if (!target) return apiError("Falta a quién.");

  try {
    const led = await findLedAlliance(parsedTag.value!, body?.statusToken);
    if (!led.ok) return apiError(led.error, led.status);

    const alliance = led.alliance;

    /**
     * El líder no se puede expulsar solo. No es un caso hipotético —es el
     * primer botón que alguien aprieta para "probar"— y dejaría la alianza con
     * un líder vetado de su propia alianza, un estado que ninguna pantalla sabe
     * explicar. Irse del liderazgo es otra cosa, y hoy la hace un admin.
     */
    if (action === "kick" && target === alliance.leaderNameKey) {
      return apiError(
        "No puedes expulsarte de tu propia alianza. Si quieres dejar de liderarla, escríbenos.",
        409
      );
    }

    const alliances = await alliancesCollection();
    const now = new Date();

    if (action === "unban") {
      await alliances.updateOne(
        { tag: alliance.tag },
        { $pull: { bannedNameKeys: target }, $set: { updatedAt: now } }
      );
      return json({ ok: true, action, nameKey: target });
    }

    /**
     * El veto y el despublicado van en ese orden: si se cayera entre los dos,
     * queda alguien vetado que todavía muestra el tag —visible y corregible—
     * en vez de alguien despublicado que puede volver a entrar en silencio.
     */
    await alliances.updateOne(
      { tag: alliance.tag },
      { $addToSet: { bannedNameKeys: target }, $set: { updatedAt: now } }
    );

    const players = await playersCollection();
    const res = await players.updateOne(
      // El filtro por `alliance` es lo que impide que esto toque a alguien que
      // no es miembro: sin él, un líder podría despublicar la alianza de
      // cualquiera pasando un nameKey al azar.
      { nameKey: target, alliance: alliance.tag },
      { $unset: { alliance: "", allianceName: "" }, $set: { updatedAt: now } }
    );

    /**
     * También en `submissions`, por el mismo motivo que el PATCH escribe en las
     * dos: es lo que esa persona ve como "lo que pediste". Si solo tocáramos
     * `players`, su página de estado le seguiría mostrando una alianza de la
     * que ya no forma parte.
     */
    const submissions = await submissionsCollection();
    await submissions.updateMany(
      { nameKey: target, allianceTag: alliance.tag, status: "approved" },
      { $unset: { allianceTag: "", allianceName: "" }, $set: { updatedAt: now } }
    );

    return json({ ok: true, action, nameKey: target, unpublished: res.modifiedCount });
  } catch (err) {
    console.error("POST /api/alliances/[tag]/members falló:", err);
    return apiError("No se pudo procesar.", 500);
  }
}
