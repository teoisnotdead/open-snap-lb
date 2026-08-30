import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "../../globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["500", "600"],
});

/**
 * El overlay vive FUERA de `[lang]`, como el panel: no tiene prosa que
 * traducir —son puestos, nombres y números— y una URL con idioma sería una
 * forma más de que un streamer la pegue mal en OBS.
 *
 * `noindex` porque esto no es una página para leer: es una capa de vídeo.
 */
export const metadata: Metadata = {
  title: "Overlay · OpenSnap LB",
  robots: { index: false, follow: false },
};

export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      {/*
        Fondo transparente, y hay que ganarle al `background` que `globals.css`
        le pone a `body`. OBS compone esta página sobre el juego: cualquier
        color acá sería un rectángulo opaco tapando la partida.
      */}
      <body
        className={`${plexSans.variable} ${plexMono.variable}`}
        style={{ background: "transparent" }}
      >
        {children}
      </body>
    </html>
  );
}
