"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MergedLeaderboardRow } from "@/lib/types";
import { fill, type Dictionary, type Lang } from "@/lib/i18n";
import { formatDelta, formatRank, formatScore } from "@/lib/format";
import {
  CheckIcon,
  SearchIcon,
  TwitchIcon,
  UntappedIcon,
  WarningIcon,
  YouTubeIcon,
} from "./icons";

type Filter = "all" | "creators" | "verified";

/**
 * La API sirve 1000 filas. Renderizarlas todas de una hace un DOM enorme para
 * una pantalla que muestra ~15, así que crecemos de a tandas. El filtrado sí
 * corre sobre las 1000 — es un match de strings, cuesta menos que pintarlas.
 */
const PAGE = 100;

/** Grilla compartida por el encabezado y las filas, para que no se desalineen. */
const GRID =
  "grid grid-cols-[86px_minmax(0,1fr)_104px_148px_122px_128px] items-center gap-4 pl-3 pr-5";

export function LeaderboardTable({
  rows,
  lang,
  t,
}: {
  rows: MergedLeaderboardRow[];
  lang: Lang;
  t: Dictionary;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: t.table.filterAll },
    { key: "creators", label: t.table.filterCreators },
    { key: "verified", label: t.table.filterVerified },
  ];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((r) => {
      if (filter === "verified" && !r.verified) return false;
      if (filter === "creators" && !r.twitch && !r.youtube && !r.untapped) {
        return false;
      }
      if (!q) return true;
      // Buscamos sobre el nombre mostrado, el original y el tag de alianza.
      return (
        r.displayName.toLowerCase().includes(q) ||
        r.playerName.toLowerCase().includes(q) ||
        (r.alliance?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, query, filter]);

  const visible = filtered.slice(0, limit);

  function reset(next: () => void) {
    next();
    setLimit(PAGE);
  }

  return (
    <>
      <section className="flex items-center justify-between gap-6 px-8 py-[22px]">
        <div className="flex grow items-center gap-3.5">
          <label className="flex h-[42px] w-[380px] items-center gap-2.5 rounded-lg border border-line-strong bg-surface-2 px-3.5 focus-within:border-accent">
            <SearchIcon className="shrink-0 text-ink-4" />
            <input
              type="search"
              value={query}
              onChange={(e) => reset(() => setQuery(e.target.value))}
              placeholder={t.table.searchPlaceholder}
              aria-label={t.table.searchPlaceholder}
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-4"
            />
          </label>

          <div className="flex items-center gap-[7px]">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => reset(() => setFilter(f.key))}
                className={
                  f.key === filter
                    ? "rounded-md bg-ink px-3.5 py-2 text-[13px] font-semibold text-bg"
                    : "rounded-md border border-line-strong px-3.5 py-2 text-[13px] text-ink-3 hover:text-ink"
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="num text-[12.5px] text-ink-4">
            {formatScore(filtered.length)} {t.table.results}
          </span>
          <Link
            href={`/${lang}/link`}
            className="rounded-[7px] bg-accent px-[18px] py-2.5 text-[13.5px] font-semibold text-bg hover:bg-accent-bright"
          >
            {t.table.linkCta}
          </Link>
        </div>
      </section>

      <section className="px-8 pb-6">
        <div className="overflow-hidden rounded-[10px] border border-line bg-[#0b0b0f]">
          <div
            className={`${GRID} h-10 border-b border-line bg-surface-2 text-[10.5px] font-semibold tracking-[0.13em] text-ink-4`}
          >
            <div className="pl-2">{t.table.rank}</div>
            <div>{t.table.player}</div>
            <div>{t.table.alliance}</div>
            <div className="text-right">{t.table.snapPoints}</div>
            <div className="text-right">{t.table.delta}</div>
            <div className="text-right">{t.table.channels}</div>
          </div>

          {visible.length === 0 ? (
            <p className="px-5 py-14 text-center text-sm text-ink-4">
              {fill(t.table.noResults, {
                q: query,
                total: formatScore(rows.length),
              })}
            </p>
          ) : (
            visible.map((row) => (
              <Row key={`${row.rank}-${row.nameKey}`} row={row} lang={lang} t={t} />
            ))
          )}
        </div>

        {limit < filtered.length && (
          <div className="flex justify-center pt-5">
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE)}
              className="rounded-lg border border-line-strong px-5 py-2.5 text-[13px] text-ink-3 hover:text-ink"
            >
              {fill(t.table.showMore, {
                n: formatScore(Math.min(PAGE, filtered.length - limit)),
              })}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

/**
 * Escalón visual del podio.
 *
 * La barra lateral y el peso del número bajan del 1 al 3 y desaparecen del 4 en
 * adelante. Todas las filas llevan la barra en transparente para que el texto
 * quede alineado: si solo la tuvieran las primeras, el resto se correría 3px.
 */
const PODIUM: Record<number, { bar: string; num: string; row: string }> = {
  1: {
    bar: "border-l-accent",
    num: "text-[21px] font-semibold text-accent",
    row: "bg-accent/[0.045]",
  },
  2: {
    bar: "border-l-ink-2",
    num: "text-[19px] font-semibold text-ink",
    row: "bg-ink/[0.022]",
  },
  3: {
    bar: "border-l-ink-4",
    num: "text-[18px] font-semibold text-ink-2",
    row: "bg-ink/[0.012]",
  },
};

function Row({
  row,
  lang,
  t,
}: {
  row: MergedLeaderboardRow;
  lang: Lang;
  t: Dictionary;
}) {
  const podium = PODIUM[row.rank];

  return (
    <Link
      href={`/${lang}/player/${encodeURIComponent(row.nameKey)}`}
      className={`${GRID} h-14 border-b border-l-3 border-l-transparent border-b-line-soft last:border-b-0 hover:bg-surface-2 ${
        podium ? `${podium.bar} ${podium.row}` : ""
      }`}
    >
      <div className={`num pl-2 ${podium ? podium.num : "text-[15px] text-ink-3"}`}>
        {formatRank(row.rank)}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[15px] font-medium">{row.displayName}</span>

        {row.verified && (
          <span
            title={t.table.verifiedTooltip}
            aria-label={t.table.verifiedTooltip}
            className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border border-accent-line text-accent"
          >
            <CheckIcon size={11} />
          </span>
        )}

        {row.ambiguous && (
          <span
            className="shrink-0 text-ink-4"
            title={t.table.ambiguousTooltip}
            aria-label={t.table.ambiguousTooltip}
          >
            <WarningIcon size={13} />
          </span>
        )}
      </div>

      <div>
        {row.alliance ? (
          <span className="num rounded border border-line-strong px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-ink-3">
            {row.alliance}
          </span>
        ) : (
          <span className="text-[13px] text-ink-4">—</span>
        )}
      </div>

      <div className="num text-right text-[15px] font-medium">
        {formatScore(row.score)}
      </div>

      <div
        className={`num text-right text-[13.5px] ${
          row.delta24h === undefined
            ? "text-ink-4"
            : row.delta24h > 0
              ? "text-pos"
              : row.delta24h < 0
                ? "text-neg"
                : "text-ink-3"
        }`}
        title={row.delta24h === undefined ? t.table.unknownDelta : undefined}
      >
        {row.delta24h === undefined ? "—" : formatDelta(row.delta24h)}
      </div>

      <div className="flex items-center justify-end gap-2.5 text-ink-3">
        {row.twitch && <TwitchIcon />}
        {row.youtube && <YouTubeIcon />}
        {row.untapped && <UntappedIcon />}
      </div>
    </Link>
  );
}
