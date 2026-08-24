"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckIcon, WarningIcon } from "@/components/icons";
import { fill, type Dictionary, type Lang } from "@/lib/i18n";

/**
 * Flujo de PETICIÓN, no de reclamo.
 *
 * Enviar el formulario no publica nada: deja un documento pendiente. La prueba
 * de propiedad (el código en el nombre) es un paso OPCIONAL al final, y su
 * único efecto es que la petición llegue marcada al panel. Ese cambio de orden
 * es todo el cambio de modelo — antes el código era el portón.
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

interface Instructions {
  code: string;
  suggestedName: string;
  charsToTrim: number;
  maxNameLength: number;
  expiresInMinutes: number;
}

type Stage = "find" | "form" | "sent" | "proof" | "proved";

export function RequestAccountFlow({ lang, t }: { lang: Lang; t: Dictionary }) {
  const [stage, setStage] = useState<Stage>("find");
  const [found, setFound] = useState<Found | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [instructions, setInstructions] = useState<Instructions | null>(null);

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

      {(stage === "sent" || stage === "proof" || stage === "proved") && sent && (
        <SentPanel
          t={t}
          lang={lang}
          sent={sent}
          stage={stage}
          instructions={instructions}
          onCode={(i) => {
            setInstructions(i);
            setStage("proof");
          }}
          onProved={() => setStage("proved")}
        />
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
    {
      label: t.link.step3,
      state: stage === "sent" || stage === "proof" || stage === "proved" ? "done" : "next",
    },
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

function FindStep({ t, onFound }: { t: Dictionary; onFound: (f: Found) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * No hay endpoint de "buscarme": el ladder público ya está disponible, así
   * que se resuelve contra `/api/leaderboard` en vez de agregar una ruta que
   * solo sirva para esto.
   */
  async function find(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t.link.connError);
        return;
      }

      const key = name.trim().normalize("NFC").replace(/\s+/g, " ").toLowerCase();
      const matches = (data.rows as { playerName: string; nameKey: string }[]).filter(
        (r) => r.nameKey === key
      );

      if (matches.length === 0) {
        setError(fill(t.table.noResults, { q: name.trim(), total: data.total }));
        return;
      }

      onFound({ playerName: matches[0].playerName, ambiguous: matches.length > 1 });
    } catch {
      setError(t.link.connError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={find} className="rounded-xl border border-line bg-surface p-4 sm:p-6">
      <h2 className="mb-1 text-[15px] font-semibold">{t.link.findTitle}</h2>
      <p className="mb-4 text-[13px] text-ink-3">{t.link.findSubtitle}</p>

      <div className="flex gap-2.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.link.findPlaceholder}
          maxLength={20}
          className="min-w-0 flex-1 rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 text-[14px] outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="shrink-0 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-bg transition-colors hover:bg-accent-bright disabled:opacity-40"
        >
          {busy ? "…" : t.link.findButton}
        </button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
    </form>
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
    allianceName: "",
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

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          <Field label={t.link.allianceLabel}>
            <input
              value={values.allianceTag}
              onChange={set("allianceTag")}
              placeholder={t.link.alliancePlaceholder}
              maxLength={5}
              className={INPUT}
            />
          </Field>
          <Field label={t.link.allianceNameLabel}>
            <input
              value={values.allianceName}
              onChange={set("allianceName")}
              placeholder={t.link.allianceNamePlaceholder}
              maxLength={40}
              className={INPUT}
            />
          </Field>
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

function SentPanel({
  t,
  lang,
  sent,
  stage,
  instructions,
  onCode,
  onProved,
}: {
  t: Dictionary;
  lang: Lang;
  sent: Sent;
  stage: Stage;
  instructions: Instructions | null;
  onCode: (i: Instructions) => void;
  onProved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);

  async function getCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/submissions/${sent.token}/code`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? t.link.connError);
      onCode(data);
    } catch {
      setError(t.link.connError);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/submissions/${sent.token}/proof`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? t.link.connError);
      onProved();
    } catch {
      setError(t.link.connError);
    } finally {
      setBusy(false);
    }
  }

  const statusUrl = `/${lang}/request/${sent.token}`;

  return (
    <div className="flex flex-col gap-5">
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
        <Link
          href={statusUrl}
          className="mt-2 inline-block text-[12.5px] text-accent hover:underline"
        >
          {t.link.sentOpenStatus}
        </Link>
      </section>

      {stage === "proved" ? (
        <section className="rounded-xl border border-line bg-surface p-4 sm:p-6">
          <h2 className="mb-1.5 flex items-center gap-2.5 text-[15px] font-semibold">
            <CheckIcon size={15} className="text-pos" />
            {t.link.proofDoneTitle}
          </h2>
          <p className="text-[13px] leading-relaxed text-ink-3">{t.link.proofDoneBody}</p>
        </section>
      ) : (
        <section className="rounded-xl border border-line bg-surface p-4 sm:p-6">
          <h2 className="mb-1.5 text-[15px] font-semibold">{t.link.proofTitle}</h2>
          <p className="mb-5 max-w-[600px] text-[13px] leading-relaxed text-ink-3">
            {t.link.proofIntro}
          </p>

          {!instructions ? (
            <button
              onClick={getCode}
              disabled={busy}
              className="rounded-lg border border-line-strong px-4 py-2.5 text-[13.5px] font-medium text-ink-2 transition-colors hover:border-line-bright hover:text-ink disabled:opacity-40"
            >
              {busy ? "…" : t.link.proofStart}
            </button>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-[14px] font-semibold">{t.link.renameTitle}</h3>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">{t.link.renameSubtitle}</p>
                </div>
                <span className="shrink-0 text-[12px] text-ink-4">
                  {fill(t.link.expiresIn, { n: instructions.expiresInMinutes })}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-[240px_minmax(0,1fr)]">
                <div className="grid place-items-center rounded-xl border border-line-strong bg-bg py-7">
                  <p className="mb-2 text-[10.5px] font-semibold tracking-[0.1em] text-ink-4">
                    {t.link.yourCode}
                  </p>
                  <p className="font-mono text-[30px] font-semibold tracking-[0.14em] text-accent">
                    {instructions.code}
                  </p>
                </div>

                <div className="flex flex-col">
                  <p className="mb-2 text-[10.5px] font-semibold tracking-[0.1em] text-ink-4">
                    {t.link.shouldLookLike}
                  </p>
                  <div className="flex items-center gap-3 rounded-lg border border-line-strong bg-bg px-4 py-3.5">
                    <span className="min-w-0 flex-1 break-all font-mono text-[15px]">
                      {instructions.suggestedName}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(instructions.suggestedName);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1600);
                      }}
                      className="shrink-0 rounded-md border border-line-strong px-3 py-1.5 text-[12px] text-ink-3 hover:text-ink"
                    >
                      {copied ? t.link.copied : t.link.copy}
                    </button>
                  </div>

                  <p className="mt-2.5 flex items-start gap-2 text-[12.5px] text-ink-3">
                    {instructions.charsToTrim > 0 ? (
                      <>
                        <WarningIcon size={13} className="mt-0.5 shrink-0" />
                        <span>
                          {fill(t.link.mustTrim, {
                            max: instructions.maxNameLength,
                            n: instructions.charsToTrim,
                          })}
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckIcon size={13} className="mt-0.5 shrink-0 text-pos" />
                        <span>
                          {fill(t.link.fitsOk, {
                            used: instructions.suggestedName.length,
                            max: instructions.maxNameLength,
                          })}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {error && <ErrorNote>{error}</ErrorNote>}

              <div className="mt-5 flex flex-col items-stretch gap-4 border-t border-line-soft pt-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                <p className="max-w-[420px] text-[12px] leading-relaxed text-ink-4">
                  {t.link.cacheNote}
                </p>
                <button
                  onClick={verify}
                  disabled={busy}
                  className="shrink-0 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-bg transition-colors hover:bg-accent-bright disabled:opacity-40"
                >
                  {busy ? t.link.confirming : t.link.confirmButton}
                </button>
              </div>
            </>
          )}

          {error && !instructions && <ErrorNote>{error}</ErrorNote>}
        </section>
      )}
    </div>
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
