/**
 * Test del token de seguimiento.
 *
 * Era `test-verification.ts` y cubría además el código que el jugador pegaba en
 * su nombre de perfil, con todo el anti-secuestro que eso necesitaba. Ese flujo
 * ya no existe —verifica el admin al aprobar— y con él se fueron esos casos.
 * Lo que queda es la llave con la que alguien vuelve a consultar su petición.
 */
import {
  generateStatusToken,
  formatStatusToken,
  parseStatusToken,
  STATUS_TOKEN_LENGTH,
  ALPHABET,
} from "../lib/tokens";

const ok: string[] = [];
const bad: string[] = [];
const c = (label: string, got: unknown, want: unknown) =>
  (JSON.stringify(got) === JSON.stringify(want) ? ok : bad).push(
    `${label} -> ${JSON.stringify(got)}`
  );

// --- generación ---
const tokens = Array.from({ length: 500 }, generateStatusToken);

c("largo del token", tokens.every((x) => x.length === STATUS_TOKEN_LENGTH), true);
c(
  "alfabeto sin caracteres ambiguos (0/1/I/L/O/U)",
  tokens.every((x) => !/[01ILOU]/.test(x)),
  true
);
c(
  "todo carácter generado pertenece al alfabeto",
  tokens.every((x) => [...x].every((ch) => ALPHABET.includes(ch))),
  true
);
c("el generador usa todo el alfabeto", new Set(tokens.join("")).size, ALPHABET.length);

/**
 * Con 30^12 la probabilidad de una colisión en 500 muestras es ~1e-13, así que
 * acá sí se puede exigir unicidad estricta sin que el test quede flaky.
 */
c("500 tokens son todos distintos", new Set(tokens).size, 500);

/**
 * El token es la ÚNICA llave con la que el público toca una petición, así que
 * tiene que ser largo de verdad: adivinarlo no puede ser una estrategia.
 */
c("el token es largo como para no adivinarse", STATUS_TOKEN_LENGTH >= 12, true);

// --- formato y parseo ---
c("formato en grupos de 4", formatStatusToken("K7M2QW9X4RTF"), "K7M2-QW9X-4RTF");

c("acepta el token tal cual", parseStatusToken("K7M2QW9X4RTF"), "K7M2QW9X4RTF");
c("acepta con guiones", parseStatusToken("K7M2-QW9X-4RTF"), "K7M2QW9X4RTF");
c("acepta en minúscula", parseStatusToken("k7m2qw9x4rtf"), "K7M2QW9X4RTF");
c(
  "acepta con espacios de copiar y pegar",
  parseStatusToken("  K7M2 QW9X 4RTF  "),
  "K7M2QW9X4RTF"
);
c(
  "el ida y vuelta formato/parseo se conserva",
  parseStatusToken(formatStatusToken(tokens[0])),
  tokens[0]
);

c("RECHAZA token corto", parseStatusToken("K7M2QW9X"), null);
c("RECHAZA token largo", parseStatusToken("K7M2QW9X4RTFX"), null);
c("RECHAZA caracteres fuera del alfabeto", parseStatusToken("K7M2QW9X4RT0"), null);
c("RECHAZA vacío", parseStatusToken(""), null);
// Un ObjectId de Mongo no debe pasar por token: es la llave vieja.
c("RECHAZA un ObjectId", parseStatusToken("6a8c87b91ed4229a0382f006"), null);

ok.forEach((t) => console.log("  [ok] " + t));
bad.forEach((t) => console.log("  [XX] " + t));
console.log(`\n${ok.length}/${ok.length + bad.length}`);
process.exit(bad.length ? 1 : 0);
