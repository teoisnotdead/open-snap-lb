/**
 * El tag de alianza, con el nombre largo colgando.
 *
 * Vive acá y no en cada pantalla porque el mismo dato se muestra en dos partes
 * con la misma pastilla y distinta forma de decir el nombre: en la tabla no
 * entra —la columna es angosta y lo que la gente reconoce es el tag— así que
 * aparece al pasar el mouse; en la ficha del jugador sobra el espacio, y
 * esconder detrás de un hover algo que se puede leer de una es hacerlo peor.
 *
 * Ninguno de los dos es dato verificable: la API oficial no expone alianzas
 * (ver docs/leaderboard-api.md §3), así que esto es siempre lo que el jugador
 * declaró.
 */

export function AllianceTag({
  tag,
  name,
  nameDisplay,
  size = "sm",
}: {
  tag: string;
  name?: string;
  /** Cómo se muestra el nombre largo. Sin `name`, no se muestra nada. */
  nameDisplay: "tooltip" | "inline";
  size?: "sm" | "lg";
}) {
  const pill = `num shrink-0 rounded border border-line-strong font-semibold text-ink-3 ${
    size === "lg"
      ? "px-2 py-1 text-[11px] tracking-[0.08em]"
      : "px-1.5 py-0.5 text-[11px] tracking-[0.06em]"
  }`;

  if (!name) return <span className={pill}>{tag}</span>;

  if (nameDisplay === "inline") {
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        <span className={pill}>{tag}</span>
        {/* Se deja partir en vez de truncar: en la ficha hay lugar, y un
            nombre cortado con puntos suspensivos no dice más que el tag. */}
        <span className="min-w-0 break-words text-[13px] text-ink-3">{name}</span>
      </span>
    );
  }

  return (
    <span className="group relative inline-flex">
      <span className={pill}>{tag}</span>

      {/**
       * Se oculta con opacidad y no con `hidden`: así el nombre sigue en el
       * árbol de accesibilidad y un lector de pantalla lo lee junto al tag, en
       * vez de anunciar tres letras sueltas.
       *
       * Va ARRIBA de la pastilla a propósito. El contenedor de la tabla tiene
       * `overflow-hidden` para redondear las esquinas, así que un globo hacia
       * abajo se cortaría en la última fila; hacia arriba nunca, porque encima
       * de la primera fila siempre está la cabecera.
       */}
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-line-strong bg-surface-3 px-2 py-1 text-[11.5px] font-medium tracking-normal text-ink-2 opacity-0 transition-opacity group-hover:opacity-100"
      >
        {name}
      </span>
    </span>
  );
}
