import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { WarningIcon } from "@/components/icons";
import { getMergedLeaderboard } from "@/lib/merge";
import { LeaderboardError } from "@/lib/leaderboard";
import { formatScore } from "@/lib/format";
import { getDictionary, isLang, type Dictionary, type Lang } from "@/lib/i18n";

// El ladder cambia solo: nada que prerenderizar.
export const dynamic = "force-dynamic";

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: raw } = await params;
  if (!isLang(raw)) notFound();
  const lang: Lang = raw;
  const t = getDictionary(lang);

  let board;
  try {
    board = await getMergedLeaderboard(60);
  } catch (err) {
    return <BoardUnavailable error={err} lang={lang} t={t} />;
  }

  const verified = board.rows.filter((r) => r.verified).length;
  const topScore = board.rows[0]?.score ?? 0;

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader
        lang={lang}
        t={t}
        active="leaderboard"
        season={board.season}
        syncedAt={board.fetchedAt}
      />

      <section className="grid shrink-0 grid-cols-4 gap-px border-b border-line bg-line">
        <Stat label={t.stats.playersInLadder} value={formatScore(board.total)} />
        <Stat
          label={t.stats.visibleInTable}
          value={formatScore(board.rows.length)}
          note={t.stats.apiCap}
        />
        <Stat label={t.stats.maxSp} value={formatScore(topScore)} />
        <Stat label={t.stats.verifiedAccounts} value={formatScore(verified)} />
      </section>

      {!board.enriched && (
        <p className="mx-8 mt-5 flex items-start gap-2.5 rounded-[10px] border border-line-strong bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink-3">
          <WarningIcon size={15} className="mt-0.5 shrink-0 text-ink-4" />
          <span>{t.error.degraded}</span>
        </p>
      )}

      <LeaderboardTable rows={board.rows} lang={lang} t={t} />

      <footer className="mt-auto flex items-center justify-between gap-8 px-8 pb-[22px] pt-[18px]">
        <p className="flex items-center gap-2 text-xs text-ink-4">
          <WarningIcon size={13} className="shrink-0" />
          <span>{t.footer.ambiguity}</span>
        </p>
        <p className="text-xs text-ink-4">{t.footer.unofficial}</p>
      </footer>
    </main>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="bg-bg px-8 py-5">
      <div className="mb-[7px] text-[10.5px] font-semibold tracking-[0.13em] text-ink-4">
        {label}
      </div>
      <div className="flex items-baseline gap-2.5">
        <span className="num text-[26px] font-medium tracking-[-0.02em]">{value}</span>
        {note && <span className="text-[11.5px] text-ink-4">{note}</span>}
      </div>
    </div>
  );
}

/**
 * El endpoint oficial se cae con cierta frecuencia y no es nuestro. Cuando pasa,
 * decimos qué pasó en vez de mostrar una tabla vacía que parece un bug nuestro.
 */
function BoardUnavailable({
  error,
  lang,
  t,
}: {
  error: unknown;
  lang: Lang;
  t: Dictionary;
}) {
  const detail =
    error instanceof LeaderboardError ? error.message : t.error.boardFallback;

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader lang={lang} t={t} active="leaderboard" />
      <div className="flex grow items-center justify-center px-8">
        <div className="max-w-[520px] text-center">
          <h1 className="mb-3 font-display text-2xl font-bold tracking-[-0.02em]">
            {t.error.boardTitle}
          </h1>
          <p className="mb-6 text-sm leading-relaxed text-ink-3">{t.error.boardBody}</p>
          <p className="num rounded-lg border border-line bg-surface px-4 py-3 text-xs text-ink-4">
            {detail}
          </p>
        </div>
      </div>
    </main>
  );
}
