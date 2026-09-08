/**
 * Comprueba que un ejercito guardado se puede volver a abrir en el constructor
 * sin perder nada: se compone, se serializa, se rehidrata y se vuelve a
 * componer, y las dos composiciones tienen que coincidir.
 *
 *   pnpm test:edit [bookKey]
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BOOK = process.argv[2] ?? "78qp9l5alslt6yj8_gf";
const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";

const dir = await mkdtemp(join(tmpdir(), "warhost-"));
const outfile = join(dir, "builder.mjs");
await build({ entryPoints: ["src/lib/builder.ts"], outfile, format: "esm", bundle: true, platform: "node", logLevel: "error" });
const B = await import(outfile);

const units = rows("army_units", [{ method: "equal", attribute: "bookKey", values: [BOOK] }, { method: "orderAsc", attribute: "sortOrder" }]);
const packages = new Map(
  rows("army_upgrade_packages", [{ method: "equal", attribute: "bookKey", values: [BOOK] }])
    .map((r) => [r.packageUid, B.parseSections(r.sections)]),
);

let fallos = 0;

// Compone un ejercito eligiendo la primera opcion valida de cada seccion.
const entries = units.slice(0, 5).map((unit, i) => {
  const entry = { key: `k${i}`, unit, choices: {} };
  for (const section of B.sectionsForUnit(unit, packages)) {
    const option = (section.options ?? [])[0];
    if (option && !B.blockReason(section, option, entry)) {
      entry.choices[B.optionId(option)] = 1;
    }
  }
  return entry;
});

const antes = B.buildArmy(entries, packages);
const guardado = B.serializeEntries(entries);
console.log(`compuesto: ${antes.points} pts · ${antes.units.length} unidades · ${guardado.length} entradas guardadas`);

// Ida y vuelta por lo que se escribe en listJson.
const recuperado = B.rehydrateEntries(JSON.parse(JSON.stringify(guardado)), units);
const despues = B.buildArmy(recuperado, packages);

if (recuperado.length !== entries.length) { console.log(`✗ se recuperan ${recuperado.length} de ${entries.length} unidades`); fallos += 1; }
if (despues.points !== antes.points) { console.log(`✗ los puntos cambian: ${antes.points} → ${despues.points}`); fallos += 1; }
if (despues.modelCount !== antes.modelCount) { console.log(`✗ las miniaturas cambian: ${antes.modelCount} → ${despues.modelCount}`); fallos += 1; }
if (JSON.stringify(despues.units) !== JSON.stringify(antes.units)) { console.log("✗ las unidades resueltas no son identicas"); fallos += 1; }
console.log(`recuperado: ${despues.points} pts · ${despues.units.length} unidades`);

// Modificar lo recuperado tiene que seguir funcionando: anadir una unidad y
// quitar una mejora.
const masUnidad = [...recuperado, { key: "nueva", unit: units[0], choices: {} }];
const conMas = B.buildArmy(masUnidad, packages);
if (conMas.points !== despues.points + units[0].cost) {
  console.log(`✗ anadir ${units[0].name} no suma su coste`); fallos += 1;
}
const sinMejora = recuperado.map((e, i) => (i === 0 ? { ...e, choices: {} } : e));
const conMenos = B.buildArmy(sinMejora, packages);
if (recuperado[0] && Object.keys(recuperado[0].choices).length > 0 && conMenos.points >= despues.points) {
  console.log("✗ quitar una mejora no abarata el ejercito"); fallos += 1;
}
console.log(`anadiendo una unidad: ${conMas.points} pts · quitando una mejora: ${conMenos.points} pts`);

// Un ejercito importado se reconstruye desde el JSON de Army Forge.
const forge = { list: { units: [{ id: units[0].unitId, selectedUpgrades: [] }, { id: "no-existe", selectedUpgrades: [] }] } };
const desdeForge = B.entriesFromForgeList(forge, units);
if (desdeForge.length !== 1) { console.log(`✗ desde Army Forge se esperaba 1 unidad util, salieron ${desdeForge.length}`); fallos += 1; }
console.log(`desde una lista importada: ${desdeForge.length} de 2 unidades reconocidas (la otra no existe en el libro)`);

// Entradas rotas no deben tumbar la edicion.
for (const basura of [null, "x", [], [{}], [{ unitId: "fantasma" }]]) {
  if (B.rehydrateEntries(basura, units).length !== 0) { console.log(`✗ rehydrateEntries(${JSON.stringify(basura)}) deberia dar 0`); fallos += 1; }
}

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);

function rows(table, queries) {
  const out = []; let cursor = null;
  for (;;) {
    const q = [...queries, { method: "limit", values: [100] }];
    if (cursor) q.push({ method: "cursorAfter", values: [cursor] });
    const args = ["tables-db", "list-rows", "--database-id", "warhost", "--table-id", table, "--json", "--queries", ...q.map((x) => JSON.stringify(x))];
    const page = JSON.parse(execFileSync("appwrite", args, { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 64 * 1024 * 1024 }));
    out.push(...page.rows);
    if (page.rows.length < 100) return out;
    cursor = page.rows[page.rows.length - 1].$id;
  }
}
