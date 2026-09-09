import { OverlayBoard } from "@/components/OverlayBoard";
import { getMergedLeaderboard } from "@/lib/merge";
import { clampRows, windowAround } from "@/lib/overlay";
import { parseOverlayKey } from "@/lib/overlay-key";
import { findPlayerByOverlayKey } from "@/lib/players";
import "./overlay.css";

export const dynamic = "force-dynamic";

/**
 * /overlay/[key]?rows=5&rank=284
 *
 * La capa para OBS: las filas del ladder alrededor del streamer, con la suya
 * marcada. Se pega como "Browser Source" y no necesita nada de Twitch — ni
 * cuenta de desarrollador, ni revisión — así que sirve igual en YouTube o Kick.
 *
 * La URL lleva la LLAVE del jugador, no su nombre. Antes era `/overlay/<nameKey>`
 * y el nameKey se deriva del nombre público: cualquiera que viera una fila del
 * ladder podía abrir la capa de esa persona. Ver `PlayerDoc.overlayKey`.
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
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key: raw } = await params;
  const sp = await searchParams;

  const key = parseOverlayKey(decodeURIComponent(raw));
  if (!key) return <OverlayNotice motivo="llaveMala" />;

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  const rows = clampRows(one(sp.rows));
  const rank = Number(one(sp.rank));
  const pinnedRank = Number.isInteger(rank) && rank > 0 ? rank : undefined;

  /**
   * Ahora la llave va PRIMERO, al revés que antes.
   *
   * Cuando el corte era "¿este nombre está vinculado?", el ladder iba adelante
   * para poder separar dos fallas que daban la misma pantalla en blanco. Ya no
   * se puede: sin llave válida no sabemos de qué jugador hablamos, así que no
   * hay a quién buscar en el ladder. Y además no queremos: resolver el ladder
   * antes de validar sería trabajo regalado a cualquiera que tire URLs al azar.
   *
   * Los tres avisos siguen siendo distintos entre sí, que era el punto — solo
   * que el de "llave mala" ahora cubre lo que antes era "no está vinculado".
   */
  const player = await findPlayerByOverlayKey(key);
  if (!player) return <OverlayNotice motivo="llaveMala" />;

  /**
   * Cacheado 60 s, así que mil visitas en un minuto son una sola consulta a la
   * API oficial.
   *
   * El caché quedó SOLO acá. La home y /api/leaderboard lo perdieron porque con
   * tráfico esporádico el stale-while-revalidate les servía el estado que dejó
   * la visita anterior (ver el comentario en app/[lang]/page.tsx). El overlay no
   * tiene ese problema: vive en OBS refrescando solo, o sea tráfico parejo, y
   * con eso la entrada nunca envejece más que la ventana.
   */
  const board = await getMergedLeaderboard(60);
  const win = windowAround(board.rows, player.nameKey, rows, pinnedRank);

  if (!win) return <OverlayNotice motivo="ausente" />;

  return (
    <main className="ov-wrap">
      <OverlayBoard
        initial={{ selfRank: win.selfRank, ambiguous: win.ambiguous, rows: win.rows }}
        overlayKey={key}
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
function OverlayNotice({ motivo }: { motivo: "ausente" | "llaveMala" }) {
  return (
    <div className="ov-card ov-notice">
      {motivo === "ausente" ? (
        <>
          <strong>Ese jugador no está en el top 1000</strong>
          <span>
            La llave es correcta, pero el nombre no aparece en el ladder. Solo
            entran los 1000 que devuelve la API oficial.
          </span>
        </>
      ) : (
        <>
          <strong>Esta URL no corresponde a ningún overlay</strong>
          <span>
            Puede estar incompleta, o ser una que ya rotaste. La actual está en
            tu página de código, la que abres con el código de tu ficha.
          </span>
        </>
      )}
    </div>
  );
}
