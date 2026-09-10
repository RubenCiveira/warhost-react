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
const { grupoDeUnidad, agruparUnidades } = await import(salida);

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
