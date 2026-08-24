/**
 * Test de la autenticación del panel.
 *
 * El foco está en lo que rompe una sesión firmada: token manipulado, firma de
 * otro secreto, vencimiento, y que sin configuración quede cerrado.
 */
import { createHmac } from "node:crypto";
import {
  hashPassword,
  verifyPassword,
  login,
  verifySessionToken,
  isAdminConfigured,
} from "../lib/admin-auth";

const ok: string[] = [];
const bad: string[] = [];
const c = (label: string, got: unknown, want: unknown) =>
  (JSON.stringify(got) === JSON.stringify(want) ? ok : bad).push(
    `${label} -> ${JSON.stringify(got)}`
  );

// --- hash de contraseña ---
const PASSWORD = "una clave razonablemente larga";
const hash = hashPassword(PASSWORD);

c("el hash tiene el formato esperado", /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/.test(hash), true);

/**
 * Sin `$` en ninguna parte. Next.js expande variables al leer `.env`, así que un
 * `$` en el hash lo mutila en silencio: el login falla con "clave incorrecta" y
 * nada indica que el problema es el formato. Este test es el que evita que
 * alguien "arregle" el separador volviendo al clásico `scrypt$salt$hash`.
 */
c("el hash NO contiene $ (dotenv-expand lo rompería)", hash.includes("$"), false);
c("la clave original NO aparece en el hash", hash.includes(PASSWORD), false);
c("acepta la clave correcta", verifyPassword(PASSWORD, hash), true);
c("RECHAZA la clave incorrecta", verifyPassword("otra clave cualquiera", hash), false);
c("RECHAZA clave vacía", verifyPassword("", hash), false);
c("RECHAZA por un solo carácter", verifyPassword(PASSWORD + "x", hash), false);

// Dos hashes de la MISMA clave tienen que diferir: si no, falta el salt y una
// tabla precomputada las rompe todas de una.
c("dos hashes de la misma clave difieren (hay salt)", hashPassword(PASSWORD) === hash, false);

// --- hashes corruptos: nunca deben pasar ---
c("RECHAZA hash con formato basura", verifyPassword(PASSWORD, "basura"), false);
c("RECHAZA hash sin prefijo scrypt",
  verifyPassword(PASSWORD, hash.replace("scrypt:", "sha256:")), false);
c("RECHAZA hash truncado",
  verifyPassword(PASSWORD, hash.slice(0, hash.length - 10)), false);
c("RECHAZA hash vacío", verifyPassword(PASSWORD, ""), false);

/**
 * `readConfig()` lee `process.env` en cada llamada, no al cargar el módulo, así
 * que alcanza con setear las variables antes de usar las funciones. Eso es
 * además lo que hace que el panel tome un cambio de secreto sin redesplegar.
 */
process.env.ADMIN_USER = "teo";
process.env.ADMIN_PASSWORD_HASH = hash;
process.env.ADMIN_SESSION_SECRET = "secreto-de-test-solo-para-esta-corrida";

c("con env vars, el panel está configurado", isAdminConfigured(), true);

// --- login ---
const token = login("teo", PASSWORD);
c("login correcto devuelve token", typeof token === "string" && token.length > 0, true);
c("RECHAZA usuario incorrecto", login("otro", PASSWORD), null);
c("RECHAZA clave incorrecta", login("teo", "no es"), null);
c("RECHAZA usuario que es prefijo del real", login("te", PASSWORD), null);
c("RECHAZA usuario que extiende al real", login("teox", PASSWORD), null);

// --- verificación del token ---
const session = verifySessionToken(token!);
c("el token válido devuelve la sesión", session?.user, "teo");
c("la sesión tiene vencimiento futuro", (session?.expiresAt.getTime() ?? 0) > Date.now(), true);

c("RECHAZA token con la firma cambiada",
  verifySessionToken(token!.slice(0, -4) + "AAAA"), null);
c("RECHAZA token con el payload cambiado",
  verifySessionToken("x" + token!.slice(1)), null);
c("RECHAZA token sin firma", verifySessionToken(token!.split(".")[0]), null);
c("RECHAZA token vacío", verifySessionToken(""), null);
c("RECHAZA basura", verifySessionToken("no.es.un.token"), null);

// Payload válido y bien formado, pero firmado con OTRO secreto: es el caso que
// distingue "firmamos" de "verificamos la firma".
const forgedPayload = Buffer.from(
  JSON.stringify({ u: "teo", exp: Date.now() + 60_000 })
).toString("base64url");
const forged = `${forgedPayload}.${createHmac("sha256", "secreto-equivocado")
  .update(forgedPayload)
  .digest("base64url")}`;
c("RECHAZA token firmado con otro secreto", verifySessionToken(forged), null);

// Vencido, firmado con el secreto CORRECTO: la firma da bien y aun así debe caer.
const expiredPayload = Buffer.from(
  JSON.stringify({ u: "teo", exp: Date.now() - 1000 })
).toString("base64url");
const expired = `${expiredPayload}.${createHmac(
  "sha256",
  "secreto-de-test-solo-para-esta-corrida"
)
  .update(expiredPayload)
  .digest("base64url")}`;
c("RECHAZA token vencido aunque la firma sea válida", verifySessionToken(expired), null);

// Cambiar ADMIN_USER invalida las sesiones abiertas.
process.env.ADMIN_USER = "otro-admin";
c("cambiar ADMIN_USER invalida los tokens viejos", verifySessionToken(token!), null);
process.env.ADMIN_USER = "teo";

// --- sin configuración, CERRADO ---
delete process.env.ADMIN_PASSWORD_HASH;
c("sin ADMIN_PASSWORD_HASH no está configurado", isAdminConfigured(), false);
c("sin configuración, el login falla", login("teo", PASSWORD), null);
c("sin configuración, ningún token vale", verifySessionToken(token!), null);

ok.forEach((t) => console.log("  [ok] " + t));
bad.forEach((t) => console.log("  [XX] " + t));
console.log(`\n${ok.length}/${ok.length + bad.length}`);
process.exit(bad.length ? 1 : 0);
