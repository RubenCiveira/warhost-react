/**
 * Desmonta TODAS las opciones del catalogo y comprueba que no se pierde nada
 * por el camino: cada nombre y cada regla que aparece en la etiqueta original
 * tiene que salir tambien del desglose.
 *
 * Se hace sobre el catalogo entero porque el riesgo aqui no es que falle, es
 * que falle en el 3% raro y nadie lo mire.
 *
 *   pnpm test:opciones [nLibros]
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const N_LIBROS = Number(process.argv[2] ?? 30);
const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";
const cli = (args) =>
  JSON.parse(execFileSync("appwrite", [...args, "--json"], { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 256e6 }));

const libros = cli([
  "tables-db", "list-rows", "--database-id", "warhost", "--table-id", "army_books",
  "--queries", JSON.stringify({ method: "limit", values: [N_LIBROS] }),
]).rows;

const paquetes = libros.flatMap((libro) =>
  cli([
    "tables-db", "list-rows", "--database-id", "warhost", "--table-id", "army_upgrade_packages",
    "--queries", JSON.stringify({ method: "equal", attribute: "bookKey", values: [libro.$id] }),
    "--queries", JSON.stringify({ method: "limit", values: [200] }),
  ]).rows.map((p) => p.sections),
);

const dir = await mkdtemp(join(tmpdir(), "warhost-opciones-"));
const bundle = join(dir, "opciones.cjs");
await build({
  stdin: {
    contents: `
      const { desglosarOpcion } = require("./src/lib/opciones");
      const { parseSections } = require("./src/lib/builder");
      module.exports = { desglosarOpcion, parseSections };
    `,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile: bundle,
  bundle: true, platform: "node", format: "cjs", logLevel: "error",
});
const { createRequire } = await import("node:module");
const { desglosarOpcion, parseSections } = createRequire(import.meta.url)(bundle);

const normalizar = (texto) => texto.toLowerCase().replace(/[^a-z0-9]/g, "");

let total = 0;
let crudas = 0;
let conReglas = 0;
const perdidas = [];

for (const json of paquetes) {
  for (const section of parseSections(json)) {
    for (const option of section.options ?? []) {
      total += 1;
      const d = desglosarOpcion(option);
      if (d.crudo) {
        crudas += 1;
        continue;
      }
      if (d.reglas.length > 0 || d.ganancias.some((g) => g.reglas.length > 0)) conReglas += 1;

      // Todo lo que se pinta tiene que estar en la etiqueta original.
      const original = normalizar(option.label ?? "");
      const piezas = [
        ...d.ganancias.map((g) => g.nombre),
        ...d.ganancias.flatMap((g) => g.reglas.map((r) => r.etiqueta)),
        ...d.reglas.map((r) => r.etiqueta),
      ];
      const fuera = piezas.filter((pieza) => !original.includes(normalizar(pieza)));
      if (fuera.length > 0) perdidas.push({ label: option.label, fuera });
    }
  }
}

await rm(dir, { recursive: true, force: true });

console.log(`${paquetes.length} paquetes · ${total} opciones`);
console.log(`  se desmontan: ${total - crudas} (${(((total - crudas) / total) * 100).toFixed(1)}%)`);
console.log(`  con reglas que consultar: ${conReglas} (${((conReglas / total) * 100).toFixed(1)}%)`);
console.log(`  se pinta la etiqueta cruda: ${crudas}`);
if (perdidas.length > 0) {
  console.log(`\n${perdidas.length} opciones pintan algo que no estaba en su etiqueta:`);
  for (const p of perdidas.slice(0, 10)) console.log(`  ${p.label} → ${p.fuera.join(", ")}`);
}
process.exit(perdidas.length === 0 ? 0 : 1);
