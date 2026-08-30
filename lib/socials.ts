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
      error: "Usuario de Twitch inválido (4-25 caracteres, letras/números/_)",
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
      error: "Usa el formato nuevo de YouTube (youtube.com/@usuario)",
    };
  }

  handle = handle.replace(/^@/, "");

  if (!YOUTUBE_HANDLE.test(handle)) {
    return {
      ok: false,
      error: "Usuario de YouTube inválido (3-30 caracteres)",
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

/**
 * Nombre largo de la alianza. Se conserva tal cual lo escribieron —solo se
 * colapsan los espacios— porque es un nombre propio: pasarlo a mayúsculas o
 * minúsculas lo arruinaría. Sin índice único, igual que el tag.
 */
export function parseAllianceName(input: string): SocialParseResult {
  const raw = input.trim().replace(/\s+/g, " ");
  if (!raw) return { ok: false, error: "Vacío" };

  if (raw.length > 40) {
    return { ok: false, error: "El nombre de la alianza no puede pasar de 40 caracteres" };
  }

  // Sin caracteres de control: terminan en el HTML del panel y de la tabla.
  const hasControlChar = [...raw].some((ch) => {
    const cp = ch.codePointAt(0)!;
    return cp < 0x20 || cp === 0x7f;
  });
  if (hasControlChar) {
    return { ok: false, error: "El nombre tiene caracteres no imprimibles" };
  }

  return { ok: true, value: raw };
}

/**
 * Usuario de Discord. Acepta el formato moderno (`nombre`, 2-32 chars en
 * minúscula con punto y guión bajo) y el viejo con discriminador
 * (`nombre#1234`), que todavía se ve escrito por ahí.
 *
 * Es dato de CONTACTO, no una red para mostrar: nunca sale por una ruta
 * pública. Ver SubmissionDoc.
 */
export function parseDiscord(input: string): SocialParseResult {
  const raw = input.trim().replace(/^@/, "");
  if (!raw) return { ok: false, error: "Vacío" };

  const legacy = raw.match(/^(.{2,32})#(\d{4})$/);
  if (legacy) return { ok: true, value: `${legacy[1]}#${legacy[2]}` };

  if (!/^[a-z0-9._]{2,32}$/i.test(raw)) {
    return {
      ok: false,
      error: "Usuario de Discord inválido (2-32 caracteres, letras/números/./_)",
    };
  }

  return { ok: true, value: raw.toLowerCase() };
}

/**
 * Email de contacto.
 *
 * La validación es deliberadamente laxa: la única prueba real de que un mail
 * existe es mandarle algo, y no mandamos nada. Un regex estricto solo sirve
 * para rechazar direcciones válidas y raras. Con que tenga forma de mail y no
 * traiga basura alcanza — el dato lo usa un humano, no un servidor SMTP.
 */
export function parseEmail(input: string): SocialParseResult {
  const raw = input.trim();
  if (!raw) return { ok: false, error: "Vacío" };

  if (raw.length > 254) return { ok: false, error: "Email demasiado largo" };

  if (!/^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/.test(raw)) {
    return { ok: false, error: "Eso no parece un email" };
  }

  return { ok: true, value: raw.toLowerCase() };
}

export const SOCIAL_PARSERS = {
  twitch: parseTwitch,
  youtube: parseYouTube,
  untapped: parseUntapped,
} as const;

/** Campos de contacto. Privados: solo se ven en el panel de admin. */
export const CONTACT_PARSERS = {
  discord: parseDiscord,
  email: parseEmail,
} as const;
