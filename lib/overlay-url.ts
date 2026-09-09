import { headers } from "next/headers";
import { getMergedLeaderboard } from "./merge";
import { ensureOverlayKey } from "./players";
import type { MergedLeaderboardRow } from "./types";

/**
 * Lo que hace falta para pegar el overlay en OBS: la URL y, si el nombre está
 * repetido, el puesto que la desambigua.
 *
 * Vive fuera de `lib/overlay.ts` a propósito. Ese módulo tiene que quedarse
 * PURO porque lo importa un componente cliente, y acá entran `next/headers` y
 * —vía `merge`— el driver de Mongo. Ver el comentario de arriba de todo en
 * `lib/overlay.ts`.
 *
 * Lo consume una sola pantalla: la página del código. La URL salió de la ficha
 * pública porque ahí la veía cualquiera que entrara al perfil, y no es un dato
 * del jugador sino la configuración de quien vinculó la cuenta — el mismo tipo
 * de cosa que el `joinCode` de una alianza, que ya se muestra solo ahí.
 *
 * Devuelve null si el jugador no tiene ficha: sin ficha no hay llave, y sin
 * llave no hay overlay.
 */
export async function overlaySetup(
  nameKey: string
): Promise<{ url: string; pinnedRank?: number } | null> {
  /**
   * Antes que el ladder, porque es lo único que puede decir que no hay nada que
   * mostrar. Además ESCRIBE si hace falta —es la migración de los aprobados sin
   * llave, ver `ensureOverlayKey`— y por eso no conviene hacerlo después de un
   * fetch que puede tardar.
   */
  const key = await ensureOverlayKey(nameKey);
  if (!key) return null;

  let live: MergedLeaderboardRow | null = null;

  try {
    /**
     * Cacheado 60 s, así que en la práctica no es una consulta extra: la ficha
     * y la home ya bajaron este mismo board.
     */
    const board = await getMergedLeaderboard(60);
    live = board.rows.find((r) => r.nameKey === nameKey) ?? null;
  } catch {
    /**
     * Sin ladder no sabemos si el nombre está repetido, y la URL sin `rank`
     * sirve igual para todo el mundo menos para un homónimo. Preferimos darla
     * así antes que no dar nada: el aviso reaparece solo en cuanto el board
     * vuelva a responder.
     */
  }

  /* Solo con nombres repetidos: el puesto es lo único que separa al streamer
     de su homónimo, y por eso mismo caduca cuando cambia de puesto. Ver
     `windowAround` en `lib/overlay.ts`. */
  const pinnedRank = live?.ambiguous ? live.rank : undefined;

  const h = await headers();
  /**
   * El origen sale del header `host` y no de una variable de entorno: el sitio
   * responde en el dominio de producción, en los preview de Vercel y en
   * localhost, y una URL fija sería la incorrecta en dos de los tres.
   * `x-forwarded-proto` lo pone el proxy de Vercel; en local no existe y hay
   * que caer a http o el link no abre.
   */
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  /* La llave, NO el nameKey: la URL no tiene que poder derivarse del nombre
     público del jugador. Ver `PlayerDoc.overlayKey`. */
  const path = `/overlay/${key}` + (pinnedRank ? `?rank=${pinnedRank}` : "");

  return { url: `${proto}://${host}${path}`, pinnedRank };
}
