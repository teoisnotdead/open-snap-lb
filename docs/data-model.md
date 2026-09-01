# Modelo de datos

Base: `opensnaplb` en el cluster `snap-lb` (Atlas M0, 512 MB).
Siete colecciones: `players`, `snapshots`, `submissions`, `alliances`,
`seasonResults`, `boardBaselines` y `boardDailies`.

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

   > `lastRank` lo siembra la aprobación del panel: cuando el nombre está
   > repetido, el admin elige de qué fila se trata y ese puesto queda como
   > semilla. Antes lo escribía solo el sync, y eso era un bloqueo circular: el
   > sync saltea a los homónimos sin `lastRank` para no adivinar, así que un
   > homónimo aprobado no volvía a pasar nada nunca — cada corrida lo salteaba
   > por falta del dato que solo esa corrida podía escribir, sin ningún error
   > visible. `lastScore` sigue siendo exclusivo del sync: sembrarlo le robaría
   > al jugador su primer snapshot, porque el sync omite el punto cuando el
   > score no cambió.
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
| `verified` | boolean | Aprobada por un admin. Hoy es lo mismo que estar acá. |
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

> **Sobre el alcance del índice.** El filtro parcial `verified: true` describía
> un subconjunto cuando había aprobados sin verificar. Hoy toda aprobación
> verifica, así que cubre `players` entero. Se deja igual —recrear el índice no
> compra nada—, y la ruta de aprobación igual chequea el canal antes de escribir
> para poder decir **a quién** pertenece en vez de tirar un E11000 pelado.

### Un doc en `players` significa "aprobado", y eso es también el tick

La única ruta que escribe acá es la aprobación del panel, y desde ahí
`verified` queda siempre en `true`.

Fueron dos ejes distintos: estar en la tabla significaba "un admin lo aprobó" y
el tick significaba "probó que controla la cuenta", con un código que el jugador
pegaba en su nombre de perfil dentro del juego. Se unificaron. Si un humano leyó
la petición y la aceptó, ya dio por buena la identidad; el código no cambiaba esa
decisión y era un trámite que la mayoría abandonaba a mitad. Con él se fueron
`proofVerified`, `proofRank`, `verificationCode` y `verificationExpiresAt`.

Lo único que hacía falta reemplazar era la desambiguación: `proofRank` decía qué
fila del ladder era la del jugador cuando el nombre estaba repetido. Ahora esa
fila la elige el admin al aprobar, que es donde ya estaba el criterio humano.

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

