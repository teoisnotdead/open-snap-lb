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
      "Ask for your channels and alliance to show up next to your row in the leaderboard.",
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
    results: "results",
    linkCta: "Link your account",
    showMore: "Show {n} more",
    noResults: "Nobody matches “{q}” in the top {total}.",
    verifiedTooltip: "Verified account — reviewed by hand",
    ambiguousTooltip:
      "More than one player shares this name in the ladder. Without history we can't tell them apart, so we don't show links.",
    unknownDelta: "We don't know what this player had 24 h ago",
    deltaTooltip:
      "Snap Points gained or lost in the last 24 h. Δ is “delta”, the sign for a difference.",
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
    gapToNext: "{n} SP to #{rank}",
    gapTied: "tied with #{rank}",
    gapLead: "{n} SP ahead of #{rank}",
    alliance: "ALLIANCE",
  },
  overlay: {
    title: "Stream overlay",
    body: "Your row and the ones around you, as a transparent layer for OBS. Add it as a Browser Source — it needs nothing from Twitch, and works the same on YouTube or Kick.",
    how: "OBS → + → Browser, paste the URL, width 360. Add ?rows=7 for more rows.",
    pinnedWarning:
      "Your name is repeated in the ladder, so the URL carries your rank (#{rank}) to tell you apart. It stops matching if you change rank — come back and copy it again.",
    teaserTitle: "Do you stream?",
    teaserBody:
      "Linked accounts get an overlay for OBS: your row and the ones around you, live on stream.",
    teaserCta: "Link your account",
  },
  chart: {
    spTitle: "{name}’s Snap Points",
    spSubtitle:
      "One point per detected change. A flat line means they didn't move, not that data is missing.",
    spSubtitleDaily:
      "One point per day, from the daily ladder archive. Link this account and we start recording it every hour.",
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
      "More than one player shares this name in the ladder. Tell us in the note below which row is yours — otherwise whoever reviews your request has to guess.",
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
    sentKeepEdit:
      "It's also your key to edit: once the request is approved, that same code lets you change your channels and your alliance yourself, from the status page and published straight away — no second review, no waiting for anyone.",
    sentOpenStatus: "Open the status page →",
    copy: "Copy",
    copied: "Copied",
    whyTitle: "Why it's reviewed by hand",
    why1:
      "Channels, alliances and contact details don't exist in the official API, so there's nothing to check them against. A person reads every request.",
    why2:
      "That also means we can say no — to a link we won't publish, or to somebody claiming a name that isn't theirs.",
    afterTitle: "Once approved",
    after1: "Your links appear next to your row in the table.",
    after2: "Your chart goes from one point a day to one every hour.",
    after3: "Your row gets the verified tick: here, approving is verifying.",
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
      "Approved. Your links show next to your row, and your chart now records every hour instead of once a day.",
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
    seeProfile: "See my profile",
    tryAgain: "Send a new request",
    editTitle: "Edit your details",
    editSubtitle:
      "Your request is approved, so changes here go live straight away — no second review. Clear a field to remove it.",
    editOpen: "Edit",
    editCancel: "Cancel",
    editSave: "Save changes",
    editSaving: "Saving…",
    editSaved: "Saved. The table shows the new details on its next load.",
    editLocked:
      "Your contact details and your player name can't be changed here — write to us if either needs to change. Everything else is yours to edit.",
    editedAt: "Last edited",
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
    s2a: "The official API only serves the current and previous month — you can't ask it for a back catalogue. So we build it: every hour we read the ladder and store one compressed snapshot of all 1 000 rows, and once a day we keep one for good. That daily archive is why every player on the ladder has a chart, linked or not.",
    s2b: "Linking adds resolution, not existence: from then on we also store a measurement of that player every hour, and only when something actually changed. If someone hasn't moved in three hours, three identical measurements add nothing — the curve draws the same between two known points.",
    s3Title: "Why Δ 24 h is sometimes blank",
    s3a: "Every hourly run also stores the whole ladder as a single compressed row, so the 24 h change is there for all 1 000 players, linked or not. It stays blank in three cases: we don't have a reading from a day ago yet, the player wasn't in the top 1 000 back then, or their name is repeated and we can't tell which row was which. Not knowing and not moving are different things, so we don't draw them the same.",
    s4Title: "Alliances are self-reported",
    s4a: "The official endpoint doesn't expose alliances, so we can't read yours. Players fill in their own tag when they link their account, which means the column stays empty for everyone who hasn't.",
    s5Title: "Repeated names",
    s5a: "Because identity is the name, two players called the same thing are indistinguishable to us. It happens: there are several cases in the top 1 000 right now.",
    s5b: "When we spot one we mark the row with a triangle and attach links to neither, unless history lets us tell which is which. We'd rather show nothing than credit someone's channel to the wrong person.",
    s6Title: "What we store about you",
    s6a: "Your in-game name, the links and alliance you entered, and your history of rank and Snap Points. We also keep the contact you gave us — Discord or email — so we can reply about your request. That contact is private: it never appears on the site or in the public API, and we don't send anything to it unless it's about your own request.",
    s6b: "We never ask for a password or access to your Twitch or YouTube account, and there's nothing to install. Whoever reviews decides with what you sent and what the public ladder shows.",
    s6link: "Link your account",
    s6c: "if you're in the top 1 000.",
    s7Title: "Requests are reviewed by hand",
    s7a: "Nothing you send shows up on the table until a person approves it, so it isn't instant. That review is also the verification: the tick next to a name means someone read the request and accepted it. When you send one we give you a 12-character tracking code — that code is the only way to look it up later, because we don't write to you when it's decided.",
    s7link: "Check a request",
    s7b: "with the code you saved.",
    s8Title: "Editing later is automatic",
    s8a: "That by-hand review happens once. After your request is approved, the same tracking code lets you change your channels, your alliance tag and its name from the status page — and the change is published on the spot. No second review, no queue, no waiting. Clearing a field removes it.",
    s8b: "It works that way because none of those fields can be checked against the official API: a Twitch handle and an alliance name are just as unprovable the day you edit them as the day they were approved, so sending them back to the queue would add a wait without adding certainty — while the outdated data stays on the table. What approval settled was who you are, and changing a link doesn't reopen that.",
    s8c: "Which is why the code is worth guarding: whoever holds it can change what shows next to your name. Every edit is stamped with a date and counted, and both the status page and the review panel show it. Your contact details and your player name are the exception — those aren't editable with the code, so write to us if either has to change.",
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
      "This name hasn't shown up in any of our daily ladder snapshots yet — it may have just entered the top 1 000. If it's you, linking your account also starts an hourly record.",
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
      "Pide que tus canales y tu alianza aparezcan junto a tu fila en el leaderboard.",
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
    results: "resultados",
    linkCta: "Vincula tu cuenta",
    showMore: "Mostrar {n} más",
    noResults: "Nadie coincide con “{q}” en el top {total}.",
    verifiedTooltip: "Cuenta verificada — revisada a mano",
    ambiguousTooltip:
      "Hay más de un jugador con este nombre en el ladder. Sin historial no podemos distinguirlos, así que no mostramos links.",
    unknownDelta: "No sabemos cuántos SP tenía este jugador hace 24 h",
    deltaTooltip:
      "Snap Points ganados o perdidos en las últimas 24 h. Δ es “delta”, el signo de una diferencia.",
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
    gapToNext: "a {n} SP del #{rank}",
    gapTied: "empatado con el #{rank}",
    gapLead: "{n} SP de ventaja sobre el #{rank}",
    alliance: "ALIANZA",
  },
  overlay: {
    title: "Overlay para stream",
    body: "Tu fila y las de alrededor, como capa transparente para OBS. Se agrega como Browser Source — no necesita nada de Twitch, y sirve igual en YouTube o Kick.",
    how: "OBS → + → Browser, pega la URL, ancho 360. Agrega ?rows=7 si quieres más filas.",
    pinnedWarning:
      "Tu nombre está repetido en el ladder, así que la URL lleva tu puesto (#{rank}) para distinguirte. Deja de coincidir si cambias de puesto — vuelve y cópiala de nuevo.",
    teaserTitle: "¿Haces streams?",
    teaserBody:
      "Las cuentas vinculadas se llevan un overlay para OBS: tu fila y las de alrededor, en vivo en el stream.",
    teaserCta: "Vincula tu cuenta",
  },
  chart: {
    spTitle: "Snap Points de {name}",
    spSubtitle:
      "Un punto por cada cambio detectado. La línea plana significa que no se movió, no que falten datos.",
    spSubtitleDaily:
      "Un punto por día, del archivo diario del ladder. Al vincular esta cuenta empezamos a registrarla cada hora.",
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
      "Hay más de un jugador con este nombre en el ladder. Cuéntanos en la nota de abajo cuál es tu fila — si no, quien revise tu petición tiene que adivinar.",
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
    sentKeepEdit:
      "También es tu llave para editar: una vez aprobada la petición, ese mismo código te deja cambiar tus canales y tu alianza por tu cuenta, desde la página de estado y publicándose en el momento — sin una segunda revisión y sin esperar a nadie.",
    sentOpenStatus: "Abrir la página de estado →",
    copy: "Copiar",
    copied: "Copiado",
    whyTitle: "Por qué se revisa a mano",
    why1:
      "Los canales, las alianzas y los datos de contacto no existen en la API oficial, así que no hay contra qué contrastarlos. Una persona lee cada petición.",
    why2:
      "Eso también nos permite decir que no — a un link que no vamos a publicar, o a alguien reclamando un nombre que no es suyo.",
    afterTitle: "Una vez aprobada",
    after1: "Tus links aparecen junto a tu fila en la tabla.",
    after2: "Tu gráfica pasa de un punto por día a uno por hora.",
    after3: "Tu fila se lleva el tick de verificado: aquí aprobar es verificar.",
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
      "Aprobada. Tus links aparecen junto a tu fila, y tu gráfica pasa a registrarse cada hora en vez de una vez por día.",
    rejectedBody: "Esta petición no fue aprobada.",
    reasonLabel: "MOTIVO",
    sentAt: "Enviada",
    reviewedAt: "Revisada",
    tokenLabel: "Código de seguimiento",
    whatYouAsked: "Lo que pediste",
    contactHidden:
      "El contacto que nos dejaste no se muestra acá. Solo lo ve quien revisa, y nunca aparece en el sitio ni en la API pública.",
    notFound:
      "No encontramos ninguna petición con ese código. Revísalo e intenta de nuevo — son 12 caracteres, y los guiones son opcionales.",
    lookupTitle: "Consulta tu petición",
    lookupSubtitle:
      "Pega el código de seguimiento que te dimos cuando enviaste la petición.",
    lookupLabel: "CÓDIGO DE SEGUIMIENTO",
    lookupButton: "Consultar",
    lookupHelp: "12 caracteres. Los guiones y las minúsculas dan igual.",
    seeProfile: "Ver mi perfil",
    tryAgain: "Enviar una nueva petición",
    editTitle: "Edita tus datos",
    editSubtitle:
      "Tu petición está aprobada, así que lo que cambies aquí se publica en el momento: no hay una segunda revisión. Deja un campo vacío para quitarlo.",
    editOpen: "Editar",
    editCancel: "Cancelar",
    editSave: "Guardar cambios",
    editSaving: "Guardando…",
    editSaved: "Guardado. La tabla muestra los datos nuevos la próxima vez que cargue.",
    editLocked:
      "Tu contacto y tu nombre de jugador no se cambian aquí — escríbenos si alguno tiene que cambiar. Todo lo demás lo editas tú.",
    editedAt: "Última edición",
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
    s2a: "La API oficial solo sirve el mes actual y el anterior: no se le puede pedir un histórico. Así que lo construimos: cada hora leemos el ladder y guardamos una foto comprimida de las 1 000 filas, y una vez por día nos quedamos con una para siempre. Ese archivo diario es lo que hace que cualquier jugador del ladder tenga gráfica, se haya vinculado o no.",
    s2b: "Vincular suma resolución, no existencia: desde ese momento guardamos además una medición de ese jugador cada hora, y solo cuando algo cambió de verdad. Si alguien no se movió en tres horas, tres mediciones idénticas no aportan nada — la curva se dibuja igual entre dos puntos conocidos.",
    s3Title: "Por qué a veces el Δ 24 h está vacío",
    s3a: "Cada corrida horaria guarda además el ladder entero en una sola fila comprimida, así que el cambio de 24 h está para los 1 000 jugadores, se hayan vinculado o no. Queda vacío en tres casos: todavía no tenemos una lectura de hace un día, el jugador no estaba en el top 1 000 entonces, o su nombre está repetido y no podemos saber cuál fila era cuál. No saber y no haberse movido son cosas distintas, así que no las dibujamos igual.",
    s4Title: "Las alianzas las declara cada jugador",
    s4a: "El endpoint oficial no expone las alianzas, así que no podemos leer la tuya. Cada jugador escribe su propio tag cuando vincula su cuenta, lo que significa que la columna queda vacía para todos los que no lo hicieron.",
    s5Title: "Nombres repetidos",
    s5a: "Como la identidad es el nombre, dos jugadores que se llaman igual son indistinguibles para nosotros. Pasa: ahora mismo hay varios casos en el top 1 000.",
    s5b: "Cuando detectamos uno marcamos la fila con un triángulo y no le asignamos los links a ninguno, salvo que el historial permita saber cuál es cuál. Preferimos no mostrar nada antes que atribuir el canal de alguien a la persona equivocada.",
    s6Title: "Qué guardamos de ti",
    s6a: "Tu nombre en el juego, los links y la alianza que hayas escrito, y tu historial de puesto y Snap Points. También guardamos el contacto que nos dejaste —Discord o email— para poder responderte por tu petición. Ese contacto es privado: nunca aparece en el sitio ni en la API pública, y no le enviamos nada que no sea sobre tu propia petición.",
    s6b: "Nunca pedimos contraseña ni acceso a tu cuenta de Twitch o YouTube, y no hay nada que instalar. Quien revisa decide con lo que enviaste y con lo que muestra el ladder público.",
    s6link: "Vincula tu cuenta",
    s6c: "si estás en el top 1 000.",
    s7Title: "Las peticiones se revisan a mano",
    s7a: "Nada de lo que envías aparece en la tabla hasta que una persona lo aprueba, así que no es inmediato. Esa revisión es también la verificación: el tick junto a un nombre significa que alguien leyó la petición y la aceptó. Al enviar una te damos un código de seguimiento de 12 caracteres: ese código es la única forma de consultarla después, porque no te escribimos cuando se decide.",
    s7link: "Consulta una petición",
    s7b: "con el código que guardaste.",
    s8Title: "Editar después es automático",
    s8a: "Esa revisión a mano ocurre una sola vez. Una vez aprobada tu petición, el mismo código de seguimiento te deja cambiar tus canales, el tag de tu alianza y su nombre desde la página de estado — y el cambio se publica en el momento. Sin una segunda revisión, sin cola y sin esperar. Dejar un campo vacío lo quita.",
    s8b: "Funciona así porque nada de eso se puede comprobar contra la API oficial: un handle de Twitch y un nombre de alianza son tan indemostrables el día que los editas como el día que se aprobaron, así que mandarlos de vuelta a la cola agregaría espera sin agregar certeza — y mientras tanto el dato viejo sigue en la tabla. Lo que la aprobación decidió fue quién eres, y cambiar un link no vuelve a abrir esa pregunta.",
    s8c: "Por eso vale la pena cuidar el código: quien lo tenga puede cambiar lo que se muestra junto a tu nombre. Cada edición queda fechada y contada, y se ve tanto en la página de estado como en el panel de revisión. La excepción es tu contacto y tu nombre de jugador: esos no se editan con el código, así que escríbenos si alguno tiene que cambiar.",
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
      "Este nombre todavía no aparece en ninguna de nuestras fotos diarias del ladder — puede que acabe de entrar al top 1 000. Si eres tú, vincular tu cuenta además arranca el registro por hora.",
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
