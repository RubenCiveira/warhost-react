/**
 * Comprueba `applyOptions` con casos armados a mano, sin tocar Appwrite.
 *
 * El caso que motiva esto: una opcion de segundo nivel ("Energy Fist" que dice
 * "Replace Energy Sword") elegida sin haber cogido antes el Energy Sword. El
 * objetivo no esta en el equipo, pero la unidad si lleva el CCW de serie, que
 * es el candidato evidente: el reemplazo cae sobre el.
 *
 *   pnpm test:loadout
 */
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "warhost-loadout-"));
const outfile = join(dir, "loadout.mjs");
await build({ entryPoints: ["src/lib/loadout.ts"], outfile, format: "esm", bundle: true, platform: "node", logLevel: "error" });
const { applyOptions } = await import(outfile);

let fallos = 0;
const comprobar = (ok, que, detalle) => {
  console.log(`  ${ok ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
};
const linea = (entries) => entries.map((e) => `${e.count}× ${e.name}`).join(", ") || "(nada)";
const cuenta = (entries, nombre) => entries.find((e) => e.name === nombre)?.count ?? 0;

const ccw = { name: "CCW", label: "CCW (A1)", count: 5, range: null, attacks: 1, rules: [], kind: "weapon" };
const rifle = { name: "Assault Rifle", label: 'Assault Rifle (24", A1)', count: 5, range: 24, attacks: 1, rules: [], kind: "weapon" };
const energyFist = (count) => ({
  variant: "replace",
  targets: ["Energy Sword"],
  affects: { type: "any" },
  count,
  gains: [{ name: "Energy Fist", type: "ArmyBookWeapon", range: 0, attacks: 2, specialRules: [{ name: "AP", rating: 2 }] }],
});

// --- El objetivo no esta, pero el CCW de serie si: cae sobre el.
{
  const res = applyOptions([{ ...ccw }, { ...rifle }], [energyFist(5)]);
  console.log(`Replace Energy Sword ×5 sobre 5×CCW: ${linea(res)}`);
  comprobar(cuenta(res, "CCW") === 0, "el CCW desaparece al no encontrar el Energy Sword");
  comprobar(cuenta(res, "Energy Fist") === 5, "y entran 5 Energy Fist");
  comprobar(cuenta(res, "Assault Rifle") === 5, "el arma a distancia no se toca");
}

// --- Solo 2 de 5 modelos cambian: quedan 3 CCW.
{
  const res = applyOptions([{ ...ccw }], [energyFist(2)]);
  comprobar(cuenta(res, "CCW") === 3 && cuenta(res, "Energy Fist") === 2, "un reemplazo parcial deja el resto del CCW", linea(res));
}

// --- El objetivo si esta: gana el match exacto, no el candidato.
{
  const conEspada = [
    { ...ccw, count: 3 },
    { name: "Energy Sword", label: "Energy Sword (A2)", count: 2, range: null, attacks: 2, rules: [], kind: "weapon" },
  ];
  const res = applyOptions(conEspada, [energyFist(2)]);
  comprobar(
    cuenta(res, "Energy Sword") === 0 && cuenta(res, "CCW") === 3 && cuenta(res, "Energy Fist") === 2,
    "con Energy Sword presente, el reemplazo lo quita a el y respeta el CCW",
    linea(res),
  );
}

// --- Sin CCW no hay candidato de cuerpo a cuerpo: solo se anade.
{
  const dosCaC = [
    { name: "Claw", label: "Claw (A2)", count: 1, range: null, attacks: 2, rules: [], kind: "weapon" },
    { name: "Fang", label: "Fang (A1)", count: 1, range: null, attacks: 1, rules: [], kind: "weapon" },
  ];
  const res = applyOptions(dosCaC, [energyFist(1)]);
  comprobar(
    cuenta(res, "Claw") === 1 && cuenta(res, "Fang") === 1 && cuenta(res, "Energy Fist") === 1,
    "sin CCW no se quita nada de cuerpo a cuerpo, solo se anade",
    linea(res),
  );
}

// --- Arma a distancia: no hay candidato universal. "Replace up to three Heavy
//     Rifles" sobre una unidad con Heavy Pistol no toca la pistola, y se
//     comporta igual en las tres selecciones (no la primera si y el resto no).
{
  const heavyRifles = (count) => ({
    variant: "replace",
    targets: ["Heavy Rifles"],
    affects: { type: "up to", value: 3 },
    count,
    gains: [{ name: "Sniper Rifle", type: "ArmyBookWeapon", range: 30, attacks: 1 }],
  });
  const base = [
    { name: "Heavy Pistol", label: 'Heavy Pistol (12", A1)', count: 5, range: 12, attacks: 1, rules: [], kind: "weapon" },
    { ...ccw },
  ];
  const res = applyOptions(base, [heavyRifles(3)]);
  comprobar(
    cuenta(res, "Heavy Pistol") === 5 && cuenta(res, "Sniper Rifle") === 3,
    "el Heavy Pistol de serie no cuenta como Heavy Rifle",
    linea(res),
  );
}

// --- "Replace all": el candidato tambien multiplica lo que entra.
{
  const res = applyOptions([{ ...ccw }], [{ ...energyFist(1), affects: { type: "all" } }]);
  comprobar(
    cuenta(res, "CCW") === 0 && cuenta(res, "Energy Fist") === 5,
    "un 'replace all' sobre el candidato cambia las 5 copias de una vez",
    linea(res),
  );
}

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
