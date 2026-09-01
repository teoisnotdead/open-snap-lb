# Alianzas como entidad

> **Estado: pasos 1 y 2 de 5 implementados.** Existen la colección `alliances` con sus
> índices, el backfill, el selector del formulario y la cola de alianzas del
> panel. **No hay líderes ni códigos de invitación todavía** (pasos 3 a 5), así
> que las secciones que hablan de expulsar, rotar y la credencial del líder
> siguen siendo propuesta a discutir. Ver "Orden sugerido" al final.

Hoy la alianza son **dos strings sueltos por jugador**: `alliance` (tag) y
`allianceName`, declarados en la petición y copiados a `players` al aprobar.
Esta propuesta los reemplaza por una colección `alliances` con dueño, y agrega
un código de invitación que el líder reparte.

---

## El problema, y el que NO es el problema

**El problema real es la divergencia de nombres.** `parseAlliance` normaliza el
tag a mayúsculas y `parseAllianceName` colapsa espacios, y ahí termina la
normalización. No hay entidad: cada jugador guarda su propia copia del nombre.
Entonces "Job Enjoyers", "JobEnjoyers" y "job enjoyers" conviven bajo el tag
`JOB`, y la tabla muestra tres tooltips distintos para la misma alianza. Eso no
se arregla revisando más: se arregla teniendo un solo lugar donde vive el
nombre.

**El que no es el problema es el trabajo manual.** Conviene decirlo porque es
la intuición equivocada más cara: para un jugador **ya aprobado**, cargar o
cambiar su alianza hoy **ya es automático**. `PATCH /api/submissions/[token]`
publica `alliance` y `allianceName` sin pasar por el panel. Nadie revisa eso
hoy, así que no hay revisión que ahorrar ahí.

Lo que sí aporta el código de alianza es algo que hoy **no existe en absoluto**:
evidencia. La API oficial no expone alianzas (ver `leaderboard-api.md` §3), así
que cuando alguien escribe `JOB` el admin no tiene con qué contrastarlo — lo
aprueba mirándolo. El líder sí sabe quién es de su alianza. El código no
automatiza un juicio: lo mueve a la única persona que puede emitirlo.

---

## Quién valida qué

Es el reparto del que depende todo lo demás, y la razón por la que esto no
degrada el significado de `verified`.

| Afirmación | Quién la valida | Cómo |
|---|---|---|
| "Yo soy esta fila del ladder" | **Un admin**, como hoy | Ojo humano. No cambia nada |
| "Estos son mis canales" | **Un admin**, como hoy | Ojo humano. No cambia nada |
| "Esta alianza existe y yo la lidero" | **Un admin**, una sola vez por alianza | Ojo humano, al crearla |
| "Pertenezco a esta alianza" | **El líder**, automático | El código de invitación |

`verified` sigue significando exactamente lo que significa hoy: *un humano miró
quién pide qué y dio por buena la identidad*. El código de alianza **nunca**
otorga `verified` ni lo reemplaza. Si esa línea se cruza, el campo vuelve a
significar dos cosas a la vez, que es el problema que ya se resolvió una vez
cuando se unificaron "aprobado" y "verificado" (ver `PlayerDoc`).

**Corolario que conviene tener claro antes de festejar:** crear una alianza
sigue siendo manual, porque cualquiera puede decir que lidera `JOB` y el admin
tiene el mismo cero para verificarlo que hoy. Lo que se gana es que la revisión
pasa a ser **O(alianzas)** en vez de **O(jugadores)**. Esa es toda la ganancia
operativa, y alcanza.

---

## `alliances`

Un doc por alianza aprobada.

| Campo | Tipo | Notas |
|---|---|---|
| `tag` | string | 2–5 alfanuméricos, mayúsculas. **Único.** Mismo `parseAlliance` de hoy |
| `name` | string | Nombre largo, ≤40 chars, tal cual se escribió. Mismo `parseAllianceName` |
| `leaderNameKey` | string | El `nameKey` del líder. Su `statusToken` es la credencial: ver abajo |
| `joinCode` | string | 8 caracteres del alfabeto Crockford. **Único.** Rotable |
| `joinCodeRotatedAt?` | Date | Deja ver si el líder ya rotó, y cuándo |
| `bannedNameKeys` | string[] | Expulsados. No pueden volver a entrar aunque tengan un código válido |
| `status` | `"pending" \| "approved" \| "rejected"` | La creación pasa por el panel |
| `rejectionReason?` | string | Igual que en `submissions` |
| `createdAt` `updatedAt` | Date | |

