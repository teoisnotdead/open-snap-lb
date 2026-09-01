/**
 * Cambia (o saca) el líder de una alianza.
 *
 *   npm run db:set-alliance-leader -- JOB "Nombre Del Jugador"          # solo mira
 *   npm run db:set-alliance-leader -- JOB "Nombre Del Jugador" --write  # escribe
 *   npm run db:set-alliance-leader -- JOB --clear --write               # la deja sin líder
 *
 * Existe porque los líderes se van del juego, y hoy el panel no tiene pantalla
 * para reasignar: la cola solo muestra alianzas PENDIENTES. Sin esto, una
 * alianza cuyo líder desaparece queda sin nadie que pueda rotar el código ni
 * expulsar a alguien — sigue funcionando, pero el día que el código se filtre no
 * hay arreglo posible.
 *
 * Es un script y no una pantalla a propósito: la operación es rara, y la
 * alternativa real a tenerlo no era "hacer una UI" sino escribir un update a
 * mano con el problema encima — que es el peor momento para acordarse de validar
 * que el nuevo líder tenga ficha aprobada. El panel puede esperar a que duela.
 *
 * Sirve igual para el caso menos dramático y más común: un líder que sigue
 * jugando y quiere pasarle la alianza a otro.
 */
import { getClient } from "../lib/mongodb";
import { alliancesCollection, playersCollection, submissionsCollection } from "../lib/db";
import { generateJoinCode } from "../lib/alliances";
import { formatJoinCode } from "../lib/join-code";
import { toNameKey } from "../lib/names";
import { parseAlliance } from "../lib/socials";

