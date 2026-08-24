/**
 * Genera el valor de ADMIN_PASSWORD_HASH a partir de una clave.
 *
 *   npm run admin:hash -- "mi clave larga"
 *
 * La clave nunca se guarda: lo que va a la env var es el hash scrypt, que no
 * se puede revertir. Así una captura de pantalla de las variables de Vercel no
 * entrega el acceso.
 */
import { randomBytes } from "node:crypto";
import { hashPassword } from "../lib/admin-auth";

const password = process.argv.slice(2).join(" ").trim();

if (!password) {
  console.error("Uso: npm run admin:hash -- \"tu clave\"");
  process.exit(1);
}

if (password.length < 12) {
  console.error(
    `La clave tiene ${password.length} caracteres. Usá al menos 12: es la única\n` +
      "puerta del panel y no hay límite de intentos todavía."
  );
  process.exit(1);
}

console.log("\nPegá esto en tus variables de entorno:\n");
console.log(`ADMIN_PASSWORD_HASH=${hashPassword(password)}`);
console.log(`ADMIN_SESSION_SECRET=${randomBytes(32).toString("hex")}`);
console.log(
  "\nADMIN_SESSION_SECRET firma la cookie de sesión. Si lo cambiás, todas las\n" +
    "sesiones abiertas se cierran — que es justamente lo que querés si sospechás\n" +
    "que se filtró.\n"
);
