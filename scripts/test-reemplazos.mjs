/**
 * Comprueba que los reemplazos quitan lo que dicen quitar.
 *
 * Dos cosas que fallaban y no se veian: Army Forge nombra el objetivo tal como
 * suena en la frase ("Replace all Adrenaline Fueleds" apuntando a un equipo
 * llamado "Adrenaline Fueled"), y una seccion "all" cambia todas las copias de
 * una vez, no una.
 *
 *   pnpm test:reemplazos
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";
const dir = await mkdtemp(join(tmpdir(), "warhost-rep-"));
const carga = async (entrada, nombre) => {
  const salida = join(dir, nombre);
  await build({ entryPoints: [entrada], outfile: salida, format: "esm", bundle: true, platform: "node", logLevel: "error" });
  return import(salida);
};
const L = await carga("src/lib/loadout.ts", "loadout.mjs");
const B = await carga("src/lib/builder.ts", "builder.mjs");

const filas = (tabla, queries) =>
  JSON.parse(
    execFileSync(
      "appwrite",
      ["tables-db", "list-rows", "--database-id", "warhost", "--table-id", tabla, "--json",
       ...queries.flatMap((q) => ["--queries", JSON.stringify(q)])],
      { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 256e6 },
    ),
  ).rows;

let fallos = 0;
const comprobar = (ok, que, detalle) => {
  console.log(`  ${ok ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
};

// --- El caso reportado: 3 copias y una seccion "Replace all" en plural.
const LIBRO = "w7qor7b2kuifcyvk_gf";
const unidades = filas("army_units", [{ method: "equal", attribute: "bookKey", values: [LIBRO] }, { method: "limit", values: [100] }]);
const paquetes = new Map(
  filas("army_upgrade_packages", [{ method: "equal", attribute: "bookKey", values: [LIBRO] }, { method: "limit", values: [100] }])
    .map((p) => [p.packageUid, B.parseSections(p.sections)]),
);

const bestia = unidades.find((u) => u.name === "Ravenous Beasts");
const secciones = B.sectionsForUnit(bestia, paquetes);
const seccion = secciones.find((s) => (s.label ?? "").startsWith("Replace all Adrenaline"));
const opcion = seccion.options[0];

const antes = L.baseLoadout(bestia.weapons, bestia.items);
const equipoAntes = antes.filter((e) => e.kind === "gear");
console.log(`Ravenous Beasts — equipo de partida: ${equipoAntes.map((e) => `${e.count}× ${e.name}`).join(", ")}`);
console.log(`  seccion ${JSON.stringify(seccion.label)} · affects=${JSON.stringify(seccion.affects)} · objetivo=${JSON.stringify(seccion.targets)}`);

const entry = { key: "k", unit: bestia, choices: { [B.optionId(opcion)]: 1 } };
const despues = B.entryLoadout(entry, secciones);
const equipoDespues = despues.filter((e) => e.kind === "gear");
console.log(`  tras elegir ${JSON.stringify(opcion.label)}: ${equipoDespues.map((e) => `${e.count}× ${e.name}`).join(", ") || "(nada)"}`);

comprobar(!equipoDespues.some((e) => e.name.startsWith("Adrenaline")), "quita las 3 copias del equipo reemplazado");
comprobar(equipoDespues.some((e) => e.name === "Burrowing Strike" && e.count === 3), "y da 3 del nuevo, uno por modelo");
comprobar(B.maxPicks(seccion, bestia.size) === 1, "una seccion 'all' solo se puede coger una vez");

// --- Y en general: ninguna seccion "all" debe dejar su objetivo en pie.
const libros = filas("army_books", [{ method: "limit", values: [8] }]);
let revisadas = 0;
let sinQuitar = 0;
for (const libro of libros) {
  const us = filas("army_units", [{ method: "equal", attribute: "bookKey", values: [libro.$id] }, { method: "limit", values: [100] }]);
  const pk = new Map(
    filas("army_upgrade_packages", [{ method: "equal", attribute: "bookKey", values: [libro.$id] }, { method: "limit", values: [100] }])
      .map((p) => [p.packageUid, B.parseSections(p.sections)]),
  );
  for (const u of us) {
    const secs = B.sectionsForUnit(u, pk);
    const base = L.baseLoadout(u.weapons, u.items);
    for (const sec of secs) {
      if (sec.variant !== "replace" || sec.affects?.type !== "all") continue;
      // Solo cuentan las que apuntan a algo que la unidad lleva de partida. Se
      // comparan etiquetas y no nombres: una opcion puede quitar el "CCW (A2)"
      // de serie y devolver un "CCW (A1)" distinto, y eso es correcto.
      // El criterio de "a que apunta" es propio y no el del codigo: si se
      // copiase de loadout.ts, la prueba diria que si a cualquier cosa que
      // hiciera loadout.ts, incluida la equivocada. El catalogo escribe el
      // mismo objeto de tres maneras (ver ARMY-FORGE-DATA-ISSUES.md).
      const objetivos = (sec.targets ?? [])
        .map((t) => {
          const limpio = t.trim().replace(/^\s*\d+\s*x\s+/i, "").toLowerCase();
          return base.find((e) => {
            const n = e.name.toLowerCase();
            return n === limpio || `${n}s` === limpio || `${n}es` === limpio || n === `${limpio}s` || n === `${limpio}es`;
          });
        })
        .filter(Boolean);
      if (objetivos.length === 0) continue;
      revisadas += 1;
      const op = (sec.options ?? [])[0];
      if (!op) continue;
      const res = B.entryLoadout({ key: "x", unit: u, choices: { [B.optionId(op)]: 1 } }, secs);
      const restan = objetivos.filter((o) => res.some((e) => e.label === o.label));
      if (restan.length > 0) {
        sinQuitar += 1;
        if (sinQuitar <= 8) {
          console.log(`    · ${u.name}: ${JSON.stringify(sec.label)} deja ${JSON.stringify(restan.map((o) => o.label))}`);
        }
      }
    }
  }
}
console.log(`\n${revisadas} secciones "replace all" que apuntan a equipo real`);
comprobar(sinQuitar === 0, "todas dejan el objetivo fuera", `${sinQuitar} no lo quitan`);

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
