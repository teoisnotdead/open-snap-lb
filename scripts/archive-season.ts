/**
 * Congela una temporada del leaderboard antes de que la API deje de servirla.
 *
 *   npm run db:archive-season -- 2026-07
 *
 * La API oficial solo devuelve el mes corriente y el anterior. Lo que sale de
 * esa ventana no se puede recuperar: este script existe para llegar antes.
 *
 * Es idempotente — el índice único {season, rank} frena cualquier repetido —,
 * así que correrlo dos veces no hace daño.
 */
import { getClient } from "../lib/mongodb";
import { ensureIndexes, seasonResultsCollection } from "../lib/db";
import { archiveSeason, isSeasonArchived } from "../lib/seasons";
import { parseSeason } from "../lib/leaderboard";

async function main() {
  const season = process.argv[2];

  if (!season || !parseSeason(season)) {
    console.error('Uso: npm run db:archive-season -- 2026-07   (formato YYYY-MM)');
    process.exit(1);
  }

  await ensureIndexes();

  if (await isSeasonArchived(season)) {
    console.log(`La temporada ${season} ya estaba archivada.`);
    const col = await seasonResultsCollection();
    console.log("filas guardadas:", await col.countDocuments({ season }));
    await (await getClient()).close();
    return;
  }

  console.log(`Pidiendo ${season} a la API oficial...`);
  const res = await archiveSeason(season);

  console.log(`\nTemporada ${res.season} archivada:`);
  console.log("  filas nuevas   :", res.inserted);
  console.log("  ya existentes  :", res.duplicates);
  console.log("  jugadores en el ladder esa temporada:", res.total.toLocaleString("es"));

  const col = await seasonResultsCollection();
  const top = await col
    .find({ season }, { projection: { _id: 0, rank: 1, playerName: 1, score: 1 } })
    .sort({ rank: 1 })
    .limit(3)
    .toArray();

  console.log("\n  podio:");
  for (const r of top) console.log(`    ${r.rank}. ${r.playerName} — ${r.score}`);

  await (await getClient()).close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
