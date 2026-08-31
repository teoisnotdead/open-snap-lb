import Link from "next/link";
import { LogoMark } from "./icons";
import { formatRelative } from "@/lib/format";
import { LANGS, type Dictionary, type Lang } from "@/lib/i18n";

type Nav = "leaderboard" | "lastSeason" | "link" | "how";

/** Las rutas son siempre en inglés; solo cambia el segmento de idioma. */
const PATHS: Record<Nav, string> = {
  leaderboard: "",
  lastSeason: "/last-season",
  link: "/link",
  how: "/how-it-works",
};

/**
 * "Temporada pasada" va segundo, pegado al leaderboard: son la misma tabla en
 * dos momentos distintos, y separarlos con "Vincular cuenta" en el medio los
 * desemparejaría.
 */
const ITEMS: Nav[] = ["leaderboard", "lastSeason", "link", "how"];

/**
 * En móvil el header se parte en dos filas: arriba logo e idioma, abajo la
 * navegación. En una sola fila los tres links no entran y terminaban cortados
 * por el borde de la pantalla.
 *
 * El "sincronizado" y la temporada solo aparecen desde `lg`: son contexto útil
 * pero no accionable, y en 390 px compiten con lo que sí importa.
 */
export function SiteHeader({
  lang,
  t,
  active,
  season,
  syncedAt,
  currentPath = "",
}: {
  lang: Lang;
  t: Dictionary;
  active?: Nav;
  season?: string;
  syncedAt?: Date;
  /** Ruta sin el segmento de idioma, para que el switcher no te saque de la página. */
  currentPath?: string;
}) {
  return (
    <header className="shrink-0 border-b border-line">
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:h-17 sm:px-8">
        <div className="flex min-w-0 items-center gap-10">
          <Link href={`/${lang}`} className="flex shrink-0 items-center gap-2.5">
            <LogoMark className="text-accent" />
            <span className="font-display text-[17px] font-extrabold tracking-[-0.02em] sm:text-[19px]">
              OPENSNAP
            </span>
            <span className="num rounded-[3px] border border-line-strong px-[5px] py-0.5 text-[10px] font-semibold tracking-[0.12em] text-ink-4">
              LB
            </span>
          </Link>

          <Nav lang={lang} t={t} active={active} className="hidden sm:flex" />
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:gap-5">
          {syncedAt && (
            <div className="hidden items-center gap-2 lg:flex">
              <span className="size-1.5 rounded-full bg-pos shadow-[0_0_0_3px_rgba(92,217,166,0.14)]" />
              <span className="text-[12.5px] text-ink-3">
                {t.header.synced} {formatRelative(syncedAt, lang)}
              </span>
            </div>
          )}

          {season && (
            <div className="num hidden rounded border border-line-strong px-2.5 py-[5px] text-[11px] font-semibold tracking-[0.1em] text-ink-3 lg:block">
              {t.header.season} {season}
            </div>
          )}

          <div className="flex items-center overflow-hidden rounded-md border border-line-strong">
            {LANGS.map((l) => (
              <Link
                key={l}
                href={`/${l}${currentPath}`}
                hrefLang={l}
                className={`px-2.5 py-[5px] text-[11px] font-semibold uppercase tracking-[0.08em] ${
                  l === lang ? "bg-ink text-bg" : "text-ink-4 hover:text-ink"
                }`}
              >
                {l}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Segunda fila, solo móvil. Scrollea sola si algún idioma alarga los
          textos más de lo que entra. */}
      <Nav
        lang={lang}
        t={t}
        active={active}
        className="flex gap-6 overflow-x-auto px-4 pb-2.5 sm:hidden"
      />
    </header>
  );
}

function Nav({
  lang,
  t,
  active,
  className = "",
}: {
  lang: Lang;
  t: Dictionary;
  active?: Nav;
  className?: string;
}) {
  return (
    <nav className={`items-center gap-7 text-sm ${className}`}>
      {ITEMS.map((key) =>
        key === active ? (
          <span
            key={key}
            className="shrink-0 border-b-2 border-accent pb-[3px] font-semibold text-ink"
          >
            {t.nav[key]}
          </span>
        ) : (
          <Link
            key={key}
            href={`/${lang}${PATHS[key]}`}
            className="shrink-0 text-ink-3 hover:text-ink"
          >
            {t.nav[key]}
          </Link>
        )
      )}
    </nav>
  );
}
