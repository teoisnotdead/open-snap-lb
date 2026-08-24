import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LANG, LANGS } from "./lib/i18n";

/**
 * Todas las páginas viven bajo un segmento de idioma (`/en/…`, `/es/…`), así
 * que la raíz tiene que ir a algún lado. Elegimos según el Accept-Language del
 * navegador y caemos a inglés.
 *
 * Las rutas son siempre en inglés: el idioma solo cambia el contenido.
 */
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const hasLang = LANGS.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  );
  if (hasLang) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = `/${preferredLang(req)}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

function preferredLang(req: NextRequest): string {
  const header = req.headers.get("accept-language") ?? "";
  // "es-419,es;q=0.9,en;q=0.8" -> ["es-419", "es", "en"]
  const tags = header.split(",").map((part) => part.split(";")[0].trim().toLowerCase());

  for (const tag of tags) {
    const base = tag.split("-")[0];
    if (LANGS.some((l) => l === base)) return base;
  }
  return DEFAULT_LANG;
}

export const config = {
  // Todo menos las rutas de API, los internos de Next y los archivos estáticos.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
