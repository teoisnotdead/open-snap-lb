import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { LANGS, getDictionary, isLang } from "@/lib/i18n";
import "../globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDictionary(lang);
  return { title: t.meta.title, description: t.meta.description };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ lang: string }> }>) {
  const { lang } = await params;
  // Cualquier otro segmento (/fr, /favicon.ico mal ruteado) no es un idioma.
  if (!isLang(lang)) notFound();

  return (
    <html lang={lang}>
      <body
        className={`${bricolage.variable} ${plexSans.variable} ${plexMono.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