function usage(): never {
  console.error(
    'Uso:\n' +
      '  npm run db:set-alliance-leader -- TAG "Nombre Del Jugador" [--write]\n' +
      "  npm run db:set-alliance-leader -- TAG --clear [--write]"
  );
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const clear = args.includes("--clear");
  const positional = args.filter((a) => !a.startsWith("--"));

  const rawTag = positional[0];
  const rawName = positional[1];
  if (!rawTag || (!clear && !rawName)) usage();

  const parsedTag = parseAlliance(rawTag);
  if (!parsedTag.ok) {
    console.error(`Tag inválido: ${parsedTag.error}`);
    process.exit(1);
  }
  const tag = parsedTag.value!;

  const alliances = await alliancesCollection();
  const players = await playersCollection();
  const submissions = await submissionsCollection();

  const alliance = await alliances.findOne({ tag });
  if (!alliance) {
    console.error(`No existe la alianza ${tag}.`);
    process.exit(1);
  }
  if (alliance.status !== "approved") {
    console.error(`La alianza ${tag} está ${alliance.status}, no aprobada. Resolvela en el panel.`);
    process.exit(1);
  }

  const before = alliance.leaderNameKey ?? "(sin líder)";
  console.log(`\nAlianza ${tag} — "${alliance.name}"`);
  console.log(`  líder actual: ${before}`);
  console.log(`  código:       ${alliance.joinCode ? formatJoinCode(alliance.joinCode) : "(ninguno: está abierta)"}`);
  console.log(`  miembros:     ${await players.countDocuments({ alliance: tag })}`);
  if (alliance.bannedNameKeys.length > 0) {
    console.log(`  expulsados:   ${alliance.bannedNameKeys.join(", ")}`);
  }

  /**
   * SACAR EL LÍDER se lleva el código con él, y hay que decirlo fuerte: una
   * alianza sin líder queda ABIERTA, o sea que cualquiera la puede elegir del
   * selector sin probar nada. Es lo coherente —no hay quién responda por sus
   * miembros— pero es un cambio de régimen, no una limpieza.
   *
   * Lo alternativo, dejar el código sin líder, es el peor estado posible: exige
   * un código que ya nadie puede rotar si se filtra.
   */
  if (clear) {
    console.log(`\nLa va a dejar SIN LÍDER.`);
    console.log(`  El código se borra: la alianza queda ABIERTA y cualquiera la puede elegir.`);
    console.log(`  Es preferible a dejar un código que ya nadie puede rotar si se filtra.`);

    if (!write) {
      console.log("\nDry run. Volvé a correr con --write para escribir.");
      await (await getClient()).close();
      return;
    }

    await alliances.updateOne(
      { tag },
      {
        $unset: { leaderNameKey: "", joinCode: "", joinCodeRotatedAt: "" },
        $set: { updatedAt: new Date() },
      }
    );
    console.log("\nListo: quedó sin líder y abierta.");
    await (await getClient()).close();
    return;
  }

  const nameKey = toNameKey(rawName);

  /**
   * MISMA REGLA que reclamar el liderazgo por la ruta pública: hace falta una
   * petición APROBADA. Liderar habilita repartir el código y expulsar, así que
   * no puede apoyarse en una identidad que nadie miró — y un script que la
   * saltee sería una puerta de atrás a esa regla, que es justo lo que un script
   * escrito a las apuradas hace sin querer.
   */
  const sub = await submissions.findOne({ nameKey, status: "approved" });
  if (!sub) {
    console.error(
      `\n"${rawName}" (nameKey: ${nameKey}) no tiene ninguna petición APROBADA.\n` +
        `Para liderar una alianza su ficha tiene que estar aprobada: aprobala primero en el panel.`
    );
    process.exit(1);
  }

  if (alliance.bannedNameKeys.includes(nameKey)) {
    console.error(
      `\n"${rawName}" está en la lista de expulsados de ${tag}.\n` +
        `Poner de líder a alguien vetado de su propia alianza es un estado que ninguna ` +
        `pantalla sabe explicar. Sacalo de la lista primero, o elegí a otro.`
    );
    process.exit(1);
  }

  if (nameKey === alliance.leaderNameKey) {
    console.log(`\n"${rawName}" ya lidera ${tag}. Nada que hacer.`);
    await (await getClient()).close();
    return;
  }

  const member = await players.findOne({ nameKey });

  console.log(`\n  líder nuevo:  ${nameKey}  ("${sub.playerName}")`);

  /**
   * Que el nuevo líder no sea miembro NO es un error: el caso típico es
   * justamente rescatar una alianza cuyo líder se fue, y quien la reclama puede
   * no haberse cargado el tag todavía. Se avisa y se sigue.
   */
  if (member?.alliance !== tag) {
    console.log(
      `  OJO: no tiene el tag ${tag} publicado (tiene: ${member?.alliance ?? "ninguno"}).\n` +
        `       Se puede hacer igual, pero va a liderar una alianza en la que no figura.`
    );
  }

  /**
   * Si la alianza estaba abierta —sin líder, sin código— darle un líder la
   * CIERRA, y eso necesita un código. Es el mismo gesto que hace la aprobación
   * en el panel cuando la alianza viene con líder reclamado.
   */
  const joinCode = alliance.joinCode ? undefined : generateJoinCode();
  if (joinCode) {
    console.log(`  estaba abierta: se le genera código, y pasa a pedirlo para entrar.`);
  } else {
    console.log(`  el código NO cambia: el líder nuevo hereda el que ya circulaba.`);
    console.log(`  Si el líder viejo no es de confianza, rotalo desde su página de estado.`);
  }

  if (!write) {
    console.log("\nDry run. Volvé a correr con --write para escribir.");
    await (await getClient()).close();
    return;
  }

  await alliances.updateOne(
    { tag },
    {
      $set: {
        leaderNameKey: nameKey,
        ...(joinCode ? { joinCode, joinCodeRotatedAt: new Date() } : {}),
        updatedAt: new Date(),
      },
    }
  );

  console.log(`\nListo: ${tag} pasa de ${before} a ${nameKey}.`);
  console.log(`El líder nuevo ve su código en /es/request/${sub.statusToken}`);
  if (joinCode) console.log(`Código generado: ${formatJoinCode(joinCode)}`);

  await (await getClient()).close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
