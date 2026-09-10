/**
 * Pasa TODAS las unidades de varios libros por la carta y avisa de las que se
 * recortan. Con una caja de tamano fijo, lo que no cabe desaparece en silencio:
 * mirar tres cartas no vale, hay que preguntarle al navegador por todas.
 *
 *   pnpm check:cards [nLibros]
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const N_LIBROS = Number(process.argv[2] ?? 6);
const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";

const cli = (args) =>
  JSON.parse(execFileSync("appwrite", [...args, "--json"], { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 256e6 }));

const libros = cli([
  "tables-db", "list-rows", "--database-id", "warhost", "--table-id", "army_books",
  "--queries", JSON.stringify({ method: "limit", values: [N_LIBROS] }),
]).rows;

const unidades = libros.flatMap((libro) =>
  cli([
    "tables-db", "list-rows", "--database-id", "warhost", "--table-id", "army_units",
    "--queries", JSON.stringify({ method: "equal", attribute: "bookKey", values: [libro.$id] }),
    "--queries", JSON.stringify({ method: "limit", values: [100] }),
  ]).rows.map((u) => ({ ...u, setting: libro.setting })),
);

const dir = await mkdtemp(join(tmpdir(), "warhost-check-"));
const bundle = join(dir, "cartas.cjs");
await build({
  stdin: {
    contents: `
      import { renderToStaticMarkup } from "react-dom/server";
      import UnitCard from "./src/components/UnitCard";
      import { baseLoadout } from "./src/lib/loadout";
      const UNITS = ${JSON.stringify(unidades)};
      globalThis.__HTML__ = UNITS.map((u) =>
        renderToStaticMarkup(
          <UnitCard variant="ejercito" unit={{
            name: u.name, size: u.size, quality: u.quality, defense: u.defense,
            cost: u.cost, maxWounds: u.size, rules: u.rules,
            loadout: baseLoadout(u.weapons, u.items),
          }} />,
        ),
      ).join("");
    `,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  outfile: bundle,
  bundle: true, platform: "node", format: "cjs", jsx: "automatic", logLevel: "error",
});
const { createRequire } = await import("node:module");
createRequire(import.meta.url)(bundle);

const pagina = join(dir, "check.html");
await writeFile(
  pagina,
  `<!doctype html><html lang="es" data-setting="grimdark"><head><meta charset="utf-8">
   <style>${readFileSync("src/styles.css", "utf8")}</style></head><body>${globalThis.__HTML__}</body></html>`,
);

const { chromium } = await import("playwright");
const navegador = await chromium.launch({ channel: "chrome" });
const p = await navegador.newPage({ viewport: { width: 900, height: 900 } });
await p.goto(`file://${pagina}`);
const malas = await p.evaluate(() =>
  [...document.querySelectorAll(".ucard")]
    .map((carta) => {
      const zonas = [...carta.querySelectorAll(".ucard-cols, .ucard-body")];
      return {
        nombre: carta.querySelector(".ucard-title")?.textContent ?? "?",
        densidad: carta.className.includes("muy-denso") ? "muy-denso" : carta.className.includes("denso") ? "denso" : "normal",
        sobra: Math.round(zonas.reduce((max, z) => Math.max(max, z.scrollHeight - z.clientHeight), 0)),
      };
    })
    .filter((c) => c.sobra > 1),
);
await navegador.close();
await rm(dir, { recursive: true, force: true });

const reparto = unidades.length;
console.log(`${libros.length} libros · ${reparto} unidades comprobadas`);
if (malas.length === 0) {
  console.log("Ninguna carta se recorta.");
} else {
  console.log(`${malas.length} se recortan (${((malas.length / reparto) * 100).toFixed(1)}%):`);
  for (const c of malas.slice(0, 12)) console.log(`  ${c.nombre.padEnd(30)} ${c.densidad.padEnd(10)} sobran ${c.sobra} px`);
  if (malas.length > 12) console.log(`  … y ${malas.length - 12} mas`);
}
process.exit(malas.length === 0 ? 0 : 1);
