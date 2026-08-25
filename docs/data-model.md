# Modelo de datos

Base: `opensnaplb` en el cluster `snap-lb` (Atlas M0, 512 MB).
Cuatro colecciones: `players`, `snapshots`, `submissions` y `seasonResults`.

> Jerarquía de Atlas, que confunde: **proyecto** `open-snap-lb` → **cluster**
> `snap-lb` → **base** `opensnaplb` → colecciones. La base no se crea desde la
> UI: aparece sola en la primera escritura.

---

## Decisión de identidad: `nameKey`, no `uid`

La Fase 0 demostró que el endpoint oficial solo devuelve `rank`, `playerName` y
`score` — no hay uid (ver `leaderboard-api.md` §3). El plan original usaba un
`uid` que en realidad venía de Cloudflare Workers de terceros.

**Decisión tomada: opción (A).** La identidad es el nombre normalizado, y no
dependemos de ninguna fuente externa. También se descartó `region`: ya no hay
regiones en el juego, y de hecho la API ignora el parámetro.

`nameKey = playerName` → NFC → colapso de espacios → trim → lowercase.
Implementado en `lib/names.ts`.

### Lo que esto cuesta, explícito

1. **Nombres duplicados.** Hoy mismo hay 3 en el top 1000 (`Leaf`, `Jay`,
   `I AM`). Un `nameKey` puede corresponder a más de una fila del ladder. Por
   eso `players` guarda `lastRank`: cuando hay ambigüedad, el merge elige la
   fila cuyo rank esté más cerca del último conocido, y si no hay histórico
   marca la fila como `ambiguous` y no le pega los links.

   > `lastRank` lo siembra la aprobación del panel, con `proofRank`: la fila que
   > probó control de la cuenta. Antes lo escribía solo el sync, y eso era un bloqueo
   > circular: el sync saltea a los homónimos sin `lastRank` para no adivinar,
   > así que un homónimo se verificaba bien y después no volvía a pasar nada
   > nunca — cada corrida lo salteaba por falta del dato que solo esa corrida
   > podía escribir, sin ningún error visible. `lastScore` sigue siendo
   > exclusivo del sync: sembrarlo le robaría al jugador su primer snapshot,
   > porque el sync omite el punto cuando el score no cambió.
2. **El nombre es mutable.** Si un jugador aprobado se cambia el nombre, su
   `nameKey` deja de aparecer en el ladder y su historial deja de crecer, en
   silencio. Es detectable (`lastSeenAt` se queda viejo) y se resuelve con una
   petición nueva. Peor: si además abandona el nombre, otro puede pedirlo —
   sin IDs de jugador, controlar el nombre *es* la identidad.
3. **Lowercase colapsa `Leaf` y `leaf`**, que en el juego son cuentas
   distintas. Se acepta a propósito: la ambigüedad hay que manejarla igual por
   el punto 1, y a cambio el formulario perdona errores de mayúsculas.

---

## `players`

Un doc por jugador **aprobado**, o al que le pusimos un nombre patcheado.
**No** hay un doc por cada jugador del top 1000.

| Campo | Tipo | Notas |
|---|---|---|
| `nameKey` | string | **Clave de identidad.** Único. |
| `playerName` | string | Último nombre exacto visto, con mayúsculas y espacios reales. |
| `patchedName?` | string | Override de display. Equivale al `patches.json` del original. |
| `twitch?` | string | Handle pelado, minúscula. |
| `youtube?` | string | Handle sin `@`, minúscula. |
| `untapped?` | string | URL completa: los UUIDs no se pueden derivar de la API. |
| `alliance?` | string | Tag, en mayúsculas. Declarado, indemostrable. |
| `allianceName?` | string | Nombre largo. Tooltip del tag en la tabla. |
| `verified` | boolean | Probó control de la cuenta. **No** significa "aprobado". |
| `verifiedAt?` | Date | |
| `lastSeenAt?` | Date | Última vez visto en el ladder. |
| `lastRank?` `lastScore?` | number | Denormalizado del último sync. |
| `peakRank?` `peakScore?` | number | Se mantienen con `$min`/`$max`. |
| `createdAt` `updatedAt` | Date | |

**`rank` es siempre 1-indexed en nuestro sistema.** La API lo manda 0-indexed
y se normaliza al entrar; es la clase de detalle que causa un off-by-one en la
UI seis semanas después.

### Índices

| Nombre | Clave | Tipo |
|---|---|---|
| `uniq_nameKey` | `{nameKey:1}` | unique |
| `uniq_twitch_verified` | `{twitch:1}` | unique **parcial** |
| `uniq_youtube_verified` | `{youtube:1}` | unique **parcial** |
| `uniq_untapped_verified` | `{untapped:1}` | unique **parcial** |
| `verified_rank` | `{verified:1,lastRank:1}` | |

