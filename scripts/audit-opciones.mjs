/**
 * Busca inconsistencias en las reglas de configuracion del catalogo y escribe
 * un informe en markdown, en ingles, para poder reportarlas aguas arriba.
 *
 * El grueso son objetivos de reemplazo que no casan con lo que la unidad lleva.
 * Ojo con los falsos positivos: una seccion puede reemplazar algo que otra
 * seccion te dio antes —"Replace Energy Sword" despues de comprar la Energy
 * Sword—, y eso es correcto. Solo se reporta lo que no aparece ni en el
 * equipo de serie ni entre lo que dan las demas opciones de la unidad.
 *
 * Guarda los hallazgos crudos; el informe se escribe aparte, para no tener que
 * recorrer el catalogo cada vez que se cambia una frase.
 *
 *   pnpm audit:opciones [nLibros]
 *   node scripts/informe-opciones.mjs > ../warhost-appwrite/ARMY-FORGE-DATA-ISSUES.md
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const N_LIBROS = Number(process.argv[2] ?? 60);
const CACHE = process.env.HALLAZGOS ?? "/tmp/warhost-hallazgos.json";
const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";
const cli = (args) =>
  JSON.parse(execFileSync("appwrite", [...args, "--json"], { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 256e6 }));
const filas = (tabla, queries) =>
  cli(["tables-db", "list-rows", "--database-id", "warhost", "--table-id", tabla,
       ...queries.flatMap((q) => ["--queries", JSON.stringify(q)])]).rows;

const dir = await mkdtemp(join(tmpdir(), "warhost-audit-op-"));
const salida = join(dir, "lib.mjs");
await build({
  stdin: {
    contents: `export { parseSections, sectionsForUnit } from "./src/lib/builder";
               export { baseLoadout } from "./src/lib/loadout";`,
    resolveDir: process.cwd(), loader: "ts",
  },
  outfile: salida, format: "esm", bundle: true, platform: "node", logLevel: "error",
});
const { parseSections, sectionsForUnit, baseLoadout } = await import(salida);

const libros = filas("army_books", [{ method: "limit", values: [N_LIBROS] }]);

const norm = (s) => String(s ?? "").trim().toLowerCase();
/**
 * Formas en singular de un plural ingles: "Claws"->"Claw", "Bashes"->"Bash".
 * Sin la segunda, "Replace all Bashes" no encuentra el "Bash" que lleva la
 * unidad y el reemplazo no quita nada.
 */
const singulares = (s) => {
  const n = norm(s);
  const formas = [n];
  if (n.endsWith("es")) formas.push(n.slice(0, -2));
  if (n.endsWith("s")) formas.push(n.slice(0, -1));
  return formas;
};
const singular = (s) => singulares(s)[singulares(s).length - 1];
/** "3x Heavy Razor Claws" -> "heavy razor claws". */
const CANTIDAD = /^\s*(\d+)\s*x\s+/i;
const sinCantidad = (s) => norm(String(s ?? "").replace(CANTIDAD, ""));

/** Todo lo que una opcion entrega, por nombre: armas, equipo y lo que contienen. */
function nombresQueDa(option) {
  const fuera = [];
  for (const gain of option.gains ?? []) {
    if (gain.name) fuera.push(gain.name);
    if (gain.label) fuera.push(gain.label);
    for (const dentro of gain.content ?? []) if (dentro?.name) fuera.push(dentro.name);
  }
  return fuera;
}

const hallazgos = [];
const alcance = { libros: 0, unidades: 0, opciones: 0 };
const apunta = (libro, unidad, tipo, detalle) =>
  hallazgos.push({ libro: libro.name, sistema: libro.gameSystem, unidad: unidad.name, unitId: unidad.unitId, tipo, ...detalle });

