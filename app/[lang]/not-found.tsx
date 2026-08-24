import Link from "next/link";
import { DEFAULT_LANG, getDictionary } from "@/lib/i18n";

/**
 * `not-found` no recibe params, así que no puede saber el idioma de la URL.
 * Sirve inglés, que es el default del sitio.
 */
export default function NotFound() {
  const lang = DEFAULT_LANG;
  const t = getDictionary(lang);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center sm:px-8">
      <p className="num mb-4 text-[13px] tracking-[0.2em] text-ink-4">404</p>
      <h1 className="mb-3 font-display text-[32px] font-bold tracking-[-0.02em]">
        {t.error.notFoundTitle}
      </h1>
      <p className="mb-7 max-w-[440px] text-sm leading-relaxed text-ink-3">
        {t.error.notFoundBody}
      </p>
      <div className="flex items-center gap-2.5">
        <Link
          href={`/${lang}`}
          className="rounded-[7px] bg-accent px-5 py-[11px] text-[13.5px] font-semibold text-bg hover:bg-accent-bright"
        >
          {t.nav.leaderboard}
        </Link>
        <Link
          href={`/${lang}/link`}
          className="rounded-[7px] border border-line-strong px-5 py-[11px] text-[13.5px] font-medium text-ink-3 hover:text-ink"
        >
          {t.error.notFoundCta}
        </Link>
      </div>
    </main>
  );
}
