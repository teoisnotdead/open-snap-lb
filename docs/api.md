# API

Las rutas propias del proyecto. Todas devuelven JSON; los errores tienen la forma
`{ "error": "mensaje" }`.

---

## `GET /api/leaderboard`

Ranking en vivo del endpoint oficial, mergeado con `players`.

```jsonc
{
  "season": "2026-08",
  "fetchedAt": "2026-08-24T03:00:00.000Z",
  "total": 50520,          // jugadores en TODO el ladder
  "count": 1000,           // filas devueltas (la API sirve top 1000 y nada más)
  "rows": [
    {
      "rank": 1,           // 1-indexed (la API oficial manda 0-indexed)
      "playerName": "Cerebro = No Hands",
      "nameKey": "cerebro = no hands",
      "score": 10169,
      "displayName": "Cerebro = No Hands",  // patchedName si existe
      "verified": false,
      "ambiguous": false   // true si hay otra fila con el mismo nameKey
    }
  ]
}
```

Cachea el fetch al endpoint oficial 60 s. No tiene sentido bajar de ahí: la
respuesta oficial pasa por CloudFront con un TTL de varios minutos.

**Sobre `ambiguous`:** en la corrida real de prueba se detectaron 10 filas
ambiguas — `Leaf`, `Jay`, `I AM`, `Bob`/`BOB`, `Shadow`/`shadow`, `jl`/`JL`. Las
tres primeras son duplicados exactos de la API; el resto colapsan por nuestro
lowercase. En esas filas los links y el `verified` **no se pegan** salvo que el
histórico permita desambiguar por rank.

---

## `POST /api/cron/sync`

Protegida con `Authorization: Bearer $CRON_SECRET`. La dispara GitHub Actions.

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://<app>.vercel.app/api/cron/sync
```

```jsonc
{
  "ok": true,
  "syncId": "2026-08-24T03",   // franja horaria UTC
  "season": "2026-08",
  "tracked": 1,          // jugadores en `players`
  "inserted": 1,         // snapshots escritos
  "unchanged": 0,        // sin cambio de rank ni score -> no se escribe
  "duplicates": 0,       // frenados por el índice único (reintento)
  "notOnBoard": 0,       // trackeados que no están en el top 1000 ahora
  "ambiguousSkipped": 0, // nombre repetido y sin histórico para desempatar
  "durationMs": 207
}
```

Sin token, con token mal, o con el esquema mal formado → **401**. Si
`CRON_SECRET` no está configurado en el entorno la ruta devuelve **503**: queda
cerrada, nunca abierta.

**Idempotencia.** El `syncId` se trunca a la hora, así que un reintento dentro
de la misma franja choca contra el índice único `{nameKey, syncId}` y no
duplica puntos en la gráfica. Verificado: dos corridas seguidas dan
`inserted: 1` y después `inserted: 0, unchanged: 1`.

**Archivo de temporadas.** Cada corrida chequea si la temporada anterior a la
viva ya está congelada; si no, la guarda entera. Es una lectura contra el índice
en la enorme mayoría de las corridas. Va **antes** del corte por "no hay
trackeados": congelar una temporada no depende de cuánta gente se vinculó, y con
el chequeo abajo un mes sin nadie vinculado perdía la temporada completa. Si
falla, se loguea y el sync sigue — archivar es un extra y no puede llevarse
puesta la corrida.

**Alcance.** Solo los jugadores de `players`, no el top 1000 entero. Y solo se
escribe snapshot si cambió el rank o el score (ver el presupuesto de
almacenamiento en `data-model.md`).

---

## `POST /api/submissions`

Crea una petición. **No publica nada**: deja un documento `pending`.

```jsonc
// entrada
{
  "playerName": "730",
  "twitch": "https://twitch.tv/Handle",   // se normaliza a "handle"
  "youtube": "@handle", "untapped": "https://snap.untapped.gg/...",
  "allianceTag": "job",                   // se normaliza a "JOB"
  "allianceName": "Job Enjoyers",
  "discord": "teo.dev", "email": "teo@ejemplo.com",  // PRIVADOS
  "note": "texto libre para quien revise"
}

// salida 201
{ "ok": true, "token": "RYNGXNWGVENT", "nameKey": "730", "playerName": "730",
  "status": "pending", "ambiguous": false }
