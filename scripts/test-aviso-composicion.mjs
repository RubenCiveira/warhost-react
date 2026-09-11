/**
 * El aviso de composicion se despliega al pulsarlo, y no navega si vive
 * dentro de un enlace (la lista de ejercitos envuelve toda la tarjeta en un
 * <Link>).
 *
 *   pnpm test:aviso
 */
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "warhost-aviso-"));
const bundle = join(dir, "app.js");

await build({
  stdin: {
    contents: `
      import { useState } from "react";
      import { createRoot } from "react-dom/client";
      import AvisoComposicion from "./src/components/AvisoComposicion";

      const sePasa = [
        { name: "A", rules: ["Hero"], maxWounds: 3 },
        { name: "B", rules: ["Hero"], maxWounds: 3 },
        { name: "C", rules: ["Hero"], maxWounds: 3 },
      ];
      const cumple = [{ name: "Master Brother", rules: ["Hero"], maxWounds: 3 }];

      function App() {
        const [navego, setNavego] = useState(false);
        return (
          <>
            <a href="#" id="tarjeta" onClick={(e) => { e.preventDefault(); setNavego(true); }}>
              <span>Mi ejercito</span>
              <AvisoComposicion puntos={1000} unidades={sePasa} />
            </a>
            <p id="navego">{navego ? "si" : "no"}</p>
            <div id="conforme">
              <AvisoComposicion puntos={1000} unidades={cumple} />
            </div>
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
const p = await navegador.newPage({ viewport: { width: 600, height: 400 } });
await p.goto(`file://${html}`);

let fallos = 0;
const comprobar = async (ok, que, detalle) => {
  console.log(`  ${(await ok) ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!(await ok)) fallos += 1;
};

const aviso = p.locator("#tarjeta .aviso-composicion");
await comprobar(aviso.isVisible(), "el icono se pinta");
await comprobar(p.locator("#tarjeta .aviso-composicion-pop").isHidden(), "el panel empieza cerrado");

await aviso.click();
await comprobar(p.locator("#tarjeta .aviso-composicion-pop").isVisible(), "un clic lo abre");
await comprobar(
  p.locator("#tarjeta .aviso-composicion-pop").innerText().then((t) => t.includes("heroes") || t.includes("Heroes")),
  "y trae el detalle de lo que incumple",
);
await comprobar(
  p.locator("#navego").innerText().then((t) => t === "no"),
  "pulsar el icono no dispara el enlace que lo envuelve",
);

// Un clic fuera lo cierra.
await p.locator("body").click({ position: { x: 5, y: 5 } });
await comprobar(p.locator("#tarjeta .aviso-composicion-pop").isHidden(), "un clic fuera lo cierra");

// Se puede reabrir y cerrar con Escape.
await aviso.click();
await comprobar(p.locator("#tarjeta .aviso-composicion-pop").isVisible(), "se reabre");
await p.keyboard.press("Escape");
await comprobar(p.locator("#tarjeta .aviso-composicion-pop").isHidden(), "Escape lo cierra");

// El ejercito conforme: icono verde, y el panel ensena lo que ha cumplido.
const avisoOk = p.locator("#conforme .aviso-composicion");
await comprobar(
  avisoOk.evaluate((el) => el.classList.contains("ok")),
  "un ejercito conforme pinta el icono en verde, no lo esconde",
);
await avisoOk.click();
const panelOk = p.locator("#conforme .aviso-composicion-pop");
await comprobar(panelOk.isVisible(), "y tambien se puede abrir");
// El titulo va en mayusculas por CSS (text-transform), y asi es como lo lee innerText.
await comprobar(panelOk.innerText().then((t) => /cumple la composicion/i.test(t)), "con el mensaje de que cumple");
await comprobar(
  panelOk.locator("li").count().then((n) => n === 4),
  "y las cuatro reglas que ha pasado, no solo un aviso vacio",
);

await navegador.close();
await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
