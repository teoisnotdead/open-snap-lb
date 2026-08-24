/**
 * Normalización y validación de handles sociales.
 *
 * Los guardamos siempre en minúscula y en forma canónica (handle pelado, sin
 * URL) porque sobre estos campos hay un índice único parcial: si dejáramos
 * entrar "Foo" y "foo" como valores distintos, dos cuentas podrían reclamar
 * el mismo canal y el índice no lo detectaría.
 */

export interface SocialParseResult {
  ok: boolean;
  /** Valor canónico listo para guardar. */
  value?: string;
  error?: string;
}

/** Twitch: 4-25 chars, alfanumérico y guión bajo. */
const TWITCH_HANDLE = /^[a-zA-Z0-9_]{4,25}$/;

/** YouTube handle (post-@): 3-30 chars, alfanumérico, guión, guión bajo y punto. */
const YOUTUBE_HANDLE = /^[a-zA-Z0-9._-]{3,30}$/;

/**
 * Acepta "handle", "@handle", "twitch.tv/handle" o la URL completa.
 * Devuelve el handle pelado en minúscula.
 */
export function parseTwitch(input: string): SocialParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Vacío" };

  let handle = raw;

  // Si parece URL, sacamos el primer segmento del path.
  const urlMatch = raw.match(
    /^(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([^/?#]+)/i
  );
  if (urlMatch) {
    handle = urlMatch[1];
  } else if (/^https?:\/\//i.test(raw)) {
    return { ok: false, error: "Esa URL no es de twitch.tv" };
  }

  handle = handle.replace(/^@/, "");

  if (!TWITCH_HANDLE.test(handle)) {
    return {
      ok: false,
      error: "Handle de Twitch inválido (4-25 caracteres, letras/números/_)",
    };
  }

  return { ok: true, value: handle.toLowerCase() };
}

/**
 * Acepta "handle", "@handle", "youtube.com/@handle" o la URL completa.
 * Devuelve el handle pelado (sin @) en minúscula.
 *
 * Solo soportamos handles modernos (@nombre). Las URLs viejas de /channel/UC...
 * y /user/... se rechazan: mezclarlas rompería la unicidad del índice, porque
 * el mismo canal tendría dos representaciones distintas.
 */
export function parseYouTube(input: string): SocialParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Vacío" };

  let handle = raw;

  const urlMatch = raw.match(
    /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/@([^/?#]+)/i
  );
  if (urlMatch) {
    handle = urlMatch[1];
  } else if (/^https?:\/\//i.test(raw) || /youtube\.com/i.test(raw)) {
    return {
      ok: false,
      error: "Usá el handle moderno de YouTube (youtube.com/@tuhandle)",
    };
  }

  handle = handle.replace(/^@/, "");

  if (!YOUTUBE_HANDLE.test(handle)) {
    return {
      ok: false,
      error: "Handle de YouTube inválido (3-30 caracteres)",
    };
  }

  return { ok: true, value: handle.toLowerCase() };
}

/**
 * Untapped es distinto: el perfil se direcciona con dos UUIDs
 * (/profile/{playerId}/{roleId}) que NO podemos derivar de la API oficial
 * (ver docs/leaderboard-api.md §5). Así que el jugador pega la URL completa y
 * nosotros solo validamos que sea de untapped.gg y tenga la forma esperada.
 */
export function parseUntapped(input: string): SocialParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Vacío" };

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: "URL inválida" };
  }

  if (!/(^|\.)untapped\.gg$/i.test(url.hostname)) {
    return { ok: false, error: "Esa URL no es de untapped.gg" };
  }

  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const pathMatch = url.pathname.match(
    new RegExp(`/profile/(${uuid})/(${uuid})`, "i")
  );

  if (!pathMatch) {
    return {
      ok: false,
      error:
        "Esperaba un link de perfil: https://snap.untapped.gg/en/profile/{id}/{id}",
    };
  }

  // Guardamos canónico: descartamos el locale y cualquier query string.
  return {
    ok: true,
    value: `https://snap.untapped.gg/en/profile/${pathMatch[1].toLowerCase()}/${pathMatch[2].toLowerCase()}`,
  };
}

/**
 * Tag de alianza. 2-5 caracteres alfanuméricos, normalizado a mayúsculas.
 *
 * A diferencia de las redes, esto NO lleva índice único: varios jugadores
 * comparten alianza, que es justamente el punto. Tampoco se puede verificar —
 * la API oficial no expone alianzas, así que es un dato declarado y así hay
 * que tratarlo.
 */
export function parseAlliance(input: string): SocialParseResult {
  const raw = input.trim().replace(/^\[|\]$/g, "");
  if (!raw) return { ok: false, error: "Vacío" };

  if (!/^[a-zA-Z0-9]{2,5}$/.test(raw)) {
    return {
      ok: false,
      error: "El tag debe tener entre 2 y 5 letras o números",
    };
  }

  return { ok: true, value: raw.toUpperCase() };
}

export const SOCIAL_PARSERS = {
  twitch: parseTwitch,
  youtube: parseYouTube,
  untapped: parseUntapped,
} as const;