El filtro parcial es `{ verified: true, <campo>: { $type: "string" } }`.

> **El `$type: "string"` no es decorativo.** Sin él, todos los jugadores
> verificados que no tienen Twitch entran al índice como `null` y chocan entre
> sí — o sea, solo *un* jugador podría estar verificado sin Twitch. Con el
> `$type`, los docs sin el campo quedan fuera del índice.

Verificado con 7 casos contra un `mongod` real (incluyendo que promover a
`verified: true` con un handle ya tomado tira `E11000`).

> **Ojo con el alcance del índice.** El filtro parcial `verified: true` significa
> que dos jugadores **aprobados sin prueba** pueden declarar el mismo Twitch sin
> que Mongo diga nada. Por eso la ruta de aprobación lo chequea explícitamente
> antes de escribir.

### Un doc en `players` significa "aprobado"

Ya no se crea uno al pedir un código: la única ruta que escribe acá es la
aprobación del panel. `verified` es un eje **independiente** — vale lo que valga
`proofVerified` en la petición, no la aprobación. Estar en la tabla y tener el
tick son cosas distintas.

`verificationCode` se mudó a `submissions`, que es donde vive el flujo del
código ahora.

---

## `submissions`

La cola de revisión. Una petición por lo que alguien quiere mostrar junto a su
nombre.

| Campo | Tipo | Notas |
|---|---|---|
| `statusToken` | string | **La llave pública.** Aleatorio, único, 12 chars |
| `nameKey` / `playerName` | string | Cuenta reclamada |
| `twitch` / `youtube` / `untapped` | string? | Ya normalizados al entrar |
| `allianceTag` / `allianceName` | string? | Indemostrables: no están en la API |
| `discord` / `email` | string? | **PRIVADOS.** Nunca salen por una ruta pública |
| `note` | string? | Texto libre del solicitante |
| `proofVerified` | boolean | El sello, no el permiso |
| `proofRank` | number? | Rank de la fila que probó control. Semilla de desambiguación |
| `verificationCode` / `verificationExpiresAt` | — | Código pendiente |
| `status` | `pending`/`approved`/`rejected` | |
| `rejectionReason` | string? | Obligatorio al rechazar |
| `reviewedAt` / `reviewedBy` | | |

### El público entra por `statusToken`, no por `_id`

Los ObjectId de Mongo son timestamp + valor por proceso + **contador
incremental**: dos peticiones seguidas difieren en el último dígito. Usarlos
como llave pública dejaría que quien manda una petición lea las de al lado
probando ids vecinos.

Por eso hay dos llaves con alcances distintos: **`statusToken` para lo público**
(aleatorio, 30^12) y **`_id` solo para el panel**, que ya está detrás de sesión.

Y el token es distinto del código de verificación a propósito: ese va en el
nombre del perfil, o sea que aparece en el leaderboard público.

### Los datos de contacto no se copian a `players`

`players` es la colección que se sirve en público. El contacto vive **solo** acá
y solo se ve en el panel. Un email de un tercero filtrado por la API pública es
un problema distinto y peor que cualquier otro de este proyecto.

### Índices

```js
{ statusToken: 1 } unique                       // la llave pública
{ status: 1, createdAt: 1 }                    // la cola del panel
{ nameKey: 1, createdAt: -1 }                  // historial por jugador
{ nameKey: 1 } unique, partial: {status:"pending"}
{ verificationCode: 1 } sparse
```

El tercero es el que importa: **una sola petición pendiente por nombre.** Sin él,
cualquiera puede mandar cien peticiones del mismo jugador y dejar el panel
inusable. El filtro parcial es lo que permite que sí convivan varias
aprobadas/rechazadas históricas del mismo nombre — solo las pendientes compiten.

### Sobre el TTL que *no* pusimos

`verificationCode` no lleva índice TTL: un TTL borra el **documento entero**, no
el campo, así que se llevaría puesta la petición. El vencimiento se chequea en la
ruta contra `verificationExpiresAt`.

---

## `seasonResults`

El cierre de cada temporada: una fila por jugador del top 1000, congelada.

| Campo | Tipo | Notas |
|---|---|---|
| `season` | string | "YYYY-MM" |
| `rank` | number | 1-indexed. **Único dentro de la temporada** |
| `playerName` / `nameKey` | string | |
| `score` | number | SP con los que terminó |
| `total` | number | Jugadores en TODO el ladder esa temporada |
| `capturedAt` | Date | |

### Por qué existe

La API oficial solo sirve el mes corriente y el anterior — junio 2026 ya
devuelve `invalid_month`. Cuando una temporada sale de esa ventana **desaparece
para siempre**: ni nosotros ni nadie puede reconstruir quién terminó dónde.

Es el único dato del proyecto que no admite recuperarse después, y por eso el
archivado va enganchado al cron y no a una tarea que alguien tenga que acordarse
de correr.

