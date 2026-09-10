/**
 * Un heroe de Tough(6) o menos se puede unir a otra unidad del ejercito. Aqui
 * se comprueba a quien deja unirse y que la union sobrevive a guardar y volver
 * a abrir, incluso si por el camino desaparece una unidad del libro.
 *
 *   pnpm test:adjuntar
 */
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "warhost-adj-"));
const salida = join(dir, "builder.mjs");
await build({ entryPoints: ["src/lib/builder.ts"], outfile: salida, format: "esm", bundle: true, platform: "node", logLevel: "error" });
const B = await import(salida);

let fallos = 0;
const comprobar = (ok, que, detalle) => {
  console.log(`  ${ok ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
};

const unidad = (unitId, rules, extra = {}) => ({
  unitId, name: unitId, size: 1, quality: 3, defense: 3, cost: 80, rules,
  upgradePackageUids: [], weapons: null, items: null, ...extra,
});
const entrada = (unit) => ({ key: `${unit.unitId}-k`, unit, choices: {} });

// --- Quien puede unirse.
comprobar(B.esHeroe(["Hero", "Tough(3)"]) && !B.esHeroe(["Fearless"]), "esHeroe reconoce la regla Hero");
comprobar(B.puedeAdjuntarse(entrada(unidad("h3", ["Hero", "Tough(3)"])), []), "heroe Tough(3): si");
comprobar(B.puedeAdjuntarse(entrada(unidad("h6", ["Hero", "Tough(6)"])), []), "heroe Tough(6): si (6 o menos)");
comprobar(!B.puedeAdjuntarse(entrada(unidad("h12", ["Hero", "Tough(12)"])), []), "heroe Tough(12): no");
comprobar(B.puedeAdjuntarse(entrada(unidad("h0", ["Hero"])), []), "heroe sin Tough (1 herida): si");
comprobar(!B.puedeAdjuntarse(entrada(unidad("tropa", ["Strider"], { size: 5 })), []), "una unidad normal: no");

// --- Ida y vuelta de la union.
const heroe = { ...entrada(unidad("hero", ["Hero", "Tough(3)"])), key: "hero-k" };
const tropa = { ...entrada(unidad("squad", ["Battleborn"], { size: 5 })), key: "squad-k" };
heroe.attachedTo = tropa.key;

const guardado = B.serializeEntries([heroe, tropa]);
comprobar(guardado[0].attachedTo === 1, "se guarda como el indice de la unidad destino", JSON.stringify(guardado[0].attachedTo));

const cat = [unidad("hero", ["Hero", "Tough(3)"]), unidad("squad", ["Battleborn"], { size: 5 })];
const vuelto = B.rehydrateEntries(guardado, cat);
comprobar(
  vuelto[0].attachedTo === vuelto[1].key && vuelto[0].attachedTo !== "squad-k",
  "al reabrir, la union apunta a la key nueva de la misma unidad",
);

// --- Si una unidad anterior ya no existe en el libro, el indice se recoloca.
const guardadoConHueco = [
  { unitId: "fantasma", choices: {} },
  { unitId: "hero", choices: {}, attachedTo: 2 },
  { unitId: "squad", choices: {} },
];
const vueltoConHueco = B.rehydrateEntries(guardadoConHueco, cat);
comprobar(vueltoConHueco.length === 2, "la unidad que ya no existe se descarta");
comprobar(
  vueltoConHueco[0].attachedTo === vueltoConHueco[1].key,
  "y la union sigue apuntando a la unidad correcta pese al hueco",
);

// --- Una union a una key que no esta en el array no se guarda.
const suelto = { ...heroe, attachedTo: "no-existe" };
comprobar(B.serializeEntries([suelto, tropa])[0].attachedTo === undefined, "una union rota no se serializa");

// --- Como lo aplica ArmyEditor: se guarda el indice a mano, se rehidrata y se
//     vuelve a serializar (que es lo que hace composeArmyPayload). El indice
//     tiene que salir igual.
const comoArmyEditor = [
  { unitId: "hero", choices: {}, attachedTo: 1 },
  { unitId: "squad", choices: {} },
];
const ida = B.rehydrateEntries(comoArmyEditor, cat);
const vuelta = B.serializeEntries(ida);
comprobar(vuelta[0].attachedTo === 1, "el indice de la union aguanta rehidratar y volver a guardar", JSON.stringify(vuelta[0].attachedTo));

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
