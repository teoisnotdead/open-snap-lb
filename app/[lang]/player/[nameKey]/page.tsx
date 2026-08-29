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
import { playersCollection, snapshotsCollection } from "@/lib/db";
import { getMergedLeaderboard } from "@/lib/merge";
import { toNameKey } from "@/lib/names";
import { formatRank, formatRelative, formatScore } from "@/lib/format";
import { fill, getDictionary, isLang, type Dictionary, type Lang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/** Tope de puntos, para que una serie larga no reviente la gráfica. */
const MAX_POINTS = 2000;

async function findPlayer(nameKey: string) {
  const players = await playersCollection();
  // Sin proyección: acá se excluía el código de verificación, que ya no existe.
  return players.findOne({ nameKey });
}

async function findHistory(nameKey: string) {
  const snapshots = await snapshotsCollection();
  return snapshots
    .find({ nameKey }, { projection: { _id: 0, timestamp: 1, rank: 1, score: 1, season: 1 } })
    .sort({ timestamp: 1 })
    .limit(MAX_POINTS)
    .toArray();
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
  let history: Awaited<ReturnType<typeof findHistory>> = [];

  try {
    player = await findPlayer(nameKey);
    history = await findHistory(nameKey);
  } catch (err) {
    console.error("Mongo no respondió en la vista de jugador:", err);
  }

  /**
   * La tabla linkea las 1000 filas, pero `players` solo tiene a los vinculados.
   * Sin esto, hacer click en casi cualquier fila daría 404 — la tabla estaría
   * prometiendo un detalle que para el 99% de los jugadores no existe. Así que
   * caemos al ladder en vivo (ya cacheado 60 s por la home) para mostrar al
   * menos puesto y SP actuales.
   */
  let live = null;
  try {
    const board = await getMergedLeaderboard(60);
    live = board.rows.find((r) => r.nameKey === nameKey) ?? null;
  } catch {
    // Si el endpoint oficial está caído seguimos con lo que tengamos guardado.
  }

  if (!player && history.length === 0 && !live) notFound();

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
          <Stat label={t.player.currentRank} value={currentRank} isRank />
          <Stat label={t.player.peakSp} value={player?.peakScore} accent />
          <Stat label={t.player.bestRank} value={player?.peakRank} isRank />
          <Stat label={t.player.daysTracked} value={daysTracked || undefined} plain />
        </section>

        {/*
          La condición mira si HAY datos, no si el jugador está en `players`.
          Antes miraba solo lo segundo, apoyándose en que sin doc de jugador no
          podía haber historial — cierto con el flujo viejo, falso ahora: los
          snapshots sobreviven al documento (una petición rechazada después de
          aprobada, un borrado a pedido). Con la condición vieja, esas
          mediciones reales quedaban invisibles y la página decía "no tenemos
          datos" teniéndolos.
        */}
        {player || points.length > 0 ? (
          <ProgressChart history={points} playerName={displayName} lang={lang} t={t} />
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
}: {
  label: string;
  value?: number;
  accent?: boolean;
  isRank?: boolean;
  plain?: boolean;
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
    </div>
  );
}
