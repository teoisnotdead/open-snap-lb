/** Test de la lógica de verificación. El foco está en el anti-secuestro. */
import {
  generateCode,
  checkClaim,
  findSquatConflict,
  generateStatusToken,
  formatStatusToken,
  parseStatusToken,
  STATUS_TOKEN_LENGTH,
  stripCode,
  buildInstructions,
  CODE_LENGTH,
  ALPHABET,
} from "../lib/verification";
import { toNameKey } from "../lib/names";

const ok: string[] = [];
const bad: string[] = [];
const c = (label: string, got: unknown, want: unknown) =>
  (JSON.stringify(got) === JSON.stringify(want) ? ok : bad).push(
    `${label} -> ${JSON.stringify(got)}`
  );

// --- generación ---
const codes = Array.from({ length: 2000 }, generateCode);
c("largo del código", codes.every((x) => x.length === CODE_LENGTH), true);
c("alfabeto sin caracteres ambiguos (0/1/I/L/O/U)",
  codes.every((x) => !/[01ILOU]/.test(x)), true);
c("todo carácter generado pertenece al alfabeto",
  codes.every((x) => [...x].every((ch) => ALPHABET.includes(ch))), true);
// NO se testea unicidad global: con 30^5 y 2000 muestras la paradoja del
// cumpleaños predice ~0.08 colisiones esperadas, así que exigir 2000 únicos es
// un test flaky. La unicidad no es una garantía del generador — el código es de
// un solo uso, con vencimiento y validado contra el nombre reclamado.
c("colisiones dentro de lo estadísticamente esperable", new Set(codes).size >= 1990, true);
c("el generador usa todo el alfabeto",
  new Set(codes.join("")).size, ALPHABET.length);

// --- caso feliz ---
const CODE = "K7M2Q";
c("acepta nombre + código", checkClaim("Sizer K7M2Q", CODE, toNameKey("Sizer")).ok, true);
c("acepta código adelante", checkClaim("K7M2Q Sizer", CODE, toNameKey("Sizer")).ok, true);
c("acepta sin espacio", checkClaim("SizerK7M2Q", CODE, toNameKey("Sizer")).ok, true);
c("acepta código en minúscula", checkClaim("Sizer k7m2q", CODE, toNameKey("Sizer")).ok, true);

// --- truncamiento: nombre de 20 chars que hay que recortar ---
c("acepta nombre recortado por el límite de 20",
  checkClaim("Nishijima Enj K7M2Q", CODE, toNameKey("Nishijima Enjoyer XY")).ok, true);

// --- EL ATAQUE ---
// El atacante pide un código para "Sizer" y lo pega en SU propia cuenta.
c("RECHAZA secuestro: código en la cuenta del atacante",
  checkClaim("Atacante K7M2Q", CODE, toNameKey("Sizer")).ok, false);
c("RECHAZA secuestro aunque el nombre sea parecido",
  checkClaim("Sizer2 K7M2Q", CODE, toNameKey("Sizer")).ok, false);
c("RECHAZA cuenta que es solo el código",
  checkClaim("K7M2Q", CODE, toNameKey("Sizer")).ok, false);
c("RECHAZA resto demasiado corto para identificar",
  checkClaim("X K7M2Q", CODE, toNameKey("Sizer")).ok, false);

// Un nombre que es prefijo de otro NO debe poder reclamar al más largo...
c("permite reclamar el nombre largo desde el recortado (truncamiento legítimo)",
  checkClaim("Sizer K7M2Q", CODE, toNameKey("Sizer Pro")).ok, true);
// ...pero al revés no: el nombre completo no puede reclamar un prefijo ajeno.
c("RECHAZA reclamar un nombre más corto que el encontrado",
  checkClaim("Sizer Pro K7M2Q", CODE, toNameKey("Sizer")).ok, false);

// --- unicode y rarezas reales del ladder ---
c("funciona con nombre coreano", checkClaim("아이엠어닥터 K7M2Q", CODE, toNameKey("아이엠어닥터")).ok, true);
c("tolera espacios de más al recortar", stripCode("Sizer  K7M2Q  ", CODE), "sizer");

// --- ocupación de nombre ---
// El ladder trae una fila por cuenta, así que el nombre pelado y el nombre con
// código NO pueden ser la misma persona coexistiendo.
const row = (playerName: string) => ({ playerName, nameKey: toNameKey(playerName) });

