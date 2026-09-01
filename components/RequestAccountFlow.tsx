"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AllianceSelect } from "@/components/AllianceSelect";
import { CheckIcon, WarningIcon } from "@/components/icons";
import { formatRank, formatScore } from "@/lib/format";
import { fill, type Dictionary, type Lang } from "@/lib/i18n";

/**
 * Flujo de PETICIÓN, no de reclamo.
 *
 * Enviar el formulario no publica nada: deja un documento pendiente que revisa
 * un admin. Hubo un cuarto paso —pegar un código en el nombre de perfil para
 * probar la cuenta— y se sacó: la aprobación del admin ya es la verificación,
 * así que el código solo agregaba un trámite que la mayoría abandonaba a mitad.
 */

interface Found {
  playerName: string;
  ambiguous: boolean;
}

interface Sent {
  /** Token de seguimiento. Es la llave publica de la peticion. */
  token: string;
  playerName: string;
}

type Stage = "find" | "form" | "sent";

export function RequestAccountFlow({ lang, t }: { lang: Lang; t: Dictionary }) {
  const [stage, setStage] = useState<Stage>("find");
  const [found, setFound] = useState<Found | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <Steps t={t} stage={stage} />

      {stage === "find" && (
        <FindStep
          t={t}
          onFound={(f) => {
            setFound(f);
            setStage("form");
          }}
        />
      )}

      {found && stage !== "find" && (
        <FoundBanner
          t={t}
          found={found}
          onChange={
            stage === "form"
              ? () => {
                  setFound(null);
                  setStage("find");
                }
              : undefined
          }
        />
      )}

      {stage === "form" && found && (
        <FormStep
          t={t}
          playerName={found.playerName}
          onSent={(s) => {
            setSent(s);
            setStage("sent");
          }}
        />
      )}

      {stage === "sent" && sent && <SentPanel t={t} lang={lang} sent={sent} />}

      {/* La puerta para el que vuelve. Solo antes de enviar: después el panel
          ya trae el link directo a SU petición, y ofrecer el buscador al lado
          sería mandarlo a pegar el código que tiene en pantalla. */}
      {!sent && (
        <p className="text-[12.5px] text-ink-4">
          {t.link.haveCode}{" "}
          <Link href={`/${lang}/request`} className="text-accent hover:underline">
            {t.link.haveCodeLink}
          </Link>
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- pasos --- */

function Steps({ t, stage }: { t: Dictionary; stage: Stage }) {
  const done = stage !== "find";
  const items = [
    { label: t.link.step1, state: stage === "find" ? "now" : "done" },
    { label: t.link.step2, state: stage === "form" ? "now" : done ? "done" : "next" },
    { label: t.link.step3, state: stage === "sent" ? "done" : "next" },
  ] as const;

  return (
    <ol className="flex items-center gap-3">
      {items.map((item, i) => (
        <li key={item.label} className="flex flex-1 items-center gap-3">
          <span className="flex items-center gap-2.5">
            <span
              className={`grid h-[22px] w-[22px] place-items-center rounded-full text-[11px] font-semibold ${
                item.state === "done"
                  ? "bg-pos/15 text-pos"
                  : item.state === "now"
                    ? "bg-accent text-bg"
                    : "border border-line-strong text-ink-4"
              }`}
            >
              {item.state === "done" ? <CheckIcon size={12} /> : i + 1}
            </span>
            {/* En móvil solo se lee la etiqueta del paso actual: las tres
                juntas no entran y se pisaban entre sí. Los círculos numerados
                quedan siempre, que es lo que da la noción de avance. */}
            <span
              className={`text-[13px] ${
                item.state === "now" ? "inline" : "hidden sm:inline"
              } ${item.state === "next" ? "text-ink-4" : "font-medium text-ink"}`}
            >
              {item.label}
            </span>
          </span>
          {i < items.length - 1 && <span className="h-px flex-1 bg-line" />}
        </li>
      ))}
    </ol>
  );
}

interface LadderRow {
  rank: number;
  playerName: string;
  nameKey: string;
  score: number;
}

/** Cuántas coincidencias se listan. Más que esto es ruido, no ayuda a elegir. */
const MAX_MATCHES = 8;

/**
 * Selección de cuenta desde el ladder, no escritura del nombre.
 *
 * Antes había que tipear el nombre exacto. Sobraba —el nombre que se guarda
 * sale siempre de la API, no de lo que escriba la persona— y además excluía a
 * quien no puede escribirlo: hoy mismo hay varios nombres coreanos en el top
 * 10, imposibles de tipear desde un teclado latino.
 *
 * Ahora el texto solo filtra, y la identidad se elige tocando una fila. De paso
 * se ve el puesto y los SP, que confirman que es la cuenta correcta antes de
 * seguir.
 */
function FindStep({ t, onFound }: { t: Dictionary; onFound: (f: Found) => void }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<LadderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // El ladder público ya está disponible: no hace falta un endpoint de
  // "buscarme", alcanza con traerlo una vez y filtrar en el cliente.
  useEffect(() => {
    let cancelled = false;

    fetch("/api/leaderboard")
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) return setError(data.error ?? t.link.connError);
        setRows(data.rows as LadderRow[]);
      })
      .catch(() => {
        if (!cancelled) setError(t.link.connError);
      });

    return () => {
      cancelled = true;
    };
  }, [t.link.connError]);

  const matches = useMemo(() => {
    const q = query.trim().normalize("NFC").replace(/\s+/g, " ").toLowerCase();
    if (!q || !rows) return [];
    return rows.filter((r) => r.nameKey.includes(q)).slice(0, MAX_MATCHES);
  }, [query, rows]);

  const searching = query.trim().length > 0;

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-6">
      <h2 className="mb-1 text-[15px] font-semibold">{t.link.findTitle}</h2>
      <p className="mb-4 text-[13px] text-ink-3">{t.link.findSubtitle}</p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.link.findPlaceholder}
        disabled={!rows && !error}
        className="w-full rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 text-[14px] outline-none focus:border-accent disabled:opacity-50"
      />

      {!rows && !error && (
        <p className="mt-3 text-[12.5px] text-ink-4">{t.link.findLoading}</p>
      )}

      {rows && !searching && (
        <p className="mt-3 text-[12.5px] text-ink-4">{t.link.findHint}</p>
      )}

      {searching && matches.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {matches.map((row) => (
            <li key={`${row.rank}-${row.nameKey}`}>
              <button
                type="button"
                onClick={() =>
                  onFound({
                    playerName: row.playerName,
                    // Homónimo: hay otra fila con el mismo nameKey.
                    ambiguous:
                      rows!.filter((r) => r.nameKey === row.nameKey).length > 1,
                  })
                }
                className="flex w-full items-center gap-3 rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 text-left transition-colors hover:border-accent"
              >
                <span className="num w-9 shrink-0 text-[13px] text-ink-4">
                  {formatRank(row.rank)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                  {row.playerName}
                </span>
                <span className="num shrink-0 text-[13px] text-ink-3">
                  {formatScore(row.score)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searching && rows && matches.length === 0 && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-4">
          {fill(t.table.noResults, { q: query.trim(), total: formatScore(rows.length) })}
        </p>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
    </section>
  );
}

function FoundBanner({
  t,
  found,
  onChange,
}: {
  t: Dictionary;
  found: Found;
  onChange?: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl border border-line bg-surface px-5 py-3.5">
        <span className="flex items-center gap-2.5 text-[13.5px]">
          <CheckIcon size={15} className="text-pos" />
          <span>
            {t.link.foundPrefix} <strong className="font-semibold">{found.playerName}</strong>{" "}
            {t.link.foundSuffix}
          </span>
        </span>
        {onChange && (
          <button onClick={onChange} className="text-[13px] text-ink-3 hover:text-ink">
            {t.link.change}
          </button>
        )}
      </div>

      {found.ambiguous && (
        <p className="flex items-start gap-2.5 rounded-lg border border-accent-line bg-accent-surface px-4 py-3 text-[12.5px] leading-relaxed text-ink-2">
          <WarningIcon size={15} className="mt-0.5 shrink-0" />
          <span>{t.link.ambiguousWarning}</span>
        </p>
      )}
    </div>
  );
}

function FormStep({
  t,
  playerName,
  onSent,
}: {
  t: Dictionary;
  playerName: string;
  onSent: (s: Sent) => void;
}) {
  const [values, setValues] = useState({
    twitch: "",
    youtube: "",
    untapped: "",
    allianceTag: "",
    discord: "",
    email: "",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const hasContent =
    values.twitch.trim() || values.youtube.trim() || values.untapped.trim() || values.allianceTag.trim();
  const hasContact = values.discord.trim() || values.email.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasContent) return setError(t.link.needOne);
    if (!hasContact) return setError(t.link.needContact);

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerName, ...values }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t.link.connError);
        return;
      }
      onSent({ token: data.token, playerName: data.playerName });
    } catch {
      setError(t.link.connError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <section className="rounded-xl border border-line bg-surface p-4 sm:p-6">
        <h2 className="mb-1 text-[15px] font-semibold">{t.link.detailsTitle}</h2>
        <p className="mb-5 text-[13px] text-ink-3">{t.link.detailsSubtitle}</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t.link.twitch} prefix="twitch.tv/">
            <input
              value={values.twitch}
              onChange={set("twitch")}
              placeholder={t.link.handlePlaceholder}
              className={INPUT}
            />
          </Field>
          <Field label={t.link.youtube} prefix="youtube.com/@">
            <input
              value={values.youtube}
              onChange={set("youtube")}
              placeholder={t.link.handlePlaceholder}
              className={INPUT}
            />
          </Field>
          <Field label={t.link.untapped}>
            <input
              value={values.untapped}
              onChange={set("untapped")}
              placeholder={t.link.untappedPlaceholder}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="mt-4">
          <span className="mb-1.5 block text-[10.5px] font-semibold tracking-[0.08em] text-ink-4">
            {t.link.allianceLabel}
          </span>
          <AllianceSelect
            t={t}
            value={values.allianceTag}
            onChange={(tag) => setValues((v) => ({ ...v, allianceTag: tag }))}
          />
        </div>
        <p className="mt-2.5 text-[12px] text-ink-4">{t.link.allianceHelp}</p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4 sm:p-6">
        <h2 className="mb-1 text-[15px] font-semibold">{t.link.contactTitle}</h2>
        <p className="mb-5 text-[13px] text-ink-3">{t.link.contactSubtitle}</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t.link.discordLabel}>
            <input
              value={values.discord}
              onChange={set("discord")}
              placeholder={t.link.discordPlaceholder}
              className={INPUT}
            />
          </Field>
          <Field label={t.link.emailLabel}>
            <input
              type="email"
              value={values.email}
              onChange={set("email")}
              placeholder={t.link.emailPlaceholder}
              className={INPUT}
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label={t.link.noteLabel}>
            <input
              value={values.note}
              onChange={set("note")}
              placeholder={t.link.notePlaceholder}
              maxLength={500}
              className={INPUT}
            />
          </Field>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-bg transition-colors hover:bg-accent-bright disabled:opacity-40"
          >
            {busy ? t.link.submitting : t.link.submitButton}
          </button>
        </div>
      </section>
    </form>
  );
}

