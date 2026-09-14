/**
 * Comprueba que el armamento, el equipo y las opciones se leen bien del
 * catalogo, usando los modulos que se despliegan.
 *
 *   pnpm test:profile [bookKey]
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BOOK = process.argv[2] ?? "78qp9l5alslt6yj8_gf";
const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";

const dir = await mkdtemp(join(tmpdir(), "warhost-"));
const bundle = async (entry, name) => {
  const outfile = join(dir, name);
  await build({ entryPoints: [entry], outfile, format: "esm", bundle: true, platform: "node", logLevel: "error" });
  return import(outfile);
};
const P = await bundle("src/lib/loadout.ts", "loadout.mjs");
const B = await bundle("src/lib/builder.ts", "builder.mjs");

const units = rows("army_units", [{ method: "equal", attribute: "bookKey", values: [BOOK] }, { method: "orderAsc", attribute: "sortOrder" }]);
const packages = new Map(
  rows("army_upgrade_packages", [{ method: "equal", attribute: "bookKey", values: [BOOK] }])
    .map((r) => [`${BOOK}:${r.packageUid}`, B.parseSections(r.sections)]),
);

let fallos = 0;
let sinArmas = 0;

for (const unit of units) {
  const entradas = P.baseLoadout(unit.weapons, unit.items);
  const weapons = entradas.filter((e) => e.kind === "weapon");
  const items = entradas.filter((e) => e.kind === "gear");
  const sections = B.sectionsForUnit(unit, packages);

  if (weapons.length === 0) sinArmas += 1;
  for (const w of weapons) {
    if (!w.name) { console.log(`✗ ${unit.name}: arma sin nombre`); fallos += 1; }
    if (w.attacks !== null && typeof w.attacks !== "number") { console.log(`✗ ${unit.name}/${w.name}: ataques no numericos`); fallos += 1; }
  }
  for (const s of sections) {
    for (const o of s.options ?? []) {
      const c = B.optionCost(o, unit.unitId);
      if (typeof c !== "number" || Number.isNaN(c)) { console.log(`✗ ${unit.name}/${o.label}: coste invalido`); fallos += 1; }
    }
  }
}

console.log(`libro ${BOOK}: ${units.length} unidades · ${sinArmas} sin armas declaradas\n`);
for (const unit of units.slice(0, 3)) {
  const entradas = P.baseLoadout(unit.weapons, unit.items);
  const weapons = entradas.filter((e) => e.kind === "weapon");
  const items = entradas.filter((e) => e.kind === "gear");
  const sections = B.sectionsForUnit(unit, packages);
  console.log(`=== ${unit.name}  (×${unit.size} C${unit.quality}+ D${unit.defense}+ ${unit.cost}pts)`);
  for (const w of weapons) {
    console.log(`   ${(w.count > 1 ? w.count + "× " : "") + w.name}`.padEnd(28) +
      `${(w.range === null ? "CaC" : w.range + '"').padStart(5)}  A${w.attacks ?? "—"}  ${w.rules.join(", ")}`);
  }
  for (const i of items) console.log(`   equipo: ${i.name}${i.rules.length ? ` (${i.rules.join(", ")})` : ""}`);
  const opciones = sections.reduce((n, s) => n + (s.options?.length ?? 0), 0);
  console.log(`   ${sections.length} secciones de mejora, ${opciones} opciones`);
  const ejemplo = sections[0];
  if (ejemplo) {
    for (const o of (ejemplo.options ?? []).slice(0, 3)) {
      console.log(`     ${ejemplo.label} → ${o.label} (+${B.optionCost(o, unit.unitId)} pts)`);
    }
  }
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
