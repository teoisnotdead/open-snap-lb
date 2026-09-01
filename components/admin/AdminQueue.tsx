"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AllianceQueue, type AllianceRow } from "@/components/admin/AllianceQueue";
import type { SubmissionStatus, SubmissionView } from "@/lib/types";

const TABS: { key: SubmissionStatus; label: string }[] = [
  { key: "pending", label: "Pendientes" },
  { key: "approved", label: "Aprobadas" },
  { key: "rejected", label: "Rechazadas" },
];

export function AdminQueue({
  user,
  status,
  counts,
  submissions,
  dbError,
  alliances,
}: {
  user: string;
  status: SubmissionStatus;
  counts: Record<SubmissionStatus, number>;
  submissions: SubmissionView[];
  dbError: string | null;
  alliances: AllianceRow[];
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1040px] flex-col px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-[-0.02em]">
            Peticiones
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-4">Sesión de {user}</p>
        </div>
        <button
          onClick={logout}
          className="rounded-lg border border-line-strong px-3.5 py-2 text-[13px] text-ink-3 transition-colors hover:border-line-bright hover:text-ink"
        >
          Salir
        </button>
      </header>

      <AllianceQueue alliances={alliances} />

      <nav className="mb-6 flex gap-1.5 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => router.push(`/admin?status=${tab.key}`)}
            className={`rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${
              status === tab.key
                ? "bg-surface-3 text-ink"
                : "text-ink-4 hover:bg-surface hover:text-ink-3"
            }`}
          >
            {tab.label}
            <span className="ml-2 text-ink-4">{counts[tab.key]}</span>
          </button>
        ))}
      </nav>

      {dbError && (
        <p className="mb-6 rounded-lg border border-[#4a2320] bg-[#2a1614] px-4 py-3 text-[13px] text-neg">
          {dbError}
        </p>
      )}

      {!dbError && submissions.length === 0 && (
        <p className="rounded-xl border border-dashed border-line py-16 text-center text-[14px] text-ink-4">
          {status === "pending" ? "No hay nada esperando revisión." : "Nada acá todavía."}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {submissions.map((s) => (
          <SubmissionCard key={s.id} submission={s} />
        ))}
      </div>
    </main>
  );
}