for (const libro of libros) {
  const unidades = filas("army_units", [
    { method: "equal", attribute: "bookKey", values: [libro.$id] },
    { method: "limit", values: [100] },
  ]);
  const paquetes = new Map(
    filas("army_upgrade_packages", [
      { method: "equal", attribute: "bookKey", values: [libro.$id] },
      { method: "limit", values: [200] },
    ]).map((p) => [p.packageUid, parseSections(p.sections)]),
  );

  alcance.libros += 1;
  for (const unidad of unidades) {
    alcance.unidades += 1;
    for (const uid of unidad.upgradePackageUids ?? []) {
      if (!paquetes.has(uid)) apunta(libro, unidad, "package-missing", { paquete: uid });
    }

    const secciones = sectionsForUnit(unidad, paquetes);
    const equipo = baseLoadout(unidad.weapons, unidad.items);
    const tieneDeSerie = new Set(equipo.flatMap((e) => [norm(e.name), norm(e.label)]));
    // Lo que la unidad puede llegar a tener comprando cualquier otra opcion.
    const puedeTener = new Set(
      secciones.flatMap((s) => (s.options ?? []).flatMap(nombresQueDa)).flatMap((n) => [norm(n), singular(n)]),
    );

    const vistos = new Set();
    for (const seccion of secciones) {
      const opciones = seccion.options ?? [];
      alcance.opciones += opciones.length;
      const limite = seccion.select?.type === "up to" ? seccion.select?.value : null;
      if (typeof limite === "number" && opciones.length > 0 && limite > opciones.length) {
        apunta(libro, unidad, "select-exceeds-options", { seccion: seccion.label, limite, opciones: opciones.length });
      }

      for (const opcion of opciones) {
        const id = opcion.id ?? opcion.uid;
        if (id && vistos.has(id)) apunta(libro, unidad, "duplicate-option-id", { seccion: seccion.label, opcion: opcion.label, id });
        if (id) vistos.add(id);

        if ((opcion.gains ?? []).length === 0) {
          apunta(libro, unidad, "option-without-gains", { seccion: seccion.label, opcion: opcion.label });
        }
        const costes = opcion.costs ?? [];
        if (costes.length > 0 && !costes.some((c) => c.unitId === unidad.unitId)) {
          apunta(libro, unidad, "cost-missing-for-unit", { seccion: seccion.label, opcion: opcion.label });
        }
      }

      if (seccion.variant !== "replace") continue;
      for (const objetivo of seccion.targets ?? []) {
        const exacto = tieneDeSerie.has(norm(objetivo));
        if (exacto) continue;
        const comoSingular = singulares(objetivo).find((f) => tieneDeSerie.has(f));
        if (comoSingular) {
          apunta(libro, unidad, "replace-target-plural", {
            seccion: seccion.label, objetivo,
            lleva: equipo.find((e) => norm(e.name) === comoSingular || norm(e.label) === comoSingular)?.name,
          });
          continue;
        }
        // El caso espejo: el objetivo va en singular y la unidad lleva el plural.
        const enPlural = equipo.find((e) => singulares(e.name).includes(norm(objetivo)) || singulares(e.label).includes(norm(objetivo)));
        if (enPlural) {
          apunta(libro, unidad, "replace-target-singular", {
            seccion: seccion.label, objetivo, lleva: enPlural.name,
          });
          continue;
        }

        // Encadenado con otra opcion: legitimo, no se reporta.
        if (puedeTener.has(norm(objetivo)) || puedeTener.has(singular(objetivo))) continue;

        // "Replace 3x Heavy Razor Claws": el objetivo lleva la cantidad dentro.
        if (CANTIDAD.test(objetivo)) {
          const pelado = sinCantidad(objetivo);
          const casa = equipo.find(
            (e) => norm(e.name) === pelado || singular(e.name) === singular(pelado) || norm(e.label) === pelado,
          );
          if (casa) {
            apunta(libro, unidad, "replace-target-quantity-prefix", {
              seccion: seccion.label, objetivo, lleva: casa.name, cuantas: casa.count,
            });
            continue;
          }
        }
        apunta(libro, unidad, "replace-target-unknown", {
          seccion: seccion.label, objetivo,
          lleva: equipo.map((e) => e.name).join(", "),
        });
      }
    }
  }
}

await rm(dir, { recursive: true, force: true });

const porTipo = {};
for (const h of hallazgos) (porTipo[h.tipo] ??= []).push(h);
console.error(`${libros.length} libros · ${hallazgos.length} hallazgos`);
for (const [t, l] of Object.entries(porTipo).sort((a, b) => b[1].length - a[1].length)) {
  console.error(`  ${t.padEnd(24)} ${l.length}`);
}
// Se guardan crudos: recorrer el catalogo tarda unos diez minutos y el texto
// del informe se reescribe muchas mas veces que los datos.
const { writeFileSync } = await import("node:fs");
writeFileSync(CACHE, JSON.stringify({ alcance, hallazgos }, null, 1));
console.error(`\nhallazgos guardados en ${CACHE}`);
console.error("informe:  node scripts/informe-opciones.mjs > ARMY-FORGE-DATA-ISSUES.md");
