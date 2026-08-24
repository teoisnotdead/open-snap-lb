import { cookies } from "next/headers";
import { apiError, json, readJson } from "@/lib/api";
import {
  isAdminConfigured,
  login,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

interface Body {
  user?: string;
  password?: string;
}

/**
 * POST /api/admin/login
 *
 * Nota sobre lo que NO tiene: límite de intentos. En serverless no hay memoria
 * compartida entre invocaciones, así que un contador honesto necesita ir a
 * Mongo, y eso agrega una escritura por intento fallido. Hoy la defensa es que
 * la clave se guarda con scrypt (lento a propósito) y que el script de setup
 * exige 12 caracteres. Si el panel se vuelve público de verdad, el límite de
 * intentos es lo primero que hay que agregar.
 */
export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return apiError("El panel de admin no está configurado.", 503);
  }

  const body = await readJson<Body>(req);
  const user = body?.user?.trim();
  const password = body?.password;

  if (!user || !password) return apiError("Falta usuario o clave.");

  const token = login(user, password);

  // Un solo mensaje para usuario inexistente y clave incorrecta: distinguirlos
  // le confirma al atacante cuál de las dos mitades ya tiene bien.
  if (!token) return apiError("Usuario o clave incorrectos.", 401);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE_SECONDS));

  return json({ ok: true, user });
}
