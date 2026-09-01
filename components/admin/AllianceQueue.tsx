"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * La cola de alianzas del panel.
 *
 * Separada de la de peticiones a propósito: son dos afirmaciones distintas y se
 * revisan con criterios distintos. Una petición pregunta "¿esta persona es esta
 * fila del ladder?"; una alianza pregunta "¿esta alianza existe y se llama
 * así?". Mezclarlas en una sola lista haría que se aprueben con el mismo gesto
 * dos cosas que no se parecen.
 *
 * Aprobar acá **no le pone líder ni código** a la alianza: solo la vuelve
 * elegible en el selector. Reclamar el liderazgo es otra cosa, con su propia
 * validación (ver docs/alliances.md).
 */

export interface AllianceRow {
  id: string;
  tag: string;
  name: string;
  members: number;
  hasLeader: boolean;
  discord?: string;
  email?: string;
  createdAt: string;
}

export function AllianceQueue({ alliances }: { alliances: AllianceRow[] }) {
  if (alliances.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="mb-1 font-display text-[17px] font-bold tracking-[-0.02em]">
        Alianzas por revisar
        <span className="ml-2 text-[13px] font-normal text-ink-4">
          {alliances.length}
        </span>
      </h2>
      <p className="mb-4 text-[12.5px] leading-relaxed text-ink-4">
        Aprobar solo la vuelve elegible en el selector. No le pone líder ni código.
      </p>

      <div className="flex flex-col gap-2.5">
        {alliances.map((a) => (
          <AllianceCard key={a.id} alliance={a} />
        ))}
      </div>
    </section>
  );
}

function AllianceCard({ alliance: a }: { alliance: AllianceRow }) {
  const router = useRouter();
  const [name, setName] = useState(a.name);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/alliances/${a.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "reject" ? { reason } : {}),
          // Solo si cambió: el backend no toca a los miembros si el nombre es
          // el mismo, pero mandarlo igual sería pedirle que lo compare al pedo.
          ...(action === "approve" && name.trim() !== a.name ? { name } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "No se pudo procesar.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar.");
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <span className="num rounded border border-line-strong px-2 py-1 text-[11px] font-semibold tracking-[0.08em] text-ink-2">
          {a.tag}
        </span>
        {/* El nombre es editable acá porque este ES el momento en que un humano
            lo está mirando: corregirlo sale más barato que rechazar y que la
            persona lo mande de nuevo. */}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          aria-label="Nombre de la alianza"
          className="min-w-0 flex-1 rounded-lg border border-line-strong bg-bg px-3 py-1.5 text-[13.5px] outline-none focus:border-accent"
        />
        <span className="text-[12px] text-ink-4">
          {a.members} con este tag publicado
        </span>
      </div>

      <p className="mb-3 text-[12px] text-ink-4">
        {a.discord && <span>Discord: {a.discord} </span>}
        {a.email && <span>Email: {a.email} </span>}
        <span>· pedida {new Date(a.createdAt).toLocaleDateString()}</span>
      </p>

      {error && <p className="mb-3 text-[12.5px] text-neg">{error}</p>}

      {rejecting ? (
        <div className="flex flex-col gap-2.5">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo del rechazo (lo ve quien pidió)"
            maxLength={300}
            className="w-full rounded-lg border border-line-strong bg-bg px-3 py-2 text-[13px] outline-none focus:border-accent"
          />
          <div className="flex gap-2.5">
            <button
              onClick={() => act("reject")}
              disabled={busy || !reason.trim()}
              className="rounded-lg border border-[#4a2320] px-3.5 py-2 text-[13px] text-neg hover:bg-[#2a1614] disabled:opacity-40"
            >
              Confirmar rechazo
            </button>
            <button
              onClick={() => setRejecting(false)}
              className="text-[13px] text-ink-3 hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2.5">
          <button
            onClick={() => act("approve")}
            disabled={busy || !name.trim()}
            className="rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-bg hover:bg-accent-bright disabled:opacity-40"
          >
            Aprobar
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="rounded-lg border border-line-strong px-3.5 py-2 text-[13px] text-ink-3 hover:text-ink disabled:opacity-40"
          >
            Rechazar
          </button>
        </div>
      )}
    </article>
  );
}
