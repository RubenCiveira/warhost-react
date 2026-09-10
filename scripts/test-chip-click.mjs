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

      const GLOSARIO = new Map([
        ["hive bond", {
          $id: "r1", name: "Hive Bond", description: "Units where all models have this rule get +1 to morale.",
          coreType: null, hasRating: false,
        }],
        ["ap", {
          $id: "r2", name: "AP", description: "Reduces the defense of the target by X.",
          coreType: "weapon", hasRating: true,
        }],
      ]);

      // Una seccion de mejora como las del catalogo: la opcion trae sus reglas
      // en sus gains, no solo en el texto de la etiqueta.
      const SECCIONES = [{
        id: "s1", uid: "s1", label: "Replace any CCW", variant: "replace", targets: ["CCW"],
        options: [{
          id: "o1", uid: "o1", costs: [{ cost: 10 }],
          label: "Energy Sword (A2, AP(1))",
          gains: [{
            id: "g1", name: "Energy Sword", type: "ArmyBookWeapon", attacks: 2, range: 0,
            specialRules: [{ name: "AP", type: "ArmyBookRule", rating: 1 }],
            label: "Energy Sword (A2, AP(1))",
          }],
        }, {
          id: "o2", uid: "o2", costs: [{ cost: 5 }],
          label: "Combat Shield (Hive Bond)",
          gains: [{
            id: "g2", name: "Combat Shield", type: "ArmyBookItem",
            content: [{ name: "Hive Bond", type: "ArmyBookRule" }],
            label: "Combat Shield (Hive Bond)",
          }],
        }],
      }];

      function App() {
        const [habilidad, setHabilidad] = useState(null);
        const [compradas, setCompradas] = useState(0);
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
                  { name: "Heavy Pistol", label: "Heavy Pistol (12\\", A1, AP(1))", count: 1, range: 12, attacks: 1, rules: ["AP(1)"], kind: "weapon" },
                  { name: "Combat Shield", label: "Combat Shield", count: 1, range: null, attacks: null, rules: ["Hive Bond"], kind: "gear" },
                ],
              }}
            />
            {/* La misma unidad en el asistente de anadir: las opciones se
                eligen, y sus reglas tienen que consultarse antes de comprarlas. */}
            <UnitCard
              variant="ejercito"
              unitId="u1"
              sections={SECCIONES}
              optionsOpen
              conTexto={new Set(GLOSARIO.keys())}
              onHabilidad={setHabilidad}
              optionAction={(section, option) => (
                <button type="button" className="icon tiny" aria-label={\`Anadir \${option.label}\`}
                  onClick={() => setCompradas((n) => n + 1)}>+</button>
              )}
              unit={{
                name: "Prueba", size: 1, quality: 3, defense: 3, cost: 100, maxWounds: 3,
                rules: ["Hive Bond"],
                loadout: [
                  { name: "CCW", label: "CCW (A2)", count: 1, range: null, attacks: 2, rules: [], kind: "weapon" },
                ],
              }}
            />
            <p id="compradas">{compradas}</p>
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

// Las reglas de arma tambien son chips: el fallo que se busca aqui es que
// vuelvan a ser texto plano al tocar la tabla de armas.
await p.keyboard.press("Escape");
const chipArma = p.locator(".ucard-wrules .ucard-chip");
await comprobar(Promise.resolve((await chipArma.count()) === 1), "la regla de arma se pinta como chip");
await chipArma.first().click();
await comprobar(p.locator(".scard").isVisible(), "pulsar una regla de arma abre su carta");
await comprobar(
  p.locator(".scard-efecto").innerText().then((t) => t.includes("defense")),
  "la carta de la regla de arma trae su descripcion",
);
await comprobar(
  p.locator(".scard-title").innerText().then((t) => /AP/.test(t)),
  "y es la regla del arma, no otra",
);
await p.keyboard.press("Escape");

// Y una del reglamento basico, sin texto.
await p.getByRole("button", { name: /^Fast$/ }).click();
await comprobar(
  p.locator(".scard-sin-texto").isVisible(),
  "una regla sin descripcion abre carta y lo dice",
);

// Y las reglas de las opciones de mejora, que es lo que se mira para decidir
// si compras la opcion.
await p.keyboard.press("Escape");
const chipOpcion = p.locator(".ucard-option-cuerpo .ucard-chip");
await comprobar(
  Promise.resolve((await chipOpcion.count()) === 2),
  "las reglas de las opciones salen como chips",
  `${await chipOpcion.count()}`,
);
await comprobar(
  p.locator(".ucard-option-cuerpo").first().innerText().then((t) => t.includes("Energy Sword") && t.includes("A2")),
  "la opcion conserva su nombre y su perfil",
);
await chipOpcion.first().click();
await comprobar(p.locator(".scard").isVisible(), "pulsar la regla de una opcion abre su carta");
await comprobar(
  p.locator("#compradas").innerText().then((t) => t === "0"),
  "consultar la regla no compra la opcion",
);
await p.keyboard.press("Escape");
// La que da el equipo configurable, que es una regla dentro de un objeto.
await p.locator(".ucard-option-cuerpo .ucard-chip", { hasText: "Hive Bond" }).click();
await comprobar(
  p.locator(".scard-efecto").innerText().then((t) => t.includes("morale")),
  "y la regla que concede un equipo configurable tambien",
);

await navegador.close();
await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
