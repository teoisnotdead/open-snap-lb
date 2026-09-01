/**
 * Prueba de punta a punta de la edición con el código.
 *
 *   npm run dev            (en otra terminal)
 *   npm run test:self-edit
 *
 * Siembra una petición aprobada con su jugador, pega contra la ruta real y
 * borra todo al final. No hace falta que sea contra un servidor local: se le
 * puede pasar otra base con BASE_URL.
 */
import { getClient } from "../lib/mongodb";
import { alliancesCollection, playersCollection, submissionsCollection } from "../lib/db";
import { generateStatusToken } from "../lib/tokens";
import { toNameKey } from "../lib/names";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const NAME = "SelfEditTestPlayer";
const OTHER = "SelfEditOtherPlayer";
const nameKey = toNameKey(NAME);
const otherKey = toNameKey(OTHER);

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

async function patch(token: string, body: Record<string, string>) {
  const res = await fetch(`${BASE}/api/submissions/${token}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

async function cleanup() {
  const players = await playersCollection();
  const submissions = await submissionsCollection();
  const alliances = await alliancesCollection();
  await players.deleteMany({ nameKey: { $in: [nameKey, otherKey] } });
  await submissions.deleteMany({ nameKey: { $in: [nameKey, otherKey] } });
  await alliances.deleteMany({ tag: { $in: ["OLD", "NEW"] } });
}

async function main() {
  await cleanup();

  const players = await playersCollection();
  const submissions = await submissionsCollection();
  const alliances = await alliancesCollection();
  const now = new Date();

  /**
   * Las dos alianzas tienen que EXISTIR y estar aprobadas: desde que la alianza
   * es una entidad, un tag de texto libre ya no se publica. Ver
   * docs/alliances.md.
   */
  await alliances.insertMany([
    { tag: "OLD", name: "Old Alliance", bannedNameKeys: [], status: "approved" as const, createdAt: now, updatedAt: now },
    { tag: "NEW", name: "Nueva Alianza", bannedNameKeys: [], status: "approved" as const, createdAt: now, updatedAt: now },
  ]);

  const token = generateStatusToken();
  const pendingToken = generateStatusToken();

  // Una cuenta aprobada, tal como la deja el panel.
  await players.insertOne({
    nameKey,
    playerName: NAME,
    twitch: "selfedit_old",
    alliance: "OLD",
    allianceName: "Old Alliance",
    verified: true,
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await submissions.insertOne({
    statusToken: token,
    nameKey,
    playerName: NAME,
    twitch: "selfedit_old",
    allianceTag: "OLD",
    allianceName: "Old Alliance",
    discord: "selfedit",
    status: "approved",
    reviewedAt: now,
    reviewedBy: "test",
    createdAt: now,
    updatedAt: now,
  });

  // Otra cuenta verificada, para el choque de canales.
  await players.insertOne({
    nameKey: otherKey,
    playerName: OTHER,
    twitch: "taken_handle",
    verified: true,
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // Y una pendiente, que todavía no se puede editar.
  await submissions.insertOne({
    statusToken: pendingToken,
    nameKey: otherKey,
    playerName: OTHER,
    twitch: "pending_handle",
    discord: "otro",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  console.log(`\nprobando contra ${BASE}\n`);

  // --- el camino feliz: cambia alianza y canal ---
  let r = await patch(token, {
    twitch: "selfedit_new",
    youtube: "@selfedit",
    untapped: "",
    allianceTag: "NEW",
  });
  check("200 al editar una aprobada", r.status === 200, r);

  let player = await players.findOne({ nameKey });
  check("el twitch nuevo quedó publicado", player?.twitch === "selfedit_new", player?.twitch);
  check("el youtube nuevo quedó publicado", player?.youtube === "selfedit", player?.youtube);
  check("el tag de alianza cambió", player?.alliance === "NEW", player?.alliance);
  check(
    "el nombre de alianza salió de la ENTIDAD, no del cliente",
    player?.allianceName === "Nueva Alianza",
    player?.allianceName
  );

  let sub = await submissions.findOne({ statusToken: token });
  check("la petición refleja lo publicado", sub?.twitch === "selfedit_new", sub?.twitch);
  check("quedó el rastro de la edición", !!sub?.editedAt && sub?.editCount === 1, {
    editedAt: sub?.editedAt,
    editCount: sub?.editCount,
  });
  check("el contacto sigue intacto", sub?.discord === "selfedit", sub?.discord);
  check("sigue aprobada", sub?.status === "approved", sub?.status);

  // --- vaciar un campo lo saca ---
  r = await patch(token, {
    twitch: "selfedit_new",
    youtube: "",
    untapped: "",
    allianceTag: "",
  });
  check("200 al vaciar campos", r.status === 200, r);

  player = await players.findOne({ nameKey });
  check("el youtube se borró de players", player?.youtube === undefined, player?.youtube);
  check(
    "sacar el tag se lleva el nombre con él",
    player?.alliance === undefined && player?.allianceName === undefined,
    { alliance: player?.alliance, allianceName: player?.allianceName }
  );

  sub = await submissions.findOne({ statusToken: token });
  check("el youtube se borró de la petición", sub?.youtube === undefined, sub?.youtube);
  check("el contador subió a 2", sub?.editCount === 2, sub?.editCount);

  // --- el contacto no se edita por acá ---
  await patch(token, {
    twitch: "selfedit_new",
    allianceTag: "NEW",
    ...({ discord: "secuestrado", email: "otro@ejemplo.com" } as Record<string, string>),
  });
  sub = await submissions.findOne({ statusToken: token });
  check("el discord no se pudo cambiar", sub?.discord === "selfedit", sub?.discord);
  check("no se coló un email", sub?.email === undefined, sub?.email);

  // --- validaciones ---
  r = await patch(token, { twitch: "no espacios!" });
  check("rechaza un handle inválido", r.status === 400, r);

  r = await patch(token, { twitch: "", youtube: "", untapped: "", allianceTag: "" });
  check("no deja vaciar la ficha entera", r.status === 400, r);

  r = await patch(token, { allianceTag: "GHOST" });
  check("rechaza una alianza que no existe", r.status === 400, r);
  check(
    "y lo dice sin culpar al formato",
    typeof r.data.error === "string" && r.data.error.includes("no existe todavía"),
    r.data.error
  );

  r = await patch(token, { twitch: "taken_handle" });
  check("rechaza un canal de otra cuenta", r.status === 409, r);
  check(
    "y dice de quién es",
    typeof r.data.error === "string" && r.data.error.includes(OTHER),
    r.data.error
  );

  // --- estado y token ---
  r = await patch(pendingToken, { twitch: "loquesea" });
  check("no deja editar una pendiente", r.status === 409, r);

  r = await patch("ZZZZZZZZZZZZ", { twitch: "loquesea" });
  check("token inexistente da 404", r.status === 404, r);

  r = await patch("corto", { twitch: "loquesea" });
  check("token mal formado da el mismo 404", r.status === 404, r);

  // --- y nada de esto rompió el GET ---
  const get = await fetch(`${BASE}/api/submissions/${token}`);
  const status = await get.json();
  check("el GET marca que se puede editar", status.canEdit === true, status);
  check("el GET sigue sin filtrar el contacto", status.discord === undefined, status);

  await cleanup();
  check("limpieza completa", true);

  console.log(`\n${pass}/${pass + fail}`);
  await (await getClient()).close();
  if (fail > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => {});
  process.exit(1);
});
