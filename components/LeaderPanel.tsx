"use client";

import { useState } from "react";
import { formatJoinCode } from "@/lib/join-code";
import type { Dictionary } from "@/lib/i18n";

/**
 * Lo que ve quien lidera una alianza, dentro de su propia página de estado.
 *
 * Está acá y no en una pantalla aparte porque la credencial del líder ES su
 * `statusToken`: no hay un tercer secreto que recordar, y la página a la que ese
 * token da acceso ya existe. El costo de esa decisión —un token filtrado toca
 * también la alianza— está discutido en docs/alliances.md.
 *
 * El código arranca TAPADO. No es teatro: esta página se abre en un stream, se
 * comparte por captura para mostrar un rechazo, y el código es justamente lo
 * que no tiene que salir en esa imagen.
 */
export function LeaderPanel({
  t,
  tag,
  name,
  joinCode,
  members,
}: {
  t: Dictionary;
  tag: string;
  name: string;
  joinCode: string;
  members: number;
}) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin portapapeles (contexto inseguro, permiso denegado): que se lea y se
      // copie a mano. Por eso el código se muestra en texto y no solo se copia.
      setShown(true);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center gap-2.5">
        <h2 className="text-[15px] font-semibold">{t.leader.title}</h2>
        <span className="num rounded border border-line-strong px-2 py-0.5 text-[11px] font-semibold tracking-[0.08em] text-ink-3">
          {tag}
        </span>
        <span className="text-[13px] text-ink-3">{name}</span>
      </div>

      <p className="mb-4 text-[13px] leading-relaxed text-ink-3">
        {t.leader.body} {members === 1 ? t.leader.membersOne : t.leader.membersMany.replace("{n}", String(members))}
      </p>

      <div className="flex flex-wrap items-center gap-2.5">
        <code
          className="num rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 text-[15px] font-semibold tracking-[0.14em] text-ink"
          aria-label={t.leader.codeLabel}
        >
          {shown ? formatJoinCode(joinCode) : "••••-••••"}
        </code>
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          className="rounded-lg border border-line-strong px-3.5 py-2 text-[13px] text-ink-3 transition-colors hover:border-line-bright hover:text-ink"
        >
          {shown ? t.leader.hide : t.leader.show}
        </button>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-line-strong px-3.5 py-2 text-[13px] text-ink-3 transition-colors hover:border-line-bright hover:text-ink"
        >
          {copied ? t.leader.copied : t.leader.copy}
        </button>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-4">{t.leader.warning}</p>
    </section>
  );
}
