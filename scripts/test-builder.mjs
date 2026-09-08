/**
 * Ejercita el constructor con datos reales del catalogo de Appwrite, usando el
 * mismo modulo que se despliega (src/lib/builder.ts).
 *
 *   pnpm test:builder [bookKey]
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BOOK = process.argv[2] ?? "78qp9l5alslt6yj8_gf";
const DB = "warhost";
// La CLI de Appwrite lee el proyecto del appwrite.config.json de su directorio,
// que vive en el repo del backend.
const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";

const dir = await mkdtemp(join(tmpdir(), "warhost-"));
const outfile = join(dir, "builder.mjs");
await build({ entryPoints: ["src/lib/builder.ts"], outfile, format: "esm", bundle: true, platform: "node", logLevel: "error" });
const B = await import(outfile);

const units = rows("army_units", [{ method: "equal", attribute: "bookKey", values: [BOOK] }, { method: "orderAsc", attribute: "sortOrder" }]);
const packages = new Map(
  rows("army_upgrade_packages", [{ method: "equal", attribute: "bookKey", values: [BOOK] }])
    .map((row) => [row.packageUid, B.parseSections(row.sections)]),
);

console.log(`libro ${BOOK}: ${units.length} unidades, ${packages.size} paquetes\n`);

let fallos = 0;
const entries = [];

for (const unit of units.slice(0, 6)) {
  const entry = { key: unit.unitId, unit, choices: {} };
  const sections = B.sectionsForUnit(unit, packages);
  const baseCost = B.entryCost(entry, sections);
  if (baseCost !== unit.cost) { console.log(`✗ ${unit.name}: coste base ${baseCost} != ${unit.cost}`); fallos += 1; }

  // Coge opciones hasta que las restricciones lo impidan, y comprueba que el
  // tope declarado se respeta de verdad.
  let anadidas = 0;
  for (const section of sections) {
    const cap = B.maxPicks(section, unit.size);
    for (const option of section.options ?? []) {
      for (let i = 0; i < cap + 2; i += 1) {
        if (B.blockReason(section, option, entry)) break;
        const id = B.optionId(option);
        entry.choices[id] = (entry.choices[id] ?? 0) + 1;
        anadidas += 1;
      }
    }
    const puestas = B.sectionChosenCount(section, entry.choices);
    if (puestas > cap) { console.log(`✗ ${unit.name} / ${section.label}: ${puestas} > tope ${cap}`); fallos += 1; }
    const distintas = (section.options ?? []).filter((o) => entry.choices[B.optionId(o)] > 0).length;
    const limite = B.maxDistinctOptions(section);
    if (distintas > limite) { console.log(`✗ ${unit.name} / ${section.label}: ${distintas} opciones > limite ${limite}`); fallos += 1; }
  }

  if (anadidas > 0 && B.entryCost(entry, sections) < baseCost) {
    console.log(`✗ ${unit.name}: las mejoras abaratan la unidad`); fallos += 1;
  }
  const resolved = B.toResolvedUnit(entry, sections, 0);
  if (!resolved.name || resolved.maxWounds < 1) { console.log(`✗ ${unit.name}: unidad resuelta invalida`); fallos += 1; }

  // El equipamiento de partida no puede quedar intacto si se han aplicado
  // reemplazos: significaria que los targets no se estan quitando.
  const base = B.entryLoadout({ ...entry, choices: {} }, sections);
  const conMejoras = B.entryLoadout(entry, sections);
  const huboReemplazo = B.appliedOptions(entry, sections).some((o) => o.variant === "replace");
  if (huboReemplazo && JSON.stringify(base) === JSON.stringify(conMejoras)) {
    console.log(`✗ ${unit.name}: hubo reemplazos pero el equipo no cambia`); fallos += 1;
  }
  if (base.length === 0 && (unit.weapons ?? "[]") !== "[]") {
    console.log(`✗ ${unit.name}: no se lee el armamento de partida`); fallos += 1;
  }
  if (resolved.loadout.length === 0) { console.log(`✗ ${unit.name}: sin equipamiento resuelto`); fallos += 1; }

  console.log(`  ${unit.name}  ${baseCost} → ${B.entryCost(entry, sections)} pts (${anadidas} mejoras)`);
  console.log(`      de partida: ${base.join(" · ") || "(nada)"}`);
  console.log(`      resultante: ${conMejoras.join(" · ")}`);
  entries.push(entry);
}

const army = B.buildArmy(entries, packages);
const suma = entries.reduce((s, e) => s + B.entryCost(e, B.sectionsForUnit(e.unit, packages)), 0);
console.log(`\nejercito: ${army.points} pts · ${army.modelCount} miniaturas · ${army.units.length} unidades`);
if (army.points !== suma) { console.log(`✗ el total ${army.points} no cuadra con la suma ${suma}`); fallos += 1; }

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);

function rows(table, queries) {
  const out = [];
  let cursor = null;
  for (;;) {
    const q = [...queries, { method: "limit", values: [100] }];
    if (cursor) q.push({ method: "cursorAfter", values: [cursor] });
    const args = ["tables-db", "list-rows", "--database-id", DB, "--table-id", table, "--json", "--queries", ...q.map((x) => JSON.stringify(x))];
    const page = JSON.parse(
      execFileSync("appwrite", args, { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 64 * 1024 * 1024 }),
    );
    out.push(...page.rows);
    if (page.rows.length < 100) return out;
    cursor = page.rows[page.rows.length - 1].$id;
  }
}
