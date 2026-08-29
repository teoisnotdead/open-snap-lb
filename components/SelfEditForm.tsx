"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon } from "@/components/icons";
import type { Dictionary } from "@/lib/i18n";

/**
 * Edición de los datos publicados, con el código como única llave.
 *
 * Solo aparece sobre una petición aprobada: quien llegó hasta acá ya pasó por
 * el ojo humano, y cambiar un handle o el nombre de la alianza no vuelve a
 * poner en duda quién es (ver `PATCH /api/submissions/[token]`). Lo que cambia
 * acá se publica al guardar.
 *
 * El formulario abre con los valores actuales y se manda ENTERO: vaciar un
 * campo es la forma de sacárselo. Por eso el botón no compara contra nada — no
 * hay estado "sin cambios" que detectar, hay un bloque de datos que se
 * reemplaza por otro.
 */

export interface EditableValues {
  twitch: string;
  youtube: string;
  untapped: string;
  allianceTag: string;
  allianceName: string;
}

export function SelfEditForm({
  t,
  token,
  initial,
}: {
  t: Dictionary;
  token: string;
  initial: EditableValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<EditableValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof EditableValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const hasContent =
    values.twitch.trim() ||
    values.youtube.trim() ||
    values.untapped.trim() ||
    values.allianceTag.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasContent) return setError(t.link.needOne);

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/submissions/${token}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t.link.connError);
        return;
      }

      setSaved(true);
      setOpen(false);
      /**
       * La ficha de arriba la pinta el servidor con lo que había al cargar la
       * página. Sin esto seguiría mostrando los datos viejos hasta un F5, que
       * es exactamente el momento en que uno duda de si guardó.
       */
      router.refresh();
    } catch {
      setError(t.link.connError);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            setOpen(true);
            setSaved(false);
          }}
          className="rounded-lg border border-line-strong px-5 py-2.5 text-[14px] font-medium text-ink-2 transition-colors hover:border-line-bright hover:text-ink"
        >
          {t.request.editOpen}
        </button>
        {saved && (
          <span className="flex items-center gap-2 text-[12.5px] text-pos">
            <CheckIcon size={14} />
            {t.request.editSaved}
          </span>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-4 sm:p-6">
      <h2 className="mb-1 text-[15px] font-semibold">{t.request.editTitle}</h2>
      <p className="mb-5 text-[13px] leading-relaxed text-ink-3">
        {t.request.editSubtitle}
      </p>

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

      <p className="mt-2.5 text-[12px] leading-relaxed text-ink-4">
        {t.request.editLocked}
      </p>

      {error && (
        <p className="mt-4 rounded-lg border border-[#4a2320] bg-[#2a1614] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-neg">
          {error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2.5">
        <button
          type="button"
          onClick={() => {
            // Cancelar tiene que devolver los valores publicados, no dejar a
            // medias lo que se tipeó: si no, reabrir muestra un borrador que la
            // tabla no tiene.
            setValues(initial);
            setError(null);
            setOpen(false);
          }}
          className="rounded-lg border border-line-strong px-5 py-2.5 text-[14px] font-medium text-ink-3 transition-colors hover:border-line-bright hover:text-ink"
        >
          {t.request.editCancel}
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-bg transition-colors hover:bg-accent-bright disabled:opacity-40"
        >
          {busy ? t.request.editSaving : t.request.editSave}
        </button>
      </div>
    </form>
  );
}

const INPUT =
  "w-full min-w-0 rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 text-[13.5px] outline-none focus:border-accent";

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
