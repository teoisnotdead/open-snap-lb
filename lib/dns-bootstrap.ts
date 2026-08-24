import dns from "node:dns";

/**
 * Escape hatch para resolvers DNS rotos en desarrollo local.
 *
 * `mongodb+srv://` obliga al driver a pedir un registro SRV, y para eso Node
 * usa c-ares (no el resolver del sistema operativo). En algunos Windows c-ares
 * no logra leer la config de red y cae al default `127.0.0.1`; si ahí no hay
 * nada escuchando, toda conexión a Atlas muere con:
 *
 *     querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net
 *
 * ...aunque el resto de internet ande bien, porque `fetch`/`curl` usan
 * getaddrinfo y no pasan por c-ares.
 *
 * Si DNS_SERVERS no está definida esto es un no-op, así que en Vercel no hace
 * absolutamente nada.
 */

function desiredServers(): string[] {
  return (process.env.DNS_SERVERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Aplica los servidores DNS si hace falta. Hay que llamarla justo antes de
 * conectar, no al importar el módulo, por dos razones:
 *
 *  1. `dns.setServers()` destruye y recrea el canal de c-ares. Si hay consultas
 *     en vuelo, mueren con `EDESTRUCTION`. Llamándola antes de crear el cliente
 *     nos aseguramos de que no haya nada nuestro en el aire.
 *  2. El dev server de Next evalúa los módulos en un contexto distinto del que
 *     después atiende los requests. Un setServers al importar puede aplicarse
 *     en un contexto y no en el que realmente conecta.
 *
 * Es idempotente por observación: si el resolver ya está como lo queremos, no
 * toca nada. Eso evita el EDESTRUCTION mejor que un flag, porque un flag no
 * sabe en qué contexto está corriendo.
 */
export function ensureDnsServers(): void {
  const want = desiredServers();
  if (want.length === 0) return;

  const current = dns.getServers();
  if (current.join(",") === want.join(",")) return;

  try {
    dns.setServers(want);
  } catch (err) {
    console.warn(
      `DNS_SERVERS inválido (${want.join(",")}), sigo con el resolver por defecto.`,
      err
    );
  }
}
