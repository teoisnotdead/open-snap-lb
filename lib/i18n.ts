/**
 * Diccionarios de idioma.
 *
 * Las RUTAS son siempre en inglés (`/en/player/…`, `/es/player/…`); lo único
 * que cambia es el contenido. El español es latinoamericano neutro: sin voseo
 * ("vincula", no "vinculá") y sin modismos regionales.
 *
 * Sin librería de i18n: son dos objetos planos que se pasan como prop.
 *
 * TODOS los valores son strings, nunca funciones. Los diccionarios cruzan la
 * frontera server -> client component, y React no puede serializar funciones:
 * pasar una revienta con "Functions cannot be passed directly to Client
 * Components". Los textos con variables usan placeholders `{nombre}` y se
 * resuelven con `fill()` en el punto de uso.
 */

export const LANGS = ["en", "es"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "en";

export function isLang(value: string): value is Lang {
  return (LANGS as readonly string[]).includes(value);
}

const en = {
  meta: {
    title: "OpenSnap LB — Unofficial Marvel Snap leaderboard",
    description:
      "Unofficial Marvel Snap leaderboard with progress history and verified player links.",
    linkTitle: "Link your account — OpenSnap LB",
    linkDescription:
      "Prove the account is yours by putting a code in your in-game profile name.",
    howTitle: "How it works — OpenSnap LB",
    howDescription:
      "Where the data comes from, what we store, and what the official leaderboard can't tell us.",
  },
  nav: {
    leaderboard: "Leaderboard",
    link: "Link account",
    how: "How it works",
  },
  header: {
    synced: "Synced",
    season: "SEASON",
  },
  stats: {
    playersInLadder: "PLAYERS IN LADDER",
    visibleInTable: "SHOWN IN TABLE",
    apiCap: "API cap",
    maxSp: "TOP SNAP POINTS",
    verifiedAccounts: "VERIFIED ACCOUNTS",
  },
  table: {
    rank: "RANK",
    player: "PLAYER",
    alliance: "ALLIANCE",
    snapPoints: "SNAP POINTS",
    delta: "Δ 24 H",
    channels: "CHANNELS",
    searchPlaceholder: "Search player…",
    filterAll: "All",
    filterCreators: "Creators",
    filterVerified: "Verified",
    results: "results",
    linkCta: "Link your account",
    showMore: "Show {n} more",
    noResults: "Nobody matches “{q}” in the top {total}.",
    verifiedTooltip: "Verified account",
    ambiguousTooltip:
      "More than one player shares this name in the ladder. Without history we can't tell them apart, so we don't show links.",
    unknownDelta: "We only track history for linked accounts",
  },
  footer: {
    ambiguity:
      "When two players share a name we only show links if history lets us tell them apart.",
    unofficial:
      "Unofficial project · data from the public Marvel Snap leaderboard · not affiliated with Second Dinner or Nuverse",
  },
  player: {
    back: "Back to leaderboard",
    lastSeen: "Last seen",
    knownAs: "Shows in game as “{name}”",
    snapPoints: "SNAP POINTS",
    currentRank: "CURRENT RANK",
    peakSp: "PEAK SP",
    bestRank: "BEST RANK",
    daysTracked: "DAYS OF HISTORY",
    alliance: "ALLIANCE",
  },
  chart: {
    spTitle: "{name}’s Snap Points",
    spSubtitle:
      "One point per detected change. A flat line means they didn't move, not that data is missing.",
    rankTitle: "Ladder position",
    rankNote: "Inverted axis: higher is a better rank",
    range7: "7 D",
    range30: "30 D",
    rangeSeason: "Season",
    rangeAll: "All",
    sp: "SP",
    place: "Rank",
    peakLabel: "peak",
    emptyTitle: "Not enough history yet",
    emptyNone:
      "We store a measurement every time a player's Snap Points change. This one has none yet.",
    emptyOne:
      "There's a single measurement stored. One more and we can draw the curve.",
  },
  link: {
    title: "Request your listing",
    intro:
      "Tell us what to show next to your name and we'll review it by hand. Nothing here can be read from the official API, so a person checks every request. We never ask for a password or access to anything.",
    step1: "Your account",
    step2: "What we show",
    step3: "How we reach you",
    findTitle: "Find your account",
    findSubtitle: "Search the leaderboard and tap your row. We take the name from there, so you don't have to type it exactly.",
    findPlaceholder: "Type a few letters of your name…",
    findLoading: "Loading the ladder…",
    findHint: "Type a few letters and pick yourself from the list.",
    foundPrefix: "We found",
    foundSuffix: "on the ladder",
    change: "Change",
    ambiguousWarning:
      "More than one player shares this name in the ladder. Proving the account is yours is the only way we can tell you apart — we recommend the optional step at the end.",
    detailsTitle: "What we show",
    detailsSubtitle: "At least one channel, or your alliance tag.",
    twitch: "TWITCH",
    youtube: "YOUTUBE",
    untapped: "UNTAPPED",
    handlePlaceholder: "yourhandle",
    untappedPlaceholder: "Your profile link",
    allianceLabel: "ALLIANCE TAG",
    alliancePlaceholder: "e.g. JOB",
    allianceNameLabel: "ALLIANCE NAME",
    allianceNamePlaceholder: "e.g. Job Enjoyers",
    allianceHelp: "We can't read alliances from the official API, so this is up to you.",
    contactTitle: "How we reach you",
    contactSubtitle:
      "At least one. Private: only the reviewer sees it, and it never appears on the site or in the public API.",
    discordLabel: "DISCORD",
    discordPlaceholder: "yourhandle",
    emailLabel: "EMAIL",
    emailPlaceholder: "you@example.com",
    noteLabel: "ANYTHING WE SHOULD KNOW",
    notePlaceholder: "Optional. Useful if your name is a duplicate.",
    needOne: "Add at least one channel or your alliance tag.",
    needContact: "Leave at least one contact so we can reply.",
    submitButton: "Send request",
    submitting: "Sending…",
    connError: "We couldn't connect. Check your connection and try again.",
    haveCode: "Already sent a request?",
    haveCodeLink: "Check it with your code →",
    sentTitle: "Request sent",
    sentBody:
      "It's in the queue. We review by hand, so it isn't instant — nothing shows on the table until it's approved.",
    sentIdLabel: "YOUR TRACKING CODE",
    sentKeep:
      "Save it. Pasting it on the status page — linked from Link account — is the only way to see how your request ended up, and we have no way to reach you if you lose it.",
    sentOpenStatus: "Open the status page →",
    proofTitle: "Optional: prove the account is yours",
    proofIntro:
      "Put a short code in your in-game profile name. Only you can change it, so it proves the account is yours — your request gets approved without questions, and the table shows the verified tick.",
    proofStart: "Get my code",
    renameTitle: "Change your name in Marvel Snap",
    renameSubtitle: "Keep part of your real name: we use it to confirm it's you.",
    expiresIn: "expires in {n} min",
    yourCode: "YOUR CODE",
    shouldLookLike: "YOUR NAME SHOULD LOOK LIKE THIS",
    copy: "Copy",
    copied: "Copied",
    fitsOk: "Fits as is: {used} of {max} characters.",
    mustTrim:
      "The game allows {max} characters, so you need to trim {n} from your current name.",
    cacheNote:
      "The official leaderboard takes a few minutes to reflect a name change. If we can't see it yet, wait a moment and try again — you don't lose the code.",
    confirmButton: "I changed it, verify",
    confirming: "Looking…",
    proofDoneTitle: "Ownership proved",
    proofDoneBody:
      "You can go back to your usual name in the game. Your request is marked as verified and only needs approval now.",
    whyTitle: "Why it's reviewed by hand",
    why1:
      "Channels, alliances and contact details don't exist in the official API, so there's nothing to check them against. A person reads every request.",
    why2:
      "That also means we can say no — to a link we won't publish, or to somebody claiming a name that isn't theirs.",
    limitTitle: "The 20-character limit",
    limitBody:
      "The game cuts names at 20 characters. If yours is already at the cap, we tell you exactly how many to trim so the code fits — and we build the suggested name for you.",
    afterTitle: "Once approved",
    after1: "Your links appear next to your row in the table.",
    after2: "We start storing your history for the chart.",
    after3: "The verified tick only shows if you completed the optional proof.",
    topOnly:
      "Only accounts in the top 1 000 of the ladder can be requested, which is the most the official API returns.",
  },
  request: {
    title: "Your request",
    pending: "pending",
    approved: "approved",
    rejected: "rejected",
    pendingBody:
      "It's in the queue. We review by hand, so it isn't instant — nothing shows on the table until it's approved.",
    approvedBody:
      "Approved. Your links show next to your row, and we've started storing your history for the chart.",
    rejectedBody: "This request wasn't approved.",
    reasonLabel: "REASON",
    sentAt: "Sent",
    reviewedAt: "Reviewed",
    tokenLabel: "Tracking code",
    whatYouAsked: "What you asked for",
    contactHidden:
      "The contact you gave us isn't shown here. Only the reviewer sees it, and it never appears on the site or in the public API.",
    notFound:
      "We couldn't find a request with that code. Check it and try again — the code is 12 characters, and the dashes are optional.",
    lookupTitle: "Check your request",
    lookupSubtitle:
      "Paste the tracking code we gave you when you sent the request.",
    lookupLabel: "TRACKING CODE",
    lookupButton: "Check",
    lookupHelp: "12 characters. Dashes and lowercase are fine.",
    proofLabel: "Ownership",
    proofYes: "Proved with the in-game code",
    proofNo: "Not proved",
    seeProfile: "See my profile",
    tryAgain: "Send a new request",
    dbDown:
      "We can't reach the database right now, so we can't show the status of your request. It's still there — try again in a few minutes.",
  },
  how: {
    title: "How it works",
    intro:
      "This is an unofficial project. It reads the same public leaderboard the Marvel Snap site shows, and adds two things that site doesn't have: progress history and verified player links.",
    s1Title: "Where the data comes from",
    s1a: "From the official leaderboard's public endpoint. It returns the top 1 000 of a ladder that currently holds more than 50 000 players, and only three fields per row: rank, name and Snap Points.",
    s1b: "There's no player ID, no region, no cardback, no title, and no alliance. That's why identity here is the name, with everything that implies.",
    s2Title: "We build the history ourselves",
    s2a: "The official API only serves the current and previous month — you can't ask it for a back catalogue. Every hour we read the ladder and store a measurement for linked players, and that's where the progress chart comes from.",
    s2b: "We only write when something changed. If a player hasn't moved in three hours, that's three identical measurements that add nothing — the curve draws the same between two known points.",
    s3Title: "Why Δ 24 h is sometimes blank",
    s3a: "Because we only keep history for linked accounts. For the rest of the top 1 000 we don't know how much they moved, so we show a dash. Not knowing and not moving are different things, so we don't draw them the same.",
    s4Title: "Alliances are self-reported",
    s4a: "The official endpoint doesn't expose alliances, so we can't read yours. Players fill in their own tag when they link their account, which means the column stays empty for everyone who hasn't.",
    s5Title: "Repeated names",
    s5a: "Because identity is the name, two players called the same thing are indistinguishable to us. It happens: there are several cases in the top 1 000 right now.",
    s5b: "When we spot one we mark the row with a triangle and attach links to neither, unless history lets us tell which is which. We'd rather show nothing than credit someone's channel to the wrong person.",
    s6Title: "What we store about you",
    s6a: "Your in-game name, the links and alliance you entered, and your history of rank and Snap Points. We also keep the contact you gave us — Discord or email — so we can reply about your request. That contact is private: it never appears on the site or in the public API, and we don't send anything to it unless it's about your own request.",
    s6b: "We never ask for a password or access to your Twitch or YouTube account. The optional ownership check works because only you can change your profile name inside the game.",
    s6link: "Link your account",
    s6c: "if you're in the top 1 000.",
    s7Title: "Requests are reviewed by hand",
    s7a: "Nothing you send shows up on the table until a person approves it, so it isn't instant. When you send a request we give you a 12-character tracking code — that code is the only way to look it up later, because we don't write to you when it's decided.",
    s7link: "Check a request",
    s7b: "with the code you saved.",
    legal:
      "Unofficial project, not affiliated with Second Dinner or Nuverse. Marvel Snap and its marks belong to their respective owners.",
  },
  error: {
    boardTitle: "The official leaderboard isn't responding",
    boardBody:
      "We read the live ranking from the official Marvel Snap site, so when that endpoint goes down we have nowhere to get it. It usually comes back on its own within a few minutes.",
    boardFallback: "We couldn't reach the official leaderboard.",
    degraded:
      "Our database isn't responding, so the ranking is showing without links, alliances or 24 h changes. The standings themselves are live and correct.",
    notFoundTitle: "We don't have data on that player",
    notFoundBody:
      "We only store history for accounts that linked themselves. If this is you and you're in the top 1 000, you can link your account.",
    notFoundCta: "Link your account",
  },
};

/** Mismo shape que `en`, para que el compilador avise si falta una clave. */
type Dictionary = typeof en;

const es: Dictionary = {
  meta: {
    title: "OpenSnap LB — Leaderboard no oficial de Marvel Snap",
    description:
      "Leaderboard no oficial de Marvel Snap con historial de progreso y links verificados de jugadores.",
    linkTitle: "Vincula tu cuenta — OpenSnap LB",
    linkDescription:
      "Demuestra que la cuenta es tuya poniendo un código en tu nombre de perfil dentro del juego.",
    howTitle: "Cómo funciona — OpenSnap LB",
    howDescription:
      "De dónde salen los datos, qué guardamos y qué no puede decirnos el leaderboard oficial.",
  },
  nav: {
    leaderboard: "Leaderboard",
    link: "Vincular cuenta",
    how: "Cómo funciona",
  },
  header: {
    synced: "Sincronizado",
    season: "TEMPORADA",
  },
  stats: {
    playersInLadder: "JUGADORES EN EL LADDER",
    visibleInTable: "VISIBLES EN TABLA",
    apiCap: "tope de la API",
    maxSp: "SP MÁXIMO",
    verifiedAccounts: "CUENTAS VERIFICADAS",
  },
  table: {
    rank: "PUESTO",
    player: "JUGADOR",
    alliance: "ALIANZA",
    snapPoints: "SNAP POINTS",
    delta: "Δ 24 H",
    channels: "CANALES",
    searchPlaceholder: "Buscar jugador…",
    filterAll: "Todos",
    filterCreators: "Creadores",
    filterVerified: "Verificados",
    results: "resultados",
    linkCta: "Vincula tu cuenta",
    showMore: "Mostrar {n} más",
    noResults: "Nadie coincide con “{q}” en el top {total}.",
    verifiedTooltip: "Cuenta verificada",
    ambiguousTooltip:
      "Hay más de un jugador con este nombre en el ladder. Sin historial no podemos distinguirlos, así que no mostramos links.",
    unknownDelta: "Solo guardamos historial de las cuentas vinculadas",
  },
  footer: {
    ambiguity:
      "Cuando dos jugadores comparten nombre solo mostramos los links si el historial permite distinguirlos.",
    unofficial:
      "Proyecto no oficial · datos del leaderboard público de Marvel Snap · sin afiliación con Second Dinner ni Nuverse",
  },
  player: {
    back: "Volver al leaderboard",
    lastSeen: "Visto por última vez",
    knownAs: "En el juego aparece como “{name}”",
    snapPoints: "SNAP POINTS",
    currentRank: "PUESTO ACTUAL",
    peakSp: "PICO DE SP",
    bestRank: "MEJOR PUESTO",
    daysTracked: "DÍAS CON HISTORIAL",
    alliance: "ALIANZA",
  },
  chart: {
    spTitle: "Snap Points de {name}",
    spSubtitle:
      "Un punto por cada cambio detectado. La línea plana significa que no se movió, no que falten datos.",
    rankTitle: "Posición en el ladder",
    rankNote: "Eje invertido: más arriba es mejor puesto",
    range7: "7 D",
    range30: "30 D",
    rangeSeason: "Temporada",
    rangeAll: "Todo",
    sp: "SP",
    place: "Puesto",
    peakLabel: "pico",
    emptyTitle: "Todavía no hay suficiente historial",
    emptyNone:
      "Guardamos una medición cada vez que cambian los Snap Points de un jugador. Este todavía no tiene ninguna.",
    emptyOne:
      "Hay una sola medición guardada. Con la próxima ya podemos dibujar la curva.",
  },
  link: {
    title: "Pide tu ficha",
    intro:
      "Cuéntanos qué mostrar junto a tu nombre y lo revisamos a mano. Nada de esto se puede leer de la API oficial, así que una persona revisa cada petición. Nunca pedimos contraseña ni acceso a nada.",
    step1: "Tu cuenta",
    step2: "Qué mostramos",
    step3: "Cómo te contactamos",
    findTitle: "Encuentra tu cuenta",
    findSubtitle: "Busca en el leaderboard y toca tu fila. El nombre lo tomamos de ahí, así que no hace falta que lo escribas exacto.",
    findPlaceholder: "Escribe algunas letras de tu nombre…",
    findLoading: "Cargando el ladder…",
    findHint: "Escribe algunas letras y elígete de la lista.",
    foundPrefix: "Encontramos a",
    foundSuffix: "en el ladder",
    change: "Cambiar",
    ambiguousWarning:
      "Hay más de un jugador con este nombre en el ladder. Comprobar que la cuenta es tuya es la única forma de distinguirte — te recomendamos el paso opcional del final.",
    detailsTitle: "Qué mostramos",
    detailsSubtitle: "Al menos un canal, o el tag de tu alianza.",
    twitch: "TWITCH",
    youtube: "YOUTUBE",
    untapped: "UNTAPPED",
    handlePlaceholder: "tuhandle",
    untappedPlaceholder: "Link de tu perfil",
    allianceLabel: "TAG DE ALIANZA",
    alliancePlaceholder: "ej. JOB",
    allianceNameLabel: "NOMBRE DE LA ALIANZA",
    allianceNamePlaceholder: "ej. Job Enjoyers",
    allianceHelp: "No podemos leer las alianzas de la API oficial, así que depende de ti.",
    contactTitle: "Cómo te contactamos",
    contactSubtitle:
      "Al menos uno. Privado: solo lo ve quien revisa, y nunca aparece en el sitio ni en la API pública.",
    discordLabel: "DISCORD",
    discordPlaceholder: "tuhandle",
    emailLabel: "EMAIL",
    emailPlaceholder: "tu@ejemplo.com",
    noteLabel: "ALGO QUE DEBAMOS SABER",
    notePlaceholder: "Opcional. Útil si tu nombre está repetido.",
    needOne: "Suma al menos un canal o el tag de tu alianza.",
    needContact: "Deja al menos un contacto para poder responderte.",
    submitButton: "Enviar petición",
    submitting: "Enviando…",
    connError: "No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.",
    haveCode: "¿Ya enviaste una petición?",
    haveCodeLink: "Consúltala con tu código →",
    sentTitle: "Petición enviada",
    sentBody:
      "Quedó en la cola. Revisamos a mano, así que no es inmediato — nada aparece en la tabla hasta que se apruebe.",
    sentIdLabel: "TU CÓDIGO DE SEGUIMIENTO",
    sentKeep:
      "Guárdalo. Pegarlo en la página de estado —hay un enlace en Vincular cuenta— es la única forma de saber cómo quedó tu petición, y si lo pierdes no tenemos cómo avisarte.",
    sentOpenStatus: "Abrir la página de estado →",
    proofTitle: "Opcional: comprueba que la cuenta es tuya",
    proofIntro:
      "Pon un código corto en tu nombre de perfil dentro del juego. Solo tú puedes cambiarlo, así que prueba que la cuenta es tuya — tu petición se aprueba sin preguntas y la tabla muestra el tick de verificado.",
    proofStart: "Dame mi código",
    renameTitle: "Cambia tu nombre en Marvel Snap",
    renameSubtitle: "Deja parte de tu nombre real: lo usamos para confirmar que eres tú.",
    expiresIn: "vence en {n} min",
    yourCode: "TU CÓDIGO",
    shouldLookLike: "TU NOMBRE TIENE QUE QUEDAR ASÍ",
    copy: "Copiar",
    copied: "Copiado",
    fitsOk: "Entra completo: {used} de {max} caracteres.",
    mustTrim:
      "El juego permite {max} caracteres, así que tienes que recortar {n} de tu nombre actual.",
    cacheNote:
      "El leaderboard oficial tarda unos minutos en reflejar un cambio de nombre. Si todavía no lo vemos, espera un momento e intenta de nuevo — no pierdes el código.",
    confirmButton: "Ya lo cambié, verificar",
    confirming: "Buscando…",
    proofDoneTitle: "Propiedad comprobada",
    proofDoneBody:
      "Ya puedes volver a tu nombre de siempre en el juego. Tu petición queda marcada como verificada y solo falta aprobarla.",
    whyTitle: "Por qué se revisa a mano",
    why1:
      "Los canales, las alianzas y los datos de contacto no existen en la API oficial, así que no hay contra qué contrastarlos. Una persona lee cada petición.",
    why2:
      "Eso también nos permite decir que no — a un link que no vamos a publicar, o a alguien reclamando un nombre que no es suyo.",
    limitTitle: "El límite de 20 caracteres",
    limitBody:
      "El juego corta los nombres en 20 caracteres. Si el tuyo ya está al tope, te decimos exactamente cuántos recortar para que el código entre — y armamos el nombre sugerido.",
    afterTitle: "Una vez aprobada",
    after1: "Tus links aparecen junto a tu fila en la tabla.",
    after2: "Empezamos a guardar tu historial para la gráfica.",
    after3: "El tick de verificado solo sale si completaste la prueba opcional.",
    topOnly:
      "Solo se pueden pedir cuentas que estén en el top 1 000 del ladder, que es lo máximo que devuelve la API oficial.",
  },
  request: {
    title: "Tu petición",
    pending: "pendiente",
    approved: "aprobada",
    rejected: "rechazada",
    pendingBody:
      "Quedó en la cola. Revisamos a mano, así que no es inmediato — nada aparece en la tabla hasta que se apruebe.",
    approvedBody:
      "Aprobada. Tus links aparecen junto a tu fila, y ya empezamos a guardar tu historial para la gráfica.",
    rejectedBody: "Esta petición no fue aprobada.",
    reasonLabel: "MOTIVO",
    sentAt: "Enviada",
    reviewedAt: "Revisada",
    tokenLabel: "Código de seguimiento",
    whatYouAsked: "Lo que pediste",
    contactHidden:
      "El contacto que nos dejaste no se muestra acá. Solo lo ve quien revisa, y nunca aparece en el sitio ni en la API pública.",
    notFound:
      "No encontramos ninguna petición con ese código. Revisalo e intentá de nuevo — son 12 caracteres, y los guiones son opcionales.",
    lookupTitle: "Consulta tu petición",
    lookupSubtitle:
      "Pega el código de seguimiento que te dimos cuando enviaste la petición.",
    lookupLabel: "CÓDIGO DE SEGUIMIENTO",
    lookupButton: "Consultar",
    lookupHelp: "12 caracteres. Los guiones y las minúsculas dan igual.",
    proofLabel: "Propiedad",
    proofYes: "Comprobada con el código en el juego",
    proofNo: "Sin comprobar",
    seeProfile: "Ver mi perfil",
    tryAgain: "Enviar una nueva petición",
    dbDown:
      "No podemos conectarnos a la base ahora mismo, así que no podemos mostrarte el estado de tu petición. Sigue ahí — intenta de nuevo en unos minutos.",
  },
  how: {
    title: "Cómo funciona",
    intro:
      "Este es un proyecto no oficial. Lee el mismo leaderboard público que muestra el sitio de Marvel Snap y le agrega dos cosas que ese sitio no tiene: historial de progreso y links verificados de jugadores.",
    s1Title: "De dónde salen los datos",
    s1a: "Del endpoint público del leaderboard oficial. Devuelve el top 1 000 de un ladder que hoy tiene más de 50 000 jugadores, y solo tres campos por fila: puesto, nombre y Snap Points.",
    s1b: "No hay ID de jugador, ni región, ni cardback, ni título, ni alianza. Por eso la identidad aquí es el nombre, con todo lo que eso implica.",
    s2Title: "El historial lo construimos nosotros",
    s2a: "La API oficial solo sirve el mes actual y el anterior: no se le puede pedir un histórico. Cada hora leemos el ladder y guardamos una medición de los jugadores vinculados, y de ahí sale la gráfica de progreso.",
    s2b: "Solo escribimos cuando algo cambió. Si un jugador no se movió en tres horas, eso son tres mediciones idénticas que no aportan nada — la curva se dibuja igual entre dos puntos conocidos.",
    s3Title: "Por qué a veces el Δ 24 h está vacío",
    s3a: "Porque solo guardamos historial de las cuentas vinculadas. Del resto del top 1 000 no sabemos cuánto se movieron, así que mostramos un guión. No saber y no haberse movido son cosas distintas, así que no las dibujamos igual.",
    s4Title: "Las alianzas las declara cada jugador",
    s4a: "El endpoint oficial no expone las alianzas, así que no podemos leer la tuya. Cada jugador escribe su propio tag cuando vincula su cuenta, lo que significa que la columna queda vacía para todos los que no lo hicieron.",
    s5Title: "Nombres repetidos",
    s5a: "Como la identidad es el nombre, dos jugadores que se llaman igual son indistinguibles para nosotros. Pasa: ahora mismo hay varios casos en el top 1 000.",
    s5b: "Cuando detectamos uno marcamos la fila con un triángulo y no le asignamos los links a ninguno, salvo que el historial permita saber cuál es cuál. Preferimos no mostrar nada antes que atribuir el canal de alguien a la persona equivocada.",
    s6Title: "Qué guardamos de ti",
    s6a: "Tu nombre en el juego, los links y la alianza que hayas escrito, y tu historial de puesto y Snap Points. También guardamos el contacto que nos dejaste —Discord o email— para poder responderte por tu petición. Ese contacto es privado: nunca aparece en el sitio ni en la API pública, y no le enviamos nada que no sea sobre tu propia petición.",
    s6b: "Nunca pedimos contraseña ni acceso a tu cuenta de Twitch o YouTube. La comprobación opcional de propiedad funciona porque solo tú puedes cambiar tu nombre de perfil dentro del juego.",
    s6link: "Vincula tu cuenta",
    s6c: "si estás en el top 1 000.",
    s7Title: "Las peticiones se revisan a mano",
    s7a: "Nada de lo que envías aparece en la tabla hasta que una persona lo aprueba, así que no es inmediato. Al enviar una petición te damos un código de seguimiento de 12 caracteres: ese código es la única forma de consultarla después, porque no te escribimos cuando se decide.",
    s7link: "Consulta una petición",
    s7b: "con el código que guardaste.",
    legal:
      "Proyecto no oficial, sin afiliación con Second Dinner ni Nuverse. Marvel Snap y sus marcas pertenecen a sus respectivos dueños.",
  },
  error: {
    boardTitle: "El leaderboard oficial no está respondiendo",
    boardBody:
      "Leemos el ranking en vivo del sitio oficial de Marvel Snap, así que cuando ese endpoint se cae no tenemos de dónde sacarlo. Suele volver solo en unos minutos.",
    boardFallback: "No pudimos comunicarnos con el leaderboard oficial.",
    degraded:
      "Nuestra base de datos no está respondiendo, así que el ranking se muestra sin links, alianzas ni cambios de 24 h. Las posiciones sí son en vivo y correctas.",
    notFoundTitle: "No tenemos datos de ese jugador",
    notFoundBody:
      "Solo guardamos historial de las cuentas que se vincularon. Si eres tú y estás en el top 1 000, puedes vincular tu cuenta.",
    notFoundCta: "Vincula tu cuenta",
  },
};

const DICTIONARIES: Record<Lang, Dictionary> = { en, es };

export function getDictionary(lang: Lang): Dictionary {
  return DICTIONARIES[lang];
}

/**
 * Resuelve los placeholders `{nombre}` de una plantilla.
 *
 *   fill(t.table.showMore, { n: "100" })  ->  "Mostrar 100 más"
 *
 * Existe porque los diccionarios no pueden tener funciones: cruzan la frontera
 * server -> client y React no serializa funciones.
 */
export function fill(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  );
}

export type { Dictionary };
