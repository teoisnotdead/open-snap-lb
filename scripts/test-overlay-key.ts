/**
 * Test de la llave del overlay.
 *
 * La llave es lo único que separa la capa de un streamer de cualquiera que
 * pase: la URL era `/overlay/<nameKey>` y el nameKey se deriva del nombre
 * público, así que cualquiera podía armarla. Lo que se fija acá es que no se
 * vuelva a caer en eso — que el largo no se achique, que el parseo no acepte
 * basura, y sobre todo que los tres códigos del proyecto sigan teniendo largos
 * distintos entre sí.
 *
 * No toca Mongo: es todo texto puro. `generateOverlayKey` sí necesita
 * `node:crypto` y vive en `lib/players.ts`, que importa el driver — se importa
 * igual porque esto corre en Node, no en el navegador.
 */
import {
  OVERLAY_KEY_ALPHABET,
  OVERLAY_KEY_LENGTH,
  parseOverlayKey,
} from "../lib/overlay-key";
import { generateOverlayKey } from "../lib/players";
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from "../lib/join-code";
import { ALPHABET, STATUS_TOKEN_LENGTH } from "../lib/status-token";

const ok: string[] = [];
const bad: string[] = [];
const c = (label: string, got: unknown, want: unknown) =>
  (JSON.stringify(got) === JSON.stringify(want) ? ok : bad).push(
    `${label} -> ${JSON.stringify(got)}`
  );

// --- generación ---
const keys = Array.from({ length: 500 }, generateOverlayKey);

c("largo de la llave", keys.every((x) => x.length === OVERLAY_KEY_LENGTH), true);
c(
  "alfabeto sin caracteres ambiguos (0/1/I/L/O/U)",
  keys.every((x) => !/[01ILOU]/.test(x)),
  true
);
c(
  "todo carácter generado pertenece al alfabeto",
  keys.every((x) => [...x].every((ch) => OVERLAY_KEY_ALPHABET.includes(ch))),
  true
);
c(
  "el generador usa todo el alfabeto",
  new Set(keys.join("")).size,
  OVERLAY_KEY_ALPHABET.length
);
c("500 llaves son todas distintas", new Set(keys).size, 500);

/**
 * Lo que hace que la llave sirva de algo. Si alguien la achica "para que la
 * URL quede más corta", esto cae: con 30^16 ≈ 4.3e23 probar al azar no es una
 * estrategia, y ese número es la razón entera de que este campo exista.
 */
c("la llave no se achicó", OVERLAY_KEY_LENGTH >= 16, true);

/**
 * EL INVARIANTE IMPORTANTE. Los tres códigos circulan por el mismo Discord, y
 * con largos distintos uno pegado en el campo equivocado se rechaza por
 * estructura —sin ir a la base— y se le puede decir a la persona CUÁL de los
 * tres puso mal. Si dos se igualan, ese error pasa a ser un 404 genérico.
 */
c(
  "los tres largos siguen siendo distintos entre sí",
  new Set([OVERLAY_KEY_LENGTH, STATUS_TOKEN_LENGTH, JOIN_CODE_LENGTH]).size,
  3
);
c("el alfabeto no se separó del del statusToken", OVERLAY_KEY_ALPHABET === ALPHABET, true);
c("el alfabeto no se separó del del joinCode", OVERLAY_KEY_ALPHABET === JOIN_CODE_ALPHABET, true);

// --- parseo ---
c("acepta la llave tal cual", parseOverlayKey(keys[0]), keys[0]);
c(
  "acepta minúsculas: una URL pasa por manos que la escriben en minúscula",
  parseOverlayKey(keys[0].toLowerCase()),
  keys[0]
);
c("acepta espacios de sobra al pegar", parseOverlayKey(`  ${keys[0]}  `), keys[0]);

c("RECHAZA una llave corta", parseOverlayKey("K7M2QW9X4RTF"), null);
c("RECHAZA una llave larga", parseOverlayKey(keys[0] + "K"), null);
c("RECHAZA caracteres fuera del alfabeto", parseOverlayKey("K7M2QW9X4RTFVBN0"), null);
c("RECHAZA vacío", parseOverlayKey(""), null);

/**
 * Los dos casos que motivaron el cambio: la URL vieja llevaba el nameKey, así
 * que un nombre de jugador NO puede pasar por llave. Ni siquiera uno que por
 * casualidad tenga 16 caracteres.
 */
c("RECHAZA un nameKey cualquiera", parseOverlayKey("alfredo"), null);
c("RECHAZA un nameKey de 16 caracteres", parseOverlayKey("elmejorjugador12"), null);

/**
 * Un `statusToken` pegado donde va la llave se rechaza por largo, que es
 * exactamente para lo que sirve que los largos sean distintos.
 */
c("RECHAZA un statusToken", parseOverlayKey("K7M2QW9X4RTF"), null);
c("RECHAZA un joinCode", parseOverlayKey("K7M2QW9X"), null);

/* "rotate" es un segmento de ruta hermano de `[key]`. Next resuelve estático
   antes que dinámico, pero que además no parsee es la segunda red. */
c("RECHAZA la palabra rotate", parseOverlayKey("rotate"), null);

ok.forEach((t) => console.log("  [ok] " + t));
bad.forEach((t) => console.log("  [XX] " + t));
console.log(`\n${ok.length}/${ok.length + bad.length}`);
process.exit(bad.length ? 1 : 0);
