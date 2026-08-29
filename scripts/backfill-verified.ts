/**
 * Pone al día a los jugadores aprobados ANTES de que aprobar fuera verificar.
 *
 *   npm run db:backfill-verified          # solo mira y cuenta
 *   npm run db:backfill-verified -- --write   # escribe
 *
 * Cuando el tick lo daba un código en el nombre del perfil, un jugador podía
 * estar aprobado —o sea, en `players`, con sus links publicados— y aun así
 * tener `verified: false`. Hoy ese estado no puede existir: la única ruta que
 * escribe en `players` es la aprobación, y deja `verified: true`.
 *
 * Pero eso vale para las aprobaciones nuevas. Los documentos viejos quedaron
 * como estaban, así que sin esto arrastran un `false` que ya no significa nada
 * —ni siquiera "no probó nada", porque esa prueba no existe— y que apaga el
 * tick, el filtro y el contador de la portada.
 *
 * Se corre UNA vez, después de desplegar el cambio. Es idempotente: una segunda
 * corrida no encuentra nada que hacer.
 */
import { getClient } from "../lib/mongodb";
import { playersCollection } from "../lib/db";

async function main() {
  const write = process.argv.includes("--write");
  const players = await playersCollection();

  const stale = await players
    .find({ verified: { $ne: true } }, { projection: { playerName: 1, lastRank: 1 } })
    .toArray();

  const total = await players.countDocuments({});

  if (stale.length === 0) {
    console.log(`Nada que migrar: los ${total} jugadores de \`players\` ya están verificados.`);
    await (await getClient()).close();
    return;
  }

  console.log(`${stale.length} de ${total} jugadores quedaron con verified: false.\n`);
  for (const p of stale) {
    const rank = p.lastRank !== undefined ? `#${p.lastRank}` : "sin rank";
    console.log(`  ${p.playerName}  (${rank})`);
  }

  if (!write) {
    console.log("\nEsto fue solo una mirada. Para escribir:");
    console.log("  npm run db:backfill-verified -- --write");
    await (await getClient()).close();
    return;
  }

  /**
   * `verifiedAt` va con la fecha de hoy y no con la de aprobación: no la
   * tenemos —`players` nunca guardó cuándo se aprobó, solo cuándo se verificó—
   * y ponerle `createdAt` sería inventar una fecha de un hecho que no ocurrió.
   */
  const now = new Date();
  const res = await players.updateMany(
    { verified: { $ne: true } },
    { $set: { verified: true, verifiedAt: now, updatedAt: now } }
  );

  console.log(`\nListo: ${res.modifiedCount} jugadores verificados.`);
  await (await getClient()).close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
