# El problema de DNS con `mongodb+srv://` en Windows

> Solo afecta al desarrollo local en esta máquina. **En Vercel no pasa nada de
> esto** y hay que usar la connection string normal de Atlas.

## Síntoma

```
Error: querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net
    code: 'ECONNREFUSED',
    syscall: 'querySrv'
```

...mientras el resto de internet funciona perfecto: el navegador anda, `curl`
anda, `npm install` anda.

## Causa

Node tiene **dos resolvers DNS distintos**:

| Resolver | Lo usan | Estado en esta máquina |
|---|---|---|
| `getaddrinfo` (del sistema operativo) | `fetch`, `curl`, `net.connect`, `dns.lookup` | ✅ funciona |
| **c-ares** (propio de Node) | `dns.resolve*`, incluido **`resolveSrv`** | ❌ roto |

`mongodb+srv://` no es un hostname común: obliga al driver a pedir un registro
**SRV**, y eso pasa sí o sí por c-ares. En esta máquina c-ares no logra leer la
config de red de Windows y cae a su default, `127.0.0.1`, donde no hay ningún
servidor DNS escuchando — de ahí el `ECONNREFUSED`.

Se puede confirmar en un segundo:

```bash
node -e "console.log(require('dns').getServers())"
# ["127.0.0.1"]   <- roto

Get-DnsClientServerAddress -AddressFamily IPv4
# Ethernet  200.28.4.130, 200.28.4.129   <- el SO sí los tiene bien
```

## Lo que se intentó y por qué no alcanzó

**`dns.setServers([...])` al importar el módulo.** Funciona en un script suelto
(`npm run db:indexes` anda perfecto así), pero no dentro del dev server de Next:

1. `setServers()` **destruye y recrea el canal de c-ares**. Cualquier consulta
   en vuelo en ese momento muere con `EDESTRUCTION` — que fue exactamente el
   error que apareció al agregarlo, porque Next re-evalúa los módulos en cada
   recompilación y le volteaba el DNS por debajo a la conexión en curso.
2. El dev server evalúa los módulos en un contexto distinto del que después
   atiende los requests, así que el `setServers` podía aplicarse en un contexto
   y no en el que realmente conecta.

La función `ensureDnsServers()` de `lib/dns-bootstrap.ts` quedó igual porque
resuelve el punto 1 de forma correcta (es idempotente **por observación**: mira
`getServers()` y solo escribe si difiere) y hace andar los scripts de línea de
comandos. Para el dev server hizo falta otra cosa.

## ⚠️ No confundir este problema con el de la IP Access List

Hay **dos** fallas distintas que se parecen porque las dos impiden conectar, y
confundirlas hace perder mucho tiempo. Se distinguen por el mensaje:

| Mensaje | Causa | Se arregla |
|---|---|---|
| `querySrv ECONNREFUSED` | El DNS local no resuelve el registro SRV | Con la seed-list o `DNS_SERVERS` (este documento) |
| `ssl3_read_bytes:tlsv1 alert internal error` (SSL alert 80) | La IP no está habilitada en Atlas | En Atlas → Network Access |

El de TLS aparece **también** cuando la entrada ya está cargada pero figura como
`Inactive` porque el cambio se está desplegando. El TCP conecta y Atlas corta el
handshake. Antes de sospechar del código, mirá que el Status diga `Active`.

> Durante el desarrollo se dio por descartada la seed-list creyendo que M0 no la
> soportaba por SNI. Era falso: en ese momento la access list estaba inactiva y
> **las dos formas** fallaban por la misma razón. Con el acceso habilitado se
> probaron ambas contra el mismo cluster: la seed-list conecta y el SRV falla
> con `querySrv ECONNREFUSED`. La seed-list es la buena en local.

## La solución que se usó: saltear el SRV

En `.env` local, `MONGODB_URI` está en **forma seed-list** en vez de
`mongodb+srv://`:

```
mongodb://usuario:password@host-00:27017,host-01:27017,host-02:27017/?ssl=true&replicaSet=...&authSource=admin
```

Esa forma nombra los hosts directamente, así que solo necesita registros A —
que resuelven por `getaddrinfo`, el resolver que **sí** funciona. Cero SRV, cero
c-ares.

La string original quedó guardada en `MONGODB_URI_SRV` del mismo `.env`.

## ⚠️ Importante para el deploy

**En Vercel hay que usar la forma `mongodb+srv://`** (la de `MONGODB_URI_SRV`),
no la seed-list. Razones:

- En Vercel el DNS funciona bien y el SRV resuelve sin problema.
- La seed-list **hardcodea los hostnames de los shards**. Si Atlas escala el
  cluster o rota los nodos, esos nombres cambian y la conexión se rompe. El
  registro SRV justamente existe para que eso sea transparente.

O sea: seed-list es un parche local, no la configuración buena.

## El arreglo de fondo

Vale la pena arreglar el DNS de la máquina, porque esto también va a romper
Docker, VPNs y cualquier herramienta que use c-ares. El `127.0.0.1` suele
venir de un proxy DNS local instalado y después apagado (AdGuard, Pi-hole,
Docker Desktop, alguna VPN). Cuando esté arreglado se puede volver a
`mongodb+srv://` en local y borrar `DNS_SERVERS`.
