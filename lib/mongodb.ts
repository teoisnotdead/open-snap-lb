import { MongoClient, type Db } from "mongodb";
import { ensureDnsServers } from "./dns-bootstrap";

/**
 * Cliente de MongoDB cacheado en una global.
 *
 * En serverless (Vercel) cada invocación puede reusar el mismo proceso Node,
 * pero en dev Next.js recarga los módulos en cada HMR. Sin este cache cada
 * recarga abriría un pool nuevo y M0 (límite de 500 conexiones) se agota.
 * Cacheamos la *promesa*, no el cliente ya resuelto, para que dos requests
 * concurrentes durante el arranque en frío compartan un único handshake.
 */

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error(
    "Falta la env var MONGODB_URI. Copiá .env.example a .env y completala."
  );
}

// Nombre de la base. Si el URI ya trae una, la respetamos.
const DB_NAME = process.env.MONGODB_DB ?? "opensnaplb";

const options = {
  // maxPoolSize bajo a propósito: en serverless hay muchas instancias chicas,
  // no una grande. M0 corta en 500 conexiones totales.
  maxPoolSize: 10,
  // Fallamos rápido en vez de colgar el request hasta el timeout de Vercel.
  serverSelectionTimeoutMS: 10_000,
};

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const isDev = process.env.NODE_ENV === "development";

/** Cache para producción; en dev usamos la global para sobrevivir al HMR. */
let prodClientPromise: Promise<MongoClient> | undefined;

function readCache(): Promise<MongoClient> | undefined {
  return isDev ? global._mongoClientPromise : prodClientPromise;
}

function writeCache(value: Promise<MongoClient> | undefined): void {
  if (isDev) global._mongoClientPromise = value;
  else prodClientPromise = value;
}

function connect(): Promise<MongoClient> {
  // Justo antes de conectar, en el mismo contexto donde el driver va a hacer
  // la consulta SRV. Es no-op si DNS_SERVERS no está definida.
  ensureDnsServers();

  const promise = new MongoClient(uri!, options).connect();

  /**
   * Sin esto, un connect fallido queda cacheado como promesa rechazada y
   * TODOS los requests siguientes de esa instancia fallan para siempre, aunque
   * el problema haya sido un hipo transitorio de red o de DNS durante el
   * arranque en frío. Al invalidar el cache, el próximo request reintenta.
   *
   * El `.catch()` vacío también evita un unhandledRejection cuando nadie más
   * está esperando esta promesa todavía.
   */
  promise.catch(() => {
    if (readCache() === promise) writeCache(undefined);
  });

  return promise;
}

export function getClient(): Promise<MongoClient> {
  const cached = readCache();
  if (cached) return cached;

  const fresh = connect();
  writeCache(fresh);
  return fresh;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(DB_NAME);
}
