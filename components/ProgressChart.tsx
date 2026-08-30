"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatScore, formatShortDate, formatDateTime } from "@/lib/format";
import { fill, type Dictionary, type Lang } from "@/lib/i18n";

/**
 * Recharts recibe colores como props, no como clases, así que los tokens del
 * tema se repiten acá como hex literales. Es el único lugar del proyecto donde
 * eso es correcto — mantenerlos en sync con globals.css es manual.
 */
const C = {
  accent: "#f0b429",
  rank: "#c8c8d4",
  grid: "#1b1b24",
  axis: "#5e5e6c",
  surface: "#0d0d12",
  border: "#2e2e3a",
  ink: "#ececf2",
  ink3: "#9797a6",
  pos: "#5cd9a6",
  neg: "#ff7b6b",
} as const;

export interface HistoryPoint {
  timestamp: string;
  rank: number;
  score: number;
  /** "YYYY-MM". Marca a qué ladder pertenece la medición. */
  season: string;
}

/** 7 y 30 son días; "season" es la temporada actual; "all" es todo. */
type Range = 7 | 30 | "season" | "all";

/** Etiquetas del selector de rango, tomadas del diccionario activo. */
function ranges(t: Dictionary): { key: Range; label: string }[] {
  return [
    { key: 7, label: t.chart.range7 },
    { key: 30, label: t.chart.range30 },
    { key: "season", label: t.chart.rangeSeason },
    { key: "all", label: t.chart.rangeAll },
  ];
}

/** Pasos "redondos" aceptables para una marca de eje. */
const STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

/**
 * Elige un dominio y marcas en valores redondos.
 *
 * Dejar que recharts derive el dominio de los datos da marcas como 9967 o
 * 10 199, que son ruido: nadie lee un eje en esos números. Buscamos el paso
 * más chico que deje entre 3 y 6 marcas, y estiramos el dominio hasta el
 * múltiplo más cercano — eso también da el aire para que la línea no toque
 * los bordes.
 */
function niceAxis(min: number, max: number, floor?: number) {
  const span = Math.max(max - min, 1);
  const step = STEPS.find((s) => span / s <= 5) ?? STEPS[STEPS.length - 1];

  let lo = Math.floor(min / step) * step - (min % step === 0 ? step : 0);
  const hi = Math.ceil(max / step) * step + (max % step === 0 ? step : 0);

  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);

  // El eje de puestos no puede bajar de #1: redondear hacia abajo daría "#0",
  // que no existe. Recortamos el dominio y marcamos el 1 explícitamente para
  // no perder la referencia del mejor puesto posible.
  if (floor !== undefined && lo < floor) {
    lo = floor;
    return {
      domain: [lo, hi] as [number, number],
      ticks: [floor, ...ticks.filter((t) => t > floor)],
    };
  }

  return { domain: [lo, hi] as [number, number], ticks };
}

/**
 * `Omit` antes de redefinir: una intersección no reemplaza un campo, lo
 * intersecta — `number & (number | null)` sigue siendo `number`, y los cortes
 * de temporada no compilarían.
 */
type Plotted = Omit<HistoryPoint, "score" | "rank"> & {
  t: number;
  score: number | null;
  rank: number | null;
};

/**
 * Corta la línea entre temporadas.
 *
 * El ladder resetea cada mes: los SP arrancan de cero. Sin esto, un tramo que
 * cruza el cambio de temporada dibuja una caída vertical desde el pico del mes
 * anterior hasta el arranque del nuevo — que parece un derrumbe y es solo el
 * reset. Insertando un punto nulo, recharts levanta el lápiz y quedan dos
 * curvas separadas, que es lo que realmente pasó.
 *
 * El punto nulo va un milisegundo antes del primero de la temporada nueva para
 * no desplazar el eje de tiempo.
 */
function breakOnSeasonChange(points: (HistoryPoint & { t: number })[]): Plotted[] {
  const out: Plotted[] = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i > 0 && points[i - 1].season !== p.season) {
      out.push({ ...p, t: p.t - 1, score: null, rank: null });
    }
    out.push(p);
  }

  return out;
}

