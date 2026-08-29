import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { TokenLookup } from "@/components/TokenLookup";
import { WarningIcon } from "@/components/icons";
import { findSubmissionByToken } from "@/lib/submissions";
import { formatStatusToken } from "@/lib/tokens";
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

  try {
    doc = await findSubmissionByToken(token);
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

                <dt className="text-ink-4">{t.request.tokenLabel}</dt>
                <dd className="font-mono tracking-[0.08em] text-ink-2">
                  {formatStatusToken(doc.statusToken)}
                </dd>
              </dl>
            </section>

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

            {doc.status === "approved" && (
              <Link
                href={`/${lang}/player/${encodeURIComponent(doc.nameKey)}`}
                className="self-start rounded-lg bg-accent px-5 py-2.5 text-[14px] font-semibold text-bg transition-colors hover:bg-accent-bright"
              >
                {t.request.seeProfile}
              </Link>
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
