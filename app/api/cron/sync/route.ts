import type { AnyBulkWriteOperation } from "mongodb";
import { playersCollection, snapshotsCollection } from "@/lib/db";
import {
  fetchLeaderboard,
  indexByNameKey,
  disambiguate,
  previousSeason,
  LeaderboardError,
} from "@/lib/leaderboard";
import { archiveSeason, isSeasonArchived } from "@/lib/seasons";
import { apiError, json, requireCronAuth } from "@/lib/api";
import type { PlayerDoc, SnapshotDoc } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Identificador de corrida, truncado a la hora (UTC).
 *
 * Es lo que hace idempotente al sync junto con el índice único
 * {nameKey, syncId}: si el GitHub Action reintenta tras un timeout, la segunda
 * corrida cae en la misma franja, choca con el índice y no duplica puntos en
 * la gráfica. Un id aleatorio por invocación no daría esa garantía.
 */
function currentSyncId(now: Date): string {
  return now.toISOString().slice(0, 13); // "2026-08-24T02"
}

/**
 * Congela la temporada anterior la primera vez que se ve una nueva.
 *
 * La API oficial solo sirve el mes corriente y el anterior: en cuanto arranca
 * octubre, agosto deja de existir para siempre. Esta es la única ventana para
 * guardarlo, y por eso va enganchado al cron y no a una tarea que alguien tenga
 * que acordarse de correr.
 *
 * NUNCA tira: archivar es un extra, y que falle no puede llevarse puesta la
 * corrida de sync, que es lo que sostiene el historial de todos los días.
 */
async function archivePreviousSeason(liveSeason: string) {
  try {
    const previous = previousSeason(liveSeason);
    if (!previous) return null;

    // Una lectura contra el índice; en la enorme mayoría de las corridas
    // termina acá.
    if (await isSeasonArchived(previous)) return null;

    const res = await archiveSeason(previous);
    console.log(`Temporada ${previous} archivada: ${res.inserted} filas.`);
    return res;
  } catch (err) {
    console.error("No se pudo archivar la temporada anterior:", err);
    return null;
  }
}

/**
 * POST /api/cron/sync — disparador principal, el workflow de GitHub Actions.
 * GET  /api/cron/sync — mismo trabajo, para Vercel Cron.
 *
 * Ambos protegidos con `Authorization: Bearer $CRON_SECRET`.
 *
 * Que un GET escriba en la base incomoda, y con razón: no es idempotente en el
 * sentido de HTTP y un prefetch podría dispararlo. Se acepta porque **Vercel
 * Cron solo emite GET**, y las dos defensas que importan siguen en pie: el
 * bearer token (nadie lo dispara sin el secreto) y el índice único
 * {nameKey, syncId}, que hace que repetir la llamada dentro de la misma hora
 * no duplique nada.
 *
 * Alcance: solo los jugadores que ya están en `players`, no el top 1000 entero
 * — así el volumen crece con la gente que efectivamente se vinculó.
 */
async function runSync(req: Request) {
  const unauthorized = requireCronAuth(req);
  if (unauthorized) return unauthorized;

  const startedAt = Date.now();
  const now = new Date();
  const syncId = currentSyncId(now);

  try {
    const players = await playersCollection();
    const tracked = await players
      .find(
        {},
        { projection: { nameKey: 1, lastRank: 1, lastScore: 1, peakRank: 1, peakScore: 1 } }
      )
      .toArray();

    // Sin cache: un snapshot tiene que reflejar el momento de la corrida.
    const board = await fetchLeaderboard({ revalidate: false });
    const rowsByKey = indexByNameKey(board.rows);

    /**
     * El archivado va ANTES del corte por "no hay trackeados", y no después.
     *
     * Congelar una temporada no tiene nada que ver con cuánta gente se vinculó:
     * son los 1000 del ladder. Con este chequeo abajo, un mes sin nadie
     * vinculado perdía la temporada entera — y eso no se recupera.
     */
    const archived = await archivePreviousSeason(board.season);

    if (tracked.length === 0) {
      return json({
        ok: true,
        syncId,
        season: board.season,
        message: "No hay jugadores en `players` todavía; nada para sincronizar.",
        tracked: 0,
        inserted: 0,
        ...(archived ? { archived } : {}),
      });
    }

    const snapshots: SnapshotDoc[] = [];
    const playerOps: AnyBulkWriteOperation<PlayerDoc>[] = [];

    let notOnBoard = 0;
    let unchanged = 0;
    let ambiguousSkipped = 0;

    for (const doc of tracked) {
      const candidates = rowsByKey.get(doc.nameKey);

      if (!candidates || candidates.length === 0) {
        // Se cayó del top 1000, o se cambió el nombre.
        notOnBoard++;
        continue;
      }

      const row = disambiguate(candidates, doc.lastRank);
      if (!row) {
        // Nombre repetido y sin histórico para desempatar: preferimos no
        // guardar nada antes que atribuirle el score a la persona equivocada.
        ambiguousSkipped++;
        continue;
      }

      // Siempre refrescamos el estado actual del jugador, cambie o no.
      playerOps.push({
        updateOne: {
          filter: { nameKey: doc.nameKey },
          update: {
            $set: {
              playerName: row.playerName,
              lastRank: row.rank,
              lastScore: row.score,
              lastSeenAt: now,
              updatedAt: now,
            },
            $max: { peakScore: row.score },
            $min: { peakRank: row.rank },
          },
        },
      });

      // Optimización de almacenamiento: si no se movió ni un punto ni un
      // puesto desde la última corrida, no escribimos snapshot. La serie
      // temporal no pierde información (entre dos puntos conocidos el valor se
      // mantuvo), y en M0 esto es la diferencia entre caber y no caber.
      if (doc.lastScore === row.score && doc.lastRank === row.rank) {
        unchanged++;
        continue;
      }

      snapshots.push({
        nameKey: doc.nameKey,
        playerName: row.playerName,
        timestamp: now,
        rank: row.rank,
        score: row.score,
        season: board.season,
        syncId,
      });
    }

    let inserted = 0;
    let duplicates = 0;

    if (snapshots.length > 0) {
      const col = await snapshotsCollection();
      try {
        // `ordered: false` para que un choque puntual no aborte el resto.
        const res = await col.insertMany(snapshots, { ordered: false });
        inserted = res.insertedCount;
      } catch (err) {
        // E11000 acá no es un fallo: es la idempotencia funcionando.
        const e = err as { code?: number; result?: { nInserted?: number }; writeErrors?: unknown[] };
        if (e.code === 11000 || Array.isArray(e.writeErrors)) {
          inserted = e.result?.nInserted ?? 0;
          duplicates = snapshots.length - inserted;
        } else {
          throw err;
        }
      }
    }

    if (playerOps.length > 0) {
      await players.bulkWrite(playerOps, { ordered: false });
    }

    return json({
      ok: true,
      syncId,
      season: board.season,
      ...(archived ? { archived } : {}),
      tracked: tracked.length,
      inserted,
      unchanged,
      duplicates,
      notOnBoard,
      ambiguousSkipped,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    if (err instanceof LeaderboardError) {
      return apiError(err.message, err.status);
    }
    console.error("/api/cron/sync falló:", err);
    return apiError("El sync falló.", 500);
  }
}

/** GitHub Actions. */
export const POST = runSync;

/**
 * Vercel Cron, que solo emite GET. Vercel agrega el header
 * `Authorization: Bearer $CRON_SECRET` por su cuenta cuando esa variable
 * existe en el proyecto, así que la misma protección aplica sin configurar
 * nada extra.
 */
export const GET = runSync;
