/**
 * Reconfigurar una unidad del ejercito la reemplaza **en su sitio**, sin tocar
 * a las demas.
 *
 * El riesgo aqui no es que no funcione, es que funcione sobre la unidad
 * equivocada: el indice viene del array guardado, y rehidratar descarta las
 * unidades que ya no existen en el libro. Si el indice se aplicara despues de
 * rehidratar, un ejercito con una unidad retirada reconfiguraria otra sin que
 * nada avisara.
 *
 *   pnpm test:reconfigurar
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";
const dir = await mkdtemp(join(tmpdir(), "warhost-recfg-"));
const salida = join(dir, "builder.mjs");
await build({ entryPoints: ["src/lib/builder.ts"], outfile: salida, format: "esm", bundle: true, platform: "node", logLevel: "error" });
const B = await import(salida);

const filas = (tabla, queries) =>
  JSON.parse(execFileSync("appwrite", ["tables-db", "list-rows", "--database-id", "warhost", "--table-id", tabla, "--json",
    ...queries.flatMap((q) => ["--queries", JSON.stringify(q)])], { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 256e6 })).rows;

let fallos = 0;
const comprobar = (ok, que, detalle) => {
  console.log(`  ${ok ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
};

const libro = filas("army_books", [
  { method: "equal", attribute: "name", values: ["Battle Brothers"] },
  { method: "equal", attribute: "gameSystem", values: ["gf"] },
  { method: "limit", values: [1] },
])[0];
const catalogo = filas("army_units", [{ method: "equal", attribute: "bookKey", values: [libro.$id] }, { method: "limit", values: [100] }]);
const packages = new Map(
  filas("army_upgrade_packages", [{ method: "equal", attribute: "bookKey", values: [libro.$id] }, { method: "limit", values: [200] }])
    .map((p) => [`${libro.$id}:${p.packageUid}`, B.parseSections(p.sections)]),
);

const conOpciones = catalogo.filter((u) => B.sectionsForUnit(u, packages).some((s) => (s.options ?? []).length > 0));
const [uno, dos, tres] = conOpciones;

// Tres unidades guardadas; se reconfigura la de en medio.
const guardadas = [uno, dos, tres].map((u) => ({ bookKey: libro.$id, unitId: u.unitId, choices: {} }));
const seccion = B.sectionsForUnit(dos, packages).find((s) => (s.options ?? []).length > 0);
const opcion = seccion.options[0];
const cambiada = { bookKey: libro.$id, unitId: dos.unitId, choices: { [B.optionId(opcion)]: 1 }, notes: "reconfigurada" };

const reemplaza = (lista, indice, nueva) => lista.map((x, i) => (i === indice ? nueva : x));

const despues = reemplaza(guardadas, 1, cambiada);
const entradas = B.rehydrateEntries(despues, catalogo);
console.log(`${libro.name}: ${guardadas.map((g) => catalogo.find((u) => u.unitId === g.unitId).name).join(" · ")}`);
comprobar(entradas.length === 3, "siguen siendo tres unidades", `${entradas.length}`);
comprobar(entradas[1].unit.unitId === dos.unitId, "la reconfigurada sigue en su sitio, la segunda");
comprobar(entradas[1].notes === "reconfigurada", "y lleva lo que se le puso");
comprobar(
  Object.keys(entradas[0].choices).length === 0 && Object.keys(entradas[2].choices).length === 0,
  "las otras dos quedan intactas",
);

// El caso que motiva aplicar el indice sobre lo guardado: una unidad retirada
// del libro desaparece al rehidratar y corre los indices.
const conRetirada = [{ bookKey: libro.$id, unitId: "no-existe-ya", choices: {} }, ...guardadas];
comprobar(
  B.rehydrateEntries(conRetirada, catalogo).length === 3,
  "una unidad retirada del libro se cae al rehidratar",
);
const bien = B.rehydrateEntries(reemplaza(conRetirada, 2, cambiada), catalogo);
comprobar(
  bien[1].unit.unitId === dos.unitId && bien[1].notes === "reconfigurada",
  "aplicando el indice sobre lo guardado se reconfigura la que toca",
);
// El mismo indice aplicado despues de rehidratar cae sobre la tercera, no
// sobre la segunda: la unidad retirada ya no esta y todo se ha corrido uno.
const mal = reemplaza(
  B.rehydrateEntries(conRetirada, catalogo),
  2,
  B.rehydrateEntries([cambiada], catalogo)[0],
);
comprobar(
  !mal.some((e) => e.unit.unitId === tres.unitId) && mal[1].notes !== "reconfigurada",
  "y aplicandolo despues de rehidratar se habria reconfigurado otra",
  `habria borrado ${tres.name} y dejado ${dos.name} sin tocar`,
);

// --- Quitar una unidad: los indices de `attachedTo` se mueven con ella.
{
  // Cuatro unidades; la segunda lleva un heroe unido (la cuarta apunta a ella).
  const base = [uno, dos, tres, uno].map((u) => ({ bookKey: libro.$id, unitId: u.unitId, choices: {} }));
  base[3] = { ...base[3], attachedTo: 1 };

  const quitar = (lista, indice) =>
    lista
      .filter((_, i) => i !== indice)
      .map((e) => {
        if (e.attachedTo === undefined) return e;
        if (e.attachedTo === indice) {
          const { attachedTo, ...suelta } = e;
          return suelta;
        }
        return e.attachedTo > indice ? { ...e, attachedTo: e.attachedTo - 1 } : e;
      });

  // Quitando la primera, la union de la cuarta tiene que seguir apuntando a la
  // misma unidad, ahora en la posicion 0.
  const sinPrimera = quitar(base, 0);
  comprobar(sinPrimera.length === 3, "quedan tres", `${sinPrimera.length}`);
  comprobar(
    sinPrimera[2].attachedTo === 0 && sinPrimera[0].unitId === dos.unitId,
    "la union se corre con los indices y sigue apuntando a la misma unidad",
    `apunta a ${sinPrimera[2].attachedTo}`,
  );
  // Una sola rehidratacion: las claves llevan sufijo aleatorio, asi que dos
  // llamadas nunca coinciden y compararlas entre si no probaria nada.
  const rehidratada = B.rehydrateEntries(sinPrimera, catalogo);
  comprobar(
    rehidratada[2].attachedTo === rehidratada[0].key,
    "y al rehidratar la union sigue en pie",
    `${rehidratada[2].attachedTo} vs ${rehidratada[0].key}`,
  );

  // Quitando aquella a la que estaba unida, la unidad se queda suelta.
  const sinDestino = quitar(base, 1);
  comprobar(
    sinDestino[2].attachedTo === undefined,
    "quitando la unidad a la que iba unida, la otra se queda suelta",
    `${JSON.stringify(sinDestino[2].attachedTo)}`,
  );
  comprobar(
    B.rehydrateEntries(sinDestino, catalogo).every((e) => e.attachedTo === undefined),
    "y no queda ninguna union apuntando al vacio",
  );
}

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