El alfabeto es Crockford base32 sin 0/1/I/L/O/U: el token se dicta y se copia a
mano, así que no puede tener caracteres que se confundan entre sí.

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
```

El tercero es el que importa: **una sola petición pendiente por nombre.** Sin él,
cualquiera puede mandar cien peticiones del mismo jugador y dejar el panel
inusable. El filtro parcial es lo que permite que sí convivan varias
aprobadas/rechazadas históricas del mismo nombre — solo las pendientes compiten.

---

## `alliances`

Un doc por alianza. La entidad que antes no existía: la alianza eran **dos
strings sueltos por jugador**, así que cada miembro guardaba su propia copia del
nombre y la misma alianza terminaba publicada escrita de tres formas.

> **Parcialmente implementada.** Hoy existen la colección, sus índices, el
> backfill y `GET /api/alliances`. El líder, el código de invitación y el
> selector del formulario todavía no: el plan completo y sus decisiones están
> en [`alliances.md`](alliances.md).

| Campo | Tipo | Notas |
|---|---|---|
| `tag` | string | 2–5 alfanuméricos, mayúsculas. **Único.** Clave de identidad |
| `name` | string | Nombre largo, ≤40 chars. Acá vive el único canónico |
| `leaderNameKey?` | string | Quién la lidera. Su `statusToken` es la credencial |
| `joinCode?` | string | 8 caracteres. Se genera al **aprobar**, no al pedir |
| `joinCodeRotatedAt?` | Date | Deja ver si el líder ya rotó, y cuándo |
| `bannedNameKeys` | string[] | Expulsados. No pueden volver aunque tengan un código válido |
| `status` | `pending`/`approved`/`rejected` | Crear una alianza pasa por el panel |
| `rejectionReason?` `reviewedAt?` `reviewedBy?` | | Igual que en `submissions` |
| `createdAt` `updatedAt` | Date | |

**La membresía no vive acá.** Sigue en `players.alliance`, que ahora referencia
un tag que existe en vez de ser texto libre. Guardar además un array de miembros
sería el mismo dato en dos lugares, y el que se desincroniza es siempre el que
nadie mira.

`players.allianceName` queda como **copia denormalizada**, y es una decisión: el
merge del leaderboard —la ruta más caliente del sitio— sigue siendo una sola
lectura de `players`, sin join. Se paga al renombrar una alianza, que obliga a un
`updateMany` sobre sus miembros; es una escritura rara y sobre pocos docs.

### Índices

```js
{ tag: 1 } unique                                  // que no existan dos "JOB"
{ joinCode: 1 } unique, partial: {$exists: true}   // ver abajo
{ status: 1, createdAt: 1 }                        // la cola del panel
{ leaderNameKey: 1 }                               // "¿de qué alianza soy dueño?"
```

**`uniq_join_code` es PARCIAL, y no es un detalle.** La mayoría de las alianzas
no tiene código: las que crea el backfill no tienen líder, y sin líder no hay
código. Un índice único común trata los campos ausentes como `null` y deja pasar
**un solo** documento sin código, así que la segunda alianza sin líder explotaría
con un duplicate key que no tiene nada que ver con lo que se quiso impedir.

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

## `boardBaselines`

Una foto del ladder **entero** por corrida, comprimida en un solo documento.

| Campo | Tipo | Notas |
|---|---|---|
| `syncId` | string | La misma corrida que los `snapshots` de esa hora. Único |
| `timestamp` | Date | Lleva el TTL |
| `season` | string | `"YYYY-MM"` |
| `total` | number | Jugadores en todo el ladder, no solo los 1000 |
| `rows` | `{n,s}[]` | Una entrada por fila: `n` = nameKey, `s` = score |

### Por qué existe

Para que el **Δ 24 h de la tabla exista para las 1000 filas**, no solo para los
jugadores vinculados. Antes ese número salía de `snapshots`, que por diseño solo
cubre a quien pidió su ficha, así que la enorme mayoría de la tabla mostraba un
guión permanente.

Y para eso no hace falta una serie temporal de todos: hace falta **un valor por
fila de hace un día**. Esa es toda la diferencia de costo.

### Por qué un documento y no mil

Un snapshot por jugador por hora para el top 1000 son 8.76 M docs y ~2.2 GB al
año — cuatro veces el M0 entero, y eso recortando por "solo si cambió" ni
siquiera alcanzaba. Un documento por corrida son ~35 KB, y el TTL lo deja fijo
en menos de 3 MB para siempre.

Las claves de `rows` son de una letra por lo mismo: con 1000 entradas, escribir
`nameKey` y `score` completos agrega ~14 KB por documento sin decir nada que el
comentario del tipo no diga.

Tampoco es un mapa `nameKey → score`: se guardan **todas** las filas, repetidos
incluidos. Colapsarlos escondería la ambigüedad justo donde importa. Al leer, un
nameKey que aparece dos veces se descarta y esa fila vuelve a mostrar un guión
— restarle el score del homónimo equivocado daría un número inventado con pinta
de dato.

### Índices

```js
{ timestamp: -1 }                              // el baseline anterior al corte
{ timestamp: 1 } expireAfterSeconds: 259200    // TTL de 72 h
{ syncId: 1 } unique                           // idempotencia del reintento
```

El TTL es lo que vuelve constante el costo: sin él, 35 KB por hora son ~300 MB
al año. Se guardan 72 h y no 24 porque el mínimo útil es un día: con margen, si
el cron se cae una noche entera, al volver todavía hay contra qué comparar en
vez de mostrar guiones en las 1000 filas.

> **No es un archivo histórico.** Se borra solo y a propósito. Para el pasado
> están `snapshots` (la curva de los vinculados) y `seasonResults` (el cierre de
> cada temporada).

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

A eso se le suman las dos colecciones comprimidas del ladder, que sí cubren el
top 1000 pero con un costo de otra escala:

| Colección | Docs/año | Tamaño |
|---|---|---|
| `snapshots` del top 1000, un doc por jugador y hora | 8.76 M | ~2.2 GB/año ❌ |
| `boardBaselines`, un doc por hora con TTL de 72 h | 72 vivos | **~2.5 MB constantes** |
| `boardDailies`, un doc por día sin TTL | 365 | **~13 MB/año** |

La diferencia entera está en no guardar una serie temporal por jugador cuando lo
que se necesita es un punto por fila: uno de hace un día para el Δ 24 h, uno por
jornada para la gráfica.

---

## `boardDailies`

Una foto del ladder entero **por día**, con el mismo formato comprimido que
`boardBaselines` pero **sin TTL**: esto sí es archivo.

| Campo | Tipo | Notas |
|---|---|---|
| `day` | string | `"YYYY-MM-DD"` UTC. Único: la idempotencia del día |
| `timestamp` | Date | Momento de la corrida que quedó como foto |
| `season` | string | `"YYYY-MM"` |
| `total` | number | Jugadores en todo el ladder, no solo los 1000 |
| `rows` | `{n,s}[]` | Igual que en `boardBaselines`. El ORDEN es el rank |

### Por qué existe

Para que **la gráfica de progreso no sea un privilegio de los vinculados**.
`snapshots` solo cubre a quien pidió su ficha y las baselines se borran a las
72 h, así que sin esto el 99% del ladder no tenía historia que mostrar por más
que el cron lo estuviera leyendo cada hora — y la tabla, que linkea las 1000
filas, prometía un detalle que casi nunca existía.

Lo que se paga es resolución: un punto por día en vez de uno por hora. Esa sigue
siendo la ventaja concreta de vincular, junto con el tilde de verificado, los
canales y la alianza.

### Por qué el rank no se guarda

Sale del índice del array: `rows` va en orden de puesto, así que la fila *i* es
el rank *i+1*. Guardarlo como campo agregaría ~5 KB por documento para repetir
un dato que la posición ya expresa.

### Cómo se lee

Con una agregación, no en JS. Cada documento son las 1000 filas (~35 KB): traer
un año entero al proceso para buscar una fila serían ~13 MB por visita a una
ficha. El `$filter` corre en Mongo y devuelve un puñado de bytes por día.

No hay ni puede haber índice por jugador —el nameKey vive dentro de un array de
1000 entradas— así que el recorrido es secuencial por `timestamp`. Es el costo
aceptado a cambio de que la escritura sea un documento por día.

### Índices

| Índice | Clave | Para qué |
|---|---|---|
| `uniq_day` | `{day:1}` unique | Idempotencia: solo la primera corrida del día escribe |
| `by_time` | `{timestamp:1}` | Orden de la serie, sin sort en memoria |

Sin TTL, deliberadamente.

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
| `lib/tokens.ts` | El token de seguimiento: generación, formato y parseo. |
| `scripts/ensure-indexes.ts` | `npm run db:indexes` — idempotente. Borra los índices obsoletos. |
| `scripts/smoke.ts` | `npm run db:smoke` — 10 checks contra Atlas, se autolimpia. |

### Por qué se cachea la promesa y no el cliente
Si se cacheara el cliente ya resuelto, dos requests concurrentes durante un
arranque en frío podrían disparar dos handshakes. Cacheando la promesa, el
segundo request espera el mismo connect. En dev va a `globalThis` para
sobrevivir al HMR de Next.