La **membresía no vive acá**: sigue viviendo en `players.alliance`, ahora como
referencia al `tag` canónico en vez de texto libre. Guardar además un array de
miembros sería el mismo dato en dos lugares, y el que se desincroniza es
siempre el que nadie mira.

### Índices

```js
{ key: { tag: 1 },      name: "uniq_tag",       unique: true }
{ key: { joinCode: 1 }, name: "uniq_join_code", unique: true,
  partialFilterExpression: { joinCode: { $exists: true } } }
{ key: { status: 1, createdAt: 1 }, name: "queue" }
{ key: { leaderNameKey: 1 },        name: "by_leader" }
```

`uniq_tag` es el índice que hace que toda esta propuesta valga la pena: es lo
que vuelve **imposible** que existan dos `JOB`, en vez de improbable.

`uniq_join_code` cubre el mismo caso que `uniq_status_token`: una colisión
metería a alguien en la alianza equivocada. Con 30^8 ≈ 6.6 × 10^11 es
improbable; el índice lo vuelve imposible y cuesta nada.

**Es PARCIAL**, y eso se descubrió implementándolo: la mayoría de las alianzas
no tiene código —las del backfill no tienen líder, y sin líder no hay código— y
un único común trata los campos ausentes como `null`, así que deja pasar **una
sola** alianza sin código y la segunda explota con un duplicate key que no tiene
nada que ver con lo que se quiso impedir.

### Cambios en las colecciones que ya existen

En `players` y `submissions` **no cambia el esquema**: `alliance` /
`allianceTag` siguen guardando el tag. Lo que cambia es de dónde sale ese
string — antes de un input libre, ahora de una alianza que existe.

`allianceName` en `players` queda como **copia denormalizada**, y hay que
decidirlo a conciencia: se mantiene para que el merge del leaderboard siga
siendo una sola lectura (`getMergedLeaderboard` ya lee `players` y nada más).
El costo es que renombrar una alianza obliga a un `updateMany` sobre sus
miembros. Es una escritura rara sobre pocos docs, y a cambio la ruta más
caliente del sitio no gana un join. Vale la pena.

---

## Los tres secretos

Van a circular por el mismo Discord, así que tienen que ser distinguibles a
simple vista y, sobre todo, **estructuralmente**.

| Secreto | Largo | Quién lo tiene | Para qué |
|---|---|---|---|
| `statusToken` | 12 | Un jugador | Ver y editar su ficha. Ya existe |
| `joinCode` | **8** | Toda una alianza | Entrar a la alianza |
| — | — | — | No hay un tercero: ver "credencial del líder" |

**Los 8 caracteres no son estética.** `parseStatusToken` exige exactamente 12,
así que un `joinCode` pegado en el campo del token se rechaza de entrada, sin
tocar la base, y le podés decir a la persona *cuál* de los dos códigos puso
donde no va. Con largos iguales, ese error da un 404 genérico y termina en un
mensaje de Discord preguntando qué pasó.

Mismo alfabeto Crockford para los dos: la lógica de por qué no lleva `0/1/I/L/O/U`
ya está en `lib/tokens.ts` y aplica igual a un código que se dicta por voz.

---

## La credencial del líder

**Decisión: el líder se autentica con su propio `statusToken`.** No hay un
tercer código.

Se guarda `leaderNameKey` en la alianza; cuando esa persona abre su página de
estado, le aparece una sección más con su alianza, la lista de miembros, el
botón de expulsar y el de rotar el código.

**El costo, explícito:** un `statusToken` filtrado pasa a poder vaciar una
alianza, no solo editar una ficha. Se acepta por dos razones. La primera es que
el daño es **reversible**: los expulsados vuelven a entrar con el código, y el
`bannedNameKeys` lo puede limpiar el líder o un admin. La segunda es que no
toca identidad ni contacto, que es exactamente la línea que la ruta `PATCH` ya
trazó cuando dejó el contacto afuera de lo editable.

La alternativa —un token de líder aparte— tiene mejor aislamiento y peor todo
lo demás: tres secretos distintos circulando por los mismos chats, y la persona
que los confunde es la misma que después escribe preguntando. Si algún día una
alianza grande justifica el aislamiento, se agrega sin romper nada: es un campo
más en `alliances`.