/**
 * Acuse de la petición.
 *
 * Lo único que hace es entregar el token de seguimiento, y por eso insiste
 * tanto: no hay cuentas ni notificaciones, así que ese token es la única forma
 * que tiene la persona de volver a enterarse de cómo terminó su pedido.
 */
function SentPanel({ t, lang, sent }: { t: Dictionary; lang: Lang; sent: Sent }) {
  const [tokenCopied, setTokenCopied] = useState(false);

  return (
    <section className="rounded-xl border border-pos/25 bg-pos/[0.06] p-4 sm:p-6">
      <h2 className="mb-1.5 flex items-center gap-2.5 font-display text-[19px] font-bold">
        <CheckIcon size={17} className="text-pos" />
        {t.link.sentTitle}
      </h2>
      <p className="mb-4 max-w-[560px] text-[13.5px] leading-relaxed text-ink-2">
        {t.link.sentBody}
      </p>

      <p className="mb-2 text-[11px] font-semibold tracking-[0.08em] text-ink-4">
        {t.link.sentIdLabel}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded-lg border border-line-strong bg-bg px-4 py-2.5 font-mono text-[19px] font-semibold tracking-[0.12em] text-accent">
          {formatToken(sent.token)}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(formatToken(sent.token));
            setTokenCopied(true);
            setTimeout(() => setTokenCopied(false), 1600);
          }}
          className="rounded-lg border border-line-strong px-3.5 py-2 text-[12.5px] text-ink-3 transition-colors hover:border-line-bright hover:text-ink"
        >
          {tokenCopied ? t.link.copied : t.link.copy}
        </button>
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">{t.link.sentKeep}</p>
      {/* Segundo párrafo y no una frase más al primero: son dos motivos
          distintos para guardar el código —volver a mirar, y editar— y el de
          editar recién existe cuando la petición se aprueba. */}
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
        {t.link.sentKeepEdit}
      </p>
      <Link
        href={`/${lang}/request/${sent.token}`}
        className="mt-2 inline-block text-[12.5px] text-accent hover:underline"
      >
        {t.link.sentOpenStatus}
      </Link>
    </section>
  );
}

/* ------------------------------------------------------------ auxiliares --- */

const INPUT =
  "w-full min-w-0 rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 text-[13.5px] outline-none focus:border-accent";

/**
 * `K7M2QW9X4RTF` -> `K7M2-QW9X-4RTF`.
 *
 * Se guarda sin guiones y se muestra con ellos: 12 caracteres corridos son
 * difíciles de leer, dictar o retomar si se corta la copia. La ruta acepta las
 * dos formas (ver `parseStatusToken`).
 */
function formatToken(token: string): string {
  return (token.match(/.{1,4}/g) ?? []).join("-");
}

function Field({
  label,
  prefix,
  children,
}: {
  label: string;
  prefix?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col">
      <span className="mb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-ink-4">
        {label}
      </span>
      {prefix ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[12.5px] text-ink-4">{prefix}</span>
          {children}
        </span>
      ) : (
        children
      )}
    </label>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-lg border border-[#4a2320] bg-[#2a1614] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-neg">
      {children}
    </p>
  );
}
