"use client";

import { useState } from "react";
import type { Dictionary } from "@/lib/i18n";
import { fill } from "@/lib/i18n";
import { DEFAULT_ROWS, OVERLAY_WIDTH, overlayHeight } from "@/lib/overlay";

/**
 * La URL del overlay del jugador, con botón de copiar.
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
  t,
}: {
  /** Absoluta y lista para pegar en OBS. La arma la ficha, ver `overlayUrl`. */
  url: string;
  /** Solo para nombres repetidos: sin esto el overlay mostraría al homónimo. */
  pinnedRank?: number;
  t: Dictionary;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <h2 className="mb-1 text-[14px] font-semibold">{t.overlay.title}</h2>
      <p className="mb-3.5 text-[12.5px] leading-relaxed text-ink-3">{t.overlay.body}</p>

      <div className="flex flex-wrap items-center gap-2.5">
        <code className="num min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 text-[12.5px] text-ink-2">
          {url}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
          className="shrink-0 rounded-lg border border-line-strong px-3.5 py-2 text-[12.5px] text-ink-3 transition-colors hover:border-line-bright hover:text-ink"
        >
          {copied ? t.link.copied : t.link.copy}
        </button>
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink-4">
        {t.overlay.how}{" "}
        {/* En mono y más claro porque es lo que hay que teclear en OBS, no
            prosa: el resto de la línea se lee una vez y esto se copia. */}
        <span className="num text-ink-2">
          {OVERLAY_WIDTH} × {overlayHeight(DEFAULT_ROWS)}
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
    </div>
  );
}
