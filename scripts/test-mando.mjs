/**
 * La carta de un heroe unido a una unidad tiene que avisar de lo que el mando
 * le presta a la unidad, aunque la regla no la lleve el heroe escrita sino que
 * se la de un objeto de su equipo — "Preacher" es justo ese caso: concede
 * "Bane in Melee Aura" desde el equipo, no desde las reglas del heroe.
 *
 *   pnpm test:mando
 */
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "warhost-mando-"));
const bundle = join(dir, "app.js");

await build({
  stdin: {
    contents: `
      import { createRoot } from "react-dom/client";
      import UnitCard from "./src/components/UnitCard";

      const GLOSARIO = new Map([
        ["bane in melee aura", { description: "This model and its unit get Bane in melee." }],
        ["bane", { description: "Attacks count as having AP(4) against Tough(3) or more." }],
        ["battleborn", { description: "Some rule." }],
        ["fearless", { description: "Some rule." }],
        ["shielded", { description: "Some rule." }],
      ]);

      // El heroe real: "Preacher" es equipo, no una regla del heroe, y es su
      // \`content\` el que lleva "Bane in Melee Aura".
      const heroe = {
        name: "Veteran Master Brother", size: 1, quality: 3, defense: 3, cost: 80, maxWounds: 3,
        rules: ["Hero", "Tough(3)", "Battleborn", "Fearless"],
        loadout: [
          { name: "CCW", label: "CCW (A2)", count: 1, range: null, attacks: 2, rules: [], kind: "weapon" },
          { name: "Combat Shield", label: "Combat Shield", count: 1, range: null, attacks: null, rules: ["Shielded"], kind: "gear" },
          { name: "Preacher", label: "Preacher (Bane in Melee Aura)", count: 1, range: null, attacks: null, rules: ["Bane in Melee Aura"], kind: "gear" },
        ],
      };
      const unidad = {
        name: "Pathfinders", size: 5, quality: 4, defense: 4, cost: 120, maxWounds: 5,
        rules: ["Strider", "Battleborn", "Fearless"],
        loadout: [
          { name: "Heavy Pistol", label: "Heavy Pistol (12\\", A1, AP(1))", count: 5, range: 12, attacks: 1, rules: ["AP(1)"], kind: "weapon" },
        ],
      };
      // La misma union, pero la unidad ya lleva Bane de por si: no debe repetirse.
      const unidadConBane = { ...unidad, rules: [...unidad.rules, "Bane"] };

      createRoot(document.getElementById("root")).render(
        <>
          <div id="con-preacher">
            <UnitCard variant="ejercito" unit={heroe} glosario={GLOSARIO} adjunta={unidad} />
          </div>
          <div id="sin-repetir">
            <UnitCard variant="ejercito" unit={heroe} glosario={GLOSARIO} adjunta={unidadConBane} />
          </div>
        </>,
      );
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
const p = await navegador.newPage({ viewport: { width: 1200, height: 900 } });
await p.goto(`file://${html}`);

let fallos = 0;
const comprobar = async (ok, que, detalle) => {
  console.log(`  ${(await ok) ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!(await ok)) fallos += 1;
};

const mando = p.locator("#con-preacher .ucard-mando");
await comprobar(mando.isVisible(), "aparece 'El mando aporta' en la columna de la unidad");
await comprobar(mando.locator(".ucard-chip-liderazgo").innerText().then((t) => t.includes("3+")), "con el liderazgo del heroe (Cal 3+)");
await comprobar(
  mando.locator(".ucard-chip-doble").innerText().then((t) => t.includes("Bane in Melee Aura") && t.includes("Bane")),
  "y el doble chip de lo que concede Preacher, aunque 'Bane in Melee Aura' este en su equipo y no en sus reglas",
);

// El tamano de la carta sigue siendo el de un tarot normal, sin marco especial.
const frame = p.locator("#con-preacher .ucard-frame");
await comprobar(
  Promise.resolve((await frame.evaluate((el) => el.className)).includes("ucard-frame") && !(await frame.evaluate((el) => el.className)).includes("emparejada")),
  "el marco no lleva una clase de alto especial",
);

// Si la unidad ya lleva Bane de por si, no se repite en "El mando aporta".
const mandoSinRepetir = p.locator("#sin-repetir .ucard-mando");
await comprobar(
  mandoSinRepetir.locator(".ucard-chip-doble").count().then((n) => n === 0),
  "si la unidad ya lleva la regla, el aporte no se repite",
);
await comprobar(mandoSinRepetir.locator(".ucard-chip-liderazgo").isVisible(), "pero el liderazgo se sigue viendo");

await navegador.close();
await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
