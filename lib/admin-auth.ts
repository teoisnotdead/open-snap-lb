import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Autenticación del panel de admin. Usuario y clave, sin librerías.
 *
 * A escala de este proyecto —un solo admin, un puñado de peticiones— montar
 * NextAuth o un proveedor OAuth sería más superficie de la que resuelve. Lo que
 * SÍ hace falta es no cometer los errores clásicos, que son tres: guardar la
 * clave en texto plano, comparar con `===`, y firmar la sesión con algo
 * adivinable. Los tres están cubiertos acá.
 */

export const SESSION_COOKIE = "osl_admin";

/** Duración de la sesión. Corta a propósito: es una consola de escritura. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const SCRYPT_KEYLEN = 64;

/**
 * Separador `:` y NO `$`, que es lo que usa el formato clásico de scrypt/bcrypt.
 *
 * Next.js expande variables al leer `.env` (dotenv-expand), así que un valor con
 * `$` se interpreta como referencia: `scrypt$a1b2...` se convierte en `scrypt`
 * más la expansión de `$a1b2...`, que no existe y queda vacía. El hash llega
 * mutilado, `isAdminConfigured()` sigue dando true porque la variable no está
 * vacía, y el login falla con "clave incorrecta" sin ninguna pista de por qué.
 *
 * Escapar cada `$` en el .env también funcionaría, pero deja una trampa armada
 * para el próximo que copie el valor a mano. Ni el hex ni el base64 contienen
 * `:`, así que como separador es inequívoco.
 */
const HASH_SEP = ":";

/**
 * `scrypt` y no SHA-256 pelado: SHA está diseñado para ser RÁPIDO, que es
 * exactamente lo que no querés en un hash de contraseña. scrypt es lento y
 * pide memoria a propósito, así que probar millones de claves cuesta caro.
 * Viene en Node, sin dependencias.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return ["scrypt", salt, hash].join(HASH_SEP);
}

/**
 * Comparación en tiempo constante.
 *
 * Con `===` el tiempo de respuesta depende de cuántos caracteres coinciden, y
 * eso deja adivinar el hash byte a byte midiendo demoras. `timingSafeEqual`
 * siempre tarda lo mismo.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(HASH_SEP);
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;

  const [, salt, expected] = parts;
  let expectedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  if (expectedBuf.length !== SCRYPT_KEYLEN) return false;

  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  return timingSafeEqual(actual, expectedBuf);
}

interface AdminConfig {
  user: string;
  passwordHash: string;
  secret: string;
}

/**
 * Sin configuración, el panel queda CERRADO, nunca abierto.
 *
 * Es la misma decisión que en `/api/cron/sync`: una env var que falta tiene que
 * producir un 503, jamás un acceso libre. Devolver `null` y que cada llamador
 * corte es más difícil de arruinar que un booleano `isConfigured`.
 */
function readConfig(): AdminConfig | null {
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!passwordHash || !secret) return null;

  return {
    user: process.env.ADMIN_USER ?? "admin",
    passwordHash,
    secret,
  };
}

export function isAdminConfigured(): boolean {
  return readConfig() !== null;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** Valida credenciales. Devuelve el token de sesión, o null si no coinciden. */
export function login(user: string, password: string): string | null {
  const config = readConfig();
  if (!config) return null;

  /**
   * Se verifica la clave SIEMPRE, incluso con usuario incorrecto, y recién al
   * final se combinan los dos resultados. Cortar antes haría que un usuario
   * inexistente responda mucho más rápido que uno real, y eso le regala al
   * atacante la lista de usuarios válidos.
   */
  const passwordOk = verifyPassword(password, config.passwordHash);

  const userBuf = Buffer.from(user);
  const expectedUserBuf = Buffer.from(config.user);
  const userOk =
    userBuf.length === expectedUserBuf.length &&
    timingSafeEqual(userBuf, expectedUserBuf);

  if (!userOk || !passwordOk) return null;

  const payload = b64url(
    JSON.stringify({ u: config.user, exp: Date.now() + SESSION_TTL_MS })
  );
  return `${payload}.${sign(payload, config.secret)}`;
}

export interface AdminSession {
  user: string;
  expiresAt: Date;
}

/** Verifica un token. Devuelve la sesión, o null si está mal firmado o vencido. */
export function verifySessionToken(token: string): AdminSession | null {
  const config = readConfig();
  if (!config) return null;

  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = sign(payload, config.secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: { u?: string; exp?: number };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!parsed.u || typeof parsed.exp !== "number") return null;
  if (parsed.exp <= Date.now()) return null;

  // El usuario del token tiene que seguir siendo el configurado: si cambiaste
  // ADMIN_USER, las sesiones viejas dejan de valer.
  if (parsed.u !== config.user) return null;

  return { user: parsed.u, expiresAt: new Date(parsed.exp) };
}

/** Lee la sesión de la cookie. Para server components y route handlers. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Opciones de la cookie de sesión, en un solo lugar para no desincronizarlas. */
export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true, // fuera del alcance de cualquier JS de la página
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
