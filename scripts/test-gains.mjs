/**
 * Comprueba el recorrido recursivo de gains de Army Forge.
 *
 *   pnpm test:gains
 */
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "warhost-gains-"));
const outfile = join(dir, "gains.mjs");
await build({
  stdin: {
    contents: `
      export { ruleLabelsFromGains } from "./src/lib/armyForgeGains";
      export { parseSections } from "./src/lib/builder";
      export { puedeTenerCaster } from "./src/lib/faccion";
    `,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile,
  format: "esm",
  bundle: true,
  platform: "node",
  logLevel: "error",
});
const { parseSections, puedeTenerCaster, ruleLabelsFromGains } = await import(outfile);

const rules = ruleLabelsFromGains([
  {
    name: "Command Pack",
    type: "ArmyBookItem",
    content: [
      { name: "Hero", type: "ArmyBookRule" },
      {
        name: "Banner Rifle",
        type: "ArmyBookWeapon",
        range: 24,
        attacks: 1,
        specialRules: [{ name: "AP", rating: 1 }],
      },
    ],
  },
  { name: "Tough", rating: 3, type: "ArmyBookRule" },
]);

await rm(dir, { recursive: true, force: true });

const expected = ["Hero", "AP(1)", "Tough(3)"];
const section = {
  id: "5h18ned",
  uid: "5E4zYzbg",
  label: "Upgrade with one",
  options: [
    {
      id: "6TUIEarP",
      label: "Archivist (Caster(2))",
      parentSectionUid: "Up5EHRM",
      parentSectionId: "5h18ned",
      gains: [
        {
          name: "Archivist",
          type: "ArmyBookItem",
          label: "Archivist (Caster(2))",
          content: [{ name: "Caster", type: "ArmyBookRule", rating: 2 }],
        },
      ],
    },
  ],
};
const sections = parseSections(JSON.stringify([section]));
const unit = { rules: [], weapons: "[]", items: "[]" };

const fallos = [];
if (JSON.stringify(rules) !== JSON.stringify(expected)) {
  fallos.push(`Reglas esperadas ${expected.join(", ")} y recibidas ${rules.join(", ")}`);
}
if (sections[0]?.options?.[0]?.label !== "Archivist (Caster(2))") {
  fallos.push("La opcion con parentSectionId valido se ha filtrado fuera de la seccion.");
}
if (!puedeTenerCaster(unit, sections)) {
  fallos.push("No se detecta Caster dentro del content de Archivist.");
}

console.log(fallos.length === 0 ? "Todo correcto." : fallos.join("\n"));
process.exit(fallos.length === 0 ? 0 : 1);
