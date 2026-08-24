/**
 * Crea/actualiza los índices de Mongo. Idempotente: se puede correr siempre.
 *
 *   npm run db:indexes
 *
 * Lee MONGODB_URI de .env (via --env-file en el script de npm).
 */
import type { Collection, Document } from "mongodb";
import { getClient } from "../lib/mongodb";
import {
  ensureIndexes,
  playersCollection,
  snapshotsCollection,
  submissionsCollection,
} from "../lib/db";

/**
 * Índices que existieron y ya no. Mongo NUNCA borra uno solo: `createIndexes`
 * ignora los que sobran, así que un índice de un modelo viejo se queda ahí
 * ocupando espacio y ralentizando cada escritura para siempre.
 *
 * `verificationCode` se mudó de `players` a `submissions` cuando la
 * verificación pasó a ser un paso opcional de la petición.
 */
const OBSOLETE: { collection: string; index: string }[] = [
  { collection: "players", index: "verification_code" },
];

async function printIndexes(name: string, col: Collection<Document>) {
  console.log(`\n${name}:`);
  for (const ix of await col.indexes()) {
    const flags = [
      ix.unique ? "unique" : null,
      ix.partialFilterExpression ? "partial" : null,
      ix.sparse ? "sparse" : null,
    ]
      .filter(Boolean)
      .join(", ");
    console.log(`  ${ix.name}: ${JSON.stringify(ix.key)}${flags ? `  [${flags}]` : ""}`);
  }
}

async function main() {
  console.log("Creando índices...");
  await ensureIndexes();

  const collections = {
    players: (await playersCollection()) as unknown as Collection<Document>,
    snapshots: (await snapshotsCollection()) as unknown as Collection<Document>,
    submissions: (await submissionsCollection()) as unknown as Collection<Document>,
  };

  for (const { collection, index } of OBSOLETE) {
    const col = collections[collection as keyof typeof collections];
    if (!col) continue;
    try {
      await col.dropIndex(index);
      console.log(`  (borrado el índice obsoleto ${collection}.${index})`);
    } catch {
      // No existe: es el caso normal en una base nueva.
    }
  }

  for (const [name, col] of Object.entries(collections)) {
    await printIndexes(name, col);
  }

  console.log("\nListo.");
  await (await getClient()).close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
