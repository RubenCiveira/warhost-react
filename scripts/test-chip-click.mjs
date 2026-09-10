/**
 * Monta la carta de unidad en un navegador de verdad y pulsa un chip, para
 * comprobar que abre la carta de la habilidad.
 *
 * Se hace asi porque el fallo era que los chips salian deshabilitados al no
 * recibir el manejador: eso compila, se ve bien en una foto, y solo se nota
 * pulsando.
 *
 *   pnpm test:chip
 */
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "warhost-chip-"));
const bundle = join(dir, "app.js");

await build({
  stdin: {
    contents: `
      import { useState } from "react";
      import { createRoot } from "react-dom/client";
      import UnitCard from "./src/components/UnitCard";
      import RuleCardModal from "./src/components/RuleCardModal";

      const GLOSARIO = new Map([["hive bond", {
        $id: "r1", name: "Hive Bond", description: "Units where all models have this rule get +1 to morale.",
        coreType: null, hasRating: false,
      }]]);

      function App() {
        const [habilidad, setHabilidad] = useState(null);
        return (
          <>
            <UnitCard
              variant="ejercito"
              conTexto={new Set(GLOSARIO.keys())}
              onHabilidad={setHabilidad}
              unit={{
                name: "Prueba", size: 1, quality: 3, defense: 3, cost: 100, maxWounds: 3,
                rules: ["Hive Bond", "Fast"],
                loadout: [
                  { name: "CCW", label: "CCW (A2)", count: 1, range: null, attacks: 2, rules: [], kind: "weapon" },
                  { name: "Combat Shield", label: "Combat Shield", count: 1, range: null, attacks: null, rules: ["Hive Bond"], kind: "gear" },
                ],
              }}
            />
            {habilidad ? (
              <RuleCardModal habilidad={habilidad} glosario={GLOSARIO} onCerrar={() => setHabilidad(null)} />
            ) : null}
          </>
        );
      }
      createRoot(document.getElementById("root")).render(<App />);
    `,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  outfile: bundle,
  bundle: true, platform: "browser", format: "iife", jsx: "automatic", logLevel: "error",
});

const html = join(dir, "app.html");
await writeFile(html, `<!doctype html><html lang="es" data-setting="grimdark"><head><meta charset="utf-8">
  <style>${readFileSync("src/styles.css", "utf8")}</style></head>
  <body><div id="root"></div><script>${readFileSync(bundle, "utf8")}</script></body></html>`);

const { chromium } = await import("playwright");
const navegador = await chromium.launch({ channel: "chrome" });
const p = await navegador.newPage({ viewport: { width: 900, height: 800 } });
await p.goto(`file://${html}`);

let fallos = 0;
const comprobar = async (ok, que, detalle) => {
  console.log(`  ${(await ok) ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!(await ok)) fallos += 1;
};

const chips = p.locator(".ucard-chip");
await comprobar(Promise.resolve((await chips.count()) >= 3), "hay chips de regla y de equipo", `${await chips.count()}`);
await comprobar(chips.first().isEnabled(), "los chips estan habilitados");

// Una regla con descripcion: abre su carta y trae el texto.
await p.getByRole("button", { name: /^Hive Bond$/ }).first().click();
await comprobar(p.locator(".scard").isVisible(), "pulsar una regla abre su carta");
await comprobar(
  p.locator(".scard-efecto").innerText().then((t) => t.includes("morale")),
  "la carta trae la descripcion del glosario",
);
await p.keyboard.press("Escape");
await comprobar(p.locator(".scard").isHidden(), "Escape la cierra");

// Y una del reglamento basico, sin texto.
await p.getByRole("button", { name: /^Fast$/ }).click();
await comprobar(
  p.locator(".scard-sin-texto").isVisible(),
  "una regla sin descripcion abre carta y lo dice",
);

await navegador.close();
await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
