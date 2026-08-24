"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary, Lang } from "@/lib/i18n";

/**
 * Entrada de código de seguimiento.
 *
 * Normaliza del lado del cliente antes de navegar —mayúsculas, sin guiones ni
 * espacios— para que pegar `k7m2-qw9x-4rtf` funcione igual que tipearlo. La
 * ruta vuelve a normalizar por su cuenta: esto es comodidad, no validación.
 */
export function TokenLookup({ lang, t }: { lang: Lang; t: Dictionary }) {
  const router = useRouter();
  const [value, setValue] = useState("");

  const cleaned = value.trim().toUpperCase().replace(/[\s-]/g, "");
  const ready = cleaned.length === 12;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    router.push(`/${lang}/request/${cleaned}`);
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-surface p-6">
      <label className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-ink-4">
        {t.request.lookupLabel}
      </label>

      <div className="flex gap-2.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="K7M2-QW9X-4RTF"
          autoFocus
          spellCheck={false}
          autoCapitalize="characters"
          className="min-w-0 flex-1 rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 font-mono text-[15px] tracking-[0.08em] outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!ready}
          className="shrink-0 rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-bg transition-colors hover:bg-accent-bright disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t.request.lookupButton}
        </button>
      </div>

      <p className="mt-2.5 text-[12px] text-ink-4">{t.request.lookupHelp}</p>
    </form>
  );
}
