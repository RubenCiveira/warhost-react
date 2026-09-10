/**
 * Comprueba que las pestanas de habilidades y equipo de una faccion salen con
 * lo suyo, y no vacias.
 *
 *   pnpm test:faccion [bookKey]
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BOOK = process.argv[2] ?? "w7qor7b2kuifcyvk_gf";
const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";
const filas = (tabla, queries) =>
  JSON.parse(
    execFileSync("appwrite", ["tables-db", "list-rows", "--database-id", "warhost", "--table-id", tabla, "--json",
      ...queries.flatMap((q) => ["--queries", JSON.stringify(q)])],
      { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 256e6 }),
  ).rows;

const dir = await mkdtemp(join(tmpdir(), "warhost-fac-"));
const salida = join(dir, "faccion.mjs");
await build({ entryPoints: ["src/lib/faccion.ts"], outfile: salida, format: "esm", bundle: true, platform: "node", logLevel: "error" });
const F = await import(salida);

const libro = JSON.parse(
  execFileSync("appwrite", ["tables-db", "get-row", "--database-id", "warhost", "--table-id", "army_books", "--row-id", BOOK, "--json"],
    { encoding: "utf8", cwd: CLI_CWD }),
);
const unidades = filas("army_units", [{ method: "equal", attribute: "bookKey", values: [BOOK] }, { method: "limit", values: [100] }]);
const glosario = new Map(
  filas("army_rules", [{ method: "equal", attribute: "gameSystem", values: [libro.gameSystem] }, { method: "limit", values: [500] }])
    .map((r) => [r.name.toLowerCase(), r]),
);

const habilidades = F.habilidadesDeFaccion(libro, glosario, unidades);
const equipo = F.equipoDeFaccion(unidades);
const generales = F.reglasGeneralesDeFaccion(glosario, unidades, habilidades);

let fallos = 0;
const comprobar = (ok, que, detalle) => {
  console.log(`  ${ok ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
};

console.log(`${libro.name} (${libro.gameSystem}) · ${unidades.length} unidades · glosario ${glosario.size}`);
console.log(`  ruleNames del libro: ${(libro.ruleNames ?? []).length}${(libro.ruleNames ?? []).length ? "" : "  (aun sin volcar: se deducen de las unidades)"}\n`);

comprobar(habilidades.length > 0, `tiene habilidades propias`, `${habilidades.length}`);
console.log(`      ${habilidades.slice(0, 8).map((r) => r.name).join(", ")}`);
comprobar(habilidades.every((r) => r.coreType === null), "ninguna es del reglamento basico");
const comunes = ["AP", "Ambush", "Deadly", "Blast", "Tough"];
const coladas = habilidades.filter((r) => comunes.includes(r.name)).map((r) => r.name);
comprobar(coladas.length === 0, "no se cuelan las comunes", coladas.join(", "));

comprobar(equipo.length > 0, "tiene equipo", `${equipo.length}`);
for (const e of equipo.slice(0, 4)) {
  console.log(`      ${e.habilidad.nombre} — lo llevan ${e.unidades.length} unidades`);
}

comprobar(generales.length > 0, "la pestana de reglas generales trae cartas", `${generales.length}`);
console.log(`      ${generales.slice(0, 8).map((r) => r.name).join(", ")}`);
comprobar(generales.every((r) => r.coreType !== null), "todas son del reglamento basico");
comprobar(
  generales.some((r) => comunes.includes(r.name)),
  "incluye reglas de arma como AP o Blast, no solo de unidad",
);
comprobar(
  !generales.some((r) => habilidades.some((h) => h.$id === r.$id)),
  "no se solapan con las habilidades propias",
);
// El rastro por el texto: si una regla propia dice "get Bane in melee", Bane
// tiene que estar aunque ninguna unidad la lleve escrita.
const textoPropias = habilidades.map((h) => h.description).join("\n");
const citadas = [...glosario.values()]
  .filter((r) => r.coreType !== null && new RegExp(`\\b${r.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(textoPropias))
  .map((r) => r.name);
const faltan = citadas.filter((n) => !generales.some((r) => r.name === n));
comprobar(faltan.length === 0, "las reglas citadas en el texto de las propias salen en generales", faltan.join(", "));
if (citadas.length) console.log(`      citadas por texto: ${citadas.slice(0, 8).join(", ")}`);

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
