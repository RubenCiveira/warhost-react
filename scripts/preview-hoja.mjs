/**
 * Dibuja fichas de catalogo —190 x 134 mm, dos por A4— y las fotografia.
 * Elige las unidades con mas opciones de configuracion, que son las que
 * deciden si la caja sirve.
 *
 *   pnpm preview:hoja [bookKey]
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";
const BOOK = process.argv[2] ?? "rvvb3kdn2x2pqkki_gf";
const SALIDA = process.env.PREVIEW_OUT ?? join(tmpdir(), "warhost-hoja.png");
const filas = (t, q) =>
  JSON.parse(execFileSync("appwrite", ["tables-db", "list-rows", "--database-id", "warhost", "--table-id", t, "--json",
    ...q.flatMap((x) => ["--queries", JSON.stringify(x)])], { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 256e6 })).rows;

const unidades = filas("army_units", [{ method: "equal", attribute: "bookKey", values: [BOOK] }, { method: "limit", values: [100] }]);
const paquetes = filas("army_upgrade_packages", [{ method: "equal", attribute: "bookKey", values: [BOOK] }, { method: "limit", values: [100] }]);

const dir = await mkdtemp(join(tmpdir(), "warhost-hoja-"));
const salidaJs = join(dir, "hoja.cjs");
await build({
  stdin: {
    contents: `
      import { renderToStaticMarkup } from "react-dom/server";
      import UnitCard from "./src/components/UnitCard";
      import { baseLoadout } from "./src/lib/loadout";
      import { parseSections, sectionsForUnit } from "./src/lib/builder";
      const UNITS = ${JSON.stringify(unidades)};
      const PK = new Map(${JSON.stringify(paquetes.map((p) => [p.packageUid, p.sections]))}.map(([k, v]) => [k, parseSections(v)]));
      const conOpciones = UNITS
        .map((u) => ({ u, secs: sectionsForUnit(u, PK) }))
        .sort((a, b) => b.secs.reduce((n, s) => n + (s.options?.length ?? 0), 0) - a.secs.reduce((n, s) => n + (s.options?.length ?? 0), 0))
        .slice(0, 2);
      globalThis.__INFO__ = conOpciones.map(({ u, secs }) => \`\${u.name}: \${secs.length} secciones, \${secs.reduce((n, s) => n + (s.options?.length ?? 0), 0)} opciones\`);
      globalThis.__HTML__ = conOpciones.map(({ u, secs }) =>
        renderToStaticMarkup(
          <UnitCard variant="catalogo" formato="hoja" unitId={u.unitId} sections={secs}
            unit={{ name: u.name, size: u.size, quality: u.quality, defense: u.defense, cost: u.cost,
                    rules: u.rules, loadout: baseLoadout(u.weapons, u.items) }} />,
        ),
      ).join("");
    `,
    resolveDir: process.cwd(), loader: "tsx",
  },
  outfile: salidaJs, bundle: true, platform: "node", format: "cjs", jsx: "automatic", logLevel: "error",
});
const { createRequire } = await import("node:module");
createRequire(import.meta.url)(salidaJs);

const html = join(dir, "hoja.html");
await writeFile(html, `<!doctype html><html lang="es" data-setting="grimdark"><head><meta charset="utf-8">
  <style>${readFileSync("src/styles.css", "utf8")}</style>
  <style>body{padding:20px;display:flex;flex-direction:column;gap:16px;align-items:flex-start}</style>
  </head><body>${globalThis.__HTML__}</body></html>`);

const { chromium } = await import("playwright");
const nav = await chromium.launch({ channel: "chrome" });
const p = await nav.newPage({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 2 });
await p.goto(`file://${html}`);
const recortes = await p.evaluate(() =>
  [...document.querySelectorAll(".ucard.hoja")].map((c) => ({
    nombre: c.querySelector(".ucard-title")?.textContent ?? "?",
    sobra: Math.round(Math.max(...[...c.querySelectorAll(".ucard-opciones-dentro, .ucard-body")].map((z) => z.scrollHeight - z.clientHeight))),
  })).filter((c) => c.sobra > 1));
await p.screenshot({ path: SALIDA, fullPage: true });
await nav.close();
await rm(dir, { recursive: true, force: true });

console.log(globalThis.__INFO__.join("\n"));
console.log(recortes.length === 0 ? "Ninguna se recorta." : `SE RECORTAN: ${recortes.map((c) => `${c.nombre} (${c.sobra}px)`).join(", ")}`);
console.log(`foto: ${SALIDA}`);
