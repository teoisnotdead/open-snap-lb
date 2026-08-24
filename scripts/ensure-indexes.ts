/**
 * Crea/actualiza los índices de Mongo. Idempotente: se puede correr siempre.
 *
 *   npm run db:indexes
 *
 * Lee MONGODB_URI de .env.local (via --env-file en el script de npm).
 */
import { getClient } from "../lib/mongodb";
import {
  ensureIndexes,
  playersCollection,
  snapshotsCollection,
} from "../lib/db";

async function main() {
  console.log("Creando índices...");
  await ensureIndexes();

  const players = await playersCollection();
  const snapshots = await snapshotsCollection();

  console.log("\nplayers:");
  for (const ix of await players.indexes()) {
    const flags = [
      ix.unique ? "unique" : null,
      ix.partialFilterExpression ? "partial" : null,
      ix.sparse ? "sparse" : null,
    ]
      .filter(Boolean)
      .join(", ");
    console.log(`  ${ix.name}: ${JSON.stringify(ix.key)}${flags ? `  [${flags}]` : ""}`);
  }

  console.log("\nsnapshots:");
  for (const ix of await snapshots.indexes()) {
    const flags = ix.unique ? "  [unique]" : "";
    console.log(`  ${ix.name}: ${JSON.stringify(ix.key)}${flags}`);
  }

  console.log("\nListo.");
  await (await getClient()).close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
