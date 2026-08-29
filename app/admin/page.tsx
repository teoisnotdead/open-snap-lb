import { redirect } from "next/navigation";
import { getAdminSession, isAdminConfigured } from "@/lib/admin-auth";
import { submissionsCollection } from "@/lib/db";
import { fetchLeaderboard, indexByNameKey } from "@/lib/leaderboard";
import { toSubmissionView } from "@/lib/submissions";
import { AdminQueue } from "@/components/admin/AdminQueue";
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
  } catch (err) {
    console.error("El panel no pudo leer Mongo:", err);
    dbError = "No se pudo leer la base. Revisá MONGODB_URI y el access list de Atlas.";
  }

  return (
    <AdminQueue
      user={session.user}
      status={status}
      counts={counts}
      submissions={submissions}
      dbError={dbError}
    />
  );
}
