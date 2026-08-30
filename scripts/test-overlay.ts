/**
 * Test de la ventana del overlay de stream.
 *
 * Todo lo que puede salir mal acá son los bordes: el #1 no tiene a nadie
 * arriba, el último no tiene a nadie abajo, y un nombre repetido puede hacer
 * que el overlay le muestre a alguien la fila de su homónimo. Nada de eso se
 * ve en desarrollo —el jugador de prueba está siempre en el medio del ladder—
 * así que va cubierto acá.
 */
import {
  windowAround,
  clampRows,
  overlayHeight,
  OVERLAY_WIDTH,
  DEFAULT_ROWS,
  MIN_ROWS,
  MAX_ROWS,
} from "../lib/overlay";
import type { MergedLeaderboardRow } from "../lib/types";

const ok: string[] = [];
const bad: string[] = [];
const c = (label: string, got: unknown, want: unknown) =>
  (JSON.stringify(got) === JSON.stringify(want) ? ok : bad).push(
    `${label} -> ${JSON.stringify(got)}`
  );

/** Un ladder sintético de 1000 filas: el jugador N se llama "p<N>" y tiene 10000-N SP. */
const ladder: MergedLeaderboardRow[] = Array.from({ length: 1000 }, (_, i) => ({
  rank: i + 1,
  playerName: `p${i + 1}`,
  nameKey: `p${i + 1}`,
  score: 10000 - i,
  displayName: `p${i + 1}`,
  verified: false,
  ambiguous: false,
})) as MergedLeaderboardRow[];

const ranks = (nameKey: string, size?: number, pinned?: number) =>
  windowAround(ladder, nameKey, size, pinned)?.rows.map((r) => r.rank);

// --- el caso normal: centrado ---
c("en el medio quedan 2 arriba y 2 abajo", ranks("p284"), [282, 283, 284, 285, 286]);

// --- bordes de arriba ---
c("el #1 muestra 4 hacia abajo", ranks("p1"), [1, 2, 3, 4, 5]);
c("el #2 muestra 1 arriba y 3 abajo", ranks("p2"), [1, 2, 3, 4, 5]);
c("el #3 ya entra centrado", ranks("p3"), [1, 2, 3, 4, 5]);
c("el #4 se despega del borde", ranks("p4"), [2, 3, 4, 5, 6]);

// --- bordes de abajo ---
c("el #1000 muestra 4 hacia arriba", ranks("p1000"), [996, 997, 998, 999, 1000]);
c("el #999 muestra 3 arriba y 1 abajo", ranks("p999"), [996, 997, 998, 999, 1000]);
c("el #997 se despega del borde", ranks("p997"), [995, 996, 997, 998, 999]);

// --- la ventana NO cambia de alto ---
c(
  "todos los puestos dan exactamente 5 filas",
  ladder.every((r) => ranks(r.nameKey)?.length === DEFAULT_ROWS),
  true
);

// --- tamaños distintos ---
c("con 3 filas queda 1 arriba y 1 abajo", ranks("p50", 3), [49, 50, 51]);
c("con 7 filas quedan 3 y 3", ranks("p50", 7), [47, 48, 49, 50, 51, 52, 53]);
c("con 7 filas el #1 no se sale por arriba", ranks("p1", 7), [1, 2, 3, 4, 5, 6, 7]);

// --- ladder más corto que la ventana ---
const corto = ladder.slice(0, 3);
c(
  "si el ladder tiene menos filas que la ventana, se devuelven todas",
  windowAround(corto, "p2")?.rows.map((r) => r.rank),
  [1, 2, 3]
);

// --- nombres repetidos ---
const conHomonimo = ladder.map((r, i) =>
  i === 36 || i === 500 ? { ...r, nameKey: "leaf", ambiguous: true } : r
);
c(
  "sin puesto fijado se elige la primera fila y se marca ambiguo",
  windowAround(conHomonimo, "leaf")?.selfRank,
  37
);
c("y avisa que es ambiguo", windowAround(conHomonimo, "leaf")?.ambiguous, true);
c(
  "con el puesto fijado se elige la fila correcta",
  windowAround(conHomonimo, "leaf", DEFAULT_ROWS, 501)?.selfRank,
  501
);
c(
  "y deja de ser ambiguo porque ya no hay duda",
  windowAround(conHomonimo, "leaf", DEFAULT_ROWS, 501)?.ambiguous,
  false
);
c(
  "un puesto fijado que no existe cae en la primera fila, no rompe",
  windowAround(conHomonimo, "leaf", DEFAULT_ROWS, 999)?.selfRank,
  37
);
/**
 * El caso real que motivó esto: el streamer pegó la URL con su puesto de ayer
 * y hoy está en otro. Cae a la primera fila —que puede no ser la suya— así que
 * el aviso tiene que seguir encendido. Antes se apagaba con solo PASAR el
 * parámetro, lo mirara o no.
 */
c(
  "un puesto fijado que no existe SIGUE siendo ambiguo",
  windowAround(conHomonimo, "leaf", DEFAULT_ROWS, 999)?.ambiguous,
  true
);
c(
  "un puesto fijado en un nombre NO repetido no inventa ambigüedad",
  windowAround(ladder, "p50", DEFAULT_ROWS, 999)?.ambiguous,
  false
);

// --- ausentes ---
c("un jugador fuera del ladder no devuelve ventana", windowAround(ladder, "nadie"), null);
c("un ladder vacío no devuelve ventana", windowAround([], "p1"), null);

// --- clampRows ---
c("sin parámetro usa el default", clampRows(null), DEFAULT_ROWS);
c("un texto que no es número usa el default", clampRows("muchas"), DEFAULT_ROWS);
c("un decimal usa el default", clampRows("5.5"), DEFAULT_ROWS);
c("recorta por abajo", clampRows("1"), MIN_ROWS);
c("recorta por arriba", clampRows("99"), MAX_ROWS);
c("un valor válido pasa tal cual", clampRows("7"), 7);

// --- medidas para OBS ---
/**
 * Los valores de la derecha están MEDIDOS en el navegador, no calculados: se
 * leyó `.ov-card` con distintas cantidades de filas. Están acá porque la ficha
 * le dice el tamaño al streamer y OBS no perdona — si el alto queda corto,
 * recorta la última fila y nadie se entera hasta que alguien lo ve al aire.
 *
 * Si alguien toca el padding de `.ov-row` en overlay.css, este test cae. Esa
 * es exactamente su razón de existir: la constante vive en TS y el estilo en
 * CSS, así que nada más los mantiene atados.
 */
c("ancho de la tarjeta", OVERLAY_WIDTH, 340);
c("alto con 3 filas", overlayHeight(3), 109);
c("alto con 5 filas (default)", overlayHeight(DEFAULT_ROWS), 181);
c("alto con 7 filas", overlayHeight(7), 253);
c("alto con 11 filas (el máximo)", overlayHeight(MAX_ROWS), 397);

ok.forEach((t) => console.log("  [ok] " + t));
bad.forEach((t) => console.log("  [XX] " + t));
console.log(`\n${ok.length}/${ok.length + bad.length}`);
process.exit(bad.length ? 1 : 0);
