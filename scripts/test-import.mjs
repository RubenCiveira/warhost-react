/**
 * Ejercita la importacion contra Army Forge de verdad, con el mismo codigo que
 * se despliega: importa src/lib/armyForgeResolve.ts y solo sustituye la capa de
 * red, que en el navegador pasa por el proxy de Appwrite.
 *
 *   pnpm test:import [urlOId] ...
 */
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SYSTEM_IDS = { gf: 2, gff: 3, aof: 4, aofs: 5, aofr: 6 };
const BASE = "https://army-forge.onepagerules.com";

const CASOS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "https://army-forge.onepagerules.com/community-lists/grimdark-future?listId=ZqVBFiF0WAQM&armyName=The+Covenant+Empire&partnerId=5wFiFns0Xmv&armyId=HwzQ4XV_5hwEBHBa",
      "ZqVBFiF0WAQM",
      "https://army-forge.onepagerules.com/share?id=ZqVBFiF0WAQM",
      "no-es-una-url-ni-un-id !!",
    ];

const dir = await mkdtemp(join(tmpdir(), "warhost-"));
const outfile = join(dir, "resolve.mjs");
await build({
  entryPoints: ["src/lib/armyForgeResolve.ts"],
  outfile,
  format: "esm",
  bundle: true,
  platform: "node",
  logLevel: "error",
});
const { extractListId, resolveList, requiredBookUids, gameSystemOf, parseStoredList } = await import(outfile);

let fallos = 0;

for (const caso of CASOS) {
  console.log(`\n─── ${caso.slice(0, 78)}`);
  const id = extractListId(caso);
  console.log(`  id extraido: ${id ?? "(ninguno)"}`);
  if (!id) {
    console.log("  → rechazado, como debe ser");
    continue;
  }

  let raw;
  try {
    raw = await getJson(`/api/community-lists/${encodeURIComponent(id)}`);
  } catch (err) {
    console.log(`  ✗ no se pudo descargar la lista: ${err.message}`);
    fallos += 1;
    continue;
  }

  const system = gameSystemOf(raw);
  const books = new Map();
  for (const uid of requiredBookUids(raw)) {
    try {
      books.set(uid, await getJson(`/api/army-books/${uid}?gameSystem=${SYSTEM_IDS[system] ?? 2}`));
    } catch (err) {
      console.log(`  ! libro ${uid} no disponible: ${err.message}`);
    }
  }

  const list = resolveList(raw, books, id);
  console.log(`  "${list.name}"  sistema=${list.gameSystem}  faccion=${list.faction}`);
  console.log(`  ${list.points} pts · ${list.modelCount} miniaturas · ${list.units.length} unidades`);
  for (const unit of list.units) {
    console.log(
      `    ${unit.name.slice(0, 22).padEnd(24)} x${String(unit.size).padEnd(2)} ` +
        `C${unit.quality} D${unit.defense} ${String(unit.cost).padStart(4)}pts ` +
        `${String(unit.maxWounds).padStart(2)}her  ${unit.rules.slice(0, 3).join(", ")}`,
    );
  }
  if (list.unresolvedUpgrades) {
    console.log(`  ⚠ ${list.unresolvedUpgrades} mejoras ya no existen en el libro actual`);
  }

  // Lo que se guarda en la columna listJson tiene que poder releerse igual.
  const roundtrip = parseStoredList(JSON.stringify(list));
  const ok = roundtrip.length === list.units.length;
  console.log(`  ${ok ? "✓" : "✗"} ida y vuelta por listJson: ${roundtrip.length}/${list.units.length} unidades`);
  if (!ok) fallos += 1;

  const sinNombre = list.units.filter((unit) => !unit.name || unit.name.startsWith("Unidad "));
  if (sinNombre.length) {
    console.log(`  ✗ ${sinNombre.length} unidades sin nombre resuelto`);
    fallos += 1;
  }
}

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);

async function getJson(path) {
  const response = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