---

## Expulsar y rotar son dos herramientas distintas

Es la parte de la propuesta que más fácil se hace mal, así que va explícita.

**Expulsar solo, no expulsa.** Si el líder echa a alguien y no rota el código,
esa persona **todavía lo tiene** y vuelve a entrar en diez segundos. Y si rota
para cerrarle la puerta, se la cierra también a los otros treinta miembros, que
ahora tienen que conseguir el código nuevo. La herramienta barata no sirve y la
que sirve es carísima: con ese reparto, nadie echa a nadie nunca.

Por eso expulsar deja rastro **sobre la persona** y no sobre el código:
`bannedNameKeys`. Ahí las dos herramientas quedan bien repartidas:

| Herramienta | Para qué | A quién afecta |
|---|---|---|
| **Expulsar** | "Vos no" | Un `nameKey`. Nadie más se entera |
| **Rotar el código** | "El código se filtró" | A los que **todavía no entraron** |

**Rotar NO echa a los que ya están adentro.** La membresía es un estado, no una
sesión. Si rotar vaciara la alianza, sería un botón que nadie se anima a tocar
—que es lo mismo que no tenerlo— justo el día que hace falta.

Expulsar borra `alliance` y `allianceName` del `players` de esa persona. Es una
escritura pública sobre una ficha ajena disparada por un tercero, que no existe
hoy en el sistema: queda acotada a esos dos campos, no toca nada más, y no
puede tocar a alguien que no sea miembro de esa alianza.

---

## Flujos

### 1. Crear una alianza — manual, una vez

1. La persona elige **"Soy líder de una alianza"** en `/{lang}/link`.
2. Manda tag, nombre y sus datos de siempre.
3. Va a la cola del panel como `pending`, igual que una petición.
4. Un admin la aprueba. Recién ahí se genera el `joinCode` y la alianza aparece
   en el selector.

El `joinCode` se genera **al aprobar**, no al pedir: un código entregado antes
de la revisión es un código que ya circula si la alianza termina rechazada.

### 2. Entrar siendo un jugador ya aprobado — automático

Es el caso de volumen y el único que es totalmente automático.

1. La persona abre su página de estado con su `statusToken`.
2. Elige su alianza del selector y pega el `joinCode`.
3. Se publica en el acto.

No hace falta ruta nueva: es `PATCH /api/submissions/[token]` con un campo más.
La identidad ya la validó un humano al aprobar; la pertenencia la valida el
código. Las dos afirmaciones tienen quien responda por ellas.

### 3. Entrar en la petición inicial — el resto sigue manual

1. La persona elige **"Pertenezco a una alianza"**, la selecciona y pega el
   código.
2. La petición entra a la cola **con la alianza ya resuelta y marcada como
   validada por código**.
3. El admin revisa identidad y canales, que es lo que siempre revisó. La
   alianza no la tiene que juzgar.

### 4. Ordenar la alianza — el líder, sin admin

Desde su página de estado: ve la lista de miembros, expulsa, rota el código.

---

## Rutas

### Nuevas

| Ruta | Qué hace |
|---|---|
| `GET /api/alliances` | Lista pública de alianzas aprobadas (tag + nombre). Alimenta el selector. **Sin `joinCode`** |
| `POST /api/alliances` | Pide crear una alianza. Deja `pending`. No publica nada |
| `GET /api/alliances/[tag]/members` | Lista de miembros. **Requiere el `statusToken` del líder** |
| `POST /api/alliances/[tag]/kick` | Expulsa un `nameKey`. Requiere el `statusToken` del líder |
| `POST /api/alliances/[tag]/rotate` | Genera un `joinCode` nuevo. Requiere el `statusToken` del líder |

`GET /api/alliances` es público a propósito: el selector lo necesita y la lista
no es secreta. Que exponga los tags le da a un squatter una lista de objetivos,
pero el squatting lo frena la revisión manual de la creación, no el secreto —
los tags ya se ven en la tabla del leaderboard.

### Modificadas

- **`parseProfileFields`** — donde hoy toma `allianceTag` + `allianceName`
  libres, pasa a tomar `allianceTag` + `allianceCode` y resolver contra
  `alliances`. Es la función que **ya comparten** `POST /api/submissions` y
  `PATCH /api/submissions/[token]`, así que las dos entradas quedan cubiertas
  de una sola vez — que es exactamente para lo que se extrajo (ver su
  comentario de cabecera).
