/**
 * Imprime fichas de catalogo a PDF y comprueba que salen dos por hoja A4.
 *
 * La maqueta de impresion no se puede juzgar en pantalla: los saltos de pagina
 * solo existen al paginar de verdad.
 *
 *   pnpm test:impresion [bookKey]
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";
const BOOK = process.argv[2] ?? "rvvb3kdn2x2pqkki_gf";
const N = 6;
const filas = (t, q) =>
  JSON.parse(execFileSync("appwrite", ["tables-db", "list-rows", "--database-id", "warhost", "--table-id", t, "--json",
    ...q.flatMap((x) => ["--queries", JSON.stringify(x)])], { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 256e6 })).rows;

const unidades = filas("army_units", [{ method: "equal", attribute: "bookKey", values: [BOOK] }, { method: "limit", values: [100] }]).slice(0, N);
const paquetes = filas("army_upgrade_packages", [{ method: "equal", attribute: "bookKey", values: [BOOK] }, { method: "limit", values: [100] }]);

const dir = await mkdtemp(join(tmpdir(), "warhost-print-"));
const salidaJs = join(dir, "hoja.cjs");
await build({
  stdin: {
    contents: `
      import { renderToStaticMarkup } from "react-dom/server";
      import UnitCard from "./src/components/UnitCard";
      import { baseLoadout } from "./src/lib/loadout";
      import { parseSections, sectionsForUnit } from "./src/lib/builder";
      const UNITS = ${JSON.stringify(unidades)};
      const PK = new Map(${JSON.stringify(paquetes.map((p) => [`${BOOK}:${p.packageUid}`, p.sections]))}.map(([k, v]) => [k, parseSections(v)]));
      globalThis.__HTML__ = UNITS.map((u) =>
        '<div class="army-slide">' + renderToStaticMarkup(
          <UnitCard variant="catalogo" formato="hoja" unitId={u.unitId} sections={sectionsForUnit(u, PK)}
            unit={{ name: u.name, size: u.size, quality: u.quality, defense: u.defense, cost: u.cost,
                    rules: u.rules, loadout: baseLoadout(u.weapons, u.items) }} />) + '</div>',
      ).join("");
    `,
    resolveDir: process.cwd(), loader: "tsx",
  },
  outfile: salidaJs, bundle: true, platform: "node", format: "cjs", jsx: "automatic", logLevel: "error",
});
const { createRequire } = await import("node:module");
createRequire(import.meta.url)(salidaJs);

const html = join(dir, "print.html");
await writeFile(html, `<!doctype html><html lang="es" data-setting="grimdark"><head><meta charset="utf-8">
  <style>${readFileSync("src/styles.css", "utf8")}</style></head>
  <body><div class="content"><div class="army-strip">${globalThis.__HTML__}</div></div></body></html>`);

const { chromium } = await import("playwright");
const nav = await chromium.launch({ channel: "chrome" });
const p = await nav.newPage();
await p.goto(`file://${html}`);
const pdf = join(dir, "fichas.pdf");
await p.pdf({ path: pdf, format: "A4", printBackground: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
await nav.close();

const bytes = await readFile(pdf);
const paginas = (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
await rm(dir, { recursive: true, force: true });

let fallos = 0;
const comprobar = (ok, que, detalle) => {
  console.log(`  ${ok ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
};
const esperadas = Math.ceil(N / 2);
console.log(`${N} fichas impresas en A4`);
comprobar(paginas === esperadas, `salen dos por hoja`, `${paginas} paginas, se esperaban ${esperadas}`);
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
