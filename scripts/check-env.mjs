/**
 * Validación de entorno, ANTES del build. Avisa fuerte pero NUNCA aborta.
 *
 * El equilibrio buscado es: enterarte de la mala configuración en el momento
 * del deploy, sin que una variable faltante tumbe el build entero — que se
 * llevaría puestas hasta las páginas estáticas que no tocan la base.
 *
 * Corre solo, sin tsx ni dependencias: npm dispara `prebuild` antes de `build`,
 * y Vercel ejecuta `npm run build`.
 */

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";

const problems = [];

function fatalish(msg, hint) {
  problems.push({ level: "falta", msg, hint });
}
function warn(msg, hint) {
  problems.push({ level: "revisar", msg, hint });
}

const uri = process.env.MONGODB_URI;
const secret = process.env.CRON_SECRET;

/**
 * En local la seed-list es la forma CORRECTA (es el workaround del DNS que no
 * resuelve SRV), así que avisar en cada build sería puro ruido. Solo importa
 * cuando estamos compilando de verdad para desplegar.
 */
const deploying = Boolean(process.env.VERCEL);

// --- MONGODB_URI ---
if (!uri) {
  fatalish(
    "MONGODB_URI no está definida.",
    "El sitio va a levantar igual, pero sin links, alianzas ni Δ 24 h. Vercel: Settings → Environment Variables."
  );
} else if (!uri.startsWith("mongodb+srv://") && !uri.startsWith("mongodb://")) {
  warn("MONGODB_URI no parece una connection string de MongoDB.");
} else if (deploying && uri.startsWith("mongodb://") && uri.includes(",")) {
  // La seed-list hardcodea los hostnames de los shards: se rompe sola cuando
  // Atlas los rota. En local se tolera; desplegada es una bomba de tiempo.
  warn(
    "MONGODB_URI está en forma seed-list, no mongodb+srv://.",
    "Fija los hosts del shard y se rompe cuando Atlas los rota. En producción usá la forma SRV."
  );
}

// --- CRON_SECRET ---
if (!secret) {
  fatalish(
    "CRON_SECRET no está definida.",
    "/api/cron/sync va a devolver 503 y el historial no se va a guardar nunca."
  );
} else if (/^cambiame/i.test(secret)) {
  problems.push({
    level: "GRAVE",
    msg: "CRON_SECRET todavía es el placeholder de .env.example.",
    hint: "Ese valor es público en el repo. Generá uno real: openssl rand -hex 32",
  });
} else if (secret.length < 24) {
  warn(
    `CRON_SECRET tiene solo ${secret.length} caracteres.`,
    "Es el único candado de la ruta de sync. Usá 32 bytes: openssl rand -hex 32"
  );
}

if (problems.length === 0) {
  console.log(`${DIM}[check-env] Variables de entorno OK.${RESET}`);
  process.exit(0);
}

const line = "─".repeat(72);
console.log(`\n${YELLOW}${line}${RESET}`);
console.log(`${YELLOW}  Revisá la configuración antes de dar este deploy por bueno${RESET}`);
console.log(`${YELLOW}${line}${RESET}`);

for (const p of problems) {
  const color = p.level === "GRAVE" ? RED : YELLOW;
  console.log(`\n  ${color}[${p.level}]${RESET} ${p.msg}`);
  if (p.hint) console.log(`          ${DIM}${p.hint}${RESET}`);
}

console.log(`\n${DIM}  El build continúa: una variable faltante no debería tumbar el sitio`);
console.log(`  entero, incluidas las páginas que no usan la base.${RESET}`);
console.log(`${YELLOW}${line}${RESET}\n`);

// Siempre 0, a propósito.
process.exit(0);
