import { apiError, json, readJson } from "@/lib/api";
import { alliancesCollection } from "@/lib/db";
import { parseAlliance, parseAllianceName, CONTACT_PARSERS } from "@/lib/socials";
import { findSubmissionByToken } from "@/lib/submissions";
import type { AllianceDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

const CONTACT_FIELDS = ["discord", "email"] as const;

interface Body {
  tag?: string;
  name?: string;
  discord?: string;
  email?: string;
  /**
   * El `statusToken` de quien reclama liderarla.
   *
   * Opcional: se puede pedir una alianza sin liderarla. Si viene, tiene que
   * corresponder a una petición APROBADA — o sea, a alguien cuya identidad ya
   * validó un humano. Liderar es la afirmación más fuerte del sistema (habilita
   * repartir el código y, más adelante, expulsar), así que no puede apoyarse en
   * una identidad que nadie miró.
   */
  statusToken?: string;
}

/**
 * POST /api/alliances/request — pide que se cree una alianza.
 *
 * **No publica nada** y no toca la ficha de nadie: deja una alianza `pending`
 * para que un admin la revise, igual que una petición de jugador. Es el camino
 * del "mi alianza no está en la lista".
 *
 * Va en `/request` y no en el `POST` de `/api/alliances` a propósito: esa ruta
 * es la lista pública, y un `POST` sobre el mismo path deja el permiso de
 * escritura pegado a la lectura para siempre. Separarlas hace obvio, al mirar
 * el árbol de rutas, que crear no es lo mismo que listar.
 *
 * Sigue sin ser verificable —la API oficial no expone alianzas— así que el
 * filtro es el mismo de siempre: el ojo humano. Lo que cambia es la escala: se
 * revisa UNA vez por alianza, no una vez por jugador que la declara.
 *
 * No se pide el nombre de jugador de quien la pide, y no es un olvido: en este
 * paso una alianza no tiene líder. Reclamar el liderazgo es otra cosa, con su
 * propia validación, y está en docs/alliances.md.
 */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);

  if (!body?.tag?.trim()) return apiError("Falta el tag de la alianza.");
  if (!body?.name?.trim()) return apiError("Falta el nombre de la alianza.");

  const tag = parseAlliance(body.tag.trim());
  if (!tag.ok) return apiError(`tag: ${tag.error}`);

  const name = parseAllianceName(body.name.trim());
  if (!name.ok) return apiError(`name: ${name.error}`);

  const contact: Partial<Record<(typeof CONTACT_FIELDS)[number], string>> = {};
  for (const field of CONTACT_FIELDS) {
    const value = body?.[field]?.trim();
    if (!value) continue;
    const parsed = CONTACT_PARSERS[field](value);
    if (!parsed.ok) return apiError(`${field}: ${parsed.error}`);
    contact[field] = parsed.value!;
  }

  // Mismo motivo que en `POST /api/submissions`: sin cuentas ni notificaciones,
  // el contacto es el único canal para rechazar o repreguntar.
  if (Object.keys(contact).length === 0) {
    return apiError("Dejá al menos un contacto (Discord o email) para poder responderte.");
  }

  try {
    /**
     * El reclamo de liderazgo. El código NO se genera acá: la alianza todavía
     * está pendiente, y un código entregado antes de la revisión ya circula si
     * la alianza termina rechazada. Se genera al aprobar.
     */
    let leaderNameKey: string | undefined;
    if (body.statusToken?.trim()) {
      const sub = await findSubmissionByToken(body.statusToken.trim());
      if (!sub) {
        return apiError("Ese código de seguimiento no corresponde a ninguna petición.", 404);
      }
      if (sub.status !== "approved") {
        return apiError(
          "Para liderar una alianza tu ficha tiene que estar aprobada. Esperá a que la revisemos.",
          409
        );
      }
      leaderNameKey = sub.nameKey;
    }

    const alliances = await alliancesCollection();

    /**
     * Se pregunta antes de insertar para poder decir CUÁL es el caso: una
     * alianza ya aprobada se puede elegir del selector ahora mismo, y una
     * pendiente solo hay que esperarla. El índice único queda igual como red
     * ante la carrera entre este chequeo y el insert.
     */
    const existing = await alliances.findOne({ tag: tag.value! });
    if (existing) {
      return apiError(
        existing.status === "approved"
          ? `La alianza ${existing.tag} ya existe: elegila de la lista.`
          : `La alianza ${existing.tag} ya está pedida y todavía no la revisamos.`,
        409
      );
    }

    const now = new Date();
    const doc: AllianceDoc = {
      tag: tag.value!,
      name: name.value!,
      bannedNameKeys: [],
      status: "pending",
      createdAt: now,
      updatedAt: now,
      ...(leaderNameKey ? { leaderNameKey } : {}),
      ...contact,
    };

    await alliances.insertOne(doc);
    return json(
      { ok: true, tag: doc.tag, name: doc.name, status: doc.status, claimedLead: Boolean(leaderNameKey) },
      201
    );
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      return apiError("Esa alianza acaba de ser pedida por otra persona.", 409);
    }
    console.error("POST /api/alliances/request falló:", err);
    return apiError("No se pudo registrar la alianza.", 500);
  }
}
