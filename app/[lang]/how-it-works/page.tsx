import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { getDictionary, isLang, type Lang } from "@/lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDictionary(lang);
  return { title: t.meta.howTitle, description: t.meta.howDescription };
}

export default async function HowPage({
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
      <SiteHeader lang={lang} t={t} active="how" currentPath="/how-it-works" />

      <article className="mx-auto w-full max-w-[720px] px-4 pb-20 pt-8 sm:px-8 sm:pt-12">
        <h1 className="mb-3 font-display text-[34px] font-bold leading-[1.1] tracking-[-0.03em]">
          {t.how.title}
        </h1>
        <p className="mb-10 text-[15px] leading-relaxed text-ink-3">{t.how.intro}</p>

        <Section title={t.how.s1Title}>
          <p>{t.how.s1a}</p>
          <p>{t.how.s1b}</p>
        </Section>

        <Section title={t.how.s2Title}>
          <p>{t.how.s2a}</p>
          <p>{t.how.s2b}</p>
        </Section>

        <Section title={t.how.s3Title}>
          <p>{t.how.s3a}</p>
        </Section>

        <Section title={t.how.s4Title}>
          <p>{t.how.s4a}</p>
        </Section>

        <Section title={t.how.s5Title}>
          <p>{t.how.s5a}</p>
          <p>{t.how.s5b}</p>
        </Section>

        <Section title={t.how.s6Title}>
          <p>{t.how.s6a}</p>
          <p>
            {t.how.s6b} <Link href={`/${lang}/link`} className={LINK}>
              {t.how.s6link}
            </Link>{" "}
            {t.how.s6c}
          </p>
        </Section>

        <Section title={t.how.s7Title}>
          <p>{t.how.s7a}</p>
          <p>
            <Link href={`/${lang}/request`} className={LINK}>
              {t.how.s7link}
            </Link>{" "}
            {t.how.s7b}
          </p>
        </Section>

        {/* Va después de la revisión a mano y no antes: la edición automática
            solo se entiende como lo que SIGUE a esa revisión, no como una
            alternativa a ella. */}
        <Section title={t.how.s8Title}>
          <p>{t.how.s8a}</p>
          <p>{t.how.s8b}</p>
          <p>{t.how.s8c}</p>
        </Section>

        <p className="mt-12 border-t border-line pt-6 text-[12.5px] leading-relaxed text-ink-4">
          {t.how.legal}
        </p>
      </article>
    </main>
  );
}

/* Preflight de Tailwind deja los <a> con el color y el subrayado heredados:
   sin esto un link dentro del texto es indistinguible del párrafo. */
const LINK = "text-accent hover:underline";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-9">
      <h2 className="mb-3 text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink-3">
        {children}
      </div>
    </section>
  );
}