function SubmissionCard({ submission: s }: { submission: SubmissionView }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const candidates = s.candidates ?? [];

  /**
   * Con el nombre repetido hay que elegir a mano qué fila se aprueba. No es un
   * detalle cosmético: ese puesto queda como `lastRank` y es lo único que
   * después permite decirle al sync cuál de los homónimos es esta persona.
   */
  const mustChoose = candidates.length > 1;
  const [rank, setRank] = useState<number | null>(null);

  async function review(action: "approve" | "reject") {
    setBusy(action);
    setError(null);

    try {
      const res = await fetch(`/api/admin/submissions/${s.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reason.trim() || undefined,
          ...(mustChoose && rank !== null ? { rank } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "No se pudo procesar.");
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo conectar.");
    } finally {
      setBusy(null);
    }
  }

  const pending = s.status === "pending";

  return (
    <article className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="min-w-0 break-words font-display text-[17px] font-bold">{s.playerName}</h2>

            {candidates.length === 1 && (
              <span className="font-mono text-[12px] text-ink-4">
                #{candidates[0].rank} · {candidates[0].score} SP
              </span>
            )}

            {mustChoose && (
              <span className="rounded-full border border-accent-line bg-accent-surface px-2 py-0.5 text-[11px] font-semibold text-accent">
                {candidates.length} homónimos
              </span>
            )}

            {candidates.length === 0 && (
              <span className="rounded-full border border-line-strong px-2 py-0.5 text-[11px] text-ink-4">
                fuera del top 1000
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-ink-4">
            {new Date(s.createdAt).toLocaleString("es")}
            {/* Los datos de abajo ya no son los que se revisaron: el jugador
                los cambió solo con su código. No hay nada que aprobar —esa
                decisión ya está tomada—, pero conviene que se vea, porque un
                contador que sube es lo único que delata un código filtrado. */}
            {s.editedAt && (
              <>
                {" · editada por el jugador "}
                {new Date(s.editedAt).toLocaleString("es")}
                {s.editCount != null && s.editCount > 1 ? ` (${s.editCount} veces)` : null}
              </>
            )}
          </p>
        </div>

        {!pending && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              s.status === "approved"
                ? "bg-[#132a20] text-pos"
                : "bg-[#2a1614] text-neg"
            }`}
          >
            {s.status === "approved" ? "aprobada" : "rechazada"}
          </span>
        )}
      </div>

      <dl className="mb-4 grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] sm:grid-cols-[110px_minmax(0,1fr)] sm:gap-x-4">
        <Field label="Twitch" value={s.twitch} />
        <Field label="YouTube" value={s.youtube} />
        <Field label="Untapped" value={s.untapped} />
        <Field
          label="Alianza"
          value={
            s.allianceTag
              ? s.allianceName
                ? `[${s.allianceTag}] ${s.allianceName}`
                : `[${s.allianceTag}]`
              : undefined
          }
        />
        <Field label="Discord" value={s.discord} private />
        <Field label="Email" value={s.email} private />
        <Field label="Nota" value={s.note} />
        {s.rejectionReason && <Field label="Motivo" value={s.rejectionReason} />}
      </dl>

      {error && (
        <p className="mb-3 rounded-lg border border-[#4a2320] bg-[#2a1614] px-3.5 py-2.5 text-[12.5px] text-neg">
          {error}
        </p>
      )}

      {pending && (
        <div className="flex flex-col gap-3 border-t border-line-soft pt-4">
          {mustChoose && !rejecting && (
            <fieldset>
              <legend className="mb-2 text-[12.5px] text-ink-3">
                Hay {candidates.length} jugadores con este nombre en el ladder. Elegí
                cuál es antes de aprobar: al que elijas se le pegan los links.
              </legend>
              <div className="flex flex-wrap gap-2">
                {candidates.map((cand) => (
                  <label
                    key={cand.rank}
                    className={`cursor-pointer rounded-lg border px-3 py-2 text-[13px] transition-colors ${
                      rank === cand.rank
                        ? "border-accent bg-accent-surface text-ink"
                        : "border-line-strong text-ink-3 hover:border-line-bright"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`rank-${s.id}`}
                      className="sr-only"
                      checked={rank === cand.rank}
                      onChange={() => setRank(cand.rank)}
                    />
                    <span className="font-mono">#{cand.rank}</span>
                    <span className="ml-2 text-ink-4">{cand.score} SP</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {rejecting && (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo del rechazo (se le muestra al solicitante)"
              autoFocus
              className="w-full rounded-lg border border-line-strong bg-bg px-3.5 py-2.5 text-[13px] outline-none focus:border-accent"
            />
          )}

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => review("approve")}
              disabled={busy !== null || rejecting || (mustChoose && rank === null)}
              title={
                mustChoose && rank === null ? "Elegí primero de qué fila se trata" : undefined
              }
              className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-bg transition-colors hover:bg-accent-bright disabled:opacity-40"
            >
              {busy === "approve" ? "Aprobando…" : "Aprobar y verificar"}
            </button>

            {rejecting ? (
              <>
                <button
                  onClick={() => review("reject")}
                  disabled={busy !== null || !reason.trim()}
                  className="rounded-lg border border-[#4a2320] px-4 py-2 text-[13px] font-semibold text-neg transition-colors hover:bg-[#2a1614] disabled:opacity-40"
                >
                  {busy === "reject" ? "Rechazando…" : "Confirmar rechazo"}
                </button>
                <button
                  onClick={() => {
                    setRejecting(false);
                    setReason("");
                  }}
                  disabled={busy !== null}
                  className="rounded-lg px-3 py-2 text-[13px] text-ink-4 hover:text-ink-3"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={() => setRejecting(true)}
                disabled={busy !== null}
                className="rounded-lg border border-line-strong px-4 py-2 text-[13px] text-ink-3 transition-colors hover:border-line-bright hover:text-ink"
              >
                Rechazar
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function Field({
  label,
  value,
  private: isPrivate,
}: {
  label: string;
  value?: string;
  private?: boolean;
}) {
  if (!value) return null;

  return (
    <>
      <dt className="text-[11px] font-semibold tracking-[0.06em] text-ink-4">
        {label.toUpperCase()}
        {isPrivate && <span className="ml-1 font-normal tracking-normal">·priv</span>}
      </dt>
      <dd className="min-w-0 break-words text-ink-2">{value}</dd>
    </>
  );
}
