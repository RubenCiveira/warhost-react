/**
 * Una unidad reforzada ("combined" en Army Forge) se configura como la normal
 * y se dobla el resultado: el doble de miniaturas, el doble de todo el equipo
 * y el doble de puntos.
 *
 * Se comprueba con la aritmetica del caso que lo motivo: unos Pathfinders con
 * Heavy Rifle a los que se les ponen Sniper Rifles.
 *
 *   pnpm test:refuerzo
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";
const dir = await mkdtemp(join(tmpdir(), "warhost-ref-"));
const carga = async (entrada, nombre) => {
  const salida = join(dir, nombre);
  await build({ entryPoints: [entrada], outfile: salida, format: "esm", bundle: true, platform: "node", logLevel: "error" });
  return import(salida);
};
const L = await carga("src/lib/loadout.ts", "loadout.mjs");
const B = await carga("src/lib/builder.ts", "builder.mjs");

const filas = (tabla, queries) =>
  JSON.parse(execFileSync("appwrite", ["tables-db", "list-rows", "--database-id", "warhost", "--table-id", tabla, "--json",
    ...queries.flatMap((q) => ["--queries", JSON.stringify(q)])], { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 256e6 })).rows;

let fallos = 0;
const comprobar = (ok, que, detalle) => {
  console.log(`  ${ok ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
};
const cuantos = (equipo, nombre) => equipo.find((e) => e.name === nombre)?.count ?? 0;

const libro = filas("army_books", [
  { method: "equal", attribute: "name", values: ["Battle Brothers"] },
  { method: "equal", attribute: "gameSystem", values: ["gf"] },
  { method: "limit", values: [1] },
])[0];
const unidades = filas("army_units", [{ method: "equal", attribute: "bookKey", values: [libro.$id] }, { method: "limit", values: [100] }]);
const paquetes = new Map(
  filas("army_upgrade_packages", [{ method: "equal", attribute: "bookKey", values: [libro.$id] }, { method: "limit", values: [200] }])
    .map((p) => [p.packageUid, B.parseSections(p.sections)]),
);

// El caso exacto: los Pathfinders salen con Heavy Pistol, cambian todas por
// Heavy Rifle, y luego tres de esos rifles por Sniper Rifle. Reforzados, eso
// son 10 miniaturas con 4 Heavy Rifle y 6 Sniper Rifle.
const pathfinders = unidades.find((u) => u.name === "Pathfinders");
const secciones = B.sectionsForUnit(pathfinders, paquetes);
const buscaSeccion = (etiqueta) => secciones.find((s) => (s.label ?? "") === etiqueta);
const aRifles = buscaSeccion("Replace all Heavy Pistols and CCWs");
const aSnipers = buscaSeccion("Replace up to three Heavy Rifles");
if (!pathfinders || !aRifles || !aSnipers) {
  console.log("El libro ya no trae esas secciones; nada que comprobar.");
  process.exit(0);
}
const opRifle = aRifles.options.find((o) => (o.label ?? "").startsWith("Heavy Rifle"));
const opSniper = aSnipers.options.find((o) => (o.label ?? "").startsWith("Sniper Rifle"));

console.log(`${pathfinders.name}: ${pathfinders.size} miniaturas · ${pathfinders.cost} pts · sale con ${L.baseLoadout(pathfinders.weapons, pathfinders.items).filter((e) => e.kind === "weapon").map((e) => `${e.count}× ${e.name}`).join(", ")}`);

const choices = { [B.optionId(opRifle)]: 1, [B.optionId(opSniper)]: 3 };
const normal = { key: "n", unit: pathfinders, choices };
const reforzada = { key: "r", unit: pathfinders, choices, combined: true };

const eqNormal = B.entryLoadoutFinal(normal, secciones);
const eqReforzada = B.entryLoadoutFinal(reforzada, secciones);
console.log(`  normal    : ${eqNormal.map((e) => `${e.count}× ${e.name}`).join(", ")} · ${B.entryCost(normal, secciones)} pts`);
console.log(`  reforzada : ${eqReforzada.map((e) => `${e.count}× ${e.name}`).join(", ")} · ${B.entryCost(reforzada, secciones)} pts`);

comprobar(
  cuantos(eqNormal, "Heavy Rifle") === 2 && cuantos(eqNormal, "Sniper Rifle") === 3,
  "el reemplazo se calcula sobre la unidad normal: 2 Heavy Rifle y 3 Sniper",
  `${cuantos(eqNormal, "Heavy Rifle")} y ${cuantos(eqNormal, "Sniper Rifle")}`,
);
comprobar(
  cuantos(eqReforzada, "Heavy Rifle") === 4 && cuantos(eqReforzada, "Sniper Rifle") === 6,
  "reforzada, el resultado se dobla entero: 4 Heavy Rifle y 6 Sniper",
  `${cuantos(eqReforzada, "Heavy Rifle")} y ${cuantos(eqReforzada, "Sniper Rifle")}`,
);
comprobar(
  eqReforzada.reduce((n, e) => n + (e.kind === "weapon" ? e.count : 0), 0) ===
    eqNormal.reduce((n, e) => n + (e.kind === "weapon" ? e.count : 0), 0) * 2,
  "no aparece ni desaparece nada por el camino",
);
comprobar(
  B.entryCost(reforzada, secciones) === B.entryCost(normal, secciones) * 2,
  "el coste se dobla con las mejoras dentro",
  `${B.entryCost(normal, secciones)} -> ${B.entryCost(reforzada, secciones)}`,
);

const resuelta = B.toResolvedUnit(reforzada, secciones, 0);
comprobar(resuelta.size === 10, "el doble de miniaturas", `${resuelta.size}`);
comprobar(resuelta.combined === true, "y queda marcada como reforzada");

// Elegir de mas en lo guardado no puede pintar cosas imposibles.
const pasado = { key: "x", unit: pathfinders, choices: { ...choices, [B.optionId(opSniper)]: 99 } };
comprobar(
  cuantos(B.entryLoadoutFinal(pasado, secciones), "Sniper Rifle") === 3,
  "una eleccion repetida de mas se acota al limite de la seccion",
  `${cuantos(B.entryLoadoutFinal(pasado, secciones), "Sniper Rifle")}`,
);

const seccion = aSnipers;
// Los limites siguen contando sobre la unidad normal.
const tope = B.maxPicks(seccion, pathfinders.size);
comprobar(
  B.maxPicks(seccion, reforzada.unit.size) === tope,
  "los limites de cada seccion no cambian al reforzar",
  `${tope}`,
);

// Y sobrevive a guardar y recuperar.
const guardado = B.serializeEntries([reforzada]);
const vuelta = B.rehydrateEntries(guardado, [pathfinders]);
comprobar(vuelta[0]?.combined === true, "el refuerzo sobrevive a guardar el ejercito");
const conNota = B.rehydrateEntries(B.serializeEntries([{ ...reforzada, notes: "va con el capitan" }]), [pathfinders]);
comprobar(conNota[0]?.notes === "va con el capitan", "y las notas tambien");

// Un Heroe es una miniatura: no se refuerza.
const heroe = unidades.find((u) => u.size === 1);
comprobar(!B.sePuedeReforzar(heroe), `un Heroe no se puede reforzar (${heroe.name})`);

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
