import { findAllianceByTag, parseJoinCode } from "./alliances";
import { SOCIAL_PARSERS, parseAlliance } from "./socials";
import type { SocialField } from "./types";

/**
 * Los campos que el jugador declara sobre sí mismo: sus canales y su alianza.
 *
 * Están acá y no en cada ruta porque hoy se escriben desde dos lados —la
 * petición inicial (`POST /api/submissions`) y la edición con el código
 * (`PATCH /api/submissions/[token]`)— y las dos tienen que validar exactamente
 * lo mismo. Si divergieran, se podría meter por edición un valor que la
 * petición rechaza, que es justo el agujero que esta función cierra.
 *
 * El CONTACTO queda afuera a propósito: no es un campo de perfil, no se publica
 * y no se edita con el código (ver la ruta PATCH).
 */

export const SOCIAL_FIELDS: SocialField[] = ["twitch", "youtube", "untapped"];

export interface ProfileFieldsInput {
  twitch?: string;
  youtube?: string;
  untapped?: string;
  /**
   * El tag de una alianza que YA EXISTE y está aprobada. Sale del selector.
   *
   * Ya no viene un `allianceName` del cliente: el nombre vive en la alianza y
   * se copia desde ahí. Mientras lo escribiera cada persona, la misma alianza
   * se publicaba con tres nombres distintos — el bug entero.
   */
  allianceTag?: string;

  /**
   * El código que reparte quien lidera la alianza. Prueba la PERTENENCIA, no la
   * identidad —de eso se sigue encargando el ojo humano del panel— y solo hace
   * falta si la alianza tiene líder.
   */
  allianceCode?: string;
}

export interface ProfileFields {
  socials: Partial<Record<SocialField, string>>;
  allianceTag?: string;
  allianceName?: string;
}

export type ProfileFieldsResult =
  | { ok: true; fields: ProfileFields }
  | { ok: false; error: string };

/**
 * Valida y normaliza. Un campo vacío o ausente es un campo NO declarado: para
 * la petición inicial son lo mismo, y para la edición los dos significan
 * "sacalo" (ver la ruta PATCH, que reemplaza el bloque entero).
 */
export interface ProfileFieldsContext {
  /**
   * Quién está pidiendo, para poder aplicar el veto de la alianza. Opcional
   * porque no siempre se conoce, y en ese caso el veto simplemente no corre:
   * las dos rutas que llaman acá SÍ lo tienen.
   */
  nameKey?: string;

  /**
   * La alianza que esta persona YA tiene publicada, si tiene alguna.
   *
   * Existe para que el código se pida al ENTRAR y no al quedarse. Sin esto,
   * alguien que ya es miembro y solo quiere corregir su Twitch tendría que
   * reponer el código de la alianza en cada edición —el formulario abre con el
   * campo vacío, porque el código no es un dato suyo que podamos guardar— y la
   * edición se volvería un trámite que necesita a un tercero.
   */
  currentAllianceTag?: string;
}

export async function parseProfileFields(
  input: ProfileFieldsInput | null | undefined,
  ctx: ProfileFieldsContext = {}
): Promise<ProfileFieldsResult> {
  const { nameKey, currentAllianceTag } = ctx;
  const socials: Partial<Record<SocialField, string>> = {};
  for (const field of SOCIAL_FIELDS) {
    const value = input?.[field]?.trim();
    if (!value) continue;
    const parsed = SOCIAL_PARSERS[field](value);
    if (!parsed.ok) return { ok: false, error: `${field}: ${parsed.error}` };
    socials[field] = parsed.value!;
  }

  /**
   * La alianza YA NO ES TEXTO LIBRE: el tag tiene que corresponder a una
   * alianza aprobada, y el nombre sale de ella.
   *
   * Es la invariante que arregla el bug original — cada jugador guardaba su
   * propia copia del nombre, así que la misma alianza se publicaba escrita de
   * tres formas. Mientras el nombre venga del cliente, no hay validación que
   * lo impida; con la entidad como única fuente, deja de poder pasar.
   *
   * Por eso esta función se volvió async: la resolución tiene que vivir ACÁ y
   * no en cada ruta. Es lo mismo que dice el comentario de arriba — si las dos
   * entradas validaran por separado, se podría colar por edición un valor que
   * la petición rechaza.
   */
  let allianceTag: string | undefined;
  let allianceName: string | undefined;

  if (input?.allianceTag?.trim()) {
    const parsed = parseAlliance(input.allianceTag.trim());
    if (!parsed.ok) return { ok: false, error: `allianceTag: ${parsed.error}` };

    const alliance = await findAllianceByTag(parsed.value!);
    if (!alliance) {
      return {
        ok: false,
        error:
          "Esa alianza no existe todavía. Elige una de la lista, o pide que la creemos.",
      };
    }

    /**
     * El veto va ANTES del código, y el orden importa: si se chequeara después,
     * a alguien expulsado se le diría "código incorrecto" y volvería a pedírselo
     * al líder que lo echó a propósito.
     *
     * Se chequea aunque la alianza no tenga código: una alianza sin líder no
     * tiene quién vete a nadie, pero puede haber tenido uno antes.
     */
    if (nameKey && alliance.bannedNameKeys.includes(nameKey)) {
      return {
        ok: false,
        error: `No puedes entrar a ${alliance.tag}. Si es un error, habla con quien la lidera.`,
      };
    }

    /**
     * El código es lo único que prueba la pertenencia.
     *
     * Solo se exige si la alianza TIENE código, o sea si alguien la lidera. Una
     * alianza sin líder queda abierta porque no hay nadie que pueda responder
     * por sus miembros: pedir un código que nadie puede dar dejaría la alianza
     * muerta en vez de protegida.
     *
     * La comparación es sobre el valor normalizado, así que da igual si lo
     * pegaron con guiones o en minúscula.
     */
    /**
     * Solo se pide el código si la alianza CAMBIA. Quedarse donde ya estabas no
     * es entrar, y el veto de arriba sigue corriendo igual: a un expulsado no lo
     * salva haber estado adentro.
     */
    const joining = alliance.tag !== currentAllianceTag;

    if (alliance.joinCode && joining) {
      const given = input.allianceCode?.trim()
        ? parseJoinCode(input.allianceCode.trim())
        : null;

      if (!given) {
        return {
          ok: false,
          error: `Para entrar a ${alliance.tag} hace falta el código que reparte quien la lidera.`,
        };
      }
      if (given !== alliance.joinCode) {
        return {
          ok: false,
          error: `Ese código no es el de ${alliance.tag}. Pídele el actual a quien la lidera: puede haber cambiado.`,
        };
      }
    }

    allianceTag = alliance.tag;
    allianceName = alliance.name;
  }

  // Tiene que haber algo que publicar. Vale igual para la edición: dejar la
  // ficha sin una sola red ni alianza no es editarla, es vaciarla — y para eso
  // hay que hablar con un humano, no apretar Guardar.
  if (Object.keys(socials).length === 0 && !allianceTag) {
    return { ok: false, error: "Indica al menos una red o el tag de tu alianza." };
  }

  return { ok: true, fields: { socials, allianceTag, allianceName } };
}
