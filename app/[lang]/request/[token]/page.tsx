import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeaderPanel, type Member } from "@/components/LeaderPanel";
import { LostCode } from "@/components/LostCode";
import { OverlayLink } from "@/components/OverlayLink";
import { RenameForm } from "@/components/RenameForm";
import { SelfEditForm } from "@/components/SelfEditForm";
import { SiteHeader } from "@/components/SiteHeader";
import { TokenLookup } from "@/components/TokenLookup";
import { WarningIcon } from "@/components/icons";
import { listAllianceMembers } from "@/lib/alliances";
import { alliancesCollection } from "@/lib/db";
import { fetchLeaderboard } from "@/lib/leaderboard";
import { overlaySetup } from "@/lib/overlay-url";
import { findSubmissionByToken } from "@/lib/submissions";
import { formatStatusToken } from "@/lib/status-token";
import { getDictionary, isLang, type Lang } from "@/lib/i18n";
import { formatDateTime } from "@/lib/format";
import type { SubmissionDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Estado de una petición.
 *
 * `noindex` no es opcional: la URL contiene el token de seguimiento, y un
 * buscador indexándola lo publicaría.
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function RequestStatusPage({
  params,
}: {
  params: Promise<{ lang: string; token: string }>;
}) {
  const { lang: raw, token } = await params;
  if (!isLang(raw)) notFound();
  const lang: Lang = raw;
  const t = getDictionary(lang);

  let doc: SubmissionDoc | null = null;
  let dbDown = false;
  /**
   * La alianza que lidera quien abrió esta página, si lidera alguna.
   *
   * Se lee acá, en el servidor, y no por la API: el `joinCode` es un secreto y
   * no tiene por qué existir en ninguna respuesta pública. Esta página ya está
   * detrás del `statusToken` y lleva `noindex` por la misma razón.
   */
  let led: {
    tag: string;
    name: string;
    joinCode: string;
    members: Member[];
    banned: string[];
  } | null = null;
  /**
   * La URL del overlay para OBS, si esta cuenta tiene derecho a una.
   *
   * Se muestra ACÁ y no en la ficha del jugador. La ficha es pública, así que
   * ahí la URL de una cuenta vinculada la veía cualquiera que entrara al
   * perfil — y no es un dato del jugador, es la configuración de quien vinculó
   * la cuenta. Del mismo tipo que el `joinCode` de arriba, y por eso en el
   * mismo lugar: detrás del `statusToken`, en una página con `noindex`.
   */
  let overlay: { url: string; pinnedRank?: number } | null = null;
  /**
   * El nombre de la ficha ya no está en el ladder: o salió del top 1000, o la
   * persona se cambió el nombre en el juego. Desde acá no se distinguen, y la
   * pantalla dice las dos cosas.
   *
   * Es lo que decide si se ofrece mudar la ficha, y es la misma condición que
   * exige la ruta — ver `lib/rename.ts`.
   */
  let nameGone = false;

  try {
    doc = await findSubmissionByToken(token);

    if (doc) {
      const alliances = await alliancesCollection();
      const mine = await alliances.findOne({
        leaderNameKey: doc.nameKey,
        status: "approved",
      });

      /**
       * Sin `joinCode` no hay nada que mostrar: la alianza está aprobada pero
       * el código todavía no se generó, que pasa si alguien la reclamó después
       * de que ya estuviera aprobada. Es un estado válido, no un error.
       */
      if (mine?.joinCode) {
        led = {
          tag: mine.tag,
          name: mine.name,
          joinCode: mine.joinCode,
          members: await listAllianceMembers(mine.tag),
          banned: mine.bannedNameKeys ?? [],
        };
      }

      /**
       * `overlaySetup` devuelve null si el jugador no tiene ficha, que es el
       * MISMO corte que aplican `/overlay` y `/api/overlay`: sin ficha no hay
       * llave. Casi siempre coincide con la petición aprobada —aprobar crea la
       * ficha— pero si la ficha se borró después, dar una URL sería mandar a la
       * persona a pegar en OBS una capa que no va a responder.
       */
      if (doc.status === "approved") {
        /**
         * Falla suave, y va aparte del try de afuera a propósito: ese pinta la
         * pantalla de "la base no responde", y esto es lo ÚLTIMO por lo que
         * conviene ocultarle a alguien el estado de su petición. Además acá se
         * ESCRIBE —`overlaySetup` genera la llave si falta— así que es la parte
         * de la página con más motivos para romperse.
         */
        try {
          overlay = await overlaySetup(doc.nameKey);
        } catch (err) {
          console.error("No se pudo preparar el overlay:", err);
        }

        /**
         * Sin cache, al revés que el overlay de arriba. Esta página se abre de
         * vez en cuando, y con tráfico así una entrada cacheada devuelve el
         * ladder que dejó la visita anterior, tenga la edad que tenga: ofrecería
         * mudar una ficha que ya volvió a la tabla, o seguiría ofreciéndolo
         * justo después de mudarla.
         *
         * Si el ladder no responde no se ofrece nada: la mudanza tampoco
         * andaría, porque se valida contra él.
         */
        try {
          const nameKey = doc.nameKey;
          const board = await fetchLeaderboard({ revalidate: false });
          nameGone = !board.rows.some((r) => r.nameKey === nameKey);
        } catch {
          // Ver arriba.
        }
      }
    }
  } catch (err) {
    console.error("No se pudo leer la petición:", err);
    dbDown = true;
  }

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader lang={lang} t={t} active="link" currentPath="/request" />

      <div className="mx-auto w-full max-w-[680px] px-4 pb-16 pt-6 sm:px-8 sm:pt-[34px]">
        <h1 className="mb-6 font-display text-[25px] sm:text-[30px] font-bold leading-[1.1] tracking-[-0.03em]">
          {t.request.title}
        </h1>

        {dbDown ? (
          <p className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-5 py-4 text-[13.5px] leading-relaxed text-ink-3">
            <WarningIcon size={15} className="mt-0.5 shrink-0" />
            <span>{t.request.dbDown}</span>
          </p>
        ) : !doc ? (
          /* Un token inválido y uno inexistente dan lo mismo a propósito:
             distinguirlos confirmaría cuáles existen. */
          <div className="flex flex-col gap-5">
            <p className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-5 py-4 text-[13.5px] leading-relaxed text-ink-3">
              <WarningIcon size={15} className="mt-0.5 shrink-0" />
              <span>{t.request.notFound}</span>
            </p>
            <TokenLookup lang={lang} t={t} />
            <LostCode t={t} />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <section className="rounded-xl border border-line bg-surface p-4 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="font-display text-[19px] font-bold">{doc.playerName}</h2>
                <StatusPill t={t} status={doc.status} />
              </div>

              <p className="text-[13.5px] leading-relaxed text-ink-2">
                {doc.status === "pending"
                  ? t.request.pendingBody
                  : doc.status === "approved"
                    ? t.request.approvedBody
                    : t.request.rejectedBody}
              </p>

              {doc.status === "rejected" && doc.rejectionReason && (
                <div className="mt-4 rounded-lg border border-[#4a2320] bg-[#2a1614] px-4 py-3 text-[13px] leading-relaxed text-ink-2">
                  <span className="mb-1 block text-[11px] font-semibold tracking-[0.06em] text-neg">
                    {t.request.reasonLabel}
                  </span>
                  {doc.rejectionReason}
                </div>
              )}

              <dl className="mt-5 grid grid-cols-[110px_minmax(0,1fr)] sm:grid-cols-[150px_minmax(0,1fr)] gap-y-2 border-t border-line-soft pt-4 text-[13px]">
                <dt className="text-ink-4">{t.request.sentAt}</dt>
                <dd className="text-ink-2">{formatDateTime(doc.createdAt, lang)}</dd>

                {doc.reviewedAt && (
                  <>
                    <dt className="text-ink-4">{t.request.reviewedAt}</dt>
                    <dd className="text-ink-2">{formatDateTime(doc.reviewedAt, lang)}</dd>
                  </>
                )}

                {doc.editedAt && (
                  <>
                    <dt className="text-ink-4">{t.request.editedAt}</dt>
                    <dd className="text-ink-2">{formatDateTime(doc.editedAt, lang)}</dd>
                  </>
                )}

                {/* El rastro de la mudanza, a la vista de quien tiene el código:
                    si no la hizo él, es la señal de que el código se filtró. */}
                {doc.renamedFrom && doc.renamedAt && (
                  <>
                    <dt className="text-ink-4">{t.request.renamedFrom}</dt>
                    <dd className="min-w-0 break-words text-ink-2">
                      {doc.renamedFrom} · {formatDateTime(doc.renamedAt, lang)}
                    </dd>
                  </>
                )}

                <dt className="text-ink-4">{t.request.tokenLabel}</dt>
                <dd className="font-mono tracking-[0.08em] text-ink-2">
                  {formatStatusToken(doc.statusToken)}
                </dd>
              </dl>
            </section>

            {/* Arriba de todo lo demás: con la ficha despegada de su fila, esto
                es a lo que vino la persona, y editar un canal no arregla nada
                mientras no se mude. */}
            {doc.status === "approved" && nameGone && (
              <RenameForm t={t} token={doc.statusToken} currentName={doc.playerName} />
            )}

            {/* Lo que pidió. Se puede mostrar porque la llave es un token
                aleatorio, no un id adivinable. El contacto sigue afuera. */}
            <section className="rounded-xl border border-line bg-surface p-4 sm:p-6">
              <h2 className="mb-4 text-[15px] font-semibold">{t.request.whatYouAsked}</h2>
              <dl className="grid grid-cols-[110px_minmax(0,1fr)] sm:grid-cols-[150px_minmax(0,1fr)] gap-y-2 text-[13px]">
                <Row label="Twitch" value={doc.twitch} />
                <Row label="YouTube" value={doc.youtube} />
                <Row label="Untapped" value={doc.untapped} />
                <Row
                  label={t.player.alliance}
                  value={
                    doc.allianceTag
                      ? doc.allianceName
                        ? `[${doc.allianceTag}] ${doc.allianceName}`
                        : `[${doc.allianceTag}]`
                      : undefined
                  }
                />
              </dl>
              <p className="mt-4 border-t border-line-soft pt-3.5 text-[12px] leading-relaxed text-ink-4">
                {t.request.contactHidden}
              </p>
            </section>

            {led && (
              <LeaderPanel
                t={t}
                tag={led.tag}
                name={led.name}
                joinCode={led.joinCode}
                members={led.members}
                banned={led.banned}
                statusToken={doc.statusToken}
              />
            )}

            {/* La edición solo existe sobre una aprobada, que es la misma
                condición que aplica `PATCH /api/submissions/[token]`. Si no,
                no hay nada publicado que editar. */}
            {doc.status === "approved" && (
              <>
                <SelfEditForm
                  t={t}
                  token={doc.statusToken}
                  initial={{
                    twitch: doc.twitch ?? "",
                    youtube: doc.youtube ?? "",
                    untapped: doc.untapped ?? "",
                    allianceTag: doc.allianceTag ?? "",
                    /**
                     * Vacío SIEMPRE, incluso si ya está adentro de la alianza.
                     * El código no se guarda con la ficha —no es un dato del
                     * jugador, es la llave de otro— así que no hay de dónde
                     * traerlo. Si vuelve a elegir una alianza con líder, lo
                     * tiene que poner de nuevo, que es lo correcto: lo que se
                     * prueba es la pertenencia de hoy.
                     */
                    allianceCode: "",
                  }}
                />

                {/* Debajo de la edición a propósito: quien vuelve acá viene casi
                    siempre a corregir un handle, y la URL del overlay se copia
                    una vez y queda pegada en OBS por meses. */}
                {overlay && (
                  <OverlayLink
                    url={overlay.url}
                    pinnedRank={overlay.pinnedRank}
                    statusToken={doc.statusToken}
                    t={t}
                  />
                )}

                <Link
                  href={`/${lang}/player/${encodeURIComponent(doc.nameKey)}`}
                  className="self-start rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-bg transition-colors hover:bg-accent-bright"
                >
                  {t.request.seeProfile}
                </Link>
              </>
            )}

            {doc.status === "rejected" && (
              <Link
                href={`/${lang}/link`}
                className="self-start rounded-lg border border-line-strong px-5 py-2.5 text-[14px] font-medium text-ink-2 transition-colors hover:border-line-bright hover:text-ink"
              >
                {t.request.tryAgain}
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-ink-4">{label}</dt>
      <dd className="min-w-0 break-words text-ink-2">{value}</dd>
    </>
  );
}

function StatusPill({
  t,
  status,
}: {
  t: ReturnType<typeof getDictionary>;
  status: "pending" | "approved" | "rejected";
}) {
  const style =
    status === "approved"
      ? "border-pos/30 bg-pos/10 text-pos"
      : status === "rejected"
        ? "border-[#4a2320] bg-[#2a1614] text-neg"
        : "border-accent-line bg-accent-surface text-accent";

  const label =
    status === "approved"
      ? t.request.approved
      : status === "rejected"
        ? t.request.rejected
        : t.request.pending;

  return (
    <span
      className={`shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-semibold ${style}`}
    >
      {label}
    </span>
  );
}