- **`POST /api/submissions`** y **`PATCH /api/submissions/[token]`** — sin
  cambios de fondo. Reglas nuevas: el código tiene que existir y coincidir con
  el tag, y el `nameKey` no puede estar en `bannedNameKeys`.

Los dos errores tienen que decir cosas distintas: *"Ese código no corresponde a
esa alianza"* y *"No podés entrar a esa alianza"*. Colapsarlos en uno solo
manda a la persona a pedirle el código de nuevo al líder que la echó a propósito.

### Panel

Cola de alianzas pendientes (aprobar / rechazar con motivo), y **reasignar
líder**. Esto último no es opcional: los líderes se van del juego, y sin
reasignación queda una alianza a la que nadie puede entrar nunca más — y no se
nota hasta seis meses después.

---

## Migración

Ya hay tags cargados como texto libre, y el selector vacío el día uno haría que
todo el mundo pida crear su alianza.

Un script `db:backfill-alliances` que:

1. Agrupe los `players` con `alliance` por tag.
2. Para cada tag, elija el `allianceName` más frecuente como canónico (y liste
   los descartados por consola: es justamente el dato que este proyecto quiere
   dejar de tener).
3. Cree las alianzas como `approved`, **sin líder y sin `joinCode`**.
4. Deje los `players` como están: su tag ya apunta a algo que ahora existe.

Una alianza sin líder es una alianza a la que **nadie puede entrar** hasta que
alguien reclame el liderazgo y un admin se lo apruebe. Es lo correcto: nadie
verificó a esa gente todavía, y regalar un `joinCode` a una alianza que armó un
script sería inventar una validación que nunca ocurrió.

---

## Riesgos aceptados

1. **Cualquiera puede reclamar que lidera una alianza conocida.** Mismo cero de
   siempre; lo frena la revisión manual. Mitigación: el admin puede reasignar.
2. **Squatting de tags.** El espacio es de 2 a 5 caracteres y la lista es
   pública. Lo frena lo mismo, y no hay razón para que una alianza real pierda
   contra una petición anterior si el admin puede reasignar.
3. **El `joinCode` es un secreto compartido y se va a filtrar.** Es la premisa,
   no una falla. Por eso existen rotar y expulsar.
4. **Renombrar una alianza escribe sobre todos sus miembros.** Consecuencia de
   denormalizar `allianceName`. Rara y sobre pocos docs.
5. **El "líder" es tan indemostrable como todo lo demás.** Si el rol se muestra
   en público, se muestra como lo que es: una afirmación declarada.

---

## Orden sugerido

Cada paso deja el sitio funcionando.

1. ~~`alliances` + índices + backfill + `GET /api/alliances`. Sin cambiar
   ninguna escritura: solo aparece la entidad y se ve que los datos cierran.~~
   **Hecho.** El backfill corrió en producción: un solo tag en uso (`CHM`), sin
   nombres divergentes todavía. Se corre con `npm run db:backfill-alliances`
   —dry run— y `-- --write` para escribir; es idempotente.
2. ~~El selector reemplaza al input libre de tag y nombre. **Acá ya se terminó la
   divergencia de nombres**, que es el bug visible hoy, y todavía no hay
   códigos en juego.~~ **Hecho.** `players.alliance` solo puede guardar una
   alianza aprobada, y el nombre sale de la entidad — el `allianceName` del
   cliente dejó de leerse. El "mi alianza no está" deja una pendiente en el
   panel; no publica nada.

   Se decidió así porque un selector cerrado rompía el formulario el día uno
   (había UNA alianza en la lista) y un fallback de texto libre devolvía el bug
   entero. Pedirla encaja con lo que el sistema ya hacía: la petición es una
   petición y el admin resuelve.
3. Creación de alianzas con líder + cola en el panel + `joinCode` al aprobar.
4. El código en `POST` y `PATCH`: entrar a una alianza.
5. Pantalla del líder: miembros, expulsar, rotar.

Si el paso 2 tarda en dar problemas, los pasos 3 a 5 pueden esperar: el 1 y el
2 solos ya arreglan lo que hoy está mal, y no agregan un solo secreto nuevo al
sistema.
