import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { ChevronLeftIcon } from "@/components/icons";
import { loadLatestArchivedSeason } from "@/lib/seasons";
import { formatRelative, formatScore } from "@/lib/format";
import { fill, getDictionary, isLang, type Dictionary, type Lang } from "@/lib/i18n";

/** El archivo no cambia, pero `players` sí: los links se enriquecen al vuelo. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDictionary(lang);
  return { title: t.meta.lastSeasonTitle, description: t.meta.lastSeasonDescription };
}

/**
 * La última temporada cerrada.
 *
 * Sale de nuestro archivo `seasonResults`, no de la API: el endpoint oficial
 * sirve el mes anterior por unas semanas y después lo pierde para siempre, así
 * que esta página es la única razón por la que archivamos.
 *
 * Muestra UNA temporada, la más reciente. `listArchivedSeasons()` ya devuelve
 * todas y `loadLatestArchivedSeason` se queda con la primera — el día que haya
 * que navegar meses viejos, el cambio es acá y no en la capa de datos.
 */
export default async function LastSeasonPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: raw } = await params;
  if (!isLang(raw)) notFound();
  const lang: Lang = raw;
  const t = getDictionary(lang);

  /* Si Mongo no responde tratamos el archivo como vacío en vez de tirar la
     página: el mensaje "todavía no hay ninguna" es impreciso pero inofensivo,
     y una pantalla de error para una sección secundaria es peor. */
  let board = null;
  try {
    board = await loadLatestArchivedSeason();
  } catch (err) {
    console.error("No se pudo leer la temporada archivada:", err);
  }

  if (!board) return <NoArchive lang={lang} t={t} />;

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader
        lang={lang}
        t={t}
        active="lastSeason"
        season={board.season}
        currentPath="/last-season"
      />

      <section className="flex flex-col gap-2 border-b border-line px-4 py-5 sm:px-8 sm:py-[22px]">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[26px] font-bold leading-none tracking-[-0.02em] sm:text-[32px]">
            {fill(t.lastSeason.title, { season: board.season })}
          </h1>
          {/* El chip evita la lectura de que esto es el ladder de ahora, que es
              el único malentendido posible en esta página. */}
          <span className="rounded-full border border-line-strong px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-4">
            {t.lastSeason.closed}
          </span>
        </div>
        <p className="max-w-[640px] text-[13px] leading-relaxed text-ink-3">
          {fill(t.lastSeason.subtitle, {
            total: formatScore(board.total),
            shown: formatScore(board.rows.length),
          })}
        </p>
        <p className="text-[12px] text-ink-4">
          {fill(t.lastSeason.capturedAt, { when: formatRelative(board.capturedAt, lang) })}
        </p>
      </section>

      {/* Sin Δ 24 h: una temporada congelada no tiene un ayer contra el que
          compararse, y la columna serían 1000 guiones. */}
      <LeaderboardTable rows={board.rows} lang={lang} t={t} showDelta={false} />
    </main>
  );
}

/**
 * Todavía no archivamos nada: pasa en un despliegue nuevo, hasta el primer
 * cambio de temporada. Explica por qué está vacío en vez de mostrar una tabla
 * de cero filas.
 */
function NoArchive({ lang, t }: { lang: Lang; t: Dictionary }) {
  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader lang={lang} t={t} active="lastSeason" currentPath="/last-season" />
      <div className="flex grow items-center justify-center px-4 py-16 sm:px-8">
        <div className="max-w-[520px] text-center">
          <h1 className="mb-3 font-display text-2xl font-bold tracking-[-0.02em]">
            {t.lastSeason.emptyTitle}
          </h1>
          <p className="mb-6 text-sm leading-relaxed text-ink-3">{t.lastSeason.emptyBody}</p>
          <Link
            href={`/${lang}`}
            className="inline-flex items-center gap-[7px] text-[13px] text-ink-3 hover:text-ink"
          >
            <ChevronLeftIcon />
            {t.lastSeason.backToLive}
          </Link>
        </div>
      </div>
    </main>
  );
}
