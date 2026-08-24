/**
 * Siembra un jugador de demo con historial sintético, para poder mirar la
 * gráfica antes de que el cron junte datos reales.
 *
 *   npx tsx --env-file=.env scripts/seed-demo.ts          # sembrar
 *   npx tsx --env-file=.env scripts/seed-demo.ts --clean  # borrar
 *
 * El jugador se llama "Sizer" y es real, pero TODO su historial es inventado.
 * No dejes esto en la base de producción.
 */
import { getClient } from "../lib/mongodb";
import { playersCollection, snapshotsCollection } from "../lib/db";
import { toNameKey } from "../lib/names";
import type { SnapshotDoc } from "../lib/types";

const NAME = "Sizer";
const KEY = toNameKey(NAME);

async function main() {
  const players = await playersCollection();
  const snapshots = await snapshotsCollection();

  if (process.argv.includes("--clean")) {
    const p = await players.deleteOne({ nameKey: KEY });
    const s = await snapshots.deleteMany({ nameKey: KEY });
    console.log(`Borrado: ${p.deletedCount} player, ${s.deletedCount} snapshots.`);
    await (await getClient()).close();
    return;
  }

  await players.deleteOne({ nameKey: KEY });
  await snapshots.deleteMany({ nameKey: KEY });

  const now = Date.now();
  const docs: SnapshotDoc[] = [];
  let score = 9210;
  let rank = 38;

  // 30 días, una medición cada 6 h, con deriva hacia arriba y algo de ruido.
  for (let i = 0; i < 120; i++) {
    const t = new Date(now - (119 - i) * 6 * 60 * 60 * 1000);
    score += Math.round((Math.random() - 0.35) * 45);
    rank = Math.max(2, rank - (Math.random() > 0.6 ? 1 : 0));
    docs.push({
      nameKey: KEY,
      playerName: NAME,
      timestamp: t,
      rank,
      score,
      season: "2026-08",
      syncId: `demo-${i}`,
    });
  }

  const last = docs[docs.length - 1];
  await snapshots.insertMany(docs);
  await players.insertOne({
    nameKey: KEY,
    playerName: NAME,
    twitch: "sizer",
    youtube: "sizer",
    alliance: "JOB",
    verified: true,
    verifiedAt: new Date(now - 20 * 86_400_000),
    lastSeenAt: new Date(),
    lastRank: last.rank,
    lastScore: last.score,
    peakRank: Math.min(...docs.map((d) => d.rank)),
    peakScore: Math.max(...docs.map((d) => d.score)),
    createdAt: new Date(now - 24 * 86_400_000),
    updatedAt: new Date(),
  });

  console.log(
    `Sembrado "${NAME}": ${docs.length} snapshots, SP final ${last.score}, rank ${last.rank}.`
  );
  await (await getClient()).close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
