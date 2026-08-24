import { cookies } from "next/headers";
import { json } from "@/lib/api";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** POST /api/admin/logout — borra la cookie de sesión. */
export async function POST() {
  const jar = await cookies();
  // maxAge 0 con las MISMAS opciones que al crearla: si `path` o `sameSite`
  // difieren, el navegador la trata como otra cookie y la vieja sobrevive.
  jar.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return json({ ok: true });
}
