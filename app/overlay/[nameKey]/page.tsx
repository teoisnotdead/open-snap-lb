import { notFound } from "next/navigation";
import { OverlayBoard } from "@/components/OverlayBoard";
import { getMergedLeaderboard } from "@/lib/merge";
import { clampRows, isLinked, windowAround } from "@/lib/overlay";
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

  /**
   * El ladder va primero aunque el corte sea por estar vinculado, para poder
   * separar dos fallas que dan la misma pantalla en blanco: un nombre que no
   * existe en el top 1000 y uno que existe pero no pidió su ficha. Se arreglan
   * distinto, así que decirlas distinto es la mitad del trabajo.
   *
   * Cuesta poco: `getMergedLeaderboard` está cacheado 60 s y lo comparte con la
   * home, así que mil visitas en un minuto son una sola consulta a la API
   * oficial.
   */
  const board = await getMergedLeaderboard(60);
  const win = windowAround(board.rows, nameKey, rows, pinnedRank);

  if (!win) return <OverlayNotice motivo="ausente" />;
  if (!(await isLinked(nameKey))) return <OverlayNotice motivo="sinVincular" />;

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
        <p className="ov-warn">nombre repetido en el ladder — agrega &rank= a la URL</p>
      )}
    </main>
  );
}

/**
 * Lo que se ve cuando no hay overlay que mostrar.
 *
 * Reemplaza al 404, que en OBS es la peor pantalla posible: un error genérico
 * de Next, con fondo blanco opaco, que no dice cuál de las tres cosas salió
 * mal ni cómo arreglarla.
 *
 * Corto y con pinta de error a propósito. Esto se compone sobre el stream, así
 * que si alguien lo deja puesto queda al aire: tiene que leerse como "acá falta
 * configurar algo" en un vistazo, no como una pieza del overlay ni como
 * publicidad.
 */
function OverlayNotice({ motivo }: { motivo: "ausente" | "sinVincular" }) {
  return (
    <div className="ov-card ov-notice">
      {motivo === "ausente" ? (
        <>
          <strong>Ese nombre no está en el top 1000</strong>
          <span>
            Revisa que esté escrito igual que en el ladder. Solo entran los
            1000 que devuelve la API oficial.
          </span>
        </>
      ) : (
        <>
          <strong>Esta cuenta no tiene overlay todavía</strong>
          <span>
            Los overlays son para cuentas vinculadas. Se pide en el sitio,
            en <em>Vincular cuenta</em>, y lo revisa una persona.
          </span>
        </>
      )}
    </div>
  );
}
