/** Test de los parsers de handles y de la normalización de nombres. */
import { parseTwitch, parseYouTube, parseUntapped } from "../lib/socials";
import { toNameKey } from "../lib/names";

const ok: string[] = [];
const bad: string[] = [];
const c = (label: string, got: unknown, want: unknown) =>
  (JSON.stringify(got) === JSON.stringify(want) ? ok : bad).push(
    `${label} -> ${JSON.stringify(got)}`
  );

// Casos tomados del media.txt real del proyecto original.
c("twitch handle pelado", parseTwitch("HuskyPuppies35").value, "huskypuppies35");
c("twitch url completa", parseTwitch("https://www.twitch.tv/KMBestMS").value, "kmbestms");
c("twitch con @", parseTwitch("@bynx_plays").value, "bynx_plays");
c("twitch dominio pelado", parseTwitch("twitch.tv/safetyblade").value, "safetyblade");
c("twitch muy corto rechazado", parseTwitch("abc").ok, false);
c("twitch: url de otro sitio rechazada", parseTwitch("https://youtube.com/@x").ok, false);

c("youtube con @", parseYouTube("@KMBestInASnap").value, "kmbestinasnap");
c("youtube url", parseYouTube("https://youtube.com/@ZombiesGoNomNom").value, "zombiesgonomnom");
c("youtube /channel/ legacy rechazado", parseYouTube("https://youtube.com/channel/UC123").ok, false);

const U = "https://snap.untapped.gg/en/profile/75d0bc56-9b43-4a1f-8c5a-80c66f2d248e/5b535444-43e8-4eba-8c18-fda9c1c9fa7c";
c("untapped url completa", parseUntapped(U).value, U);
c("untapped otro locale se canonicaliza", parseUntapped(U.replace("/en/", "/es/")).value, U);
c("untapped dominio ajeno rechazado", parseUntapped("https://evil.com/profile/a/b").ok, false);
c("untapped sin uuids rechazado", parseUntapped("https://snap.untapped.gg/en/profile/abc").ok, false);
c("untapped: no se deja engañar por subdominio falso", parseUntapped("https://untapped.gg.evil.com/x").ok, false);

// Rarezas reales medidas contra el ladder en vivo.
c("nameKey: espacios al final", toNameKey("Butt   "), "butt");
c("nameKey: mayúsculas y símbolos", toNameKey("Cerebro = No Hands"), "cerebro = no hands");
c("nameKey: coreano intacto", toNameKey("아이엠어닥터"), "아이엠어닥터");
c("nameKey: colapsa espacios internos", toNameKey("I  AM"), "i am");

ok.forEach((t) => console.log("  [ok] " + t));
bad.forEach((t) => console.log("  [XX] " + t));
console.log(`\n${ok.length}/${ok.length + bad.length}`);
process.exit(bad.length ? 1 : 0);
