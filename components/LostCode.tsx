import type { Dictionary } from "@/lib/i18n";
import { SITE_CONTACT } from "@/lib/contact";

/**
 * La salida para quien perdió su código.
 *
 * Recuperar es MANDAR EL MISMO código, no emitir otro: la identidad ya la
 * revisó una persona al aprobar, y esa decisión no se vuelve a tomar porque
 * alguien haya perdido un papel. Ver el bloque `Recovery` del panel.
 *
 * Se calla entero si no hay contacto configurado. Un "escríbenos" sin dirección
 * es peor que el silencio: manda a la persona a buscar un canal que no existe.
 * Ver `SITE_CONTACT`.
 */
export function LostCode({ t }: { t: Dictionary }) {
  if (!SITE_CONTACT) return null;

  return (
    <section className="rounded-xl border border-line bg-surface px-5 py-4">
      <h2 className="mb-1 text-[14px] font-semibold">{t.request.lostTitle}</h2>
      <p className="text-[12.5px] leading-relaxed text-ink-3">{t.request.lostBody}</p>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-4">
        {t.request.lostWrite} <span className="num text-ink-2">{SITE_CONTACT}</span>
      </p>
    </section>
  );
}
