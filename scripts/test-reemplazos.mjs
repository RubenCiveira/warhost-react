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

// --- Un reemplazo encadenado no se puede elegir antes de tiempo.
// Los Pathfinders llevan Flamer Pistol y tienen "Replace Gravity Pistol": esa
// seccion solo sirve despues de comprar la Gravity Pistol en otra. Antes se
// caia sobre el CCW y quitaba lo que no tocaba.
{
  const bb = filas("army_books", [
    { method: "equal", attribute: "name", values: ["Battle Brothers"] },
    { method: "equal", attribute: "gameSystem", values: ["gf"] },
    { method: "limit", values: [1] },
  ])[0];
  const us = filas("army_units", [{ method: "equal", attribute: "bookKey", values: [bb.$id] }, { method: "limit", values: [100] }]);
  const pk = new Map(
    filas("army_upgrade_packages", [{ method: "equal", attribute: "bookKey", values: [bb.$id] }, { method: "limit", values: [200] }])
      .map((p) => [p.packageUid, B.parseSections(p.sections)]),
  );
  const pf = us.find((u) => u.name === "Elite Pathfinder");
  const secs = B.sectionsForUnit(pf, pk);
  const cadena = secs.find((x) => (x.label ?? "") === "Replace Gravity Pistol");
  const origen = secs.find((x) => (x.label ?? "") === "Replace Flamer Pistol");
  const daGravity = origen.options.find((o) => (o.label ?? "").startsWith("Gravity Pistol"));

  console.log(`\n${pf.name}: lleva ${L.baseLoadout(pf.weapons, pf.items).map((e) => e.name).join(", ")}`);
  const vacio = { key: "p", unit: pf, choices: {} };
  const motivo = B.blockReason(cadena, cadena.options[0], vacio, secs);
  comprobar(Boolean(motivo), "sin Gravity Pistol no deja elegir su reemplazo", motivo ?? "no lo bloquea");
  comprobar(
    (motivo ?? "").includes("Replace Flamer Pistol"),
    "y dice donde se consigue",
    motivo ?? "",
  );

  const conGravity = { key: "p", unit: pf, choices: { [B.optionId(daGravity)]: 1 } };
  comprobar(
    B.blockReason(cadena, cadena.options[0], conGravity, secs) === null,
    "comprada la Gravity Pistol, el reemplazo se abre",
  );
  const tras = B.entryLoadout({ ...conGravity, choices: { ...conGravity.choices, [B.optionId(cadena.options[0])]: 1 } }, secs);
  comprobar(
    tras.some((e) => e.name === "CCW"),
    "y no se lleva por delante el CCW, que era la vieja adivinanza",
  );
}

// --- "Upgrade all models with any": varias mejoras, todas comprables.
// El fallo era tomar `affects: all` como tope de la seccion entera, asi que la
// primera mejora bloqueaba las demas. `affects` dice a cuantos modelos alcanza;
// cuantas puedes elegir lo dice `select`.
{
  const libros = filas("army_books", [{ method: "limit", values: [30] }]);
  let miradas = 0;
  let malas = 0;
  let unaSola = 0;
  for (const libro of libros) {
    const us = filas("army_units", [{ method: "equal", attribute: "bookKey", values: [libro.$id] }, { method: "limit", values: [100] }]);
    const pk = new Map(
      filas("army_upgrade_packages", [{ method: "equal", attribute: "bookKey", values: [libro.$id] }, { method: "limit", values: [200] }])
        .map((p) => [p.packageUid, B.parseSections(p.sections)]),
    );
    for (const u of us) {
      for (const sec of B.sectionsForUnit(u, pk)) {
        if (sec.affects?.type !== "all") continue;
        const opciones = sec.options ?? [];

        if (sec.variant !== "replace" && opciones.length > 1 && sec.select?.type !== "exactly") {
          miradas += 1;
          // Cogida la primera, la segunda tiene que seguir disponible.
          const entry = { key: "x", unit: u, choices: { [B.optionId(opciones[0])]: 1 } };
          if (B.blockReason(sec, opciones[1], entry)) malas += 1;
          // Y la ya cogida no, que alcanzar a todos ya lo hizo a la primera.
          if (!B.blockReason(sec, opciones[0], entry)) unaSola += 1;
        }

        if (sec.variant === "replace" && opciones.length > 1) {
          const entry = { key: "x", unit: u, choices: { [B.optionId(opciones[0])]: 1 } };
          if (!B.blockReason(sec, opciones[1], entry)) malas += 1;
        }
      }
    }
  }
  console.log(`\n${miradas} secciones "alcanza a todos" con varias mejoras`);
  comprobar(malas === 0, "se pueden comprar todas, y un reemplazo 'all' sigue admitiendo una", `${malas} mal`);
  comprobar(unaSola === 0, "pero cada mejora solo una vez", `${unaSola} repetibles`);
}

// --- Ninguna seccion puede quedar bloqueada para siempre.
// Bloquear un reemplazo cuyo objetivo la unidad no lleva es lo correcto, pero
// solo si hay forma de conseguirlo. Una que no se abra con ninguna opcion es
// una seccion muerta: o el catalogo esta mal, o la estamos leyendo mal.
{
  const libros = filas("army_books", [{ method: "limit", values: [30] }]);
  let conObjetivo = 0;
  let deEntrada = 0;
  const muertas = [];
  for (const libro of libros) {
    const us = filas("army_units", [{ method: "equal", attribute: "bookKey", values: [libro.$id] }, { method: "limit", values: [100] }]);
    const pk = new Map(
      filas("army_upgrade_packages", [{ method: "equal", attribute: "bookKey", values: [libro.$id] }, { method: "limit", values: [200] }])
        .map((p) => [p.packageUid, B.parseSections(p.sections)]),
    );
    for (const u of us) {
      const secs = B.sectionsForUnit(u, pk);
      const vacio = { key: "x", unit: u, choices: {} };
      for (const sec of secs) {
        if ((sec.targets ?? []).length === 0) continue;
        conObjetivo += 1;
        if (B.objetivosQueFaltan(sec, vacio, secs).length === 0) {
          deEntrada += 1;
          continue;
        }
        const seAbre = secs.some((otra) =>
          otra !== sec &&
          (otra.options ?? []).some(
            (op) => B.objetivosQueFaltan(sec, { key: "x", unit: u, choices: { [B.optionId(op)]: 1 } }, secs).length === 0,
          ),
        );
        if (!seAbre) muertas.push(`${libro.name} · ${u.name} · ${JSON.stringify(sec.label)}`);
      }
    }
  }
  console.log(`\n${conObjetivo} secciones con objetivo · ${deEntrada} disponibles de entrada`);
  for (const m of muertas.slice(0, 6)) console.log(`    · ${m}`);
  comprobar(muertas.length === 0, "las bloqueadas se abren comprando otra opcion", `${muertas.length} sin salida`);
}

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
