import { redirect } from "next/navigation";
import { getAdminSession, isAdminConfigured } from "@/lib/admin-auth";
import { alliancesCollection, playersCollection, submissionsCollection } from "@/lib/db";
import { fetchLeaderboard, indexByNameKey } from "@/lib/leaderboard";
import { toSubmissionView } from "@/lib/submissions";
import { AdminQueue } from "@/components/admin/AdminQueue";
import type { AllianceRow } from "@/components/admin/AllianceQueue";
import type { SubmissionStatus, SubmissionView } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES: SubmissionStatus[] = ["pending", "approved", "rejected"];

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!isAdminConfigured()) redirect("/admin/login");

  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { status: rawStatus } = await searchParams;
  const status: SubmissionStatus = STATUSES.includes(rawStatus as SubmissionStatus)
    ? (rawStatus as SubmissionStatus)
    : "pending";

  let submissions: SubmissionView[] = [];
  let counts: Record<SubmissionStatus, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  let dbError: string | null = null;
  let pendingAlliances: AllianceRow[] = [];

  try {
    const col = await submissionsCollection();

    const [docs, grouped] = await Promise.all([
      col
        .find({ status })
        .sort({ createdAt: status === "pending" ? 1 : -1 })
        .limit(200)
        .toArray(),
      col
        .aggregate<{ _id: SubmissionStatus; n: number }>([
          { $group: { _id: "$status", n: { $sum: 1 } } },
        ])
        .toArray(),
    ]);

    for (const g of grouped) {
      if (STATUSES.includes(g._id)) counts = { ...counts, [g._id]: g.n };
    }

    /**
     * Las filas del ladder con ese nombre son contexto para decidir, no un dato
     * de la petición: se resuelven al vuelo. Si el ladder no responde, el panel
     * sigue andando — revisar una petición no depende de eso.
     *
     * Van todas y no solo la primera: con un nombre repetido, elegir cuál fila
     * es parte de la aprobación.
     */
    let byKey = new Map<string, SubmissionView["candidates"]>();
    try {
      const board = await fetchLeaderboard({ revalidate: 60 });
      byKey = new Map(
        [...indexByNameKey(board.rows).entries()].map(([k, rows]) => [
          k,
          rows.map((r) => ({ rank: r.rank, score: r.score, playerName: r.playerName })),
        ])
      );
    } catch {
      // sin filas del ladder, pero con cola
    }

    submissions = docs.map((d) => toSubmissionView(d, byKey.get(d.nameKey)));

    /**
     * Las alianzas pendientes van SIEMPRE, sin importar la pestaña: son pocas
     * —una por alianza, no una por jugador— y esconderlas detrás de un filtro
     * propio las dejaría esperando sin que nadie se entere de que están.
     */
    const allianceCol = await alliancesCollection();
    const pending = await allianceCol.find({ status: "pending" }).sort({ createdAt: 1 }).toArray();

    if (pending.length > 0) {
      const players = await playersCollection();
      const counts = await players
        .aggregate<{ _id: string; n: number }>([
          { $match: { alliance: { $in: pending.map((a) => a.tag) } } },
          { $group: { _id: "$alliance", n: { $sum: 1 } } },
        ])
        .toArray();
      const byTag = new Map(counts.map((c) => [c._id, c.n]));

      pendingAlliances = pending.map((a) => ({
        id: String(a._id),
        tag: a.tag,
        name: a.name,
        members: byTag.get(a.tag) ?? 0,
        hasLeader: Boolean(a.leaderNameKey),
        discord: a.discord,
        email: a.email,
        createdAt: a.createdAt.toISOString(),
      }));
    }
  } catch (err) {
    console.error("El panel no pudo leer Mongo:", err);
    dbError = "No se pudo leer la base. Revisa MONGODB_URI y el access list de Atlas.";
  }

  return (
    <AdminQueue
      user={session.user}
      status={status}
      counts={counts}
      submissions={submissions}
      dbError={dbError}
      alliances={pendingAlliances}
    />
  );
}
