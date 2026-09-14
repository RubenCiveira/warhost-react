/**
 * Recalcula cada ejercito guardado con el codigo actual y lo compara con lo que
 * tiene almacenado.
 *
 * Hace falta porque un ejercito guarda sus unidades **ya resueltas**: si se
 * corrige la logica que las resuelve, lo guardado no cambia solo. Esto dice
 * cuales quedaron desfasados y en que.
 *
 *   pnpm audit:armies
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";
const cli = (args) =>
  JSON.parse(execFileSync("appwrite", [...args, "--json"], { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 256e6 }));
const filas = (tabla, queries) =>
  cli(["tables-db", "list-rows", "--database-id", "warhost", "--table-id", tabla,
       ...queries.flatMap((q) => ["--queries", JSON.stringify(q)])]).rows;

const dir = await mkdtemp(join(tmpdir(), "warhost-audit-"));
const salida = join(dir, "builder.mjs");
await build({ entryPoints: ["src/lib/builder.ts"], outfile: salida, format: "esm", bundle: true, platform: "node", logLevel: "error" });
const B = await import(salida);

const ejercitos = filas("armies", [{ method: "limit", values: [100] }]);
const cache = new Map();

let desfasados = 0;
let sinEntradas = 0;

for (const ej of ejercitos) {
  let guardado;
  try { guardado = JSON.parse(ej.listJson || "{}"); } catch { guardado = {}; }
  // Desde que un ejercito puede mezclar facciones, `source.bookKey` (uno
  // solo) paso a `source.books` (uno por faccion presente). Este script solo
  // recalcula el caso de una sola faccion; con varias, se deja como "no se
  // puede recalcular" en vez de mezclar mal sus catalogos.
  const bookKey =
    guardado.source?.bookKey ?? (guardado.source?.books?.length === 1 ? guardado.source.books[0].bookKey : undefined);
  const etiqueta = `${ej.name} (${ej.status} v${ej.version})`;

  if (!guardado.entries || !bookKey) {
    sinEntradas += 1;
    console.log(`  ~ ${etiqueta.padEnd(34)} no guarda sus elecciones: no se puede recalcular`);
    continue;
  }

  if (!cache.has(bookKey)) {
    const unidades = filas("army_units", [
      { method: "equal", attribute: "bookKey", values: [bookKey] }, { method: "limit", values: [100] },
    ]);
    const paquetes = new Map(
      filas("army_upgrade_packages", [
        { method: "equal", attribute: "bookKey", values: [bookKey] }, { method: "limit", values: [100] },
      ]).map((p) => [`${bookKey}:${p.packageUid}`, B.parseSections(p.sections)]),
    );
    cache.set(bookKey, { unidades, paquetes });
  }
  const { unidades, paquetes } = cache.get(bookKey);

  const rehecho = B.buildArmy(B.rehydrateEntries(guardado.entries, unidades, bookKey), paquetes);
  const iguales = JSON.stringify(rehecho.units) === JSON.stringify(guardado.units);
  const puntos = rehecho.points === guardado.points;

  if (iguales && puntos) {
    console.log(`  ✓ ${etiqueta.padEnd(34)} al dia`);
  } else {
    desfasados += 1;
    console.log(`  ✗ ${etiqueta.padEnd(34) } DESFASADO${puntos ? "" : `  puntos ${guardado.points} → ${rehecho.points}`}`);
    for (const [i, u] of rehecho.units.entries()) {
      const antes = guardado.units?.[i];
      if (!antes || JSON.stringify(antes.loadout) === JSON.stringify(u.loadout)) continue;
      const texto = (l) => (Array.isArray(l) ? l.map((e) => (typeof e === "string" ? e : `${e.count}× ${e.name}`)).join(", ") : "?");
      console.log(`        ${u.name}`);
      console.log(`          guardado: ${texto(antes.loadout)}`);
      console.log(`          ahora   : ${texto(u.loadout)}`);
    }
  }
}

await rm(dir, { recursive: true, force: true });
console.log(`\n${ejercitos.length} ejercitos · ${desfasados} desfasados · ${sinEntradas} sin elecciones guardadas`);
