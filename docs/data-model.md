# Modelo de datos (Fase 1)

Base: `opensnaplb` en el cluster `snap-lb` (Atlas M0, 512 MB).
Dos colecciones: `players` y `snapshots`.

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
2. **El nombre es mutable.** Si un jugador verificado se cambia el nombre,
   su `nameKey` deja de aparecer en el ladder. Es detectable (`lastSeenAt` se
   queda viejo) y se resuelve re-verificando.
3. **Lowercase colapsa `Leaf` y `leaf`**, que en el juego son cuentas
   distintas. Se acepta a propósito: la ambigüedad hay que manejarla igual por
   el punto 1, y a cambio el formulario perdona errores de mayúsculas.

---

## `players`

Un doc por jugador que se vinculó o al que le pusimos un nombre patcheado.
**No** hay un doc por cada jugador del top 1000.

| Campo | Tipo | Notas |
|---|---|---|
| `nameKey` | string | **Clave de identidad.** Único. |
| `playerName` | string | Último nombre exacto visto, con mayúsculas y espacios reales. |
| `patchedName?` | string | Override de display. Equivale al `patches.json` del original. |
| `twitch?` | string | Handle pelado, minúscula. |
| `youtube?` | string | Handle sin `@`, minúscula. |
| `untapped?` | string | URL completa: los UUIDs no se pueden derivar de la API. |
| `verified` | boolean | |
| `verifiedAt?` | Date | |
| `verificationCode?` | string | Código corto pendiente. |
| `verificationExpiresAt?` | Date | |
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
| `verification_code` | `{verificationCode:1}` | sparse |

El filtro parcial es `{ verified: true, <campo>: { $type: "string" } }`.

> **El `$type: "string"` no es decorativo.** Sin él, todos los jugadores
> verificados que no tienen Twitch entran al índice como `null` y chocan entre
> sí — o sea, solo *un* jugador podría estar verificado sin Twitch. Con el
> `$type`, los docs sin el campo quedan fuera del índice.

Verificado con 7 casos contra un `mongod` real (incluyendo que promover a
`verified: true` con un handle ya tomado tira `E11000`, que es la garantía en
la que se apoya `/api/verify/confirm` de la Fase 2).

### Sobre el TTL que *no* pusimos
`verificationCode` no lleva índice TTL: un TTL borra el **documento entero**,
no el campo, así que borraría al jugador. El vencimiento se chequea en la ruta
de confirm contra `verificationExpiresAt`.

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

## Archivos de la Fase 1

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
