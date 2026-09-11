/**
 * Los limites de composicion, contra los cuatro numeros de referencia que
 * ensena Army Forge para 1000 puntos: Heroes 0/2, Units 1/5, Models/Tough
 * 10/50, Max 2 unit copies. Si Army Forge cambia estas cifras para otro total
 * de puntos, es esta prueba la que hay que corregir primero.
 *
 *   pnpm test:composicion
 */
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = await mkdtemp(join(tmpdir(), "warhost-comp-"));
const salida = join(dir, "composicion.mjs");
await build({ entryPoints: ["src/lib/composicion.ts"], outfile: salida, format: "esm", bundle: true, platform: "node", logLevel: "error" });
const { limitesComposicion, verificacionesComposicion } = await import(salida);
// Las pruebas de aqui abajo se escribieron contra la forma vieja, de "solo lo
// que falla": se mantiene como envoltorio fino sobre la nueva, que ademas
// dice lo que se ha cumplido.
const incumplimientosComposicion = (puntos, unidades) =>
  verificacionesComposicion(puntos, unidades).filter((verificacion) => !verificacion.ok);

let fallos = 0;
const comprobar = (ok, que, detalle) => {
  console.log(`  ${ok ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
};

const mil = limitesComposicion(1000);
console.log(`1000 puntos: ${JSON.stringify(mil)}`);
comprobar(mil.maxHeroes === 2, "Heroes 0/2");
comprobar(mil.maxUnidades === 5, "Units 1/5");
comprobar(mil.maxModelos === 50, "Models/Tough 10/50");
comprobar(mil.maxCopiasPorUnidad === 2, "Max 2 unit copies");

const dosMil = limitesComposicion(2000);
console.log(`2000 puntos: ${JSON.stringify(dosMil)}`);
comprobar(dosMil.maxHeroes === 4, "el doble de puntos, el doble de heroes");
comprobar(dosMil.maxUnidades === 10, "y el doble de unidades");
comprobar(dosMil.maxCopiasPorUnidad === 3, "una copia mas al completar otros 1000");

comprobar(JSON.stringify(limitesComposicion(0)) === JSON.stringify({ maxHeroes: 0, maxUnidades: 0, maxModelos: 0, maxCopiasPorUnidad: 1 }), "sin puntos, todo a cero salvo la copia base");

// Los tramos redondean hacia arriba: con menos de 500 puntos ya se admite 1
// heroe, no cero.
const chico = limitesComposicion(150);
comprobar(chico.maxHeroes === 1 && chico.maxUnidades === 1, "una partida pequena admite al menos 1 heroe y 1 unidad", JSON.stringify(chico));

// --- El aviso, que no bloquea, solo dice en que se pasa. A 1000 pts.
const unidad = (name, over = {}) => ({ name, rules: [], maxWounds: 1, ...over });

const cumple = [
  unidad("Master Brother", { rules: ["Hero"] }),
  unidad("Master Brother", { rules: ["Hero"] }),
  unidad("Battle Brothers", { maxWounds: 5 }),
];
comprobar(incumplimientosComposicion(1000, cumple).length === 0, "un ejercito dentro de todos los limites no avisa de nada");

const tresHeroes = [
  unidad("A", { rules: ["Hero"] }),
  unidad("B", { rules: ["Hero"] }),
  unidad("C", { rules: ["Hero"] }),
];
const avisoHeroes = incumplimientosComposicion(1000, tresHeroes);
comprobar(
  avisoHeroes.length === 1 && avisoHeroes[0].clave === "heroes",
  "3 heroes a 1000 pts (limite 2) avisa solo de heroes",
  JSON.stringify(avisoHeroes),
);

const seisUnidades = Array.from({ length: 6 }, (_, i) => unidad(`Unidad ${i}`));
comprobar(
  incumplimientosComposicion(1000, seisUnidades).some((a) => a.clave === "unidades"),
  "6 unidades a 1000 pts (limite 5) avisa de unidades",
);

// --- El caso reportado: un heroe unido a una unidad no cuenta ademas como
// unidad. A 500 pts el limite es 1 heroe y 3 unidades.
const heroeUnido = [
  unidad("Master Brother", { rules: ["Hero"] }),
  unidad("Battle Brothers"),
  unidad("Pathfinders"),
];
comprobar(
  incumplimientosComposicion(500, heroeUnido).length === 0,
  "1 heroe + 2 unidades a 500 pts no avisa: el heroe no gasta cupo de unidad",
  JSON.stringify(incumplimientosComposicion(500, heroeUnido)),
);
const conTresUnidades = [...heroeUnido, unidad("Destroyers")];
comprobar(
  incumplimientosComposicion(500, conTresUnidades).length === 0,
  "1 heroe + 3 unidades (el maximo) a 500 pts tampoco avisa",
  JSON.stringify(incumplimientosComposicion(500, conTresUnidades)),
);
const conCuatroUnidades = [...conTresUnidades, unidad("Support Brothers")];
const avisoCuartaUnidad = incumplimientosComposicion(500, conCuatroUnidades);
comprobar(
  avisoCuartaUnidad.length === 1 && avisoCuartaUnidad[0].clave === "unidades",
  "pero una cuarta unidad (sin contar el heroe) si avisa",
  JSON.stringify(avisoCuartaUnidad),
);

const muchosModelos = [unidad("Horda", { maxWounds: 60 })];
comprobar(
  incumplimientosComposicion(1000, muchosModelos).some((a) => a.clave === "modelos"),
  "60 modelos/Tough a 1000 pts (limite 50) avisa de modelos",
);

const tresCopias = [unidad("Pathfinders"), unidad("Pathfinders"), unidad("Pathfinders")];
const avisoCopias = incumplimientosComposicion(1000, tresCopias);
comprobar(
  avisoCopias.some((a) => a.clave === "copias" && a.mensaje.includes("Pathfinders")),
  "3 copias de la misma unidad a 1000 pts (limite 2) avisa de copias, con el nombre",
  JSON.stringify(avisoCopias),
);

// --- El icono verde: cuando cumple todo, se ven las cuatro reglas, no una
// lista vacia.
const todasLasVerificaciones = verificacionesComposicion(1000, cumple);
comprobar(todasLasVerificaciones.length === 4, "un ejercito conforme sigue dando las cuatro reglas", `${todasLasVerificaciones.length}`);
comprobar(
  todasLasVerificaciones.every((v) => v.ok),
  "y las cuatro pasan",
);
comprobar(
  new Set(todasLasVerificaciones.map((v) => v.clave)).size === 4,
  "heroes, unidades, modelos y copias, cada una una vez",
);

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
