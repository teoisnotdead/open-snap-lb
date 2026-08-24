import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { TokenLookup } from "@/components/TokenLookup";
import { getDictionary, isLang, type Lang } from "@/lib/i18n";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Buscador de peticiones por código.
 *
 * Existe porque el link directo se pierde: la gente cierra la pestaña. El
 * código lo pueden haber copiado a cualquier lado, así que hace falta una
 * puerta donde pegarlo.
 */
export default async function RequestLookupPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: raw } = await params;
  if (!isLang(raw)) notFound();
  const lang: Lang = raw;
  const t = getDictionary(lang);

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader lang={lang} t={t} active="link" currentPath="/request" />

      <div className="mx-auto w-full max-w-[560px] px-4 pb-16 pt-8 sm:px-8 sm:pt-[48px]">
        <h1 className="mb-2 font-display text-[25px] sm:text-[30px] font-bold leading-[1.1] tracking-[-0.03em]">
          {t.request.lookupTitle}
        </h1>
        <p className="mb-7 text-[14px] leading-relaxed text-ink-3">
          {t.request.lookupSubtitle}
        </p>

        <TokenLookup lang={lang} t={t} />
      </div>
    </main>
  );
}