A diferencia de `snapshots`, que solo cubre a los jugadores aprobados, acá
quedan los 1000 — hayan pedido su ficha o no.

> **Hoy no se muestra en ningún lado.** Por decisión de producto el sitio
> expone solo el mes corriente y el anterior. Se archiva igual porque el dato
> no admite recuperarse después: es la diferencia entre "no lo mostramos" —
> reversible— y "no lo tenemos" —definitivo.

### Índices

```js
{ season: 1, rank: 1 } unique   // la tabla de la temporada, e idempotencia
{ nameKey: 1, season: -1 }      // las temporadas de un jugador
```

> **El único es por PUESTO, no por nombre.** Dentro de una misma temporada hay
> nombres repetidos —en julio "Leaf" aparece en el #139 y en el #161— y un
> único sobre `{season, nameKey}` habría rechazado al segundo, dejando el
> archivo incompleto justo en el caso ambiguo. El puesto sí es único.

La consulta por jugador devuelve **las dos filas** cuando el nombre está
repetido. Es lo honesto: no sabemos cuál es cuál, y elegir una sería inventar.

### Cuánto ocupa

236 KB por temporada, índices incluidos — unas 4 temporadas por MB. En el M0 de
512 MB entran más de un siglo.

---

## `snapshots`

Append-only, un doc por jugador por corrida.

| Campo | Tipo | Notas |
|---|---|---|
| `nameKey` | string | |
| `playerName` | string | Nombre exacto en ese momento: deja ver cambios de nombre. |
| `timestamp` | Date | |
| `rank` | number | 1-indexed. |
| `score` | number | Snap Points. Es lo que grafica recharts. |
| `season` | string | `"YYYY-MM"`, derivado del `month` consultado. |
| `syncId` | string | Identifica la corrida. |

Se cayeron `cardback` y `title` del plan original: **no existen en ninguna
fuente disponible**.

### Índices

| Nombre | Clave | Tipo |
|---|---|---|
| `player_history` | `{nameKey:1, timestamp:-1}` | query de la gráfica |
| `uniq_player_sync` | `{nameKey:1, syncId:1}` | unique — idempotencia |
| `by_sync` | `{syncId:1}` | inspeccionar/revertir una corrida |

`uniq_player_sync` hace que el sync sea **idempotente**: si GitHub Actions
reintenta una corrida (timeout, fallo de red), el mismo par jugador+corrida no
se puede insertar dos veces. Sin esto, un reintento ensucia la gráfica con
puntos duplicados.

---

## Presupuesto de almacenamiento en M0 (512 MB)

Cada snapshot pesa ~250 B con índices incluidos. Con sync **cada hora**:

| Jugadores en `players` | Docs/año | Tamaño/año |
|---|---|---|
| 50 | 438 K | ~110 MB |
| 200 | 1.75 M | ~440 MB |
| 500 | 4.4 M | ~1.1 GB ❌ |

Con 200 jugadores ya estamos al 85% del tier gratis al año. Dos mitigaciones,
para decidir en Fase 2:

1. **Escribir solo cuando cambia** `rank` o `score`. La mayoría de los
   jugadores no se mueven cada hora; esto recorta el volumen varias veces y no
   pierde información, porque una serie temporal con puntos solo en los
   cambios se grafica igual (step/línea entre puntos conocidos).
2. **Retención**: bajar la resolución de lo viejo (dejar un punto por día
   pasados 90 días) en vez de borrar.

Ninguna se implementa todavía. Lo que sí ya está: el sync arranca **limitado a
los jugadores que están en `players`**, no al top 1000 completo, tal como pide
el plan.

---

## Archivos

| Archivo | Qué hace |
|---|---|
| `lib/mongodb.ts` | Cliente cacheado en global. Cachea la *promesa*, no el cliente. |
| `lib/dns-bootstrap.ts` | Escape hatch DNS opt-in para dev local (no-op en Vercel). |
| `lib/types.ts` | `PlayerDoc`, `SnapshotDoc`, tipos de la API cruda y del merge. |
| `lib/names.ts` | `toNameKey`, `toDisplayName`. |
| `lib/socials.ts` | Parseo/canonicalización de Twitch, YouTube y Untapped. |
| `lib/db.ts` | Accessors de colecciones, definición de índices, `ensureIndexes`. |
| `scripts/ensure-indexes.ts` | `npm run db:indexes` — idempotente. |
| `scripts/smoke.ts` | `npm run db:smoke` — 10 checks contra Atlas, se autolimpia. |

### Por qué se cachea la promesa y no el cliente
Si se cacheara el cliente ya resuelto, dos requests concurrentes durante un
arranque en frío podrían disparar dos handshakes. Cacheando la promesa, el
segundo request espera el mismo connect. En dev va a `globalThis` para
sobrevivir al HMR de Next.