export function ProgressChart({
  history,
  playerName,
  lang,
  t,
  hasHourly,
}: {
  history: HistoryPoint[];
  playerName: string;
  lang: Lang;
  t: Dictionary;
  /**
   * Si la serie incluye mediciones horarias, o es solo el archivo diario.
   *
   * Cambia el subtítulo y nada más. Importa porque las dos series se dibujan
   * igual pero no dicen lo mismo: "un punto por cada cambio detectado" es
   * verdad con `snapshots` y mentira con la foto diaria, donde entre dos
   * puntos pudo pasar cualquier cosa.
   */
  hasHourly: boolean;
}) {
  const [range, setRange] = useState<Range>(30);

  const data = useMemo(() => {
    const points = history.map((h) => ({ ...h, t: new Date(h.timestamp).getTime() }));
    if (points.length === 0) return points;

    if (range === "all") return breakOnSeasonChange(points);

    /**
     * "Temporada" es la del ÚLTIMO punto que tenemos, no la del calendario.
     *
     * Arrancado septiembre, alguien sin mediciones nuevas todavía vería una
     * gráfica vacía si filtráramos por el mes corriente. Anclando a la última
     * medición siempre queda algo que mostrar, y además es lo que la persona
     * quiere ver: su última temporada jugada.
     */
    if (range === "season") {
      const current = points[points.length - 1].season;
      return points.filter((p) => p.season === current);
    }

    // El corte se ancla a la última medición, no al reloj de pared. Además de
    // ser puro (el reloj no lo es, y serviría distinto en servidor y cliente),
    // es lo que corresponde: si el sync estuvo caído dos días, "últimos 7 D"
    // debe mostrar los últimos 7 días CON DATOS, no una franja medio vacía.
    const last = points[points.length - 1].t;
    const cutoff = last - range * 24 * 60 * 60 * 1000;
    return breakOnSeasonChange(points.filter((p) => p.t >= cutoff));
  }, [history, range]);

  if (history.length < 2) {
    return <NotEnoughData points={history.length} t={t} />;
  }

  /**
   * Los cortes entre temporadas son puntos con `score: null`. Sirven para que
   * recharts levante el lápiz, pero no son mediciones: incluirlos en el pico o
   * en el dominio de los ejes daría un mínimo de 0 y aplastaría la curva.
   */
  const real = data.filter(
    (d): d is HistoryPoint & { t: number } => d.score !== null && d.rank !== null
  );

  /**
   * Red de seguridad, hoy inalcanzable: todos los rangos se anclan a la última
   * medición, así que siempre sobrevive al menos una. Sin esto, un `data` vacío
   * daría `Math.min()` de nada = Infinity y reventaría los ejes.
   */
  if (real.length === 0) return <NotEnoughData points={0} t={t} />;

  const peak = real.reduce((a, b) => (b.score > a.score ? b : a), real[0]);

  /**
   * Los puntos se marcan solo cuando son contables de un vistazo.
   *
   * Cada uno es una corrida del cron, así que verlos es lo que deja claro que
   * la resolución es horaria y no diaria. Pero en "Temporada" o "Todo" son
   * cientos: el trazo se convierte en una hilera de círculos pegados y se lee
   * peor que la línea sola. El umbral es la densidad real de la serie, no el
   * rango elegido, porque un jugador que se movió poco tiene pocos puntos
   * incluso en un mes.
   */
  const showDots = real.length <= 60;

  const scores = real.map((d) => d.score);
  const { domain: scoreDomain, ticks: scoreTicks } = niceAxis(
    Math.min(...scores),
    Math.max(...scores)
  );

  const ranks = real.map((d) => d.rank);
  const { domain: rankDomain, ticks: rankTicks } = niceAxis(
    Math.min(...ranks),
    Math.max(...ranks),
    1
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-line bg-surface px-3 pb-3.5 pt-4 sm:px-6 sm:pt-[22px]">
        <div className="mb-1.5 flex flex-col gap-3 px-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-0">
          <div>
            <h2 className="mb-1 text-[15px] font-semibold tracking-[-0.01em]">
              {fill(t.chart.spTitle, { name: playerName })}
            </h2>
            <p className="text-[12.5px] text-ink-4">
              {hasHourly ? t.chart.spSubtitle : t.chart.spSubtitleDaily}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 self-start">
            {ranges(t).map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={
                  r.key === range
                    ? "rounded-md bg-ink px-3 py-1.5 text-[12.5px] font-semibold text-bg"
                    : "rounded-md border border-line-strong px-3 py-1.5 text-[12.5px] text-ink-3 hover:text-ink"
                }
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 20, right: 16, bottom: 8, left: 8 }}>
            <defs>
              <linearGradient id="spFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.accent} stopOpacity={0.22} />
                <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => formatShortDate(new Date(v), lang)}
              stroke={C.grid}
              tick={{ fill: C.axis, fontSize: 11.5 }}
              tickLine={false}
              minTickGap={48}
            />
            <YAxis
              domain={scoreDomain}
              ticks={scoreTicks}
              tickFormatter={formatScore}
              stroke={C.grid}
              tick={{ fill: C.axis, fontSize: 11.5, fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              width={62}
            />
            <Tooltip
              content={<SpTooltip lang={lang} t={t} />}
              cursor={{ stroke: "#35353f", strokeDasharray: "3 3" }}
            />
            <Area
              /**
               * Escalones, no curva suave.
               *
               * Los SP saltan de golpe al terminar una partida y se quedan
               * quietos hasta la siguiente; `monotone` interpolaba una subida
               * gradual entre dos mediciones, que es una lectura inventada —
               * sugería actividad continua donde hubo un salto puntual.
               * `stepAfter` mantiene el valor hasta la medición siguiente, que
               * es exactamente lo que sabemos que pasó.
               */
              type="stepAfter"
              dataKey="score"
              stroke={C.accent}
              strokeWidth={2}
              fill="url(#spFill)"
              dot={showDots ? { r: 2.5, fill: C.accent, strokeWidth: 0 } : false}
              activeDot={{ r: 5, fill: C.accent, stroke: C.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <ReferenceDot
              x={peak.t}
              y={peak.score}
              r={4}
              fill={C.accent}
              stroke={C.surface}
              strokeWidth={2}
              label={{
                value: `${t.chart.peakLabel} ${formatScore(peak.score)}`,
                position: "top",
                fill: C.ink3,
                fontSize: 11.5,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <section className="rounded-xl border border-line bg-surface px-3 pb-3 pt-4 sm:px-6 sm:pt-5">
        {/* Apilado en móvil: lado a lado, el título se partía en dos líneas y
            la nota le quedaba encimada al costado. */}
        <div className="mb-1 flex flex-col gap-0.5 px-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4 sm:px-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
            {t.chart.rankTitle}
          </h2>
          <span className="text-[12.5px] text-ink-4">{t.chart.rankNote}</span>
        </div>

        <ResponsiveContainer width="100%" height={140}>
          <LineChart data={data} margin={{ top: 14, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => formatShortDate(new Date(v), lang)}
              stroke={C.grid}
              tick={{ fill: C.axis, fontSize: 11.5 }}
              tickLine={false}
              minTickGap={48}
            />
            <YAxis
              reversed
              domain={rankDomain}
              ticks={rankTicks}
              tickFormatter={(r) => `#${r}`}
              stroke={C.grid}
              tick={{ fill: C.axis, fontSize: 11.5, fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              width={62}
            />
            <Tooltip
              content={<RankTooltip lang={lang} t={t} />}
              cursor={{ stroke: "#35353f", strokeDasharray: "3 3" }}
            />
            <Line
              // Mismo motivo que en la gráfica de SP: el puesto cambia de un
              // salto cuando alguien te pasa, no deslizándose.
              type="stepAfter"
              dataKey="rank"
              stroke={C.rank}
              strokeWidth={2}
              dot={showDots ? { r: 2.5, fill: C.rank, strokeWidth: 0 } : false}
              activeDot={{ r: 5, fill: C.rank, stroke: C.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}

type TooltipProps = {
  active?: boolean;
  payload?: { payload: { t: number; score: number; rank: number } }[];
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[7px] border border-[#2e2e3a] bg-surface-3 px-3 py-2.5">
      {children}
    </div>
  );
}

function SpTooltip({ active, payload, lang, t }: TooltipProps & { lang: Lang; t: Dictionary }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <Shell>
      <div className="mb-1 text-[11px] text-ink-3">{formatDateTime(new Date(p.t), lang)}</div>
      <div className="num text-[15px] text-ink">{formatScore(p.score)} {t.chart.sp}</div>
    </Shell>
  );
}

function RankTooltip({ active, payload, lang, t }: TooltipProps & { lang: Lang; t: Dictionary }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <Shell>
      <div className="mb-1 text-[11px] text-ink-3">{formatDateTime(new Date(p.t), lang)}</div>
      <div className="num text-[15px] text-ink">{t.chart.place} #{p.rank}</div>
    </Shell>
  );
}

/**
 * El historial lo construimos nosotros con el cron: un jugador recién vinculado
 * no tiene nada que graficar todavía. Explicarlo evita que parezca un error.
 */
export function NotEnoughData({ points, t }: { points: number; t: Dictionary }) {
  return (
    <section className="rounded-xl border border-line bg-surface px-4 py-12 text-center sm:px-6 sm:py-14">
      <h2 className="mb-2 text-[15px] font-semibold">{t.chart.emptyTitle}</h2>
      <p className="mx-auto max-w-[440px] text-[13px] leading-relaxed text-ink-4">
        {points === 0 ? t.chart.emptyNone : t.chart.emptyOne}
      </p>
    </section>
  );
}
