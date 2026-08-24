"use client";

import { useState } from "react";
import { fill, type Dictionary, type Lang } from "@/lib/i18n";
import {
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  SearchIcon,
  SpinnerIcon,
  WarningIcon,
} from "./icons";

interface RequestOk {
  ok: true;
  playerName: string;
  nameKey: string;
  code: string;
  suggestedName: string;
  charsToTrim: number;
  maxNameLength: number;
  expiresInMinutes: number;
  ambiguous: boolean;
  alreadyVerified: boolean;
  steps: string[];
}

type Status = "idle" | "loading" | "error";

export function LinkAccountFlow({ lang, t }: { lang: Lang; t: Dictionary }) {
  const [name, setName] = useState("");
  const [claim, setClaim] = useState<RequestOk | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const [twitch, setTwitch] = useState("");
  const [youtube, setYoutube] = useState("");
  const [untapped, setUntapped] = useState("");
  const [alliance, setAlliance] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [retryable, setRetryable] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/verify/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerName: name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t.link.connError);
        setStatus("error");
        return;
      }
      setClaim(data);
      setStatus("idle");
    } catch {
      setError(t.link.connError);
      setStatus("error");
    }
  }

  async function confirm() {
    if (!claim) return;
    if (!twitch.trim() && !youtube.trim() && !untapped.trim()) {
      setConfirmError(t.link.needOne);
      return;
    }

    setConfirming(true);
    setConfirmError("");
    setRetryable(false);
    try {
      const res = await fetch("/api/verify/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          playerName: claim.playerName,
          twitch: twitch.trim() || undefined,
          youtube: youtube.trim() || undefined,
          untapped: untapped.trim() || undefined,
          alliance: alliance.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setConfirmError(data.error ?? t.link.connError);
        setRetryable(data.retryable === true);
        return;
      }
      setDone(true);
    } catch {
      setConfirmError(t.link.connError);
      setRetryable(true);
    } finally {
      setConfirming(false);
    }
  }

  function copy() {
    if (!claim) return;
    navigator.clipboard?.writeText(claim.suggestedName).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        /* Sin permiso de portapapeles el nombre igual está a la vista. */
      }
    );
  }

  if (done && claim) {
    return <Success playerName={claim.playerName} nameKey={claim.nameKey} lang={lang} t={t} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper step={claim ? 2 : 1} t={t} />

      {/* ---- paso 1 ---- */}
      {!claim ? (
        <form
          onSubmit={requestCode}
          className="rounded-xl border border-line bg-surface p-6"
        >
          <h2 className="mb-1 text-base font-semibold">{t.link.findTitle}</h2>
          <p className="mb-4 text-[13.5px] text-ink-3">{t.link.findSubtitle}</p>
          <div className="flex gap-2.5">
            <label className="flex h-[46px] grow items-center gap-2.5 rounded-lg border border-line-strong bg-bg px-3.5 focus-within:border-accent">
              <SearchIcon className="shrink-0 text-ink-4" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.link.findPlaceholder}
                maxLength={20}
                aria-label={t.link.findPlaceholder}
                className="w-full bg-transparent text-[15px] outline-none placeholder:text-ink-4"
              />
              <span className="num shrink-0 text-xs text-ink-4">{name.length}/20</span>
            </label>
            <button
              type="submit"
              disabled={status === "loading" || !name.trim()}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-5 text-[13.5px] font-semibold text-bg hover:bg-accent-bright disabled:opacity-40"
            >
              {status === "loading" && <SpinnerIcon className="animate-spin" />}
              {t.link.findButton}
            </button>
          </div>

          {error && (
            <p className="mt-3.5 flex items-start gap-2 text-[13px] text-neg">
              <WarningIcon size={14} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}
        </form>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-[10px] border border-line bg-surface px-5 py-[15px]">
            <span className="flex items-center gap-3 text-[14.5px]">
              <CheckCircleIcon size={17} className="text-pos" />
              {t.link.foundPrefix}{" "}
              <strong className="font-semibold">{claim.playerName}</strong>{" "}
              {t.link.foundSuffix}
            </span>
            <button
              type="button"
              onClick={() => {
                setClaim(null);
                setConfirmError("");
              }}
              className="text-[13px] text-ink-3 hover:text-ink"
            >
              {t.link.change}
            </button>
          </div>

          {claim.alreadyVerified && (
            <Callout>{t.link.alreadyVerified}</Callout>
          )}

          {claim.ambiguous && (
            <Callout>{t.link.ambiguousWarning}</Callout>
          )}

          {/* ---- paso 2 ---- */}
          <section className="flex flex-col gap-5 rounded-xl border border-accent-surface bg-surface p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h2 className="mb-1 text-base font-semibold">{t.link.renameTitle}</h2>
                <p className="text-[13.5px] text-ink-3">{t.link.renameSubtitle}</p>
              </div>
              <span className="flex shrink-0 items-center gap-[7px] text-[12.5px] text-ink-3">
                <ClockIcon />
                <span className="num">
                  {fill(t.link.expiresIn, { n: claim.expiresInMinutes })}
                </span>
              </span>
            </div>

            <div className="grid grid-cols-[250px_minmax(0,1fr)] gap-[18px]">
              <div className="flex flex-col items-center justify-center gap-2.5 rounded-[10px] border border-accent-surface bg-bg p-[18px]">
                <span className="text-[10.5px] font-semibold tracking-[0.13em] text-ink-4">
                  {t.link.yourCode}
                </span>
                <span className="num text-[40px] font-semibold leading-none tracking-[0.14em] text-accent">
                  {claim.code}
                </span>
              </div>

              <div className="flex flex-col justify-center gap-3">
                <div>
                  <div className="mb-2 text-[10.5px] font-semibold tracking-[0.13em] text-ink-4">
                    {t.link.shouldLookLike}
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-[9px] border border-line-strong bg-bg px-[15px] py-[13px]">
                    <span className="num text-[19px] font-medium">
                      {claim.suggestedName.replace(claim.code, "")}
                      <span className="text-accent">{claim.code}</span>
                    </span>
                    <button
                      type="button"
                      onClick={copy}
                      className="inline-flex shrink-0 items-center gap-[7px] rounded-md border border-line-bright px-[11px] py-[7px] text-[12.5px] font-medium hover:border-ink-3"
                    >
                      {copied ? <CheckIcon size={13} /> : <CopyIcon />}
                      {copied ? t.link.copied : t.link.copy}
                    </button>
                  </div>
                </div>

                {claim.charsToTrim > 0 ? (
                  <p className="flex items-start gap-2 text-[12.5px] text-neg">
                    <WarningIcon size={14} className="mt-0.5 shrink-0" />
                    <span>
                      {fill(t.link.mustTrim, {
                        n: claim.charsToTrim,
                        max: claim.maxNameLength,
                      })}
                    </span>
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-[12.5px] text-pos">
                    <CheckIcon size={14} className="shrink-0" />
                    <span>
                      {fill(t.link.fitsOk, {
                        used: claim.suggestedName.length,
                        max: claim.maxNameLength,
                      })}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ---- paso 3 ---- */}
          <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-6">
            <div>
              <h2 className="mb-1 text-base font-semibold">{t.link.socialsTitle}</h2>
              <p className="text-[13.5px] text-ink-3">{t.link.socialsSubtitle}</p>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <Field
                label={t.link.twitch}
                prefix="twitch.tv/"
                value={twitch}
                onChange={setTwitch}
                placeholder={t.link.handlePlaceholder}
              />
              <Field
                label={t.link.youtube}
                prefix="youtube.com/@"
                value={youtube}
                onChange={setYoutube}
                placeholder={t.link.handlePlaceholder}
              />
              <Field
                label={t.link.untapped}
                value={untapped}
                onChange={setUntapped}
                placeholder={t.link.untappedPlaceholder}
              />
              {/* La alianza no es un canal: no cuenta para el mínimo de una red. */}
              <Field
                label={t.link.allianceLabel}
                value={alliance}
                onChange={setAlliance}
                placeholder={t.link.alliancePlaceholder}
                help={t.link.allianceHelp}
                maxLength={5}
                uppercase
              />
            </div>

            {confirmError && (
              <p
                className={`flex items-start gap-2 text-[13px] ${
                  retryable ? "text-ink-3" : "text-neg"
                }`}
              >
                {retryable ? (
                  <ClockIcon size={14} className="mt-0.5 shrink-0" />
                ) : (
                  <WarningIcon size={14} className="mt-0.5 shrink-0" />
                )}
                {confirmError}
              </p>
            )}

            <div className="flex items-center justify-between gap-5 border-t border-line pt-4">
              <p className="max-w-[560px] text-[12.5px] leading-relaxed text-ink-4">
                {t.link.cacheNote}
              </p>
              <button
                type="button"
                onClick={confirm}
                disabled={confirming}
                className="flex shrink-0 items-center gap-2 rounded-[7px] bg-accent px-5 py-[11px] text-[13.5px] font-semibold text-bg hover:bg-accent-bright disabled:opacity-40"
              >
                {confirming && <SpinnerIcon className="animate-spin" />}
                {confirming ? t.link.confirming : t.link.confirmButton}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  prefix,
  value,
  onChange,
  placeholder,
  help,
  maxLength,
  uppercase,
}: {
  label: string;
  prefix?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  help?: string;
  maxLength?: number;
  uppercase?: boolean;
}) {
  return (
    <div>
      <div className="mb-[7px] text-[11px] font-semibold tracking-[0.1em] text-ink-4">
        {label}
      </div>
      <label className="flex h-[42px] items-center gap-2 rounded-lg border border-line-strong bg-bg px-3.5 focus-within:border-accent">
        {prefix && <span className="num shrink-0 text-[13.5px] text-ink-4">{prefix}</span>}
        <input
          value={value}
          // El tag de alianza se guarda en mayúsculas; normalizarlo mientras se
          // escribe evita que el campo muestre algo distinto de lo que se guarda.
          onChange={(e) =>
            onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)
          }
          placeholder={placeholder}
          aria-label={label}
          maxLength={maxLength}
          className={`w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-4 ${
            uppercase ? "num tracking-[0.06em]" : ""
          }`}
        />
      </label>
      {help && <p className="mt-1.5 text-[11.5px] leading-snug text-ink-4">{help}</p>}
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    // El texto va envuelto: como el contenedor es flex, cualquier <span> suelto
    // dentro del mensaje se volvería un flex item y partiría la frase.
    <p className="flex items-start gap-2.5 rounded-[10px] border border-line px-4 py-3.5 text-[13px] leading-relaxed text-ink-3">
      <WarningIcon size={15} className="mt-0.5 shrink-0 text-ink-4" />
      <span>{children}</span>
    </p>
  );
}

function Stepper({ step, t }: { step: 1 | 2; t: Dictionary }) {
  const items = [t.link.step1, t.link.step2, t.link.step3];
  return (
    <div className="flex items-center gap-3">
      {items.map((label, i) => {
        const n = i + 1;
        const state = step >= 2 && n <= 2 ? "active" : n === step ? "active" : "idle";
        const doneStep = step === 2 && n === 1;
        return (
          <div key={label} className="flex grow items-center gap-3 last:grow-0">
            <div className="flex shrink-0 items-center gap-2.5">
              <span
                className={`num inline-flex size-[22px] items-center justify-center rounded-full text-xs font-semibold ${
                  state === "active"
                    ? "bg-accent text-bg"
                    : "border border-line-bright text-ink-4"
                }`}
              >
                {doneStep ? <CheckIcon size={12} /> : n}
              </span>
              <span
                className={`text-[13.5px] ${
                  state === "active" ? "font-medium text-ink" : "text-ink-4"
                }`}
              >
                {label}
              </span>
            </div>
            {n < 3 && <span className="h-px grow bg-line-strong" />}
          </div>
        );
      })}
    </div>
  );
}

function Success({
  playerName,
  nameKey,
  lang,
  t,
}: {
  playerName: string;
  nameKey: string;
  lang: Lang;
  t: Dictionary;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-accent text-bg">
        <CheckIcon size={22} />
      </div>
      <h2 className="mb-2 font-display text-2xl font-bold tracking-[-0.02em]">
        {fill(t.link.successTitle, { name: playerName })}
      </h2>
      <p className="mx-auto mb-6 max-w-[440px] text-sm leading-relaxed text-ink-3">
        {t.link.successBody}
      </p>
      <a
        href={`/${lang}/player/${encodeURIComponent(nameKey)}`}
        className="inline-block rounded-[7px] bg-accent px-5 py-[11px] text-[13.5px] font-semibold text-bg hover:bg-accent-bright"
      >
        {t.link.successCta}
      </a>
    </div>
  );
}