```

**El `token` es la única llave pública de la petición.** No se devuelve el `_id`:
los ObjectId de Mongo son timestamp + valor por proceso + **contador
incremental**, así que desde uno conocido se adivinan los vecinos y cualquiera
que mande una petición podría leer las de al lado. El token son 12 caracteres
aleatorios del mismo alfabeto Crockford del código de verificación — 30^12 ≈
5.3 × 10^17.

> Tiene que ser **distinto** del código de verificación, y no por longitud: ese
> código va en el nombre del perfil, o sea que se publica en el leaderboard.
> Reusarlo para consultar el estado regalaría el acceso a cualquiera que mire la
> tabla.

El insert distingue los dos índices únicos que pueden chocar: `uniq_status_token`
es mala suerte y se reintenta con otro token, `uniq_pending_per_player` es un
error del usuario. Sin mirar el nombre del índice le diríamos «ya pediste» a
alguien que no pidió.

Reglas de entrada:

| Regla | Por qué |
|---|---|
| El jugador tiene que estar en el ladder | Si no, cualquiera llena la cola de basura |
| Al menos una red **o** el tag de alianza | Tiene que haber algo que publicar |
| Al menos un contacto (Discord o email) | Sin cuentas ni notificaciones, es el único canal para rechazar o repreguntar |
| `allianceName` exige `allianceTag` | La tabla muestra el tag; el nombre solo sería dato huérfano |
| Una sola pendiente por nombre (409) | Índice `uniq_pending_per_player`. Sin esto, cien peticiones del mismo jugador dejan el panel inusable |

---

## `POST /api/submissions/[token]/code`

Emite —o reutiliza— el código de prueba de propiedad.

Se emite acá y no al crear la petición porque el que nunca va a probar nada no
necesita un código colgando. Si ya hay uno vigente devuelve **el mismo**:
rotarlo dejaría inservible el nombre que el jugador quizá ya se cambió.

---

## `POST /api/submissions/[token]/proof`

Busca el código en el ladder en vivo y, si aparece en la cuenta reclamada, marca
la petición como `proofVerified`. **Sigue sin publicar nada**: solo agrega el
sello para quien revisa.

### Las tres decisiones que importan acá

**1. Se busca por código, no por nombre.** Al agregarse el código al nombre, el
`nameKey` cambió y ya no coincide con el reclamado.

**2. Encontrar el código NO alcanza.** Prueba control de *alguna* cuenta, no de
la reclamada. Sin el chequeo extra, alguien podría pedir un código para "Sizer",
pegarlo en el nombre de **su propia** cuenta y quedar marcado como Sizer. Por eso
`checkClaim()` saca el código del nombre encontrado y exige que lo que queda sea
prefijo del reclamado — por prefijo y no por igualdad, porque quien tiene el
nombre al tope de 20 caracteres necesita recortarlo para que el código entre.

Se revisan **todas** las filas que contengan el código, no solo la primera: 5
caracteres pueden aparecer por casualidad en el nombre de otro.

**3. `checkClaim()` tampoco alcanza: falta descartar la ocupación de nombre.**
Un atacante que se renombra `730` pasa ese chequeo igual de bien que el dueño.
Lo cierra `findSquatConflict()`: si el ladder **todavía muestra una fila con el
nombre pelado** mientras aparece otra con el código, hay dos cuentas distintas
en juego. El ladder trae una fila por cuenta, así que las dos formas del nombre
no pueden coexistir siendo la misma persona — cuando el dueño se renombra, su
fila deja de decir `730`. Ver las dos a la vez es la señal.

El falso negativo es un homónimo genuino queriendo verificarse: lo rechazamos,
mismo criterio que usa el sync con los nombres repetidos.

**Riesgo residual, sin arreglo posible con identidad por nombre:** si el dueño
abandona el nombre o se cae del top 1000, no queda fila pelada que delate nada.
Con la API oficial sin IDs de jugador, control del nombre *es* la identidad.

El fetch al ladder va con `cache: no-store`. Con la respuesta cacheada podríamos
estar mirando el nombre viejo y rechazar una prueba legítima.

---

## `GET /api/submissions/[token]`

Estado de una petición, para el solicitante. Sin cuentas ni notificaciones, es la
única forma que tiene de saber cómo quedó.

Devuelve el estado, la prueba, **lo que pidió publicar** y el motivo si fue
rechazada. Eso último se puede mostrar justamente porque la llave es un token
aleatorio: con el `_id` adivinable había que dejar la vista casi vacía.

**El contacto sigue afuera.** No porque el token sea débil, sino porque un token
termina en historiales, chats y capturas, y no hay razón para que un email viaje
en esa vista — ya lo tiene quien lo escribió.

El token se acepta con guiones, espacios y en minúscula (`parseStatusToken`).
Un token mal formado y uno inexistente dan el mismo 404: distinguirlos
confirmaría cuáles existen.

### `/{lang}/request` y `/{lang}/request/[token]`

La página de estado, y un buscador donde pegar el código para quien cerró la
pestaña. Las dos llevan `noindex`: la URL **contiene** el token.

---

## Panel de admin

Todas exigen una sesión válida (cookie `osl_admin`, firmada con HMAC). Sin las
env vars del panel devuelven **503**: cerradas, nunca abiertas.

| Ruta | Qué hace |
|---|---|
| `POST /api/admin/login` | Valida usuario y clave, setea la cookie |
| `POST /api/admin/logout` | Borra la cookie |
| `GET /api/admin/submissions?status=` | La cola, con el rank actual resuelto al vuelo |
| `POST /api/admin/submissions/[id]` | `{action:"approve"\|"reject", reason?}` |

**Aprobar es lo único que escribe en `players`**, o sea lo único que publica
algo. Al aprobar:

- `verified` toma el valor de `proofVerified`, no de la aprobación. El tick
  refleja la prueba de propiedad; estar en la tabla refleja la aprobación.
- `lastRank` se siembra con `proofRank` **solo si todavía no hay uno**. Si el
  jugador ya venía trackeado, el sync tiene un valor más fresco.
- El contacto (Discord, email) **no se copia** a `players`: esa colección se
  sirve en público.
- Se chequea que ningún otro jugador tenga ya ese canal. El índice único de las
  redes solo aplica a `verified: true`, así que no frena a dos aprobados sin
  prueba que declaren el mismo Twitch.

Rechazar exige motivo: sin él, el solicitante se queda sin nada que hacer con la
respuesta y vos sin memoria de por qué lo rechazaste.

### Sobre la autenticación

La clave se guarda como hash **scrypt**, no en texto plano ni SHA pelado: SHA
está diseñado para ser rápido, que es justo lo que no querés en un hash de
contraseña. Las comparaciones son en tiempo constante (`timingSafeEqual`), y la
clave se verifica **siempre**, incluso con usuario incorrecto — cortar antes
haría que un usuario inexistente responda más rápido y eso regala la lista de
usuarios válidos.

> El hash usa `:` como separador, **no `$`**. Next expande variables al leer
> `.env`, así que un `$` en el valor lo mutila en silencio: el login falla con
> «clave incorrecta» sin ninguna pista. `npm run build` avisa si lo detecta.

**Lo que no tiene:** límite de intentos. En serverless no hay memoria compartida
entre invocaciones, así que un contador honesto necesita ir a Mongo. Si el panel
se vuelve un objetivo real, es lo primero que hay que agregar.

---

## `GET /api/player/[nameKey]`

No estaba en el plan original, pero la vista de detalle de la Fase 3 no tiene
de dónde leer sin esto.

```jsonc
{
  "player": {
    "nameKey": "sizer", "playerName": "Sizer", "displayName": "Sizer",
    "verified": false, "lastRank": 2, "lastScore": 9987,
    "peakRank": 2, "peakScore": 9987, "lastSeenAt": "2026-08-24T03:00:21.279Z"
  },
  "history": [
    { "playerName": "Sizer", "timestamp": "2026-08-24T03:00:20.669Z",
      "rank": 2, "score": 9987, "season": "2026-08" }
  ],
  "count": 1,
  "truncated": false   // true si se llegó al tope de 2000 puntos
}
```

La projection excluye `verificationCode` y `verificationExpiresAt`: un código
pendiente filtrado por una ruta pública dejaría que cualquiera se adelante a
verificar esa cuenta. Hay un test que lo cubre.

---

## Estado de las pruebas

`scripts/` tiene cuatro suites, todas pasando:

| Comando | Qué cubre |
|---|---|
| `npm run test:socials` | 18 casos de parseo de handles y normalización de nombres |
| `npm run test:verification` | 30 casos de la lógica de verificación, incluidos el secuestro y la ocupación de nombre |
| `npm run test:admin-auth` | 31 casos de hash de clave y sesiones firmadas |
| `npm run db:smoke` | 10 casos del modelo contra Atlas real; se autolimpia |

Y verificación end-to-end contra el server levantado del ciclo completo:
validación de entrada, la petición duplicada, la no-fuga de contacto por la ruta
pública, las rutas de admin cerradas sin sesión, login, cola y aprobación —
comprobando que aprobar **sin** prueba publica los links pero **no** el tick.
