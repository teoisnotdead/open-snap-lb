/**
 * Prueba de la mudanza de nombre con el código.
 *
 *   npm run test:rename
 *
 * No necesita `npm run dev`: la ruta solo resuelve el token y baja el ladder, y
 * todo lo demás vive en `lib/rename.ts`. Probando la función directo se le puede
 * pasar un ladder INVENTADO — contra la ruta real habría que mudar una ficha de
 * prueba a la fila de un jugador de verdad, que es justo lo que no hay que
 * hacer contra la base viva.
 *
 * Siembra sus propios datos, con nombres que no existen en el ladder, y los
 * borra al final. La alianza de prueba va `rejected` para que no aparezca en el
 * selector público ni un segundo.
 */
import { getClient } from "../lib/mongodb";
import {
  alliancesCollection,
  playersCollection,
  snapshotsCollection,
  submissionsCollection,
} from "../lib/db";
import { movePlayer, renamePlayer, resolveRename } from "../lib/rename";
import { generateStatusToken } from "../lib/tokens";
import { toNameKey } from "../lib/names";
import type { LeaderboardRow } from "../lib/types";

const OLD = "RenameTestViejo";
const NEW = "RenameTestNuevo";
const OTHER = "RenameTestOtro";
const WANTED = "RenameTestPedido";
const TWIN = "RenameTestGemelo";
const TAG = "ZQRN";
const ALLIANCE_NAME = "Rename Test (prueba)";

const oldKey = toNameKey(OLD);
const newKey = toNameKey(NEW);
const otherKey = toNameKey(OTHER);
const wantedKey = toNameKey(WANTED);
const twinKey = toNameKey(TWIN);
const ALL_KEYS = [oldKey, newKey, otherKey, wantedKey, twinKey];

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

function row(rank: number, playerName: string, score = 10_000 - rank): LeaderboardRow {
  return { rank, playerName, nameKey: toNameKey(playerName), score };
}

async function cleanup() {
  const [players, submissions, alliances, snapshots] = await Promise.all([
    playersCollection(),
    submissionsCollection(),
    alliancesCollection(),
    snapshotsCollection(),
  ]);
  await players.deleteMany({ nameKey: { $in: ALL_KEYS } });
  await submissions.deleteMany({ nameKey: { $in: ALL_KEYS } });
  await snapshots.deleteMany({ nameKey: { $in: ALL_KEYS } });
  // Por nombre además de por tag: si algún día existe una ZQRN de verdad, el
  // insert de abajo choca y esto no se la lleva puesta.
  await alliances.deleteMany({ tag: TAG, name: ALLIANCE_NAME });
}

function reglas() {
  console.log("\nreglas del ladder (sin base)\n");

  const from = { nameKey: oldKey, playerName: OLD };
  const ladder = [row(1, "Alguien"), row(2, NEW), row(3, TWIN), row(40, TWIN)];

  let r = resolveRename(ladder, from, { playerName: NEW });
  check("nombre viejo ausente y nuevo presente: se puede", r.ok && r.row.rank === 2, r);

  r = resolveRename(ladder, from, { playerName: `  ${NEW.toUpperCase()}  ` });
  check("perdona mayúsculas y espacios del nombre nuevo", r.ok && r.row.playerName === NEW, r);

  r = resolveRename([...ladder, row(9, OLD)], from, { playerName: NEW });
  check("si el nombre viejo sigue en el ladder, no se mueve", !r.ok && r.status === 409, r);
  check(
    "y dice en qué puesto sigue",
    !r.ok && r.error.includes(OLD) && r.error.includes("#9"),
    r
  );

  r = resolveRename(ladder, from, { playerName: "NoEstoyEnLaTabla" });
  check("el nombre nuevo tiene que estar en el ladder", !r.ok && r.status === 404, r);

  r = resolveRename([], from, { playerName: NEW });
  check("con el ladder vacío no se mueve a ningún lado", !r.ok && r.status === 404, r);

  r = resolveRename(ladder, from, { playerName: OLD.toLowerCase() });
  check("mismo nameKey no es una mudanza", !r.ok && r.status === 400, r);

  r = resolveRename(ladder, from, { playerName: "x".repeat(21) });
  check("rechaza un nombre más largo que lo que permite el juego", !r.ok && r.status === 400, r);

  r = resolveRename(ladder, from, { playerName: TWIN });
  check("nombre repetido sin puesto: no adivina", !r.ok && r.status === 409, r);

  r = resolveRename(ladder, from, { playerName: TWIN, rank: 40 });
  check("nombre repetido con puesto: elige esa fila", r.ok && r.row.rank === 40, r);

  r = resolveRename(ladder, from, { playerName: TWIN, rank: 38 });
  check("y aguanta que la fila se haya corrido un par de puestos", r.ok && r.row.rank === 40, r);
}

