/**
 * Dibuja cartas de hechizo reales y les hace una foto. Como la de unidad, es de
 * tamano fijo —70 x 120 mm, la de tarot de pie— y solo verla llena dice si el
 * diseno funciona.
 *
 *   pnpm preview:spells [bookKey] [grimdark|fantasy]
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BOOK = process.argv[2] ?? "78qp9l5alslt6yj8_gf";
const TEMA = process.argv[3] ?? "grimdark";
const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";
const SALIDA = process.env.PREVIEW_OUT ?? join(tmpdir(), "warhost-hechizos.png");

const libro = JSON.parse(
  execFileSync("appwrite", ["tables-db", "get-row", "--database-id", "warhost", "--table-id", "army_books", "--row-id", BOOK, "--json"],
    { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 64e6 }),
);

const dir = await mkdtemp(join(tmpdir(), "warhost-spells-"));
const salidaJs = join(dir, "cartas.cjs");
await build({
  stdin: {
    contents: `
      import { renderToStaticMarkup } from "react-dom/server";
      import SpellCard from "./src/components/SpellCard";
      import { parseSpells } from "./src/lib/spells";
      const SPELLS = parseSpells(${JSON.stringify(libro.spells)});
      globalThis.__HTML__ = SPELLS.map((s) =>
        renderToStaticMarkup(<SpellCard spell={s} faction={${JSON.stringify(libro.factionName || libro.name)}} />),
      ).join("");
      globalThis.__N__ = SPELLS.length;
    `,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  outfile: salidaJs,
  bundle: true, platform: "node", format: "cjs", jsx: "automatic", logLevel: "error",
});
const { createRequire } = await import("node:module");
createRequire(import.meta.url)(salidaJs);

const html = join(dir, "preview.html");
await writeFile(html, `<!doctype html><html lang="es" data-setting="${TEMA}"><head><meta charset="utf-8">
  <style>${readFileSync("src/styles.css", "utf8")}</style>
  <style>body{padding:24px;display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap}</style>
  </head><body>${globalThis.__HTML__}</body></html>`);

const { chromium } = await import("playwright");
const navegador = await chromium.launch({ channel: "chrome" });
const pagina = await navegador.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
await pagina.goto(`file://${html}`);
// Igual que en las unidades: lo que no cabe en una caja fija desaparece callado.
const recortes = await pagina.evaluate(() =>
  [...document.querySelectorAll(".scard")]
    .map((c) => ({
      nombre: c.querySelector(".scard-title")?.textContent ?? "?",
      sobra: Math.round(Math.max(...[...c.querySelectorAll(".scard-body")].map((z) => z.scrollHeight - z.clientHeight))),
    }))
    .filter((c) => c.sobra > 1),
);
await pagina.screenshot({ path: SALIDA, fullPage: true });
await navegador.close();
await rm(dir, { recursive: true, force: true });

console.log(`${libro.name} (${libro.gameSystem}) · ${globalThis.__N__} hechizos`);
console.log(recortes.length === 0 ? "Ninguno se recorta." : `SE RECORTAN: ${recortes.map((c) => `${c.nombre} (${c.sobra}px)`).join(", ")}`);
console.log(`foto: ${SALIDA}`);
