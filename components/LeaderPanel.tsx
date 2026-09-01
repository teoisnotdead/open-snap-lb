"use client";

import { useRouter } from "next/navigation";
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
export interface Member {
  nameKey: string;
  playerName: string;
  lastRank?: number;
}

export function LeaderPanel({
  t,
  tag,
  name,
  joinCode,
  members,
  banned,
  statusToken,
}: {
  t: Dictionary;
  tag: string;
  name: string;
  joinCode: string;
  members: Member[];
  banned: string[];
  /** La credencial del líder. Va en el body de cada acción, nunca en la URL. */
  statusToken: string;
}) {
  const router = useRouter();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState(joinCode);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rotate() {
    setBusy("rotate");
    setError(null);
    try {
      const res = await fetch(`/api/alliances/${tag}/rotate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ statusToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t.leader.failed);
      setCode(data.joinCode);
      // Se muestra solo: si no, el líder acaba de cambiar el código y no ve
      // cuál es, que es justo lo que necesita para repartirlo de nuevo.
      setShown(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.leader.failed);
    } finally {
      setBusy(null);
    }
  }

  async function member(nameKey: string, action: "kick" | "unban") {
    setBusy(nameKey);
    setError(null);
    try {
      const res = await fetch(`/api/alliances/${tag}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ statusToken, nameKey, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? t.leader.failed);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.leader.failed);
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
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
        {t.leader.body}{" "}
        {members.length === 1
          ? t.leader.membersOne
          : t.leader.membersMany.replace("{n}", String(members.length))}
      </p>

      <div className="flex flex-wrap items-center gap-2.5">
        <code
          className="num rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 text-[15px] font-semibold tracking-[0.14em] text-ink"
          aria-label={t.leader.codeLabel}
        >
          {shown ? formatJoinCode(code) : "••••-••••"}
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
        <button
          type="button"
          onClick={rotate}
          disabled={busy !== null}
          className="rounded-lg border border-line-strong px-3.5 py-2 text-[13px] text-ink-3 transition-colors hover:border-line-bright hover:text-ink disabled:opacity-40"
        >
          {busy === "rotate" ? t.leader.rotating : t.leader.rotate}
        </button>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-4">{t.leader.warning}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-4">{t.leader.rotateHelp}</p>

      {error && (
        <p className="mt-3 rounded-lg border border-[#4a2320] bg-[#2a1614] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-neg">
          {error}
        </p>
      )}

      <div className="mt-5 border-t border-line-soft pt-4">
        <h3 className="mb-2.5 text-[13px] font-semibold">{t.leader.membersTitle}</h3>

        {members.length === 0 ? (
          <p className="text-[12.5px] text-ink-4">{t.leader.empty}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {members.map((m) => (
              <li
                key={m.nameKey}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2"
              >
                <span className="flex min-w-0 items-baseline gap-2.5">
                  {m.lastRank !== undefined && (
                    <span className="num shrink-0 text-[12px] text-ink-4">#{m.lastRank}</span>
                  )}
                  <span className="truncate text-[13.5px]">{m.playerName}</span>
                </span>
                <button
                  type="button"
                  onClick={() => member(m.nameKey, "kick")}
                  disabled={busy !== null}
                  className="shrink-0 text-[12.5px] text-ink-4 transition-colors hover:text-neg disabled:opacity-40"
                >
                  {busy === m.nameKey ? t.leader.kicking : t.leader.kick}
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-4">{t.leader.kickHelp}</p>
      </div>

      {banned.length > 0 && (
        <div className="mt-4 border-t border-line-soft pt-4">
          <h3 className="mb-2.5 text-[13px] font-semibold text-ink-3">
            {t.leader.bannedTitle}
          </h3>
          <ul className="flex flex-col gap-1">
            {banned.map((key) => (
              <li key={key} className="flex items-center justify-between gap-3 px-2 py-1">
                <span className="truncate text-[13px] text-ink-4">{key}</span>
                <button
                  type="button"
                  onClick={() => member(key, "unban")}
                  disabled={busy !== null}
                  className="shrink-0 text-[12.5px] text-ink-4 transition-colors hover:text-ink disabled:opacity-40"
                >
                  {t.leader.unban}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
