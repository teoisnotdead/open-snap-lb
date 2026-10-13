"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LadderPicker, type LadderRow } from "@/components/LadderPicker";
import { fill, type Dictionary } from "@/lib/i18n";

/**
 * Mudar la ficha al nombre nuevo, con el código como única llave.
 *
 * Solo se monta cuando el nombre de la ficha ya no está en el ladder, que es la
 * misma condición que exige `POST /api/submissions/[token]/rename`: mostrarlo
 * con la ficha funcionando sería ofrecer un botón que siempre responde que no.
 * El porqué de esa regla está en `lib/rename.ts`.
 *
 * Confirma en DOS pasos, como rotar la URL del overlay y por lo mismo: después
 * de mover no hay vuelta atrás desde esta pantalla —el nombre nuevo sí está en
 * el ladder, así que la ficha deja de poder moverse—, y un click de más es
 * barato comparado con quedar pegado a la fila de un homónimo.
 */
export function RenameForm({
  t,
  token,
  currentName,
}: {
  t: Dictionary;
  token: string;
  /** El nombre que tiene la ficha hoy, el que ya no aparece en la tabla. */
  currentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<LadderRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move() {
    if (!picked) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/submissions/${token}/rename`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // El puesto va siempre: si el nombre nuevo está repetido es lo único
        // que dice cuál de las filas tocó la persona.
        body: JSON.stringify({ playerName: picked.playerName, rank: picked.rank }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t.link.connError);
        setBusy(false);
        return;
      }

      /**
       * `busy` se queda en true a propósito. La página la pinta el servidor, y
       * con la ficha ya mudada este bloque deja de montarse: soltar el botón
       * antes sería invitar a un segundo click sobre algo que ya pasó.
       */
      router.refresh();
    } catch {
      setError(t.link.connError);
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-accent-line bg-accent-surface p-4 sm:p-6">
      <h2 className="mb-1 text-[15px] font-semibold">{t.request.renameTitle}</h2>
      <p className="text-[13px] leading-relaxed text-ink-2">
        {fill(t.request.renameBody, { name: currentName })}
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 rounded-lg border border-line-strong bg-bg px-5 py-2.5 text-[14px] font-medium text-ink-2 transition-colors hover:border-line-bright hover:text-ink"
        >
          {t.request.renameOpen}
        </button>
      ) : picked ? (
        <div className="mt-4">
          <p className="text-[13px] leading-relaxed text-ink-2">
            {fill(t.request.renameConfirmBody, {
              from: currentName,
              to: picked.playerName,
              rank: picked.rank,
            })}
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2.5">
            <button
              onClick={move}
              disabled={busy}
              className="rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-bg transition-colors hover:bg-accent-bright disabled:opacity-40"
            >
              {busy ? t.request.renameMoving : t.request.renameConfirm}
            </button>
            <button
              onClick={() => {
                setPicked(null);
                setError(null);
              }}
              disabled={busy}
              className="rounded-lg border border-line-strong bg-bg px-5 py-2.5 text-[14px] font-medium text-ink-3 transition-colors hover:border-line-bright hover:text-ink disabled:opacity-40"
            >
              {t.request.renameBack}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <LadderPicker t={t} onPick={(row) => setPicked(row)} />
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-[#4a2320] bg-[#2a1614] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-neg">
          {error}
        </p>
      )}
    </section>
  );
}
