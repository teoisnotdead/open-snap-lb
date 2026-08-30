import { boardDailiesCollection, snapshotsCollection } from "./db";

/**
 * Un punto de la serie de un jugador, venga de donde venga.
 *
 * `daily` marca la procedencia y no es cosmético: los puntos horarios salen de
 * `snapshots` y solo existen para los vinculados, los diarios salen del archivo
 * del ladder entero. La ficha lo usa para no prometer resolución que no tiene.
 */
export interface HistoryRow {
  timestamp: Date;
  rank: number;
  score: number;
  season: string;
  daily: boolean;
}

/** Tope de puntos horarios, para que una serie larga no reviente la gráfica. */
const MAX_POINTS = 2000;

/**
 * La serie horaria de un jugador vinculado. Vacía para todos los demás: el
 * cron solo escribe `snapshots` de quien está en `players`.
 */
async function loadHourly(nameKey: string): Promise<HistoryRow[]> {
  const snapshots = await snapshotsCollection();
  const docs = await snapshots
    .find({ nameKey }, { projection: { _id: 0, timestamp: 1, rank: 1, score: 1, season: 1 } })
    .sort({ timestamp: 1 })
    .limit(MAX_POINTS)
    .toArray();

  return docs.map((d) => ({ ...d, daily: false }));
}

/**
 * La serie diaria, que existe para los 1000 hayan pedido su ficha o no.
 *
 * El filtrado va en una agregación y no en JS a propósito. Cada documento son
 * las 1000 filas del ladder (~35 KB): traerse un año entero para buscar una
 * fila serían ~13 MB por visita a una ficha. Con el `$filter` en el servidor,
 * Mongo lee lo mismo pero devuelve un puñado de bytes por día.
 *
 * `before` corta la serie donde arranca la horaria: un jugador que vinculó hoy
 * conserva la historia diaria de antes de vincular, y desde ahí en adelante
 * manda la fina. Sin el corte los dos tramos se pisarían en el solape.
 */
async function loadDaily(nameKey: string, before?: Date): Promise<HistoryRow[]> {
  const col = await boardDailiesCollection();

  const docs = await col
    .aggregate<{ timestamp: Date; rank: number; score: number; season: string }>([
      ...(before ? [{ $match: { timestamp: { $lt: before } } }] : []),
      { $sort: { timestamp: 1 } },

      /**
       * Se queda con las filas de ESTE jugador. Puede haber más de una: los
       * nombres repetidos son la razón de que `rows` guarde una entrada por
       * fila en vez de un mapa nameKey → score.
       */
      { $set: { hit: { $filter: { input: "$rows", as: "r", cond: { $eq: ["$$r.n", nameKey] } } } } },

      /**
       * Exactamente una, ni cero ni dos. Descarta de un saque los dos casos que
       * no sabemos atribuir: el día que el jugador no estaba en el top 1000, y
       * el día en que su nombre aparecía repetido. Mismo criterio que usa el
       * delta en `merge.ts` — preferimos el hueco antes que un número inventado.
       */
      { $match: { hit: { $size: 1 } } },

      {
        $project: {
          _id: 0,
          timestamp: 1,
          season: 1,
          score: { $arrayElemAt: ["$hit.s", 0] },
          // El orden de `rows` ES el rank, así que el puesto sale del índice.
          rank: { $add: [{ $indexOfArray: ["$rows.n", nameKey] }, 1] },
        },
      },
    ])
    .toArray();

  return docs.map((d) => ({ ...d, daily: true }));
}

/**
 * El historial completo de un jugador: diario donde es lo único que hay, y
 * horario desde que se vinculó.
 *
 * Nunca tira. Si Mongo no responde, la ficha se dibuja igual con el puesto y
 * los SP en vivo; perder la gráfica es peor que no tenerla, pero mucho menos
 * malo que tirar la página.
 */
export async function loadHistory(nameKey: string): Promise<HistoryRow[]> {
  try {
    const hourly = await loadHourly(nameKey);
    const daily = await loadDaily(nameKey, hourly[0]?.timestamp);
    return [...daily, ...hourly];
  } catch (err) {
    console.error("No se pudo leer el historial del jugador:", err);
    return [];
  }
}
