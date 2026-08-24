import Link from "next/link";
import { LogoMark } from "./icons";
import { formatRelative } from "@/lib/format";
import { LANGS, type Dictionary, type Lang } from "@/lib/i18n";

type Nav = "leaderboard" | "link" | "how";

/** Las rutas son siempre en inglés; solo cambia el segmento de idioma. */
const PATHS: Record<Nav, string> = {
  leaderboard: "",
  link: "/link",
  how: "/how-it-works",
};

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
  const items: Nav[] = ["leaderboard", "link", "how"];

  return (
    <header className="flex h-17 shrink-0 items-center justify-between border-b border-line px-8">
      <div className="flex items-center gap-10">
        <Link href={`/${lang}`} className="flex items-center gap-2.5">
          <LogoMark className="text-accent" />
          <span className="font-display text-[19px] font-extrabold tracking-[-0.02em]">
            OPENSNAP
          </span>
          <span className="num rounded-[3px] border border-line-strong px-[5px] py-0.5 text-[10px] font-semibold tracking-[0.12em] text-ink-4">
            LB
          </span>
        </Link>

        <nav className="flex items-center gap-7 text-sm">
          {items.map((key) =>
            key === active ? (
              <span
                key={key}
                className="border-b-2 border-accent pb-[3px] font-semibold text-ink"
              >
                {t.nav[key]}
              </span>
            ) : (
              <Link
                key={key}
                href={`/${lang}${PATHS[key]}`}
                className="text-ink-3 hover:text-ink"
              >
                {t.nav[key]}
              </Link>
            )
          )}
        </nav>
      </div>

      <div className="flex items-center gap-5">
        {syncedAt && (
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-pos shadow-[0_0_0_3px_rgba(92,217,166,0.14)]" />
            <span className="text-[12.5px] text-ink-3">
              {t.header.synced} {formatRelative(syncedAt, lang)}
            </span>
          </div>
        )}

        {season && (
          <div className="num rounded border border-line-strong px-2.5 py-[5px] text-[11px] font-semibold tracking-[0.1em] text-ink-3">
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
    </header>
  );
}
