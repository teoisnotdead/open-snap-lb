/**
 * Crea la entidad `alliances` a partir de los tags que ya están cargados como
 * texto libre en `players`.
 *
 *   npm run db:backfill-alliances            # solo mira y cuenta
 *   npm run db:backfill-alliances -- --write # escribe
 *
 * Existe por dos razones. La primera es que sin esto el selector del formulario
 * arranca VACÍO, y entonces todo el mundo pide crear su alianza aunque ya
 * estuviera cargada — que es exactamente el trabajo manual que la entidad viene
 * a evitar. La segunda es que deja ver el problema que motivó todo esto: la
 * misma alianza escrita de varias formas.
 *
 * Las alianzas se crean SIN LÍDER y SIN CÓDIGO. Es la decisión importante del
 * script: a esta gente no la verificó nadie, y regalarle un `joinCode` a una
 * alianza que armó un script sería inventar una validación que nunca ocurrió.
 * Una alianza sin líder existe, se ve en el selector y muestra a sus miembros,
 * pero no se puede entrar hasta que alguien la reclame y un admin se lo
 * apruebe. Ver docs/alliances.md.
 *
 * Es idempotente: las alianzas que ya existen no se tocan. Una segunda corrida
 * solo encuentra las que se hayan cargado en el medio.
 */
import { getClient } from "../lib/mongodb";
import { alliancesCollection, playersCollection } from "../lib/db";
import type { AllianceDoc } from "../lib/types";

/**
 * Elige el nombre canónico entre las variantes cargadas para un mismo tag.
 *
 * Gana el más frecuente. Ante un empate gana el más largo, que en la práctica
 * es el que está escrito completo ("Job Enjoyers" contra "Job"); y ante un
 * empate de los dos, el alfabéticamente primero, solo para que el script sea
 * determinista y dos corridas no elijan distinto.
 *
 * Es una heurística y puede equivocarse. Por eso el script IMPRIME las
 * variantes descartadas: el objetivo no es acertar siempre, es que quede a la
 * vista cuáles hay que corregir a mano desde el panel.
 */
function pickName(variants: { name: string; n: number }[]): string {
  return [...variants].sort(
    (a, b) => b.n - a.n || b.name.length - a.name.length || a.name.localeCompare(b.name)
  )[0].name;
}

async function main() {
  const write = process.argv.includes("--write");
  const players = await playersCollection();
  const alliances = await alliancesCollection();

  /**
   * Se agrupa por tag Y nombre para poder contar las variantes. Agrupar solo
   * por tag daría el conteo de miembros pero escondería justamente lo que este
   * script vino a mostrar.
   */
  const rows = await players
    .aggregate<{ _id: { tag: string; name: string | null }; n: number }>([
      { $match: { alliance: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { tag: "$alliance", name: "$allianceName" },
          n: { $sum: 1 },
        },
      },
    ])
    .toArray();

  if (rows.length === 0) {
    console.log("No hay ningún jugador con alianza cargada. Nada que migrar.");
    await (await getClient()).close();
    return;
  }

  // tag -> variantes de nombre. Un tag sin ningún nombre cargado es posible:
  // `allianceName` siempre fue opcional.
  const byTag = new Map<string, { name: string; n: number }[]>();
  for (const r of rows) {
    const list = byTag.get(r._id.tag) ?? [];
    if (r._id.name) list.push({ name: r._id.name, n: r.n });
    byTag.set(r._id.tag, list);
  }

  const existing = new Set(
    (await alliances.find({}, { projection: { tag: 1 } }).toArray()).map((a) => a.tag)
  );

  const now = new Date();
  const toCreate: AllianceDoc[] = [];
  let divergent = 0;
  let skipped = 0;

  for (const [tag, variants] of [...byTag.entries()].sort()) {
    const members = rows
      .filter((r) => r._id.tag === tag)
      .reduce((sum, r) => sum + r.n, 0);

    if (existing.has(tag)) {
      console.log(`  ${tag.padEnd(6)} ya existe, se deja como está`);
      skipped++;
      continue;
    }

    // Sin nombre cargado por nadie, el tag es todo lo que hay. Se usa como
    // nombre para no crear una alianza con el campo vacío; el panel lo corrige.
    const name = variants.length > 0 ? pickName(variants) : tag;

    const others = variants.filter((v) => v.name !== name);
    if (others.length > 0) divergent++;

    const detail = others.length > 0 ? `  ← descarta ${others.map((o) => `"${o.name}" (${o.n})`).join(", ")}` : "";
    console.log(`  ${tag.padEnd(6)} "${name}"  ${members} miembro(s)${detail}`);

    toCreate.push({
      tag,
      name,
      bannedNameKeys: [],
      status: "approved",
      createdAt: now,
      updatedAt: now,
    });
  }

  console.log(
    `\n${byTag.size} tag(s) en uso: ${toCreate.length} a crear, ${skipped} ya existían.`
  );
  if (divergent > 0) {
    console.log(
      `${divergent} tag(s) tenían el nombre escrito de más de una forma — que es el ` +
        `motivo de toda esta migración. Revisá los "descarta" de arriba y corregí ` +
        `desde el panel lo que haya quedado mal elegido.`
    );
  }

  if (toCreate.length === 0) {
    console.log("\nNada que escribir.");
    await (await getClient()).close();
    return;
  }

  if (!write) {
    console.log("\nDry run. Volvé a correr con -- --write para escribir.");
    await (await getClient()).close();
    return;
  }

  /**
   * `ordered: false` para que un tag que se haya creado desde el panel entre
   * medio no aborte el resto del lote. El duplicate key de `uniq_tag` es el
   * caso esperado ahí, no un error.
   */
  try {
    const res = await alliances.insertMany(toCreate, { ordered: false });
    console.log(`\nListo: ${res.insertedCount} alianza(s) creada(s).`);
  } catch (err) {
    const e = err as { code?: number; result?: { nInserted?: number } };
    if (e.code === 11000) {
      console.log(
        `\nListo: ${e.result?.nInserted ?? "algunas"} creada(s). Alguna ya existía ` +
          `(se creó desde el panel mientras corría esto); las salteó.`
      );
    } else {
      throw err;
    }
  }

  console.log(
    "\nNinguna quedó con líder ni con código: no se puede entrar a ellas hasta " +
      "que alguien las reclame y vos se lo apruebes."
  );

  await (await getClient()).close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
