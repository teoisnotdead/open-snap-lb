import { SOCIAL_PARSERS, parseAlliance, parseAllianceName } from "./socials";
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
  allianceTag?: string;
  allianceName?: string;
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
export function parseProfileFields(
  input: ProfileFieldsInput | null | undefined
): ProfileFieldsResult {
  const socials: Partial<Record<SocialField, string>> = {};
  for (const field of SOCIAL_FIELDS) {
    const value = input?.[field]?.trim();
    if (!value) continue;
    const parsed = SOCIAL_PARSERS[field](value);
    if (!parsed.ok) return { ok: false, error: `${field}: ${parsed.error}` };
    socials[field] = parsed.value!;
  }

  let allianceTag: string | undefined;
  if (input?.allianceTag?.trim()) {
    const parsed = parseAlliance(input.allianceTag.trim());
    if (!parsed.ok) return { ok: false, error: `allianceTag: ${parsed.error}` };
    allianceTag = parsed.value;
  }

  let allianceName: string | undefined;
  if (input?.allianceName?.trim()) {
    const parsed = parseAllianceName(input.allianceName.trim());
    if (!parsed.ok) return { ok: false, error: `allianceName: ${parsed.error}` };
    allianceName = parsed.value;
  }

  // Un nombre de alianza sin tag es dato huérfano: la tabla muestra el tag.
  if (allianceName && !allianceTag) {
    return {
      ok: false,
      error: "Si indicás el nombre de la alianza, indicá también el tag.",
    };
  }

  // Tiene que haber algo que publicar. Vale igual para la edición: dejar la
  // ficha sin una sola red ni alianza no es editarla, es vaciarla — y para eso
  // hay que hablar con un humano, no apretar Guardar.
  if (Object.keys(socials).length === 0 && !allianceTag) {
    return { ok: false, error: "Indicá al menos una red o el tag de tu alianza." };
  }

  return { ok: true, fields: { socials, allianceTag, allianceName } };
}
