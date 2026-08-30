import { notFound } from "next/navigation";
import { OverlayBoard } from "@/components/OverlayBoard";
import { getMergedLeaderboard } from "@/lib/merge";
import { clampRows, windowAround } from "@/lib/overlay";
import { toNameKey } from "@/lib/names";
import "./overlay.css";

export const dynamic = "force-dynamic";

/**
 * /overlay/[nameKey]?rows=5&rank=284
 *
 * La capa para OBS: las filas del ladder alrededor del streamer, con la suya
 * marcada. Se pega como "Browser Source" y no necesita nada de Twitch — ni
 * cuenta de desarrollador, ni revisión — así que sirve igual en YouTube o Kick.
 *
 * El primer render lo hace el servidor a propósito: OBS carga la página una
 * vez y la deja meses corriendo, y una capa que arranca vacía esperando a que
 * el JS resuelva es una capa que se ve vacía en el momento en que el streamer
 * la está encuadrando.
 */
export default async function OverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ nameKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { nameKey: raw } = await params;
  const sp = await searchParams;

  const nameKey = toNameKey(decodeURIComponent(raw));
  if (!nameKey) notFound();

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const rows = clampRows(one(sp.rows));
  const rank = Number(one(sp.rank));
  const pinnedRank = Number.isInteger(rank) && rank > 0 ? rank : undefined;

  const board = await getMergedLeaderboard(60);
  const win = windowAround(board.rows, nameKey, rows, pinnedRank);

  /**
   * Un 404 y no una capa vacía: en OBS, "no se ve nada" puede ser el nombre
   * mal escrito, el jugador fuera del top 1000 o la URL equivocada, y las tres
   * se diagnostican distinto. La página de error al menos se ve.
   */
  if (!win) notFound();

  return (
    <main className="ov-wrap">
      <OverlayBoard
        initial={{ selfRank: win.selfRank, ambiguous: win.ambiguous, rows: win.rows }}
        nameKey={nameKey}
        rows={rows}
        pinnedRank={pinnedRank}
      />
      {/*
        Si el nombre está repetido en el ladder no sabemos cuál fila es este
        streamer, y el overlay estaría mostrando la de un homónimo como propia.
        Se dice en pantalla en vez de elegir en silencio: quien lo vea sabe que
        tiene que agregar `&rank=` a la URL.
      */}
      {win.ambiguous && (
        <p className="ov-warn">nombre repetido en el ladder — agregá &rank= a la URL</p>
      )}
    </main>
  );
}
