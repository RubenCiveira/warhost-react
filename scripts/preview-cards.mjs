/**
 * Dibuja cartas de unidad reales —el componente que se despliega, el CSS que se
 * despliega y datos del catalogo— en un HTML, y le hace una foto.
 *
 * La carta es de tamano fijo, asi que lo unico que dice si el diseno funciona es
 * verla llena: con la unidad de mas armas y la de mas reglas, no con una de dos
 * lineas.
 *
 *   pnpm preview:cards [bookKey] [grimdark|fantasy]
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
const SALIDA = process.env.PREVIEW_OUT ?? join(tmpdir(), "warhost-cartas.png");

const filas = JSON.parse(
  execFileSync(
    "appwrite",
    [
      "tables-db", "list-rows", "--database-id", "warhost", "--table-id", "army_units", "--json",
      "--queries", JSON.stringify({ method: "equal", attribute: "bookKey", values: [BOOK] }),
      "--queries", JSON.stringify({ method: "limit", values: [100] }),
    ],
    { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 64e6 },
  ),
).rows;

const armas = (u) => JSON.parse(u.weapons || "[]").length;
const equipo = (u) => JSON.parse(u.items || "[]").length;

// Los tres casos que deciden si la caja aguanta: el maximo de armas, el maximo
// de reglas y una corriente con equipo.
const elegidas = [
  [...filas].sort((a, b) => armas(b) - armas(a))[0],
  [...filas].sort((a, b) => (b.rules?.length ?? 0) - (a.rules?.length ?? 0))[0],
  [...filas].sort((a, b) => equipo(b) - equipo(a))[0],
  [...filas].filter((u) => equipo(u) > 0).sort((a, b) => armas(b) - armas(a))[0],
].filter(Boolean);

const dir = await mkdtemp(join(tmpdir(), "warhost-preview-"));
const salidaJs = join(dir, "cartas.cjs");

await build({
  stdin: {
    contents: `
      import { renderToStaticMarkup } from "react-dom/server";
      import UnitCard from "./src/components/UnitCard";
      import RuleCard from "./src/components/RuleCard";
      import { baseLoadout } from "./src/lib/loadout";
      import { parseHabilidad } from "./src/lib/reglas";
      const UNITS = ${JSON.stringify(elegidas)};
      globalThis.__HTML__ = UNITS.map((u) =>
        renderToStaticMarkup(
          <UnitCard
            variant="ejercito"
            unit={{
              name: u.name, size: u.size, quality: u.quality, defense: u.defense,
              cost: u.cost, maxWounds: u.size * (Number(/^tough\\((\\d+)\\)$/i.exec(u.rules.find((r) => /^tough\\(/i.test(r)) ?? "")?.[1]) || 1), rules: u.rules,
              loadout: baseLoadout(u.weapons, u.items),
            }}
          />,
        ),
      ).join("") +
        // Una carta de regla al lado, para ver las dos piezas juntas.
        ${JSON.stringify(process.env.PREVIEW_RULE ?? "")}.split("|").filter(Boolean).map((x) => {
          const [nombre, texto] = x.split("::");
          return renderToStaticMarkup(
            <RuleCard
              habilidad={parseHabilidad(nombre, "regla")}
              regla={texto ? { description: texto } : null}
            />,
          );
        }).join("");
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
await writeFile(
  html,
  `<!doctype html><html lang="es" data-setting="${TEMA}"><head><meta charset="utf-8">
   <style>${readFileSync("src/styles.css", "utf8")}</style>
   <style>body{padding:24px;display:flex;flex-direction:column;gap:22px;align-items:flex-start}</style>
   </head><body>${globalThis.__HTML__}</body></html>`,
);

const { chromium } = await import("playwright");
// Con el Chrome del sistema: no hace falta que Playwright se baje el suyo.
const navegador = await chromium.launch({ channel: "chrome" });
const pagina = await navegador.newPage({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2 });
await pagina.goto(`file://${html}`);
// Con tamano fijo lo que no cabe se recorta en silencio: hay que preguntarlo.
const recortes = await pagina.evaluate(() =>
  [...document.querySelectorAll(".ucard")].map((carta) => {
    const nombre = carta.querySelector(".ucard-title")?.textContent ?? "?";
    const zonas = [...carta.querySelectorAll(".ucard-cols, .ucard-body")];
    const sobra = zonas.reduce((max, z) => Math.max(max, z.scrollHeight - z.clientHeight), 0);
    return { nombre, sobra };
  }),
);
await pagina.screenshot({ path: SALIDA, fullPage: true });
await navegador.close();
await rm(dir, { recursive: true, force: true });

console.log(
  elegidas
    .map((u, i) => {
      const sobra = recortes[i]?.sobra ?? 0;
      const aviso = sobra > 1 ? `  ✗ SE RECORTAN ${Math.round(sobra)} px` : "  ✓ cabe";
      return `${u.name} — ${armas(u)} armas, ${u.rules.length} reglas, ${equipo(u)} equipo${aviso}`;
    })
    .join("\n"),
);
console.log(`\nfoto: ${SALIDA}`);
