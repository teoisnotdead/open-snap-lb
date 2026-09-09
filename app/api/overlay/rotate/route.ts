import { apiError, json, readJson } from "@/lib/api";
import { playersCollection } from "@/lib/db";
import { generateOverlayKey } from "@/lib/players";
import { findSubmissionByToken } from "@/lib/submissions";

export const dynamic = "force-dynamic";

interface Body {
  statusToken?: string;
}

/**
 * POST /api/overlay/rotate — el jugador cambia la llave de su overlay.
 *
 * Existe por dónde vive esa llave: pegada en OBS, en una máquina que se
 * comparte por pantalla. Se filtra sola en una captura de "así tengo armado el
 * stream", en un tutorial, o cuando alguien presta la escena. Un secreto que se
 * filtra así y no se puede cambiar es un secreto de un solo uso.
 *
 * Rotar ROMPE la fuente que ya esté configurada, y eso es todo lo que hace: la
 * URL vieja deja de resolver y hay que pegar la nueva en OBS. Se avisa en la
 * pantalla antes de tocar el botón, porque descubrirlo al aire sería el peor
 * momento posible.
 *
 * La credencial es el `statusToken`, igual que en las acciones de alianza: no
 * hay un cuarto secreto. Va en el BODY y nunca en la URL — un token en el path
 * termina en los logs del servidor y en el historial del navegador.
 *
 * Esta ruta gana sobre `/api/overlay/[key]` porque Next resuelve los segmentos
 * estáticos antes que los dinámicos. Igual no habría choque: "rotate" tiene 6
 * caracteres y `parseOverlayKey` exige 16.
 */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body?.statusToken) return apiError("Falta el código.", 400);

  try {
    const doc = await findSubmissionByToken(body.statusToken);

    /**
     * Un token inválido, uno inexistente y uno de una petición no aprobada dan
     * el mismo 404. Mismo criterio que la página de estado: distinguirlos solo
     * sirve para confirmarle a alguien qué tokens existen.
     */
    if (!doc || doc.status !== "approved") return apiError("Código inválido.", 404);

    const players = await playersCollection();

    /**
     * Reintento ante el choque de `uniq_overlay_key`. Con 30^16 no va a pasar
     * nunca, pero el mismo criterio se aplica en el insert de `submissions` y
     * en la rotación del `joinCode`: un duplicado no reintentado le devolvería
     * un 500 a la persona por mala suerte pura.
     */
    for (let attempt = 0; attempt < 3; attempt++) {
      const overlayKey = generateOverlayKey();
      try {
        const res = await players.updateOne(
          { nameKey: doc.nameKey },
          {
            $set: {
              overlayKey,
              overlayKeyRotatedAt: new Date(),
              updatedAt: new Date(),
            },
          }
        );

        /* La petición está aprobada pero la ficha no existe: se borró después.
           No hay overlay que rotar, y decirlo es mejor que devolver una llave
           que no le sirve a nadie. */
        if (res.matchedCount === 0) {
          return apiError("Esta cuenta no tiene ficha publicada.", 404);
        }

        return json({ ok: true, overlayKey });
      } catch (err) {
        if ((err as { code?: number }).code !== 11000) throw err;
      }
    }

    return apiError("No se pudo generar una llave nueva. Prueba de nuevo.", 500);
  } catch (err) {
    console.error("POST /api/overlay/rotate falló:", err);
    return apiError("No se pudo rotar la llave del overlay.", 500);
  }
}
