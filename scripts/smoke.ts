/** Smoke test del modelo contra Atlas real. Limpia todo lo que crea. */
import { getClient } from "../lib/mongodb";
import { playersCollection, snapshotsCollection } from "../lib/db";
import { toNameKey } from "../lib/names";

const TAG = "__smoke__";
const ok: string[] = [];
const bad: string[] = [];
const check = (n: string, c: boolean) => (c ? ok : bad).push(n);

async function main() {
  const players = await playersCollection();
  const snapshots = await snapshotsCollection();

  // Limpieza previa por si quedó algo de una corrida abortada.
  await players.deleteMany({ nameKey: { $regex: `^${TAG}` } });
  await snapshots.deleteMany({ nameKey: { $regex: `^${TAG}` } });

  const now = new Date();
  const keyA = `${TAG}sizer`;
  const keyB = `${TAG}derek`;

  // 1. upsert de jugador (el patrón que va a usar el sync)
  await players.updateOne(
    { nameKey: keyA },
    {
      $set: { playerName: "Sizer", lastRank: 2, lastScore: 9987, lastSeenAt: now, updatedAt: now },
      $setOnInsert: { verified: false, createdAt: now },
      $max: { peakScore: 9987 },
      $min: { peakRank: 2 },
    },
    { upsert: true }
  );
  const a = await players.findOne({ nameKey: keyA });
  check("upsert crea el jugador con verified:false", a?.verified === false && a?.lastScore === 9987);

  // 2. $max/$min mantienen los picos aunque el jugador empeore
  await players.updateOne(
    { nameKey: keyA },
    { $set: { lastRank: 40, lastScore: 9000, updatedAt: new Date() }, $max: { peakScore: 9000 }, $min: { peakRank: 40 } }
  );
  const a2 = await players.findOne({ nameKey: keyA });
  check("peakScore no baja al empeorar", a2?.peakScore === 9987);
  check("peakRank no empeora al bajar de puesto", a2?.peakRank === 2);
  check("lastScore sí refleja el valor actual", a2?.lastScore === 9000);

  // 3. snapshots append-only + idempotencia por syncId
  const syncId = "smoke-run-1";
  const snap = { nameKey: keyA, playerName: "Sizer", timestamp: now, rank: 2, score: 9987, season: "2026-08", syncId };
  await snapshots.insertOne({ ...snap });
  let dupCode: number | null = null;
  try {
    await snapshots.insertOne({ ...snap });
  } catch (e) {
    dupCode = (e as { code?: number }).code ?? null;
  }
  check("reintento del mismo sync no duplica el snapshot", dupCode === 11000);

  // 4. varias corridas sí se acumulan, y salen ordenadas para la gráfica
  await snapshots.insertMany([
    { ...snap, syncId: "smoke-run-2", timestamp: new Date(now.getTime() + 3600e3), rank: 3, score: 9950 },
    { ...snap, syncId: "smoke-run-3", timestamp: new Date(now.getTime() + 7200e3), rank: 1, score: 10100 },
  ]);
  const history = await snapshots.find({ nameKey: keyA }).sort({ timestamp: 1 }).toArray();
  check("histórico acumula 3 puntos", history.length === 3);
  check("histórico sale ordenado por tiempo", history.map((h) => h.score).join(",") === "9987,9950,10100");

  // 5. el índice único parcial sobre socials, contra Atlas de verdad
  await players.updateOne(
    { nameKey: keyA },
    { $set: { twitch: "sizer", verified: true, verifiedAt: new Date(), updatedAt: new Date() } }
  );
  await players.updateOne(
    { nameKey: keyB },
    { $set: { playerName: "Derek", updatedAt: new Date() }, $setOnInsert: { verified: false, createdAt: new Date() } },
    { upsert: true }
  );
  let claimCode: number | null = null;
  try {
    await players.updateOne({ nameKey: keyB }, { $set: { twitch: "sizer", verified: true } });
  } catch (e) {
    claimCode = (e as { code?: number }).code ?? null;
  }
  check("otro jugador no puede reclamar un twitch ya verificado", claimCode === 11000);

  // 6. normalización coherente con lo que devuelve la API
  check("nameKey normaliza los espacios que trae la API", toNameKey("Butt   ") === "butt");

  // Limpieza
  const dp = await players.deleteMany({ nameKey: { $regex: `^${TAG}` } });
  const ds = await snapshots.deleteMany({ nameKey: { $regex: `^${TAG}` } });
  check("limpieza completa", (await players.countDocuments({ nameKey: { $regex: `^${TAG}` } })) === 0);
  console.log(`\nlimpiado: ${dp.deletedCount} players, ${ds.deletedCount} snapshots`);

  ok.forEach((t) => console.log("  [ok] " + t));
  bad.forEach((t) => console.log("  [XX] " + t));
  console.log(`\n${ok.length}/${ok.length + bad.length}`);

  await (await getClient()).close();
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
