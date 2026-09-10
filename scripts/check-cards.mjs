/**
 * Pasa TODAS las unidades y hechizos de varios libros por su carta y avisa de
 * los que se recortan. Con una caja de tamano fijo, lo que no cabe desaparece en silencio:
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

const paquetes = libros.flatMap((libro) =>
  cli([
    "tables-db", "list-rows", "--database-id", "warhost", "--table-id", "army_upgrade_packages",
    "--queries", JSON.stringify({ method: "equal", attribute: "bookKey", values: [libro.$id] }),
    "--queries", JSON.stringify({ method: "limit", values: [100] }),
  ]).rows.map((p) => [p.packageUid, p.sections]),
);

const dir = await mkdtemp(join(tmpdir(), "warhost-check-"));
const bundle = join(dir, "cartas.cjs");
await build({
  stdin: {
    contents: `
      import { renderToStaticMarkup } from "react-dom/server";
      import UnitCard from "./src/components/UnitCard";
      import SpellCard from "./src/components/SpellCard";
      import { baseLoadout } from "./src/lib/loadout";
      import { parseSpells } from "./src/lib/spells";
      import { parseSections, sectionsForUnit } from "./src/lib/builder";
      const UNITS = ${JSON.stringify(unidades)};
      const PAQUETES = new Map(${JSON.stringify(paquetes)}.map(([k, v]) => [k, parseSections(v)]));
      const BOOKS = ${JSON.stringify(libros.map((l) => ({ name: l.name, spells: l.spells })))};
      globalThis.__HTML__ =
        UNITS.map((u) =>
          renderToStaticMarkup(
            <UnitCard variant="ejercito" unit={{
              name: u.name, size: u.size, quality: u.quality, defense: u.defense,
              cost: u.cost, maxWounds: u.size, rules: u.rules,
              loadout: baseLoadout(u.weapons, u.items),
            }} />,
          ),
        ).join("") +
        // La misma unidad en ficha de catalogo, con sus opciones dentro.
        UNITS.map((u) =>
          renderToStaticMarkup(
            <UnitCard variant="catalogo" formato="hoja" unitId={u.unitId}
              sections={sectionsForUnit(u, PAQUETES)}
              unit={{
                name: u.name, size: u.size, quality: u.quality, defense: u.defense,
                cost: u.cost, rules: u.rules, loadout: baseLoadout(u.weapons, u.items),
              }} />,
          ),
        ).join("") +
        BOOKS.flatMap((b) =>
          parseSpells(b.spells).map((s) => renderToStaticMarkup(<SpellCard spell={s} faction={b.name} />)),
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
const malas = await p.evaluate(() => {
  const mirar = (selector, titulo, zonas, tipo) =>
    [...document.querySelectorAll(selector)].map((carta) => ({
      tipo,
      nombre: carta.querySelector(titulo)?.textContent ?? "?",
      densidad:
        [
          ["opciones-extremas", "extrema"],
          ["opciones-muy-densas", "muy-densa"],
          ["opciones-densas", "densa"],
          ["muy-denso", "muy-denso"],
          ["denso", "denso"],
        ].find(([clase]) => carta.classList.contains(clase))?.[1] ?? "normal",
      sobra: Math.round(
        [...carta.querySelectorAll(zonas)].reduce((max, z) => Math.max(max, z.scrollHeight - z.clientHeight), 0),
      ),
    }));

  return [
    ...mirar(".ucard:not(.hoja)", ".ucard-title", ".ucard-bloque, .ucard-body", "unidad"),
    ...mirar(".scard", ".scard-title", ".scard-body", "hechizo"),
    ...mirar(".ucard.hoja", ".ucard-title", ".ucard-opciones-dentro, .ucard-body", "ficha"),
  ].filter((c) => c.sobra > 1);
});
// Contar por tipo: ahora hay tres piezas distintas en la pagina y sumarlas
// todas y restar hacia atras daba cifras falsas.
// MEDIR=1 vuelca las alturas reales de cada ficha a /tmp/medidas.json, que es
// como se calibran las constantes de `pasoDeOpciones` en UnitCard: el modelo
// estima en milimetros y aqui se ve cuanto se aleja de lo que pinta el
// navegador. Sin esto, las constantes serian numeros inventados.
if (process.env.MEDIR) {
  const m = await p.evaluate(() =>
    [...document.querySelectorAll(".ucard.hoja")].map((c, i) => ({
      i,
      n: c.querySelector(".ucard-title")?.textContent ?? "?",
      cab: c.querySelector("header")?.offsetHeight ?? 0,
      cuerpo: c.querySelector(".ucard-body")?.clientHeight ?? 0,
      zona: c.querySelector(".ucard-opciones-dentro")?.clientHeight ?? 0,
      usa: c.querySelector(".ucard-secciones")?.scrollHeight ?? 0,
      armas: c.querySelectorAll(".ucard-armas tbody tr").length,
      reglas: c.querySelectorAll(".ucard-bloque .ucard-chips .ucard-chip").length,
      equipo: c.querySelectorAll(".ucard-equipo-tabla tbody tr").length,
      paso: c.className.match(/opciones-[a-z-]+/)?.[0] ?? "normal",
    })),
  );
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    "/tmp/medidas.json",
    JSON.stringify({
      medidas: m,
      // En el mismo orden en que se han pintado, para poder unir sin fiarse
      // del nombre: hay unidades homonimas en libros distintos.
      unidades: unidades.map((u) => ({ nombre: u.name, paquetes: u.upgradePackageUids })),
      paquetes: Object.fromEntries(paquetes),
    }),
  );
  await navegador.close();
  process.exit(0);
}
// Cuantas fichas caen en cada escalon de densidad: si todas acaban en el mas
// apretado, el umbral esta mal puesto y se esta encogiendo la letra de balde.
const escalones = await p.evaluate(() =>
  [...document.querySelectorAll(".ucard.hoja")].reduce((cuenta, carta) => {
    const paso =
      ["opciones-extremas", "opciones-muy-densas", "opciones-densas"].find((c) => carta.classList.contains(c)) ??
      "opciones-normales";
    return { ...cuenta, [paso]: (cuenta[paso] ?? 0) + 1 };
  }, {}),
);
const cartas = await p.evaluate(() => ({
  unidad: document.querySelectorAll(".ucard:not(.hoja)").length,
  ficha: document.querySelectorAll(".ucard.hoja").length,
  hechizo: document.querySelectorAll(".scard").length,
}));
await navegador.close();
await rm(dir, { recursive: true, force: true });

const reparto = cartas.unidad + cartas.ficha + cartas.hechizo;
console.log(
  `${libros.length} libros · ${reparto} cartas ` +
    `(${cartas.unidad} de unidad, ${cartas.ficha} fichas de catalogo, ${cartas.hechizo} hechizos)`,
);
console.log(
  "fichas por escalon: " +
    ["opciones-normales", "opciones-densas", "opciones-muy-densas", "opciones-extremas"]
      .map((paso) => `${paso.replace("opciones-", "")} ${escalones[paso] ?? 0}`)
      .join(" · "),
);
if (malas.length === 0) {
  console.log("Ninguna carta se recorta.");
} else {
  console.log(`${malas.length} se recortan (${((malas.length / reparto) * 100).toFixed(1)}%):`);
  for (const c of malas.slice(0, 12)) console.log(`  [${c.tipo}] ${c.nombre.padEnd(28)} ${c.densidad.padEnd(10)} sobran ${c.sobra} px`);
  if (malas.length > 12) console.log(`  … y ${malas.length - 12} mas`);
}
process.exit(malas.length === 0 ? 0 : 1);