async function mudanza() {
  console.log("\nla mudanza (contra la base)\n");

  const [players, submissions, alliances, snapshots] = await Promise.all([
    playersCollection(),
    submissionsCollection(),
    alliancesCollection(),
    snapshotsCollection(),
  ]);
  const now = new Date();
  const token = generateStatusToken();
  const token2 = generateStatusToken();
  const overlayKey = "RENAMETESTKEY234";

  // Una ficha aprobada con todo lo que tiene que viajar.
  await players.insertOne({
    nameKey: oldKey,
    playerName: OLD,
    patchedName: "Viejo Patcheado",
    twitch: "renametest_tw",
    alliance: TAG,
    allianceName: ALLIANCE_NAME,
    verified: true,
    verifiedAt: now,
    overlayKey,
    lastRank: 700,
    lastScore: 9100,
    peakRank: 12,
    peakScore: 12345,
    createdAt: now,
    updatedAt: now,
  });

  const approved = {
    nameKey: oldKey,
    playerName: OLD,
    twitch: "renametest_tw",
    discord: "renametest",
    status: "approved" as const,
    reviewedAt: now,
    reviewedBy: "test",
    createdAt: now,
    updatedAt: now,
  };
  // Dos aprobadas del mismo nombre: las dos son llaves de esta ficha.
  await submissions.insertMany([
    { ...approved, statusToken: token },
    { ...approved, statusToken: token2 },
  ]);

  await alliances.insertOne({
    tag: TAG,
    name: ALLIANCE_NAME,
    leaderNameKey: oldKey,
    bannedNameKeys: ["otro-expulsado", oldKey],
    status: "rejected",
    createdAt: now,
    updatedAt: now,
  });

  await snapshots.insertMany([
    { nameKey: oldKey, playerName: OLD, timestamp: new Date(now.getTime() - 7200e3), rank: 701, score: 9000, season: "2026-09", syncId: "rename-test-1" },
    { nameKey: oldKey, playerName: OLD, timestamp: new Date(now.getTime() - 3600e3), rank: 700, score: 9100, season: "2026-09", syncId: "rename-test-2" },
  ]);

  // Otra cuenta ya vinculada, y un nombre con una petición pendiente de otro.
  await players.insertOne({
    nameKey: otherKey,
    playerName: OTHER,
    twitch: "renametest_otro",
    verified: true,
    verifiedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await submissions.insertOne({
    statusToken: generateStatusToken(),
    nameKey: wantedKey,
    playerName: WANTED,
    twitch: "renametest_pedido",
    discord: "otro",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  const ladder = [row(5, OTHER), row(8, WANTED), row(30, TWIN), row(31, NEW), row(90, TWIN)];
  const from = { nameKey: oldKey, playerName: OLD };

  // --- lo que NO deja ---
  let r = await renamePlayer(from, ladder, { playerName: OTHER });
  check("no pisa la ficha de otra cuenta", !r.ok && r.status === 409, r);

  r = await renamePlayer(from, ladder, { playerName: WANTED });
  check("no se muda a un nombre con una petición pendiente", !r.ok && r.status === 409, r);

  // Directo a `movePlayer`, salteando la consulta previa: es lo que pasa si
  // alguien aprueba ese nombre justo entre la consulta y la escritura.
  const gate = await movePlayer(from, row(5, OTHER));
  check("y si la consulta previa no lo ve, lo frena el índice único", gate === "taken", gate);

  let player = await players.findOne({ nameKey: oldKey });
  check("después de los tres rechazos la ficha sigue donde estaba", player?.overlayKey === overlayKey, player);
  check(
    "y el código sigue apuntando al nombre viejo",
    (await submissions.findOne({ statusToken: token }))?.nameKey === oldKey
  );

  // --- el camino feliz ---
  r = await renamePlayer(from, ladder, { playerName: NEW });
  check("se muda a un nombre libre que está en el ladder", r.ok, r);

  check("no queda ficha con el nombre viejo", (await players.findOne({ nameKey: oldKey })) === null);

  player = await players.findOne({ nameKey: newKey });
  check("la ficha quedó con el nombre nuevo", player?.playerName === NEW, player?.playerName);
  check("conserva el canal y la alianza", player?.twitch === "renametest_tw" && player?.alliance === TAG, player);
  check("conserva la llave del overlay: la URL de OBS no cambia", player?.overlayKey === overlayKey, player?.overlayKey);
  check("conserva los picos", player?.peakRank === 12 && player?.peakScore === 12345, player);
  check("el puesto es el de la fila nueva", player?.lastRank === 31, player?.lastRank);
  check("`lastScore` no se tocó: es del sync", player?.lastScore === 9100, player?.lastScore);
  check("se fue el nombre patcheado, que era del viejo", player?.patchedName === undefined, player?.patchedName);

  const subs = await submissions.find({ statusToken: { $in: [token, token2] } }).toArray();
  check(
    "las DOS aprobadas apuntan al nombre nuevo",
    subs.length === 2 && subs.every((s) => s.nameKey === newKey && s.playerName === NEW),
    subs.map((s) => s.nameKey)
  );
  check(
    "quedó el rastro de la mudanza",
    subs.every((s) => s.renamedFrom === OLD && !!s.renamedAt && s.renameCount === 1),
    subs.map((s) => [s.renamedFrom, s.renameCount])
  );
  check("el contacto sigue intacto", subs.every((s) => s.discord === "renametest"));
  check("siguen aprobadas", subs.every((s) => s.status === "approved"));

  const alliance = await alliances.findOne({ tag: TAG });
  check("el liderazgo viajó con la ficha", alliance?.leaderNameKey === newKey, alliance?.leaderNameKey);
  check(
    "el veto también, y el nombre que quedó libre no lo hereda",
    !!alliance?.bannedNameKeys.includes(newKey) && !alliance.bannedNameKeys.includes(oldKey),
    alliance?.bannedNameKeys
  );
  check("los otros expulsados no se tocaron", !!alliance?.bannedNameKeys.includes("otro-expulsado"));

  check("no quedan snapshots con el nombre viejo", (await snapshots.countDocuments({ nameKey: oldKey })) === 0);
  const moved = await snapshots.find({ nameKey: newKey }).toArray();
  check("el historial horario viajó entero", moved.length === 2, moved.length);
  check("cada punto conserva el nombre que tenía", moved.every((s) => s.playerName === OLD));

  // --- no se repite ---
  r = await renamePlayer(from, ladder, { playerName: TWIN, rank: 30 });
  check("el nombre viejo ya no tiene ficha que mover", !r.ok && r.status === 409, r);

  // --- segunda mudanza, a un homónimo, con historial ya ocupando el destino ---
  await snapshots.insertOne({
    nameKey: twinKey, playerName: TWIN, timestamp: now, rank: 90, score: 5000, season: "2026-10", syncId: "rename-test-2",
  });
  const ladder2 = [row(30, TWIN), row(90, TWIN)];
  r = await renamePlayer({ nameKey: newKey, playerName: NEW }, ladder2, { playerName: TWIN, rank: 90 });
  check("se muda a un nombre repetido si dice a qué fila", r.ok && r.row.rank === 90, r);

  player = await players.findOne({ nameKey: twinKey });
  check("y el puesto elegido queda como semilla para desempatar", player?.lastRank === 90, player?.lastRank);
  check(
    "el destino ya tenía historial: el viejo no se mezcla, y la mudanza no se cae",
    (await snapshots.countDocuments({ nameKey: newKey })) === 2 &&
      (await snapshots.countDocuments({ nameKey: twinKey })) === 1
  );

  const sub = await submissions.findOne({ statusToken: token });
  check(
    "el rastro guarda el nombre inmediatamente anterior y cuenta dos",
    sub?.renamedFrom === NEW && sub?.renameCount === 2,
    [sub?.renamedFrom, sub?.renameCount]
  );
}

async function main() {
  reglas();

  await cleanup();
  await mudanza();
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
