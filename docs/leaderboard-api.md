# Contrato del endpoint de leaderboard (Marvel Snap)

> Investigación de Fase 0. Fecha de sondeo: **2026-08-23/24 UTC**.
> Fuente: ingeniería inversa de `public/index.js` de
> [JaydenScottL/bettersnaplb](https://github.com/JaydenScottL/bettersnaplb) +
> ~30 requests reales contra el endpoint en vivo.

---

## 1. El endpoint

```
GET https://marvelsnap.com/wp-json/api/v1/leaderboard?month={M}&year={YYYY}&region=global
```

Es una REST route de WordPress (`wp-json`) servida por el theme
`marvel-snap-2025`. Es la que alimenta a https://www.marvelsnap.com/infiniteleaderboard.

- **Método:** `GET` únicamente. La respuesta manda `Allow: GET`.
- **Auth:** ninguna. Endpoint público, sin token, sin cookie, sin nonce.
- **Headers de request:** ninguno necesario. No requiere `User-Agent` especial,
  ni `Referer`, ni `Content-Type`. Probado con curl pelado → 200 OK.

### Request de ejemplo

```bash
curl "https://marvelsnap.com/wp-json/api/v1/leaderboard?month=8&year=2026&region=global"
```

### Parámetros

| Param | ¿Se respeta? | Notas |
|---|---|---|
| `month` | **SÍ** | Único parámetro funcional. Solo acepta **mes actual o mes anterior**. Cualquier otro → HTTP 400. |
| `year` | **NO** | Ignorado por completo. `year=2026`, `year=126`, `year=0` y `year=abc` devuelven todos idéntico resultado. |
| `region` | **NO** | Ignorado. `global`, `us`, `eu`, `na`, `ap`, `oceania` y hasta `bogusregion` devuelven el **mismo dataset global**. Ver el bug de `region=asia` abajo. |
| `offset` | **NO** | Se acepta y se **refleja en la respuesta**, pero no pagina. Siempre devuelve `offset: 0`. |
| `limit` | **NO** | Igual que `offset`: se refleja pero se ignora. Siempre `limit: 1000`. |

> **Consecuencia práctica:** el único eje que podemos variar es `month`. No hay
> paginación ni filtro por región del lado del servidor.

---

## 2. Respuesta

### Shape exacto

```jsonc
{
  "offset": 0,        // siempre 0, no controlable
  "limit": 1000,      // siempre 1000, no controlable
  "total": 50254,     // total de jugadores en el ladder (≠ results.length)
  "results": [
    { "rank": 0, "playerName": "Cerebro = No Hands", "score": 10169 },
    { "rank": 1, "playerName": "Sizer",              "score": 9987  },
    { "rank": 2, "playerName": "아이엠어닥터",         "score": 9753  }
    // ... exactamente 1000 elementos
  ]
}
```

### Tipos verificados (unión sobre las 1000 filas)

| Campo | Tipo | Notas |
|---|---|---|
| `rank` | `number` | **0-indexed.** Va 0..999 y coincide siempre con el índice del array. |
| `playerName` | `string` | Máx. **20 caracteres** (truncado por el juego). |
| `score` | `number` | Snap Points. Entero. |

**No hay ningún otro campo.** Verificado haciendo la unión de keys sobre las
1000 filas: el resultado es exactamente `rank, playerName, score`.

### Respuesta de error

```json
{
  "code": "invalid_month",
  "message": "Invalid month. Only current or previous month is allowed.",
  "data": { "status": 400 }
}
```

Se dispara con `month` fuera de ventana (`month=6`, `month=13`) y también
**cuando no se manda ningún parámetro**.

---

## 3. ⚠️ Lo que NO devuelve este endpoint (importante para Fase 1)

El plan original de las fases 1 y 2 asume campos que **este endpoint no
expone**:

| Campo asumido en el plan | ¿Existe? | De dónde sale realmente |
|---|---|---|
| `uid` | **NO** | De un Cloudflare Worker de terceros (ver §5) |
| `cardback` | **NO** | No existe en ninguna fuente encontrada |
| `title` | **NO** | No existe en ninguna fuente encontrada |
| `region` / `server` | **NO** | Del worker de alianzas (`account_region`) |
| `season` | **NO** | Derivable solo del `month` que pedimos |

La única identidad que devuelve el endpoint oficial es **`playerName`**, y
tiene tres problemas:

1. **No es único.** En el snapshot actual hay 3 nombres duplicados dentro del
   top 1000: `Leaf` (×2), `Jay` (×2), `I AM` (×2). El sitio original parchea
   esto a mano concatenando el rank: `Leaf(391)`.
2. **Es mutable.** El jugador puede cambiarlo cuando quiera — que es
   justamente lo que hace viable el flujo de verificación, pero significa que
   no sirve como clave primaria estable.
3. **Está truncado a 20 chars** y conserva espacios al final (8 nombres en el
   top 1000 tienen trailing/leading spaces, ej. `"Butt   "`, `"Gibby "`).
   También aparece 1 nombre censurado como `[REDACTED] Smlz`, y 72 nombres
   con caracteres no-ASCII (coreano, japonés, emoji).

**Esto impacta directo el diseño de Fase 1 y 2** — lo detallo en §6.

---

## 4. Rate limits y comportamiento raro

### Rate limiting
**No se observó ninguno.** ~30 requests en pocos minutos, incluyendo 10
rapid-fire consecutivos: todas 200 OK, sin `429`, sin `Retry-After`, sin
headers de cuota.

### Cache de CloudFront
Todo pasa por CloudFront y **viene cacheado**:

```
X-Cache: Hit from cloudfront
Age: 172
```

- El `Age` sube monótonamente y sigue siendo HIT pasados ~3 minutos → TTL de
  varios minutos.
- Los datos **sí cambian** entre corridas (vi `total` moverse 50114 → 50254 y
  el score de `Holic` bajar 9700 → 9689 en el lapso de la investigación).
- **Consecuencia para el cron:** sincronizar más seguido que el TTL del cache
  es tirar requests al vacío. Con un schedule de GitHub Actions cada 30-60 min
  estamos holgados y nunca vamos a pegarle a un rate limit.

### 🐛 Bug: `region=asia` rompe la respuesta

`region=asia` (y solo ese valor) hace que WordPress emita warnings de PHP en
crudo **antes** del JSON, lo que **invalida el parseo**:

```html
<br />
<b>Warning</b>:  Undefined array key "region" in
<b>/var/www/html/wp-content/themes/marvel-snap-2025/api/leaderboard.php</b>
on line <b>125</b><br />
```

Se repite decenas de veces. La respuesta deja de ser JSON válido → un
`res.json()` explota. Como `region` se ignora igual, **hay que hardcodear
`region=global` y nunca aceptar ese valor desde el input del usuario.**

### 🐛 Ausencia de CORS
La respuesta **no incluye `Access-Control-Allow-Origin`**, ni siquiera
mandando un `Origin`. Por eso el sitio original está obligado a pasar por un
proxy Cloudflare Worker desde el browser.

> **Para nosotros esto no es problema:** al llamar desde una API route de
> Next.js (server-side) CORS no aplica. Nuestro `/api/leaderboard` **es** el
> proxy, y encima nos deja cachear y hacer el merge en un solo hop.

### Bugs en el cliente original (no copiar)
En `public/index.js:41` el original construye la URL así:

```js
var url = "...?month=" + ((currentDate.getMonth() + 1) - allArguments.season) +
          " &year=" + currentDate.getYear() + "&region=global";
```

Dos defectos: un **espacio antes de `&year`** (queda `month=8 `) y
`getYear()`, que está deprecado y devuelve `año - 1900` (hoy: `126`). Ninguno
de los dos rompe nada porque el server tolera el espacio e **ignora `year`**
por completo — pero conviene mandar la URL bien formada.

---

## 5. Fuentes auxiliares del sitio original (de dónde sale el `uid`)

El original **no obtiene el uid del endpoint oficial**. Encadena tres
Cloudflare Workers privados del autor, todos verificados como activos hoy:

| Worker | Contenido | Clave |
|---|---|---|
| `quiet-mountain-519c.scottieofaberoth.workers.dev` | alianzas + región + collection score | `playerName` |
| `blue-disk-0eff.scottieofaberoth.workers.dev` | links de media (ttv/yt/ut) | UUID |
| `muddy-salad-4dae.ytjaycr.workers.dev` | histórico de SP | timestamp → `{ playerName: score }` |

Muestras:

```jsonc
// alliances — keyed by playerName
"x169": {
  "id": "a8608f8b-8d46-406b-b1ec-098ca36984f1",  // <- el "uid" real (UUID)
  "collection_score": 33974,
  "account_region": "ap-northeast-1",            // <- la región real
  "tag": "JOB",
  "alliance_name": "Just Ordinary Beings"
}

// media — keyed by ese mismo UUID
"f186c0ac-1388-4f8b-9038-596e7add8ce2": { "ttv": "jeeeeet13" }

// chart — histórico, exactamente lo que reemplaza nuestra colección snapshots
"1787002860890": { "Cerebro = No Hands": 9754, "HELIXRD04": 9680, ... }
```

La cadena de identidad es: `playerName → alliances[name].id (UUID) → media[uuid]`.
Ese UUID viene de datos de Untapped.gg que el autor scrapea aparte, **no de la
API oficial**.

Nota: el `media.txt` y el `patches.json` del repo usan otro esquema de ID
(estilo Firebase, 28 chars: `CZktHFfdN4wl2oejKuf0FVov0xht`), heredado de una
API interna vieja que el código actual ya no llama — está toda comentada en
`index.js:253-361`, y referenciaba campos `open_id`, `role_id`, `server_id`,
`indicator_0`. **Esa API ya no se usa.** Confirma que el `uid` estable no está
disponible públicamente hoy.

---

## 6. Implicaciones para las Fases 1 y 2 — RESUELTO

> **DECIDIDO (2026-08-23): opción (A).** La identidad es el `playerName`
> normalizado (`nameKey`). No usamos los workers de terceros: construimos solo
> con lo que devuelve la API oficial. Además se descartó `region` por completo
> — ya no hay regiones en el juego, y la API ignora el parámetro igual.
> El detalle del modelo resultante está en `data-model.md`.

El plan usa `uid` como clave primaria de `players` y como input de
`/api/verify/*`. **Ese `uid` no existe en el endpoint oficial**, así que hay
que resolver la identidad antes de escribir el modelo. Las tres salidas:

**(A) Clave = `playerName` (recomendada).**
El jugador se identifica por nombre; el nombre truncado a 20 chars es también
el canal de verificación. Es autocontenido: no dependemos de workers de
terceros. Costo: hay que desambiguar los duplicados (ej. clave compuesta
`playerName + rank` al momento de vincular, y guardar el nombre "canónico"
verificado), y si el jugador se cambia el nombre después de verificar hay que
re-linkearlo (detectable: su nombre desaparece del ladder).

**(B) Clave = UUID del worker de alianzas.**
Nos da uid real + región + alianza, y hace el modelo idéntico al que
planteaste. Costo: dependemos de infraestructura de un tercero que puede
apagarse sin aviso, y solo cubre a los jugadores que ese worker conoce.

**(C) Híbrido:** `playerName` como clave, y enriquecer con región/alianza
desde el worker cuando esté disponible, degradando limpio si no responde.

Sobre el flujo de verificación: **funciona igual en las tres opciones**, y de
hecho el endpoint lo habilita bien — `playerName` es live, así que si el
jugador se pone el código en el nombre, lo vemos en el siguiente fetch. Ojo
con el presupuesto de caracteres: el nombre tope es de **20 chars**, así que
el código tiene que ser corto (4-6 chars) para que le entre junto al nombre.
Y hay que contemplar el TTL del cache de CloudFront: entre que el jugador
cambia el nombre y que nosotros lo vemos pueden pasar varios minutos, así que
`/api/verify/confirm` debería poder reintentar en vez de fallar de una.

---

## 7. Resumen ejecutivo

✅ El endpoint funciona, es público, sin auth y sin rate limit observable.
✅ Un solo request trae el top 1000 completo (~50 KB, ~200 ms en frío).
✅ El flujo de verificación por nombre de perfil es viable.
   > **Se midió viable y no se usa.** Se implementó y después se sacó: hoy la
   > verificación es la aprobación del admin. La conclusión técnica sigue en pie
   > —el nombre se puede cambiar y el ladder lo refleja en minutos— por si
   > alguna vez hace falta volver a apoyarse en eso.
⚠️ Solo devuelve `rank`, `playerName`, `score` — **no hay uid, cardback,
   title ni region**.
⚠️ Solo mes actual y anterior; el histórico más viejo hay que construirlo
   nosotros (que es exactamente para lo que sirve `snapshots`).
⚠️ `region=asia` devuelve HTML roto — hardcodear `region=global`.
