"use client";

import { useEffect, useState } from "react";
import { formatDelta, formatRank, formatScore } from "@/lib/format";

export interface OverlayRow {
  rank: number;
  displayName: string;
  score: number;
  delta24h?: number;
  verified: boolean;
}

export interface OverlayData {
  selfRank: number;
  ambiguous: boolean;
  rows: OverlayRow[];
}

/**
 * Cada cuánto se repregunta. Coincide con el cache de 60 s del ladder: pedir
 * más seguido devolvería exactamente la misma respuesta y solo gastaría
 * invocaciones de Vercel, que en Hobby son finitas.
 */
const POLL_MS = 60_000;

/**
 * Las filas del ladder alrededor del streamer, para componer en OBS.
 *
 * Se hidrata con lo que ya renderizó el servidor y desde ahí se refresca sola:
 * un overlay que quedó pegado en los datos de hace seis horas es peor que no
 * tenerlo, porque nadie lo está mirando para darse cuenta.
 *
 * Nunca se vacía ante un error de red. Si una consulta falla —y en un stream
 * de horas alguna falla— se queda con las últimas filas buenas: en pantalla,
 * un dato de hace dos minutos es infinitamente mejor que un hueco negro.
 */
export function OverlayBoard({
  initial,
  nameKey,
  rows,
  pinnedRank,
}: {
  initial: OverlayData;
  nameKey: string;
  rows: number;
  pinnedRank?: number;
}) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    let vivo = true;

    const url =
      `/api/overlay/${encodeURIComponent(nameKey)}?rows=${rows}` +
      (pinnedRank ? `&rank=${pinnedRank}` : "");

    const tick = async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as OverlayData;
        if (vivo && next?.rows?.length) setData(next);
      } catch {
        // Se conserva lo último bueno. Ver la nota del componente.
      }
    };

    const id = setInterval(tick, POLL_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [nameKey, rows, pinnedRank]);

  return (
    <div className="ov-card">
      {data.rows.map((row) => {
        const self = row.rank === data.selfRank;
        return (
          <div key={row.rank} className={`ov-row${self ? " ov-self" : ""}`}>
            <span className="ov-rank">{formatRank(row.rank)}</span>
            <span className="ov-name">{row.displayName}</span>
            {row.delta24h !== undefined && row.delta24h !== 0 && (
              <span className={`ov-delta ${row.delta24h > 0 ? "ov-pos" : "ov-neg"}`}>
                {formatDelta(row.delta24h)}
              </span>
            )}
            <span className="ov-score">{formatScore(row.score)}</span>
          </div>
        );
      })}
    </div>
  );
}
