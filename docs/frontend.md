# Frontend (Fase 3)

Next.js App Router + Tailwind v4 + recharts. Dark-only a propósito: no hay
variante clara que mantener.

## Por qué Tailwind

El diseño se apoya en un set chico y estricto de tokens — cinco grises, un
acento, dos colores semánticos — repetidos en decenas de celdas de tabla. Con
`@theme` de Tailwind v4 esos tokens se declaran una vez en `app/globals.css` y
salen como utilidades (`bg-surface`, `text-ink-3`, `border-line`), así que un
hex suelto en un componente es un bug detectable a simple vista.

**La excepción es la gráfica.** Recharts recibe colores como props, no como
clases, así que `components/ProgressChart.tsx` repite los tokens como hex
literales en un objeto `C`. Es el único lugar del proyecto donde eso es
correcto, y mantenerlo en sync con `globals.css` es manual.

## Rutas

| Ruta | Tipo | Qué es |
|---|---|---|
| `/` | dinámica | Leaderboard con buscador y filtros |
| `/jugador/[nameKey]` | dinámica | Perfil + gráficas de progreso |
| `/vincular` | estática | Flujo de verificación en 3 pasos |
| `/como-funciona` | estática | De dónde salen los datos y qué guardamos |

Las páginas server-side llaman a `getMergedLeaderboard()` y a Mongo
directamente, **no** a nuestras propias rutas de API: un server component
haciendo fetch a su propio `/api/...` es un salto de red de ida y vuelta contra
sí mismo. Por eso el merge vive en `lib/merge.ts` y lo comparten la página y la
route handler, en vez de estar duplicado.

## Δ 24 h: por qué a veces es un guión

`lib/merge.ts` calcula el delta con una agregación sobre `snapshots`: toma el
snapshot más reciente anterior al corte de 24 h y lo compara con el score
actual. Solo guardamos historial de los jugadores vinculados, así que la enorme
mayoría de las 1000 filas no tiene delta.

La UI muestra **guión, no cero**: "no sabemos" y "no se movió" son cosas
distintas y no se pueden dibujar igual sin mentir.

## Las gráficas

Dos figuras **separadas**, cada una con su escala: Snap Points arriba, posición
abajo. Nunca un solo plot con dos ejes Y — es la forma clásica de sugerir una
correlación que el gráfico no demuestra.

Detalles que importan:

- **Marcas en valores redondos.** Dejar que recharts derive el dominio de los
  datos da marcas como `9967` o `10 199`. `niceAxis()` busca el paso más chico
  que deje entre 3 y 6 marcas y estira el dominio hasta el múltiplo más cercano
  — lo que además da el aire para que la línea no toque los bordes.
- **El eje de puestos tiene piso en #1.** Redondear hacia abajo daba `#0`, que
  no existe; se recorta el dominio y se marca el 1 explícitamente.
- **El rango se ancla a la última medición, no al reloj.** `Date.now()` dentro
  de un `useMemo` es impuro (el linter lo marca) y serviría distinto en servidor
  y cliente. Además es lo correcto: si el sync estuvo caído dos días, "últimos
  7 D" debe mostrar los últimos 7 días *con datos*.
- **Estado vacío explicado.** Un jugador recién vinculado no tiene historial;
  decirlo evita que parezca un error.

## Paginación de la tabla

La API sirve 1000 filas. El filtrado corre sobre las 1000 (es un match de
strings, cuesta menos que pintarlas) pero el render crece de a 100: un DOM de
1000 filas para una pantalla que muestra ~15 no se paga.

El buscador matchea contra el nombre mostrado **y** el original, así que si un
jugador tiene nombre patcheado, quien busque el viejo también lo encuentra.

## Trampas encontradas al implementar

**Un `<p>` con `display:flex` parte el texto en columnas.** Cualquier `<span>`
dentro del mensaje se vuelve su propio flex item. Los callouts de ícono + texto
envuelven el texto en un `<span>` propio por eso. Se veía como tres columnas de
palabras sueltas.

**Los números se formatean a mano, no con `toLocaleString`.** El separador
cambia según el locale del servidor (punto en es-AR, coma en en-US) y la tabla
quedaría distinta entre el render del servidor y el del cliente. `formatScore`
usa un espacio fino de no separación, que agrupa los miles sin ensanchar la
columna.

**Numerales tabulares en todo lo que sea cifra** (`.num` en `globals.css`). Sin
eso las columnas de Snap Points bailan de fila en fila y la tabla deja de
escanearse de un vistazo.

## Scripts útiles

| Comando | Qué hace |
|---|---|
| `npm run db:seed-demo` | Siembra un jugador con 120 snapshots sintéticos para mirar la gráfica |
| `npm run db:seed-demo -- --clean` | Lo borra |
| `npm run db:delete-player -- "Nombre"` | Borra un jugador y todo su historial |

⚠️ `db:seed-demo` escribe datos **inventados** en la base que le apunte
`MONGODB_URI`. No lo corras contra producción.
