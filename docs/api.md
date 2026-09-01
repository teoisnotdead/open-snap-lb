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
  "deltaSince": "2026-08-23T03:07:12.000Z",  // contra qué momento se comparó
  "count": 1000,           // filas devueltas (la API sirve top 1000 y nada más)
  "rows": [
    {
      "rank": 1,           // 1-indexed (la API oficial manda 0-indexed)
      "playerName": "Cerebro = No Hands",
      "nameKey": "cerebro = no hands",
      "score": 10169,
      "displayName": "Cerebro = No Hands",  // patchedName si existe
      "verified": false,
      "ambiguous": false,  // true si hay otra fila con el mismo nameKey
      "delta24h": 45       // ausente cuando no lo sabemos: ver abajo
    }
  ]
}
```

Cachea el fetch al endpoint oficial 60 s. No tiene sentido bajar de ahí: la
respuesta oficial pasa por CloudFront con un TTL de varios minutos.

**Sobre `delta24h`:** sale de `boardBaselines`, la foto comprimida del ladder
entero que guarda cada corrida de sync, así que existe para las 1000 filas y no
solo para los jugadores vinculados. Se **omite** —y la tabla pinta un guión— en
tres casos: todavía no hay un baseline anterior al corte de 24 h, el jugador no
estaba en el top 1000 entonces, o su nombre está repetido. Ese último caso es el
mismo criterio de siempre: con dos filas homónimas no sabemos cuál era cuál, y
restar la equivocada da un número inventado con pinta de dato.

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
  "baselineSaved": true, // foto del ladder entero guardada en esta corrida
  "baselineRows": 1000,  // filas que entraron en esa foto
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

## `GET /api/alliances`

Las alianzas aprobadas. Alimenta el selector que reemplazó al input de texto
libre donde cada persona escribía el nombre de su alianza como se le ocurría —
el bug que motivó la entidad (ver [`alliances.md`](alliances.md)).

```jsonc
{
  "count": 1,
  "alliances": [
    { "tag": "CHM", "name": "Chamosquitos", "members": 1,
      "hasLeader": false, "requiresCode": false }
  ]
}
```

`members` sale de agrupar `players` por `alliance`, no de un contador guardado:
la membresía vive en `players` y un contador denormalizado sería el mismo dato en
dos lugares. `players` solo tiene a los jugadores **aprobados**, no a los 1000
del ladder, así que agrupar la colección entera es barato.

`requiresCode` es lo que el formulario necesita: si pedir o no el código del
líder. Una alianza **sin líder queda abierta** —no hay nadie que pueda responder
por sus miembros, y exigir un código que nadie reparte la dejaría muerta en vez
de protegida—, así que hoy `requiresCode` coincide con `hasLeader`. Van como
campos separados porque esa coincidencia es una consecuencia, no algo en lo que
el formulario deba apoyarse.

Es pública a propósito: los tags ya se ven en la tabla del leaderboard, así que
la lista no revela nada nuevo. Lo único que no puede salir de acá es el
`joinCode`, y por eso la respuesta se arma campo por campo en
`listApprovedAlliances` en vez de devolver los documentos.

---

## `POST /api/alliances/request`

Pide que se cree una alianza. **No publica nada**: deja una `pending` para el
panel, igual que una petición de jugador.

Va en `/request` y no como `POST` sobre `/api/alliances` para no dejar el
permiso de escritura pegado al de lectura de la lista pública.

Acepta un `statusToken` opcional: es el reclamo de liderazgo. Tiene que
corresponder a una petición **aprobada** — liderar habilita repartir el código y
expulsar, así que no puede apoyarse en una identidad que nadie miró. El
`joinCode` **no** se genera acá: uno entregado antes de la revisión ya circula
si la alianza termina rechazada.

---

## `POST /api/alliances/[tag]/members`

El líder expulsa (`action: "kick"`) o readmite (`action: "unban"`). La
credencial es su propio `statusToken`, en el body.

Es la única escritura pública sobre la ficha de OTRA persona. Queda acotada a
`alliance` y `allianceName`, no toca identidad ni canales ni contacto, y el
`updateOne` filtra por `alliance: <tag>` — sin esa condición un líder podría
despublicarle la alianza a cualquiera mandando un `nameKey` al azar.

Expulsar deja rastro sobre la **persona** (`bannedNameKeys`), no sobre el
código. Sin esa lista, expulsar no expulsaría a nadie: el echado todavía tiene el
código y vuelve a entrar en diez segundos.

El líder no se puede expulsar solo (409): dejaría un líder vetado de su propia
alianza, un estado que ninguna pantalla sabe explicar.

---

## `POST /api/alliances/[tag]/rotate`

Código de invitación nuevo. Misma credencial.

**No expulsa a los que ya están adentro.** La membresía es un estado, no una
sesión: si rotar vaciara la alianza sería un botón que nadie se anima a tocar
—lo mismo que no tenerlo— justo el día que hace falta. Para sacar a alguien está
`kick`, que es quirúrgico y no le cambia el código a los demás.

### Sobre el 401/403 de las tres

Un token inexistente, uno de una petición no aprobada y uno de alguien que no
lidera esa alianza dan **todos el mismo 403**. Distinguirlos convertiría la ruta
en un oráculo: con un token cualquiera se podría averiguar si existe, si está
aprobado y qué alianza lidera.

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
aleatorios de un alfabeto Crockford —sin 0/1/I/L/O/U, que se confunden al
dictarlo— así que son 30^12 ≈ 5.3 × 10^17 combinaciones.

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

## `GET /api/submissions/[token]`

Estado de una petición, para el solicitante. Sin cuentas ni notificaciones, es la
única forma que tiene de saber cómo quedó.

Devuelve el estado, **lo que pidió publicar** y el motivo si fue rechazada. Eso último se puede mostrar justamente porque la llave es un token
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

## `PATCH /api/submissions/[token]`

El jugador corrige sus propios datos publicados. Es la **única escritura pública
que publica algo sin pasar por el panel**.

Se apoya entera en una decisión ya tomada: aprobar la petición fue el momento en
que un humano dio por buena la identidad de quien la mandó. Nada de lo que se
toca acá vuelve a poner eso en duda —un handle de Twitch y un nombre de alianza
son datos declarados, tan indemostrables el día de la edición como el día de la
aprobación—, así que mandarlos de nuevo a la cola agregaría espera sin agregar
certeza. Mientras tanto los datos viejos siguen publicados: ese es el costo real
de no tener esta ruta.

Body: `{twitch?, youtube?, untapped?, allianceTag?, allianceName?}`.

| Regla | Por qué |
|---|---|
| Hace falta el token | Es la misma llave con la que consulta el estado |
| La petición tiene que estar `approved` (409 si no) | Sobre una pendiente o rechazada no hay nada publicado que editar |
| Solo se tocan campos que ya eran públicos | El **contacto no se edita acá**: es la forma de llegar a la persona si hay que revertir algo, y un código puede terminar en una captura. Dejar que quien lo tenga cambie el Discord de destino convertiría una fuga en un secuestro silencioso de la ficha |
| El body **reemplaza** el bloque entero | Lo que no venga se borra. Es lo que hace un formulario que abre con los valores actuales y se manda completo, y evita inventar una diferencia entre "no lo mandé" y "lo quiero vacío" — sobre un form HTML son el mismo request |
| Mismas validaciones que `POST` (`parseProfileFields`) | Lo que no se puede pedir tampoco se puede colar editando |
| Canal ya asignado a otra cuenta (409) | Se pregunta antes para nombrar al dueño; el índice único queda como red ante una carrera |
| Sin `upsert` | Si la petición figura aprobada pero no hay `players`, algo se rompió antes: crear uno publicaría una ficha verificada que nadie revisó |

Escribe en las **dos** colecciones: `players` (lo publicado) y `submissions`
(lo que el jugador y el panel leen como "lo que pidió"). Si solo escribiera la
primera, las dos pantallas mostrarían datos que ya no son los publicados.

Deja rastro en `editedAt` y `editCount`, que el panel muestra sobre la petición.
No hay nada que aprobar —esa decisión ya está tomada—, pero un contador que sube
solo es lo único que delata un código filtrado.

---

## Panel de admin

Todas exigen una sesión válida (cookie `osl_admin`, firmada con HMAC). Sin las
env vars del panel devuelven **503**: cerradas, nunca abiertas.

| Ruta | Qué hace |
|---|---|
| `POST /api/admin/login` | Valida usuario y clave, setea la cookie |
| `POST /api/admin/logout` | Borra la cookie |
| `GET /api/admin/submissions?status=` | La cola, con las filas del ladder que tienen ese nombre resueltas al vuelo |
| `POST /api/admin/submissions/[id]` | `{action:"approve"\|"reject", reason?, rank?}` |

**Aprobar es lo único que escribe en `players`**, o sea lo único que publica
algo. Al aprobar:

- `verified` queda en **true, siempre**. Aprobar *es* verificar: hubo un paso
  automático —un código que el jugador pegaba en su nombre de perfil— y se sacó,
  porque si un humano ya leyó la petición y la aceptó, dio por buena la
  identidad. Sostener dos niveles de confianza sobre el mismo acto no le decía
  nada a nadie.
- `lastRank` se siembra con el puesto de la fila aprobada **solo si todavía no
  hay uno**. Si el jugador ya venía trackeado, el sync tiene un valor más fresco.
- El contacto (Discord, email) **no se copia** a `players`: esa colección se
  sirve en público.
- Se chequea que ningún otro jugador tenga ya ese canal. El índice único de las
  redes ya lo cubriría, pero así el error dice **a quién** pertenece en vez de
  ser un E11000.

**`rank` es obligatorio cuando el nombre está repetido** en el ladder (409 si
falta, con la lista de puestos y SP para elegir). Es la semilla de
desambiguación que antes daba la prueba de propiedad, y sin ella un aprobado
homónimo nunca mostraría sus links ni acumularía historial: no sabríamos cuál de
las dos filas es. Con un solo candidato no hace falta mandarlo. Si el ladder
oficial no responde, se aprueba igual sin semilla — revisar no puede depender de
un servicio de terceros.

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
    "alliance": "JOB", "allianceName": "Job Enjoyers",   // declarados, no leídos
    "verified": false, "lastRank": 2, "lastScore": 9987,
    "peakRank": 2, "peakScore": 9987, "lastSeenAt": "2026-08-24T03:00:21.279Z"
  },
  "history": [
    // daily:true  → del archivo diario del ladder. Existe para CUALQUIER
    //               jugador del top 1000, se haya vinculado o no.
    { "timestamp": "2026-08-23T00:07:11.402Z",
      "rank": 3, "score": 9901, "season": "2026-08", "daily": true },
    // daily:false → medición horaria de `snapshots`. Solo para vinculados,
    //               y solo desde el momento en que se vincularon.
    { "timestamp": "2026-08-24T03:00:20.669Z",
      "rank": 2, "score": 9987, "season": "2026-08", "daily": false }
  ],
  "count": 2
}
```

