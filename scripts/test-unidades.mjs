/**
 * Clasificacion de unidades en heroes / base / vehiculos y su orden.
 *
 * Casos a mano para las tres ramas, y una pasada por libros reales para que
 * ningun heroe acabe fuera de su grupo y ningun vehiculo sea multi-modelo.
 *
 *   pnpm test:unidades [nLibros]
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const N_LIBROS = Number(process.argv[2] ?? 8);
const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";
const filas = (tabla, queries) =>
  JSON.parse(
    execFileSync("appwrite", ["tables-db", "list-rows", "--database-id", "warhost", "--table-id", tabla, "--json",
      ...queries.flatMap((q) => ["--queries", JSON.stringify(q)])],
      { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 256e6 }),
  ).rows;

const dir = await mkdtemp(join(tmpdir(), "warhost-uni-"));
const salida = join(dir, "unidades.mjs");
await build({ entryPoints: ["src/lib/unidades.ts"], outfile: salida, format: "esm", bundle: true, platform: "node", logLevel: "error" });
const { grupoDeUnidad, agruparUnidades, emparejarHeroes } = await import(salida);

let fallos = 0;
const comprobar = (ok, que, detalle) => {
  console.log(`  ${ok ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
};

// --- Las tres ramas.
comprobar(grupoDeUnidad({ rules: ["Hero", "Tough(6)"], size: 1, cost: 90 }) === "heroe", "Hero manda, aunque tenga Tough");
comprobar(grupoDeUnidad({ rules: ["Fear(2)", "Tough(12)"], size: 1, cost: 300 }) === "vehiculo", "modelo unico con Tough y sin Hero es vehiculo/monstruo");
comprobar(grupoDeUnidad({ rules: ["Tough(3)"], size: 3, cost: 120 }) === "base", "multi-modelo con Tough sigue siendo base");
comprobar(grupoDeUnidad({ rules: ["Strider"], size: 1, cost: 40 }) === "base", "modelo unico sin Tough es base");

// --- Orden: grupos fijos, y dentro de mas a menos puntos.
const mezcla = [
  { $id: "a", rules: ["Strider"], size: 10, cost: 105 },
  { $id: "b", rules: ["Hero", "Tough(3)"], size: 1, cost: 55 },
  { $id: "c", rules: ["Fear(2)", "Tough(12)"], size: 1, cost: 300 },
  { $id: "d", rules: ["Hero", "Tough(6)"], size: 1, cost: 145 },
  { $id: "e", rules: ["Battleborn"], size: 5, cost: 150 },
  { $id: "f", rules: ["Aircraft", "Tough(6)"], size: 1, cost: 315 },
];
const grupos = agruparUnidades(mezcla);
comprobar(grupos.map((g) => g.grupo).join(",") === "heroe,base,vehiculo", "los grupos salen en orden fijo", grupos.map((g) => g.grupo).join(","));
comprobar(grupos[0].unidades.map((u) => u.$id).join("") === "db", "heroes de mas a menos puntos");
comprobar(grupos[1].unidades.map((u) => u.$id).join("") === "ea", "base de mas a menos puntos");
comprobar(grupos[2].unidades.map((u) => u.$id).join("") === "fc", "vehiculos de mas a menos puntos");

// --- Un grupo vacio no aparece.
const soloBase = agruparUnidades([{ $id: "x", rules: ["Fast"], size: 5, cost: 100 }]);
comprobar(soloBase.length === 1 && soloBase[0].grupo === "base", "los grupos sin unidades no salen");

// --- Emparejar un heroe con su unidad.
const ru = (name, over = {}) => ({
  name, unitKey: name, sortOrder: 0, size: 1, quality: 3, defense: 3, cost: 80, maxWounds: 3,
  rules: [], loadout: [], upgrades: [], unresolvedUpgrades: 0, ...over,
});
const lista = [
  ru("Master Brother", { rules: ["Hero", "Tough(3)"], cost: 60, size: 1 }),
  ru("Battle Brothers", { rules: ["Battleborn"], cost: 150, size: 5 }),
  ru("Assault Brothers", { rules: ["Battleborn"], cost: 165, size: 5 }),
];
const filas1 = emparejarHeroes(lista, [1, undefined, undefined]);
comprobar(filas1.length === 2, "la unidad unida sale de la lista", `${filas1.length}`);
const par = filas1.find((f) => f.adjunta);
comprobar(par && par.principal.name === "Master Brother" && par.adjunta.name === "Battle Brothers", "el heroe lleva su unidad dentro");
comprobar(par && par.size === 6 && par.cost === 210, "miniaturas y puntos se suman", `${par?.size}/${par?.cost}`);
comprobar(grupoDeUnidad(par) === "heroe", "el par se clasifica por el heroe");
const secs = agruparUnidades(filas1);
comprobar(secs[0].grupo === "heroe" && secs[0].unidades[0].adjunta, "el par va en Heroes");
comprobar(secs[1].grupo === "base" && secs[1].unidades.length === 1, "la otra unidad suelta queda en Base");

// --- Sin uniones, una fila por unidad.
comprobar(emparejarHeroes(lista, [undefined, undefined, undefined]).every((f) => !f.adjunta), "sin attachedTo, nada se empareja");
// --- Un indice fuera de rango no rompe nada.
comprobar(emparejarHeroes(lista, [9, undefined, undefined]).length === 3, "un destino que no existe deja al heroe suelto");

// --- Datos reales.
const libros = filas("army_books", [{ method: "limit", values: [N_LIBROS] }]);
let heroesMal = 0;
let vehiculosMal = 0;
let totalUnidades = 0;
for (const libro of libros) {
  const unidades = filas("army_units", [{ method: "equal", attribute: "bookKey", values: [libro.$id] }, { method: "limit", values: [200] }]);
  totalUnidades += unidades.length;
  for (const seccion of agruparUnidades(unidades)) {
    for (const u of seccion.unidades) {
      if (seccion.grupo === "heroe" && !u.rules.some((r) => r.trim().toLowerCase() === "hero")) heroesMal += 1;
      if (seccion.grupo === "vehiculo" && (u.size !== 1 || !u.rules.some((r) => /^tough\(\d+\)$/i.test(r.trim())))) vehiculosMal += 1;
    }
    const puntos = seccion.unidades.map((u) => u.cost);
    if ([...puntos].sort((a, b) => b - a).join() !== puntos.join()) {
      comprobar(false, `${libro.name}: ${seccion.grupo} sin ordenar por puntos`);
    }
  }
}
console.log(`\n${libros.length} libros, ${totalUnidades} unidades`);
comprobar(heroesMal === 0, "todo lo clasificado como heroe tiene la regla Hero", `${heroesMal} mal`);
comprobar(vehiculosMal === 0, "todo vehiculo/monstruo es modelo unico con Tough", `${vehiculosMal} mal`);

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
