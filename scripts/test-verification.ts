/** Test de la lógica de verificación. El foco está en el anti-secuestro. */
import {
  generateCode,
  checkClaim,
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
