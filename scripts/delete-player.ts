/**
 * Borra un jugador y todos sus snapshots.
 *
 *   npm run db:delete-player -- "Sizer"
 *
 * Útil para limpiar datos de prueba y para atender un pedido de borrado.
 */
import { getClient } from "../lib/mongodb";
import { playersCollection, snapshotsCollection } from "../lib/db";
import { toNameKey } from "../lib/names";

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Uso: npm run db:delete-player -- "Nombre Del Jugador"');
    process.exit(1);
  }

  const nameKey = toNameKey(input);
  const players = await playersCollection();
  const snapshots = await snapshotsCollection();

  const player = await players.findOne({ nameKey });
  const snapCount = await snapshots.countDocuments({ nameKey });

  if (!player && snapCount === 0) {
    console.log(`No hay nada guardado para "${input}" (nameKey: ${nameKey}).`);
  } else {
    console.log(
      `Borrando nameKey "${nameKey}": ${player ? "1 player" : "0 players"}, ${snapCount} snapshots.`
    );
    await players.deleteOne({ nameKey });
    await snapshots.deleteMany({ nameKey });
    console.log("Listo.");
  }

  await (await getClient()).close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
