"use client";

import { useEffect, useState } from "react";
import type { Dictionary } from "@/lib/i18n";

/**
 * El selector de alianza, compartido por la petición inicial y la edición.
 *
 * Reemplaza a los dos inputs de texto libre (tag y nombre) que había antes, y
 * ese reemplazo ES el arreglo: mientras cada persona escribiera el nombre de su
 * alianza, la misma alianza terminaba publicada como "Job Enjoyers",
 * "JobEnjoyers" y "job enjoyers". Ahora el nombre vive en un solo lugar y de acá
 * sale únicamente un tag que ya existe.
 *
 * Vive en un componente propio y no duplicado en cada formulario porque los dos
 * escriben sobre el mismo campo publicado: si divergieran, uno de los dos
 * volvería a dejar entrar lo que el otro rechaza.
 */

interface Alliance {
  tag: string;
  name: string;
  members: number;
  hasLeader: boolean;
}

export function AllianceSelect({
  t,
  value,
  onChange,
}: {
  t: Dictionary;
  /** El tag elegido, o "" para "ninguna". */
  value: string;
  onChange: (tag: string) => void;
}) {
  const [alliances, setAlliances] = useState<Alliance[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/alliances")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { alliances: Alliance[] }) => alive && setAlliances(d.alliances))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  /**
   * El tag publicado puede no estar en la lista: quedó de antes de que las
   * alianzas fueran una entidad, o su alianza se rechazó. Se agrega como opción
   * para que abrir el formulario y guardar sin tocar nada no le BORRE la
   * alianza a alguien en silencio — el body reemplaza el bloque entero.
   */
  const options = alliances ?? [];
  const orphan = value && !options.some((a) => a.tag === value);

  if (failed) {
    return (
      <p className="rounded-lg border border-line-strong bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-ink-3">
        {t.link.allianceLoadFailed}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={alliances === null}
        aria-label={t.link.allianceLabel}
        className="w-full min-w-0 rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 text-[13.5px] text-ink outline-none focus:border-accent disabled:text-ink-4"
      >
        <option value="">
          {alliances === null ? t.link.allianceLoading : t.link.allianceNone}
        </option>
        {orphan && <option value={value}>{value}</option>}
        {options.map((a) => (
          <option key={a.tag} value={a.tag}>
            {a.tag} — {a.name}
            {a.members > 0 ? ` (${a.members})` : ""}
          </option>
        ))}
      </select>

      {/* Se ofrece pedirla en vez de dejar escribir el tag a mano: un campo
          libre de salida devolvería exactamente el problema que el selector
          vino a resolver. */}
      {!asking ? (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="self-start text-[12px] text-ink-3 underline underline-offset-2 hover:text-ink"
        >
          {t.link.allianceMissing}
        </button>
      ) : (
        <AllianceRequest t={t} onClose={() => setAsking(false)} />
      )}
    </div>
  );
}

/**
 * Pedir una alianza que no está en la lista.
 *
 * NO la agrega al selector ni la publica: deja una pendiente para que un admin
 * la mire, porque una alianza sigue siendo indemostrable — la API oficial no
 * las expone. Lo que cambia respecto de antes es la escala: se revisa una vez
 * por alianza y no una vez por cada jugador que la declara.
 */
function AllianceRequest({ t, onClose }: { t: Dictionary; onClose: () => void }) {
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      // El contacto se manda como Discord o email según tenga arroba: es un
      // solo campo en pantalla porque pedir dos para elegir uno es fricción.
      const key = contact.includes("@") && contact.includes(".") ? "email" : "discord";
      const res = await fetch("/api/alliances/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag, name, [key]: contact }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t.link.allianceRequestFailed);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.link.allianceRequestFailed);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="rounded-lg border border-line-strong bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
        {t.link.allianceRequested}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-line-strong bg-surface-2 p-3.5">
      <p className="text-[12.5px] leading-relaxed text-ink-3">
        {t.link.allianceRequestHelp}
      </p>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[110px_minmax(0,1fr)]">
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder={t.link.alliancePlaceholder}
          maxLength={5}
          aria-label={t.link.allianceLabel}
          className={REQ_INPUT}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.link.allianceNamePlaceholder}
          maxLength={40}
          aria-label={t.link.allianceNameLabel}
          className={REQ_INPUT}
        />
      </div>

      <input
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder={t.link.allianceContactPlaceholder}
        aria-label={t.link.allianceContactPlaceholder}
        className={REQ_INPUT}
      />

      {error && <p className="text-[12.5px] leading-relaxed text-neg">{error}</p>}

      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={send}
          disabled={busy || !tag.trim() || !name.trim() || !contact.trim()}
          className="rounded-[7px] bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-bg hover:bg-accent-bright disabled:opacity-40"
        >
          {busy ? t.link.allianceRequestSending : t.link.allianceRequestSend}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-[12.5px] text-ink-3 hover:text-ink"
        >
          {t.link.allianceRequestCancel}
        </button>
      </div>
    </div>
  );
}

const REQ_INPUT =
  "w-full min-w-0 rounded-lg border border-line-strong bg-bg px-3 py-2 text-[13px] outline-none focus:border-accent";
