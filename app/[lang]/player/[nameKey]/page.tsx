import Link from "next/link";
import { notFound } from "next/navigation";
import { AllianceTag } from "@/components/AllianceTag";
import { SiteHeader } from "@/components/SiteHeader";
import { ProgressChart, type HistoryPoint } from "@/components/ProgressChart";
import {
  CheckIcon,
  ChevronLeftIcon,
  TwitchIcon,
  UntappedIcon,
  YouTubeIcon,
} from "@/components/icons";
import { playersCollection } from "@/lib/db";
import { loadHistory, type HistoryRow } from "@/lib/history";
import { getMergedLeaderboard } from "@/lib/merge";
import type { MergedLeaderboardRow } from "@/lib/types";
import { toNameKey } from "@/lib/names";
import { formatRank, formatRelative, formatScore } from "@/lib/format";
import { fill, getDictionary, isLang, type Dictionary, type Lang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

async function findPlayer(nameKey: string) {
  const players = await playersCollection();
  // Sin proyección: acá se excluía el código de verificación, que ya no existe.
  return players.findOne({ nameKey });
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ lang: string; nameKey: string }>;
}) {
  const { lang: rawLang, nameKey: rawKey } = await params;
  if (!isLang(rawLang)) notFound();
  const lang: Lang = rawLang;
  const t = getDictionary(lang);

  const nameKey = toNameKey(decodeURIComponent(rawKey));
  if (!nameKey) notFound();

  // Igual que en la home: si Mongo no responde seguimos con los datos en vivo
  // en vez de tirar la página. Sin base no hay historial ni links, pero el
  // puesto y los SP del jugador son públicos.
  let player: Awaited<ReturnType<typeof findPlayer>> = null;
  let history: HistoryRow[] = [];

  try {
    player = await findPlayer(nameKey);
  } catch (err) {
    console.error("Mongo no respondió en la vista de jugador:", err);
  }

  /**
   * Va aparte del `findPlayer`: el historial ya no depende de estar vinculado.
   * La foto diaria del ladder cubre a los 1000, así que cualquier fila de la
   * tabla llega acá con gráfica — y quien vinculó suma resolución horaria
   * encima. Ver `lib/history.ts`.
   */
  history = await loadHistory(nameKey);

  /**
   * La tabla linkea las 1000 filas, pero `players` solo tiene a los vinculados.
   * Sin esto, hacer click en casi cualquier fila daría 404 — la tabla estaría
   * prometiendo un detalle que para el 99% de los jugadores no existe. Así que
   * caemos al ladder en vivo (ya cacheado 60 s por la home) para mostrar al
   * menos puesto y SP actuales.
   */
  let live: MergedLeaderboardRow | null = null;
  /**
   * Las filas de arriba y abajo en el ladder vivo. Vienen del MISMO fetch que
   * `live` —ya cacheado 60 s por la home— así que saber cuánto falta para el
   * puesto siguiente no cuesta ninguna consulta extra.
   */
  let above: MergedLeaderboardRow | null = null;
  let below: MergedLeaderboardRow | null = null;
  try {
    const board = await getMergedLeaderboard(60);
    const i = board.rows.findIndex((r) => r.nameKey === nameKey);
    if (i >= 0) {
      live = board.rows[i];
      above = board.rows[i - 1] ?? null;
      below = board.rows[i + 1] ?? null;
    }
  } catch {
    // Si el endpoint oficial está caído seguimos con lo que tengamos guardado.
  }

  if (!player && history.length === 0 && !live) notFound();

  const hasHourly = history.some((h) => !h.daily);

  const points: HistoryPoint[] = history.map((h) => ({
    timestamp: h.timestamp.toISOString(),
    rank: h.rank,
    score: h.score,
    season: h.season,
  }));

  const displayName =
    player?.patchedName ?? player?.playerName ?? live?.displayName ?? nameKey;
  const alliance = player?.alliance ?? live?.alliance;
  /* Van juntos o no van: el nombre suelto, sin el tag al lado, no se
     reconoce — es el tag lo que la gente ve en el juego. */
  const allianceName = alliance
    ? (player?.allianceName ?? live?.allianceName)
    : undefined;

  // El ladder en vivo es más fresco que lo denormalizado del último sync.
  const currentScore = live?.score ?? player?.lastScore;
  const currentRank = live?.rank ?? player?.lastRank;

  /**
   * Cuánto falta para el puesto de arriba, colgado del tile de PUESTO ACTUAL.
   *
   * Se calla con los nombres repetidos, igual que el Δ 24 h: con dos filas
   * homónimas no sabemos cuál es esta persona, así que la distancia al de
   * arriba sería la de un desconocido presentada como propia. Mismo criterio
   * que `merge.ts` — antes el hueco que el número inventado.
   *
   * El #1 no tiene a nadie arriba y la línea no desaparece: se da vuelta y
   * muestra su ventaja sobre el #2, que es el dato que le importa a quien va
   * primero.
   */
  const rankNote = (() => {
    if (!live || live.ambiguous) return undefined;

    const rival = above ?? below;
    if (!rival) return undefined;

    const gap = Math.abs(rival.score - live.score);
    const rank = formatRank(rival.rank);

    if (gap === 0) return fill(t.player.gapTied, { rank });
    return fill(above ? t.player.gapToNext : t.player.gapLead, {
      n: formatScore(gap),
      rank,
    });
  })();

  const daysTracked =
    history.length > 0
      ? Math.max(
          1,
          Math.round(
            (history[history.length - 1].timestamp.getTime() -
              history[0].timestamp.getTime()) /
              86_400_000
          )
        )
      : 0;

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader
        lang={lang}
        t={t}
        syncedAt={player?.lastSeenAt ?? undefined}
        currentPath={`/player/${encodeURIComponent(nameKey)}`}
      />

      <div className="flex flex-col gap-5 px-4 pb-10 pt-5 sm:px-8 sm:pt-[22px]">
        <Link
          href={`/${lang}`}
          className="flex w-fit items-center gap-[7px] text-[13px] text-ink-3 hover:text-ink"
        >
          <ChevronLeftIcon />
          {t.player.back}
        </Link>

        <section className="flex flex-col gap-5 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-8 sm:pb-[22px]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="min-w-0 break-words font-display text-[28px] font-bold leading-none tracking-[-0.03em] sm:text-[42px]">
                {displayName}
              </h1>
              {player?.verified && (
                <span
                  title={t.table.verifiedTooltip}
                  aria-label={t.table.verifiedTooltip}
                  className="inline-flex size-6 items-center justify-center rounded-full border border-accent-line text-accent"
                >
                  <CheckIcon size={13} />
                </span>
              )}
              {alliance && (
                <AllianceTag
                  tag={alliance}
                  name={allianceName}
                  nameDisplay="inline"
                  size="lg"
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
              {player?.lastSeenAt && (
                <span>
                  {t.player.lastSeen} {formatRelative(player.lastSeenAt, lang)}
                </span>
              )}
              {player?.patchedName && (
                <span className="text-ink-4">
                  {fill(t.player.knownAs, { name: player.playerName })}
                </span>
              )}
            </div>
          </div>

          {player && (player.twitch || player.youtube || player.untapped) && (
            <div className="flex flex-wrap items-center gap-2.5 sm:shrink-0">
              {player.twitch && (
                <SocialLink href={`https://twitch.tv/${player.twitch}`}>
                  <TwitchIcon size={16} />
                  twitch.tv/{player.twitch}
                </SocialLink>
              )}
              {player.youtube && (
                <SocialLink href={`https://youtube.com/@${player.youtube}`}>
                  <YouTubeIcon size={16} />
                  youtube.com/@{player.youtube}
                </SocialLink>
              )}
              {player.untapped && (
                <SocialLink href={player.untapped}>
                  <UntappedIcon size={16} />
                  Untapped
                </SocialLink>
              )}
            </div>
          )}
        </section>

        {/* Cinco métricas en fila no entran en 390 px: 2 columnas en móvil, 3 en
            tablet. */}
        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
          <Stat label={t.player.snapPoints} value={currentScore} />
          <Stat label={t.player.currentRank} value={currentRank} isRank note={rankNote} />
          <Stat label={t.player.peakSp} value={player?.peakScore} accent />
          <Stat label={t.player.bestRank} value={player?.peakRank} isRank />
          <Stat label={t.player.daysTracked} value={daysTracked || undefined} plain />
        </section>

        {/*
          La condición mira si HAY datos, no si el jugador está en `players`.
          Eso empezó cubriendo a los desvinculados cuyos snapshots sobrevivían
          al documento, y ahora cubre además al ladder entero: con el archivo
          diario, cualquier fila de la tabla llega con algo que graficar.

          `NotLinked` quedó para el caso que de verdad no tiene nada: un nombre
          que todavía no apareció en ninguna foto diaria — recién entrado al
          top 1000, o el primer día de vida de la colección.
        */}
        {player || points.length > 0 ? (
          <ProgressChart
            history={points}
            playerName={displayName}
            lang={lang}
            t={t}
            hasHourly={hasHourly}
          />
        ) : (
          <NotLinked lang={lang} t={t} />
        )}
      </div>
    </main>
  );
}

/**
 * Un jugador del top 1000 que nunca se vinculó: existe en el ladder pero no
 * tenemos historial suyo, y nunca lo vamos a tener si no se vincula. En vez de
 * una gráfica vacía, la invitación.
 */
function NotLinked({ lang, t }: { lang: Lang; t: Dictionary }) {
  return (
    <section className="rounded-xl border border-line bg-surface px-6 py-14 text-center">
      <h2 className="mb-2 text-[15px] font-semibold">{t.error.notFoundTitle}</h2>
      <p className="mx-auto mb-6 max-w-[460px] text-[13px] leading-relaxed text-ink-4">
        {t.error.notFoundBody}
      </p>
      <Link
        href={`/${lang}/link`}
        className="inline-block rounded-[7px] bg-accent px-5 py-[11px] text-[13.5px] font-semibold text-bg hover:bg-accent-bright"
      >
        {t.error.notFoundCta}
      </Link>
    </section>
  );
}

function SocialLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-[7px] border border-line-strong bg-surface-2 px-3.5 py-2.5 text-[13px] font-medium text-ink hover:border-line-bright"
    >
      {children}
    </a>
  );
}

function Stat({
  label,
  value,
  accent,
  isRank,
  plain,
  note,
}: {
  label: string;
  value?: number;
  accent?: boolean;
  isRank?: boolean;
  plain?: boolean;
  /**
   * Línea chica bajo el número. Sale de la grilla de 5 columnas a propósito:
   * un sexto tile la rompería en desktop, y este dato es una precisión sobre
   * el puesto, no una métrica aparte.
   */
  note?: string;
}) {
  const text =
    value === undefined
      ? "—"
      : isRank
        ? formatRank(value)
        : plain
          ? String(value)
          : formatScore(value);

  return (
    <div className="rounded-[10px] border border-line bg-surface px-[18px] py-4">
      <div className="mb-2.5 text-[10.5px] font-semibold tracking-[0.13em] text-ink-4">
        {label}
      </div>
      <div
        className={`num text-[27px] font-medium tracking-[-0.02em] ${
          value === undefined ? "text-ink-4" : accent ? "text-accent" : ""
        }`}
      >
        {text}
      </div>
      {note && <div className="mt-1 text-[11.5px] text-ink-4">{note}</div>}
    </div>
  );
}
