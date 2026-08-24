# API (Fase 2)

Cinco rutas. Todas devuelven JSON; los errores tienen la forma
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

**Alcance.** Solo los jugadores de `players`, no el top 1000 entero. Y solo se
escribe snapshot si cambió el rank o el score (ver el presupuesto de
almacenamiento en `data-model.md`).

---

## `POST /api/verify/request`

```jsonc
// request
{ "playerName": "Sizer" }

// response
{
  "ok": true,
  "playerName": "Sizer",
  "nameKey": "sizer",
  "code": "M8MH8",
  "suggestedName": "Sizer M8MH8",
  "charsToTrim": 0,        // cuántos chars hay que sacrificar por el tope de 20
  "maxNameLength": 20,
  "expiresInMinutes": 60,
  "expiresAt": "2026-08-24T04:00:19.623Z",
  "alreadyVerified": false,
  "ambiguous": false,
  "steps": ["...", "...", "...", "..."]
}
```

- Se exige que el jugador **exista en el ladder actual**, si no cualquiera
  podría llenar `players` de basura → **404**.
- Si ya hay un código vigente **se devuelve el mismo**, no se rota. Rotarlo
  invalidaría el nombre que el jugador quizá ya se cambió.
- Código de 5 caracteres, alfabeto tipo Crockford base32 (sin `0`, `1`, `I`,
  `L`, `O`, `U`) porque hay que tipearlo a mano en el cliente del juego.

---

## `POST /api/verify/confirm`

```jsonc
// request — al menos una red
{ "playerName": "Sizer", "twitch": "sizer", "youtube": "@sizer",
  "untapped": "https://snap.untapped.gg/en/profile/<uuid>/<uuid>" }

// response
{ "ok": true, "verified": true, "nameKey": "sizer", "playerName": "Sizer",
  "twitch": "sizer", "message": "¡Listo! Ya podés volver a tu nombre de siempre." }
```

Códigos de error:

| Código | Significado |
|---|---|
| 400 | Red mal formada, o no mandaste ninguna |
| 404 | No hay código pendiente para ese jugador |
| 404 + `retryable: true` | El código todavía no aparece en el ladder — hay que reintentar |
| 410 | El código venció |
| 403 | El código apareció, pero en una cuenta distinta de la reclamada |
| 409 | Ese canal ya lo reclamó otra cuenta verificada |

### Las dos decisiones que importan acá

**1. Se busca por código, no por nombre.** Al agregarse el código al nombre, el
`nameKey` del jugador cambió y ya no coincide con el que reclamó. Buscar por
`nameKey` no encontraría nunca nada.

**2. Encontrar el código NO alcanza.** Prueba control de *alguna* cuenta, no de
la reclamada. Sin un chequeo extra, un atacante podría pedir un código para
"Sizer", pegarlo en el nombre de **su propia** cuenta y confirmar — y nosotros
marcaríamos a "Sizer" como verificado con las redes del atacante. Por eso
`checkClaim()` saca el código del nombre encontrado y exige que lo que queda
sea prefijo del nombre reclamado. La comparación es por prefijo y no por
igualdad justamente por el tope de 20 caracteres: quien tiene el nombre al
límite necesita recortarlo para que le entre el código.

Además se revisan **todas** las filas que contengan el código, no solo la
primera: los códigos no son únicos a nivel global y 5 caracteres pueden
aparecer por casualidad en el nombre de otro.

El fetch al ladder va con `cache: no-store`. Con la respuesta cacheada
podríamos estar mirando el nombre viejo y rechazar una verificación legítima.

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

`scripts/` tiene tres suites, todas pasando:

| Comando | Qué cubre |
|---|---|
| `npm run test:socials` | 18 casos de parseo de handles y normalización de nombres |
| `npm run test:verification` | 24 casos de la lógica de verificación, incluido el ataque de secuestro |
| `npm run db:smoke` | 10 casos del modelo contra Atlas real; se autolimpia |

Y una suite end-to-end de 19 checks contra el server levantado que cubre auth
del cron, idempotencia, los errores de verificación y la no-fuga del código.
