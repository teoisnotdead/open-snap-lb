import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Comparación de secretos en tiempo constante.
 * `timingSafeEqual` explota si los buffers difieren en longitud, así que la
 * chequeamos antes — y esa comparación de longitud no filtra nada útil.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Valida `Authorization: Bearer <CRON_SECRET>`.
 * Devuelve una respuesta de error si falla, o null si está todo bien.
 */
export function requireCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    // Sin secreto configurado, la ruta queda cerrada — nunca abierta.
    console.error("CRON_SECRET no está configurado; se rechaza el request.");
    return apiError("El endpoint de sync no está configurado.", 503);
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token || !safeEqual(token, secret)) {
    return apiError("No autorizado.", 401);
  }

  return null;
}

/** Parsea el body JSON sin que un body inválido tire un 500. */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
