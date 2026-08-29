import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { RequestAccountFlow } from "@/components/RequestAccountFlow";
import { WarningIcon } from "@/components/icons";
import { getDictionary, isLang, type Lang } from "@/lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDictionary(lang);
  return { title: t.meta.linkTitle, description: t.meta.linkDescription };
}

export default async function LinkPage({
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
      <SiteHeader lang={lang} t={t} active="link" currentPath="/link" />

      {/* Una sola columna en móvil: la barra lateral de 372 px fijos no entra, y
          su contenido es contexto, así que baja debajo del formulario. */}
      <div className="grid grid-cols-1 gap-8 px-4 pb-16 pt-6 lg:grid-cols-[minmax(0,1fr)_372px] lg:gap-10 lg:px-8 lg:pt-[34px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <h1 className="mb-2 font-display text-[27px] sm:text-[34px] font-bold leading-[1.1] tracking-[-0.03em]">
              {t.link.title}
            </h1>
            <p className="max-w-[640px] text-[14.5px] leading-relaxed text-ink-3">
              {t.link.intro}
            </p>
          </div>

          <RequestAccountFlow lang={lang} t={t} />
        </div>

        <aside className="flex flex-col gap-3.5">
          <Card title={t.link.whyTitle}>
            <p className="mb-3.5">{t.link.why1}</p>
            <p>{t.link.why2}</p>
          </Card>

          <Card title={t.link.afterTitle}>
            <ul className="list-disc pl-[17px] leading-[1.75]">
              <li>{t.link.after1}</li>
              <li>{t.link.after2}</li>
              <li>{t.link.after3}</li>
            </ul>
          </Card>

          {/* El texto va en su propio <span>: el <p> es flex y si no, se parte. */}
          <p className="flex items-start gap-2.5 rounded-[10px] border border-line px-[17px] py-[15px] text-[12.5px] leading-relaxed text-ink-4">
            <WarningIcon size={15} className="mt-0.5 shrink-0" />
            <span>{t.link.topOnly}</span>
          </p>
        </aside>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h3 className="mb-3 text-[13.5px] font-semibold">{title}</h3>
      <div className="text-[13px] leading-relaxed text-ink-3">{children}</div>
    </section>
  );
}
