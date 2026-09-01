/**
 * Prueba de punta a punta de la alianza como entidad.
 *
 *   npm run dev          (en otra terminal)
 *   npm run test:alliances
 *
 * Cubre lo que hace y lo que NO tiene que dejar hacer: pedir una alianza,
 * rechazar duplicados, no publicar una alianza que no existe, y que el nombre
 * salga SIEMPRE de la entidad y nunca de lo que mande el cliente — que es el
 * bug que motivó todo esto.
 *
 * Siembra sus propios datos y los borra al final. Se le puede apuntar a otra
 * base con BASE_URL.
 */
import { getClient } from "../lib/mongodb";
import { alliancesCollection, playersCollection, submissionsCollection } from "../lib/db";
import { parseProfileFields } from "../lib/profile-fields";
import { generateStatusToken } from "../lib/tokens";
import { parseJoinCode, formatJoinCode, generateJoinCode } from "../lib/alliances";
import { toNameKey } from "../lib/names";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const TAG = "ZQT";
const TAG2 = "ZQT2";
const NAME = "AllianceTestPlayer";
const nameKey = toNameKey(NAME);

let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    pass++;
    console.log(`  [ok] ${label}`);
  } else {
    fail++;
    console.log(`  [FALLA] ${label}`, detail ?? "");
  }
}

async function requestAlliance(body: Record<string, string>) {
  const res = await fetch(`${BASE}/api/alliances/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function cleanup() {
  const alliances = await alliancesCollection();
  const players = await playersCollection();
  const submissions = await submissionsCollection();
  await alliances.deleteMany({ tag: { $in: [TAG, TAG2] } });
  await players.deleteMany({ nameKey });
  await submissions.deleteMany({ nameKey });
}

async function main() {
  console.log(`\nprobando contra ${BASE}\n`);
  await cleanup();

  const alliances = await alliancesCollection();

  // --- el código de invitación, que es puro y no necesita base ---
  console.log("código de invitación:");
  const code = generateJoinCode();
  check("tiene 8 caracteres", code.length === 8, code);
  check("se puede volver a parsear", parseJoinCode(code) === code);
  check(
    "acepta guiones, espacios y minúscula",
    parseJoinCode(formatJoinCode(code).toLowerCase()) === code,
    formatJoinCode(code)
  );
  check(
    "RECHAZA un statusToken de 12 (el largo distinto es a propósito)",
    parseJoinCode(generateStatusToken()) === null
  );

  // --- pedir una alianza ---
  console.log("\nPOST /api/alliances/request:");
  const created = await requestAlliance({
    tag: TAG.toLowerCase(),
    name: "  Zeta   Quest  ",
    discord: "teo.test",
  });
  check("crea la alianza (201)", created.status === 201, created);
  check("normaliza el tag a mayúsculas", created.body?.tag === TAG, created.body);
  check("colapsa los espacios del nombre", created.body?.name === "Zeta Quest", created.body);
  check("queda pendiente, no aprobada", created.body?.status === "pending", created.body);

  const dup = await requestAlliance({ tag: TAG, name: "Otra cosa", discord: "teo.test" });
  check("rechaza el tag duplicado (409)", dup.status === 409, dup);
  check(
    "y dice que está PEDIDA, no que ya existe",
    String(dup.body?.error).includes("todavía no la revisamos"),
    dup.body
  );

  const noContact = await requestAlliance({ tag: TAG2, name: "Sin contacto" });
  check("exige un contacto", noContact.status === 400, noContact);

  const badTag = await requestAlliance({
    tag: "DEMASIADOLARGO",
    name: "X",
    discord: "teo.test",
  });
  check("valida el tag", badTag.status === 400, badTag);

  // --- la resolución contra la entidad ---
  console.log("\nparseProfileFields:");

  const pending = await parseProfileFields({ allianceTag: TAG });
  check(
    "NO deja publicar una alianza pendiente",
    !pending.ok && String((pending as { error: string }).error).includes("no existe"),
    pending
  );

  const ghost = await parseProfileFields({ allianceTag: "NOPE" });
  check("NO deja publicar una alianza inexistente", !ghost.ok, ghost);

  // La aprobamos por debajo: el panel es lo que hace esto, y no queremos
  // arrastrar la sesión de admin a esta prueba.
  await alliances.updateOne({ tag: TAG }, { $set: { status: "approved" } });

  const ok = await parseProfileFields({ allianceTag: TAG.toLowerCase() });
  check("deja publicar una aprobada, y normaliza el tag", ok.ok && ok.fields.allianceTag === TAG, ok);
  check(
    "el nombre sale de la ENTIDAD, no del cliente",
    ok.ok && ok.fields.allianceName === "Zeta Quest",
    ok
  );

  /**
   * El corazón del bug original: antes, mandar un nombre distinto lo publicaba
   * tal cual y la misma alianza terminaba escrita de varias formas. Ahora el
   * campo ni siquiera se lee.
   */
  const spoof = await parseProfileFields({
    allianceTag: TAG,
    allianceName: "Nombre Inventado",
  } as { allianceTag: string; allianceName: string });
  check(
    "IGNORA un allianceName mandado por el cliente",
    spoof.ok && spoof.fields.allianceName === "Zeta Quest",
    spoof
  );

  const empty = await parseProfileFields({});
  check("sigue exigiendo algo que publicar", !empty.ok, empty);

  await cleanup();
  await (await getClient()).close();

  console.log(`\n${pass} ok, ${fail} fallas\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  process.exit(1);
});
