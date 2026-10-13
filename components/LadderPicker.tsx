"use client";

import { useEffect, useMemo, useState } from "react";
import { formatRank, formatScore } from "@/lib/format";
import { fill, type Dictionary } from "@/lib/i18n";

export interface LadderRow {
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
 *
 * Lo usan las dos pantallas donde alguien dice "esta fila soy yo": pedir la
 * ficha, y mudarla después de un cambio de nombre.
 */
export function LadderPicker({
  t,
  onPick,
}: {
  t: Dictionary;
  /** `ambiguous`: hay otra fila con el mismo nameKey, o sea un homónimo. */
  onPick: (row: LadderRow, ambiguous: boolean) => void;
}) {
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
    <>
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
                  onPick(row, rows!.filter((r) => r.nameKey === row.nameKey).length > 1)
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

      {error && (
        <p className="mt-4 rounded-lg border border-[#4a2320] bg-[#2a1614] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-neg">
          {error}
        </p>
      )}
    </>
  );
}
