# OpenSnap LB

Leaderboard no oficial de Marvel Snap. Lee el mismo ranking público que muestra
el sitio oficial y le agrega dos cosas que ese sitio no tiene:

- **Historial de progreso.** La API oficial solo sirve el mes actual y el
  anterior, así que el histórico lo construimos nosotros guardando una medición
  por hora.
- **Archivo de temporadas.** Cuando una temporada sale de esa ventana de dos
  meses desaparece para siempre. Al detectar el cambio de mes, el cron congela
  la anterior completa: los 1000, con ficha o sin ella.

  > El sitio **no lo muestra**: en pantalla se ve solo el mes corriente y el
  > anterior, que es lo que da la API oficial. El archivo se junta igual porque
  > una temporada que no se guarda hoy no se puede recuperar mañana, y son
  > 236 KB por mes. La lectura (`findPlayerSeasons`) está escrita y sin uso,
  > lista para el día que se quiera exponer.
- **Links de jugadores.** Cada quien pide su ficha desde un formulario y un
  admin la aprueba. Esa aprobación es también la verificación: el tick ✓ junto a
  un nombre significa que una persona leyó la petición y la aceptó.

Inspirado en [bettersnaplb](https://github.com/JaydenScottL/bettersnaplb), que
mantiene esos datos a mano vía Discord. Acá la petición entra sola por el sitio
y la revisión ocurre en un panel.

### Por qué la revisión es manual

Casi nada de lo que se muestra junto a un jugador existe en la API oficial: ni
canales, ni alianzas, ni contacto. No hay contra qué contrastarlo, así que el
único filtro posible es el ojo humano — y además permite decir que no.

Aprobar y verificar son **lo mismo**: una petición aceptada publica los links y
se lleva el tick ✓.

Fueron dos estados separados. El segundo lo daba un código que el jugador pegaba
en su nombre de perfil dentro del juego —lo único comprobable contra la API
oficial— y podía haber aprobados sin tick. Se unificaron: si un humano ya
decidió que la petición es legítima, la prueba automática no cambiaba la
decisión, y era un trámite de varios pasos que la mayoría abandonaba a mitad.

Lo único que quedó por cubrir fue la desambiguación de homónimos, que antes
resolvía ese código. Ahora, cuando el nombre está repetido en el ladder, el
panel obliga a elegir de qué fila se trata antes de aprobar.

---

## Stack

| Pieza | Qué |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Estilos | Tailwind v4, dark-only |
| Base | MongoDB Atlas M0 |
| Gráficas | recharts |
| Deploy | Vercel (Hobby) |
| Cron | GitHub Actions → API route protegida con bearer token |

Vercel Cron queda descartado: en Hobby permite **una sola corrida por día**, que
para una serie temporal no alcanza.

---

## Variables de entorno

| Variable | Obligatoria | Qué es |
|---|---|---|
| `MONGODB_URI` | sí | Connection string de Atlas |
| `MONGODB_DB` | no | Nombre de la base (default `opensnaplb`) |
| `CRON_SECRET` | sí | Secreto compartido con el GitHub Action |
| `ADMIN_USER` | no | Usuario del panel (default `admin`) |
| `ADMIN_PASSWORD_HASH` | sí | Hash scrypt de la clave del panel |
| `ADMIN_SESSION_SECRET` | sí | Firma la cookie de sesión del panel |
| `DNS_SERVERS` | no | Escape hatch para DNS roto en local (ver abajo) |

Generá el secreto del cron con:

```bash
openssl rand -hex 32
```

Y los dos del panel de una sola vez con:

```bash
npm run admin:hash -- "tu clave de al menos 12 caracteres"
```

La clave **no se guarda**: lo que va al entorno es un hash scrypt, irreversible.
Una captura de las variables de Vercel no entrega el acceso.

> ⚠️ El hash usa `:` como separador, **no `$`**. Next expande variables al leer
> `.env`, así que un `$` en el valor se interpreta como referencia y el hash
> llega mutilado — el login falla con «clave incorrecta» sin ninguna pista de
> por qué. `npm run build` avisa si detecta un `$` ahí.

Sin `CRON_SECRET`, `/api/cron/sync` devuelve **503**. Sin las variables del
panel, `/admin` devuelve **503**. Las dos quedan cerradas, nunca abiertas.

---

## Correr en local

```bash
npm install
cp .env.example .env      # completá MONGODB_URI y CRON_SECRET
npm run db:indexes        # crea los índices (idempotente)
npm run dev
```

Usá `.env` y **no** `.env.local`: los scripts de mantenimiento leen `.env`
explícitamente, mientras que Next lee los dos.

### Si Atlas no conecta en local

Hay dos fallas distintas que se parecen. Se distinguen por el mensaje:

| Mensaje | Causa | Arreglo |
|---|---|---|
| `querySrv ECONNREFUSED` | Tu Node no resuelve el registro SRV | Usá la connection string en forma seed-list, o seteá `DNS_SERVERS` |
| `SSL alert number 80` | Tu IP no está habilitada en Atlas | Atlas → Network Access. Ojo: una entrada recién agregada figura `Inactive` unos minutos mientras se despliega, y falla igual |

El detalle completo está en [`docs/troubleshooting-dns.md`](docs/troubleshooting-dns.md).

---

## Deploy en Vercel

1. Importá el repo en Vercel. El framework se detecta solo.

2. **Settings → Environment Variables**, para Production y Preview:

   | Variable | Valor |
   |---|---|
   | `MONGODB_URI` | La forma **`mongodb+srv://`** de Atlas |
   | `MONGODB_DB` | `opensnaplb` |
   | `CRON_SECRET` | El mismo valor que vas a poner en GitHub |

   > ⚠️ **En Vercel va la forma `mongodb+srv://`**, no la seed-list. Si en local
   > usás seed-list por el problema de DNS, esa string hardcodea los hostnames
   > de los shards y se rompe cuando Atlas los rota. El registro SRV existe
   > justamente para que eso sea transparente. No copies tu `.env` local tal cual.

   No definas `DNS_SERVERS` en Vercel: allá el DNS funciona y la variable es un
   no-op, pero mejor no arrastrar config que no hace falta.

3. **Atlas → Network Access → `0.0.0.0/0`.** Vercel en Hobby no tiene IPs fijas,
   así que no hay nada más específico que habilitar. Esperá a que el Status diga
   `Active` antes de probar.

4. Deploy. Anotá la URL `*.vercel.app`.

5. Corré los índices una vez contra la base de producción:

   ```bash
   MONGODB_URI="<la de produccion>" npm run db:indexes
   ```

---

## Configurar el cron

El workflow vive en [`.github/workflows/sync.yml`](.github/workflows/sync.yml)
y corre **cada hora en el minuto 7**. No es el minuto 0 a propósito: GitHub
encola todos los cron de la hora en punto y los retrasa cuando hay carga.

En **Settings → Secrets and variables → Actions**, agregá:

| Secret | Valor |
|---|---|
| `APP_URL` | `https://tu-app.vercel.app` (sin barra final) |
| `CRON_SECRET` | El mismo que pusiste en Vercel |

Probalo a mano desde la pestaña **Actions → Sync leaderboard snapshots → Run
workflow**. Si anda, el resumen de la corrida muestra una tabla con cuántos
snapshots entraron.

### Por qué no hay respaldo en Vercel Cron

`vercel.json` declaró un cron diario a las 06:00 UTC hasta que Actions quedó
operativo. Se sacó para tener un solo disparador: dos mecanismos para la misma
tarea significan dos lugares donde mirar cuando algo falla.

| | GitHub Actions | Vercel Cron (Hobby) |
|---|---|---|
| Frecuencia | Cada hora | **1 vez por día** |
| Puntualidad | Retrasos de minutos | Dentro de la hora indicada |
| Costo | Gratis (repo público) | Incluido en Hobby |
| Límite | — | 2 cron jobs |

Un punto por día hace una gráfica pobre, así que nunca fue candidato a
disparador principal. Si hiciera falta reponerlo como red de seguridad —
GitHub deshabilita los workflows programados tras 60 días sin actividad, ver
abajo — alcanza con devolver el bloque a `vercel.json`:

```json
"crons": [{ "path": "/api/cron/sync", "schedule": "0 6 * * *" }]
```

Los dos pueden convivir sin duplicar nada: el índice único `{nameKey, syncId}` y
el `syncId` truncado a la hora hacen que dos disparos en la misma franja se
anulen; está verificado con GET y POST seguidos.

> Vercel Cron **solo emite `GET`**, por eso la ruta expone `GET` además de
> `POST`. Vercel agrega el header `Authorization: Bearer $CRON_SECRET` por su
> cuenta cuando esa variable existe en el proyecto, así que no hay que
> configurar nada extra.

### Dos cosas que conviene saber

- **GitHub deshabilita los workflows programados** después de 60 días sin
  actividad en el repo. Si el sync deja de correr sin explicación, es esto: hay
  que reactivarlo desde la pestaña Actions.
- **El cron de GitHub no es puntual.** Puede retrasarse varios minutos. Para
  este caso da igual: el `syncId` se trunca a la hora, así que dos corridas de
  la misma hora no duplican puntos.

---

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Server de desarrollo |
| `npm run build` | Build de producción |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:indexes` | Crea/actualiza los índices. Idempotente |
| `npm run db:smoke` | 10 checks del modelo contra Atlas. Se autolimpia |
| `npm run admin:hash -- "clave"` | Genera `ADMIN_PASSWORD_HASH` y `ADMIN_SESSION_SECRET` |
| `npm run test:socials` | 18 casos de parseo de handles y normalización |
| `npm run test:tokens` | 17 casos del token de seguimiento |
| `npm run test:overlay` | 28 casos de la ventana del overlay: bordes del ladder y homónimos |
| `npm run test:admin-auth` | 31 casos de hash de clave y sesiones firmadas |
| `npm run test:self-edit` | 27 casos de la edición con el código, contra la ruta viva (necesita `npm run dev`). Se autolimpia |
| `npm run db:archive-season -- 2026-07` | Congela una temporada antes de que la API la suelte |
| `npm run db:seed-demo` | Siembra un jugador con historial sintético |
| `npm run db:seed-demo -- --clean` | Lo borra |
| `npm run db:delete-player -- "Nombre"` | Borra un jugador y su historial |

> ⚠️ `db:seed-demo` escribe datos **inventados** en la base a la que apunte
> `MONGODB_URI`. Nunca contra producción.

---

## Overlay para streams

`/overlay/<nombre>` devuelve las filas del ladder alrededor de un jugador, con
fondo transparente, para pegar en OBS como **Browser Source**.

No es una Twitch Extension y no lo necesita: no hay cuenta de desarrollador que
sacar, ni revisión que esperar, y funciona igual en YouTube o Kick porque la
capa se compone del lado del streamer.

**Solo para cuentas vinculadas.** Un nombre que no está en `players` devuelve
404, en la página y en la API. El motivo es de cuota antes que de producto:
cada capa abierta es una consulta por minuto contra las invocaciones de Vercel,
y sin el corte cualquiera puede apuntar un overlay a cualquier fila del top
1000. La URL se la damos hecha al jugador en su ficha, con botón de copiar;
a quien no vinculó se le muestra ahí mismo qué se está perdiendo.

```
https://<tu-app>/overlay/730
https://<tu-app>/overlay/730?rows=7
https://<tu-app>/overlay/leaf?rank=211
```

| Parámetro | Default | Qué hace |
|---|---|---|
| `rows` | 5 | Filas visibles. Se recorta entre 3 y 11 |
| `rank` | — | Desempata un nombre repetido eligiendo la fila por puesto |

En OBS: **+ → Browser**, pegar la URL y poner el tamaño. No hace falta tocar el
CSS personalizado — la página ya viene con el fondo transparente.

El ancho es fijo en **340 px** y cada fila mide **36**. Los tamaños de abajo
llevan 9 px de holgura ya incluidos, porque el alto exacto **no alcanza**:
comprobado en OBS, con los 181 px que mide la tarjeta de cinco filas la última
quedaba cortada, y con 190 entra bien.

| `rows` | Poner en OBS | (mide) |
|---|---|---|
| 3 | 340 × 118 | 109 |
| **5** (default) | **340 × 190** | 181 |
| 7 | 340 × 262 | 253 |
| 11 | 340 × 406 | 397 |

Sobrar no se nota —el resto queda transparente— y faltar se descubre al aire,
así que la fórmula es `36 × filas + 10`. Estirar el ancho del Browser Source no
ensancha la tarjeta —los 340 px están en el CSS— solo agrega espacio vacío;
para agrandarla se escala la capa en el canvas.

### Cuando no hay overlay que mostrar

En vez del 404 de Next —fondo blanco opaco y ningún dato útil— la página
distingue las dos fallas y las dice:

| Qué pasó | Qué se ve |
|---|---|
| El nombre no está en el top 1000 | "Revisa que esté escrito igual que en el ladder" |
| Está en el ladder pero no vinculado | "Los overlays son para cuentas vinculadas" |

Las dos comparten el diseño de la capa pero con borde rojizo, para que se lean
como un error y no como parte del overlay: esto se compone sobre el stream, así
que si alguien lo deja puesto queda al aire.

### Detalles que importan

**La ventana no cambia de alto.** El #1 no tiene a nadie arriba, así que muestra
cuatro filas hacia abajo en vez de dos huecos; el #1000 al revés. Una capa que
cambia de tamaño al subir de puesto correría el resto del layout del stream.

**Los nombres repetidos avisan.** Si hay dos filas con el mismo nombre no
sabemos cuál es la del streamer, así que el overlay lo dice en pantalla en vez
de elegir en silencio. Se arregla agregando `&rank=` con el puesto propio — y
si ese puesto deja de existir, el aviso vuelve.

**Se refresca solo cada 60 s**, que es el cache del ladder: preguntar más
seguido devuelve lo mismo y gasta invocaciones. Si una consulta falla se queda
con las últimas filas buenas en vez de vaciarse: nadie está mirando el overlay
para darse cuenta de que se cayó.

**El primer render es del servidor.** OBS carga la página una vez y la deja
corriendo meses, así que la capa no puede arrancar vacía esperando al JS —
justo cuando el streamer la está encuadrando.

---

## El panel

Vive en `/admin`, fuera del segmento de idioma: no es contenido público y no se
traduce. Lleva `noindex` para que `/admin/login` no termine en Google.

La cola tiene tres pestañas — pendientes, aprobadas, rechazadas. Cada petición
muestra el rank actual del jugador, lo que pidió publicar, y el contacto que
dejó. **El contacto es privado**: solo se ve acá, nunca sale por la API pública
ni por la página de estado.

Aprobar es lo único que escribe en `players`, o sea lo único que publica algo.
Rechazar exige un motivo, que el solicitante ve en su página de estado.

### Seguimiento de una petición

Al enviar, cada petición entrega un **código de seguimiento** de 12 caracteres
(`RYNG-XNWG-VENT`). Con eso el solicitante consulta su estado en `/{lang}/request`
o directo en `/{lang}/request/{código}`. Es lo único que tiene: no hay cuentas ni
avisos, así que si lo pierde hay que buscarlo por el contacto que dejó.

Es un token **aleatorio** y no el id de Mongo porque los ObjectId llevan un
contador incremental: desde uno conocido se adivinan los vecinos, y cualquiera
que mandara una petición podría leer las de al lado. El alfabeto no tiene 0, 1,
I, L, O ni U, que son los caracteres que se confunden al dictarlo.

### Editar con el código, sin volver a la cola

Una vez **aprobada** la petición, ese mismo código deja al jugador cambiar sus
canales, el tag de su alianza y su nombre desde la página de estado
(`PATCH /api/submissions/[token]`). Se publica en el momento: no hay una segunda
revisión.

La revisión a mano decidió **quién es** esa persona, y cambiar un handle no
vuelve a abrir esa pregunta — un canal de Twitch y un nombre de alianza son tan
indemostrables el día de la edición como el día de la aprobación, así que
mandarlos otra vez a la cola agregaría espera sin agregar certeza, y mientras
tanto el dato viejo sigue publicado.

El **contacto no se edita** por ahí, y el nombre de jugador tampoco. El contacto
es la forma de llegar a la persona si hay que revertir algo, y un código puede
terminar en una captura: dejar que quien lo tenga cambie el Discord de destino
convertiría una fuga en un secuestro silencioso de la ficha. Cada edición queda
fechada y contada (`editedAt`, `editCount`) y se ve en la cola — no hay nada que
aprobar, pero un contador que sube solo es lo único que delata un código
filtrado.

### Lo que el panel todavía no tiene

- **Límite de intentos de login.** En serverless no hay memoria compartida entre
  invocaciones, así que un contador honesto necesita ir a Mongo. Por ahora la
  defensa es scrypt (lento a propósito) y el mínimo de 12 caracteres.
- **Editar antes de aprobar.** Hoy es aprobar o rechazar tal cual vino.
- **Aviso de peticiones nuevas.** Hay que entrar a mirar. Cuando moleste, un
  webhook de Discord es una env var y tres líneas — mucho más barato que montar
  envío de correo.

---

## Documentación

| Documento | Qué cubre |
|---|---|
| [`docs/leaderboard-api.md`](docs/leaderboard-api.md) | Contrato del endpoint oficial: qué devuelve, qué ignora, sus bugs |
| [`docs/data-model.md`](docs/data-model.md) | Colecciones, índices y por qué la identidad es el nombre |
| [`docs/api.md`](docs/api.md) | Las rutas propias, la cola de revisión y las decisiones de seguridad |
| [`docs/frontend.md`](docs/frontend.md) | Rutas, i18n, gráficas y las trampas encontradas |
| [`docs/troubleshooting-dns.md`](docs/troubleshooting-dns.md) | El problema de SRV/c-ares y cómo distinguirlo del de access list |

---

## Limitaciones conocidas

Son del endpoint oficial, no nuestras — el detalle está en
[`docs/leaderboard-api.md`](docs/leaderboard-api.md):

- **Solo el top 1 000** de un ladder de más de 50 000 jugadores.
- **La identidad es el nombre.** No hay ID de jugador. Dos jugadores homónimos
  son indistinguibles: se marcan y no se les asignan links.
- **No hay región, cardback, título ni alianza.** La alianza (tag y nombre) la
  declara cada jugador al pedir su ficha, así que la columna queda vacía para
  quien no lo hizo, y nadie puede comprobarla.
- **El nombre es la identidad.** Si un jugador aprobado se cambia el nombre en
  el juego, deja de ser encontrado y su historial deja de crecer, en silencio.
  Y si además abandona el nombre, otro puede pedirlo: sin IDs de jugador,
  controlar el nombre *es* la identidad.
- **El Δ 24 h no siempre se puede calcular.** Existe para las 1000 filas —cada
  corrida guarda el ladder entero comprimido en un documento—, pero queda en
  guión si todavía no hay una lectura de hace un día, si el jugador no estaba en
  el top 1 000 entonces, o si su nombre está repetido. *No sabemos* y *no se
  movió* son cosas distintas.

---

Proyecto no oficial, sin afiliación con Second Dinner ni Nuverse. Marvel Snap y
sus marcas pertenecen a sus respectivos dueños.
