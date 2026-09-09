"use client";

import { useState } from "react";
import type { Dictionary } from "@/lib/i18n";
import { fill } from "@/lib/i18n";
import { DEFAULT_ROWS, OVERLAY_WIDTH, obsHeight } from "@/lib/overlay";

/**
 * La URL del overlay del jugador, con botón de copiar y de rotar.
 *
 * Vive en la página del código y no en la ficha pública: la URL lleva la llave
 * secreta del overlay, así que solo puede verla quien tiene el `statusToken`.
 * Ver `PlayerDoc.overlayKey`.
 *
 * La URL llega ARMADA desde el servidor, que la saca del header `host`. La
 * alternativa —completarla al montar con `window.location.origin`— pintaba
 * primero un path suelto y lo reemplazaba después, y sobre todo obligaba a
 * escribir estado dentro de un efecto, que es justo lo que el lint prohíbe y
 * con razón: es un valor derivado del request, no algo que cambie con el uso.
 */
export function OverlayLink({
  url,
  pinnedRank,
  statusToken,
  t,
}: {
  /** Absoluta y lista para pegar en OBS. La arma `overlaySetup`, en el servidor. */
  url: string;
  /** Solo para nombres repetidos: sin esto el overlay mostraría al homónimo. */
  pinnedRank?: number;
  /** La credencial para rotar. Va en el body del POST, nunca en la URL. */
  statusToken: string;
  t: Dictionary;
}) {
  const [copied, setCopied] = useState(false);
  /**
   * La URL vigente. Arranca en la del servidor y solo cambia al rotar, que es
   * la única forma de que esta pantalla se entere de una llave nueva sin
   * recargar. No hay efecto de por medio: cambia por una acción, no por montar.
   */
  const [current, setCurrent] = useState(url);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rotate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/overlay/rotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ statusToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t.overlay.rotateFailed);

      /**
       * El origen y el `?rank=` salen de la URL que ya teníamos, no de
       * `window.location`: es el mismo valor que armó el servidor mirando el
       * header `host`, y así la URL rotada sale idéntica a la que saldría de
       * recargar la página.
       */
      const previa = new URL(current);
      previa.pathname = `/overlay/${data.overlayKey}`;
      setCurrent(previa.toString());

      setRotated(true);
      setConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.overlay.rotateFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <h2 className="mb-1 text-[14px] font-semibold">{t.overlay.title}</h2>
      <p className="mb-3.5 text-[12.5px] leading-relaxed text-ink-3">{t.overlay.body}</p>

      <div className="flex flex-wrap items-center gap-2.5">
        <code className="num min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 text-[12.5px] text-ink-2">
          {current}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(current);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="shrink-0 rounded-lg border border-line-strong px-3.5 py-2 text-[12.5px] text-ink-3 transition-colors hover:border-line-bright hover:text-ink"
        >
          {copied ? t.link.copied : t.link.copy}
        </button>
      </div>

      {/* Que la URL es un secreto va PEGADO a la URL, no al final del bloque:
          quien la copia de un vistazo no lee el resto. */}
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-3">{t.overlay.secret}</p>

      {rotated && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-pos">{t.overlay.rotated}</p>
      )}

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-4">
        {t.overlay.how}{" "}
        {/* En mono y más claro porque es lo que hay que teclear en OBS, no
            prosa: el resto de la línea se lee una vez y esto se copia. */}
        <span className="num text-ink-2">
          {OVERLAY_WIDTH} × {obsHeight(DEFAULT_ROWS)}
        </span>
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-4">{t.overlay.sizeNote}</p>

      {/*
        Con un nombre repetido la URL lleva el puesto pegado, que es lo único
        que la desambigua — y por eso deja de servir en cuanto la persona
        cambia de puesto. Se avisa acá y no en el overlay porque acá todavía se
        puede hacer algo al respecto.
      */}
      {pinnedRank !== undefined && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-neg">
          {fill(t.overlay.pinnedWarning, { rank: pinnedRank })}
        </p>
      )}

      {/*
        Rotar en DOS pasos, al revés que copiar el código de la alianza.
        Rotar allá corta a quien no entró todavía; rotar acá le apaga la fuente
        de OBS a quien la tiene puesta, y eso se descubre al aire. Un click de
        más es barato comparado con eso.
      */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5 border-t border-line-soft pt-3.5">
        {confirming ? (
          <>
            <button
              onClick={rotate}
              disabled={busy}
              className="rounded-lg border border-[#4a2320] bg-[#2a1614] px-3.5 py-2 text-[12.5px] font-medium text-neg transition-colors hover:border-neg disabled:opacity-50"
            >
              {busy ? t.overlay.rotating : t.overlay.rotateConfirm}
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="rounded-lg px-2 py-2 text-[12.5px] text-ink-4 transition-colors hover:text-ink disabled:opacity-50"
            >
              {t.overlay.rotateCancel}
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              setConfirming(true);
              setRotated(false);
              setError(null);
            }}
            className="rounded-lg border border-line-strong px-3.5 py-2 text-[12.5px] text-ink-3 transition-colors hover:border-line-bright hover:text-ink"
          >
            {t.overlay.rotate}
          </button>
        )}
      </div>

      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-4">{t.overlay.rotateHelp}</p>

      {error && <p className="mt-2 text-[12.5px] text-neg">{error}</p>}
    </div>
  );
}