**Sobre `history`:** sale de `lib/history.ts`, la misma fuente que la ficha web.
Los dos tramos van concatenados en orden de tiempo y no se solapan: el diario
corta donde arranca el horario, así que quien vincula hoy conserva la historia
de antes de vincular y desde ahí gana resolución.

Un día en que el jugador no estaba en el top 1000, o en que su nombre aparecía
repetido en el ladder, **no produce punto**. Es el mismo criterio del `delta24h`:
preferimos el hueco antes que un número que no sabemos atribuir.

El campo `truncated` ya no existe. Solo tenía sentido cuando el historial era el
tope de 2000 snapshots; con el tramo diario, la serie está acotada por los días
que lleva viva la colección.

Sin projection: `players` es la colección pública y no guarda nada privado. Acá
se excluían `verificationCode` y `verificationExpiresAt`, que dejaron de existir
cuando la verificación pasó a ser la aprobación del admin; el contacto del
solicitante nunca vivió en esta colección sino en `submissions`.

---

## Estado de las pruebas

`scripts/` tiene cinco suites, todas pasando:

| Comando | Qué cubre |
|---|---|
| `npm run test:socials` | 18 casos de parseo de handles y normalización de nombres |
| `npm run test:tokens` | 17 casos del token de seguimiento: generación, formato y parseo |
| `npm run test:admin-auth` | 31 casos de hash de clave y sesiones firmadas |
| `npm run test:self-edit` | 27 casos de la edición con el código, contra la ruta viva; se autolimpia |
| `npm run db:smoke` | 10 casos del modelo contra Atlas real; se autolimpia |

Y verificación end-to-end contra el server levantado del ciclo completo:
validación de entrada, la petición duplicada, la no-fuga de contacto por la ruta
pública, las rutas de admin cerradas sin sesión, login, cola y aprobación.