c("deja pasar al dueño que se renombró (no queda fila pelada)",
  findSquatConflict([row("730 K7M2Q"), row("Sizer")], toNameKey("730")), null);

c("BLOQUEA al ocupante: el nombre pelado sigue en el ladder",
  findSquatConflict([row("730"), row("730 K7M2Q")], toNameKey("730"))?.playerName, "730");

c("bloquea aunque el ocupante aparezca primero",
  findSquatConflict([row("730 K7M2Q"), row("730")], toNameKey("730"))?.playerName, "730");

// Hace match pese a que el texto crudo trae mayúsculas y espacios de sobra.
c("compara por nameKey, no por texto crudo",
  findSquatConflict([row("  SiZeR  ")], toNameKey("sizer"))?.nameKey, "sizer");

c("un nombre que solo contiene al reclamado no es conflicto",
  findSquatConflict([row("730 Pro"), row("Not730")], toNameKey("730")), null);

c("ladder vacío no es conflicto", findSquatConflict([], toNameKey("730")), null);

// --- token de consulta ---
const tokens = Array.from({ length: 500 }, generateStatusToken);

c("largo del token", tokens.every((x) => x.length === STATUS_TOKEN_LENGTH), true);
c("token usa el mismo alfabeto sin ambiguos",
  tokens.every((x) => [...x].every((ch) => ALPHABET.includes(ch))), true);

/**
 * Con 30^12 la probabilidad de una colisión en 500 muestras es ~1e-13. Acá sí
 * se puede exigir unicidad estricta, a diferencia del código de verificación
 * (30^5), donde hacerlo daba un test flaky.
 */
c("500 tokens son todos distintos", new Set(tokens).size, 500);

/**
 * El token de consulta NO puede ser el código de verificación: ese va en el
 * nombre del perfil, o sea que se publica en el leaderboard.
 */
c("el token es mucho más largo que el código de verificación",
  STATUS_TOKEN_LENGTH > CODE_LENGTH * 2, true);

c("formato en grupos de 4", formatStatusToken("K7M2QW9X4RTF"), "K7M2-QW9X-4RTF");

c("acepta el token tal cual", parseStatusToken("K7M2QW9X4RTF"), "K7M2QW9X4RTF");
c("acepta con guiones", parseStatusToken("K7M2-QW9X-4RTF"), "K7M2QW9X4RTF");
c("acepta en minúscula", parseStatusToken("k7m2qw9x4rtf"), "K7M2QW9X4RTF");
c("acepta con espacios de copiar y pegar",
  parseStatusToken("  K7M2 QW9X 4RTF  "), "K7M2QW9X4RTF");
c("el ida y vuelta formato/parseo se conserva",
  parseStatusToken(formatStatusToken(tokens[0])), tokens[0]);

c("RECHAZA token corto", parseStatusToken("K7M2QW9X"), null);
c("RECHAZA token largo", parseStatusToken("K7M2QW9X4RTFX"), null);
c("RECHAZA caracteres fuera del alfabeto", parseStatusToken("K7M2QW9X4RT0"), null);
c("RECHAZA vacío", parseStatusToken(""), null);
// Un ObjectId de Mongo no debe pasar por token: es la llave vieja.
c("RECHAZA un ObjectId", parseStatusToken("6a8c87b91ed4229a0382f006"), null);

// --- instrucciones ---
const short = buildInstructions("Sizer", CODE);
c("nombre corto no necesita recorte", short.charsToTrim, 0);
c("sugerencia para nombre corto", short.suggestedName, "Sizer K7M2Q");

const long = buildInstructions("Nishijima Enjoyer XY", CODE); // 20 chars
c("nombre al límite necesita recortar 6", long.charsToTrim, 6);
c("la sugerencia entra en 20 chars", long.suggestedName.length <= 20, true);
c("la sugerencia contiene el código", long.suggestedName.includes(CODE), true);
c("la sugerencia sigue siendo verificable",
  checkClaim(long.suggestedName, CODE, toNameKey("Nishijima Enjoyer XY")).ok, true);

ok.forEach((t) => console.log("  [ok] " + t));
bad.forEach((t) => console.log("  [XX] " + t));
console.log(`\n${ok.length}/${ok.length + bad.length}`);
process.exit(bad.length ? 1 : 0);
