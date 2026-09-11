/**
 * Los limites de composicion, contra el "Force Organisation" opcional que da
 * el reglamento para cada sistema de juego (no son iguales entre GF, GFF, AoF
 * y AoFS):
 *
 *   GF:   1 heroe/500pts, 1 unidad/200pts, sin limite de modelos, +1 copia/1000pts
 *   GFF:  1 heroe/150pts, 1 unidad/30pts,  1 modelo/20pts,        +1 copia/150pts
 *   AoF:  1 heroe/375pts, 1 unidad/150pts, sin limite de modelos, +1 copia/750pts
 *   AoFS: 1 heroe/125pts, 1 unidad/25pts,  1 modelo/15pts,        +1 copia/125pts
 *
 * Si el reglamento cambia estas cifras, es esta prueba la que hay que
 * corregir primero.
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
const incumplimientosComposicion = (puntos, unidades, gameSystem) =>
  verificacionesComposicion(puntos, unidades, gameSystem).filter((verificacion) => !verificacion.ok);

let fallos = 0;
const comprobar = (ok, que, detalle) => {
  console.log(`  ${ok ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
};

// --- Grimdark Future estandar: 500/hero, 200/unidad, sin limite de modelos, 1000/copia.
const mil = limitesComposicion(1000, "gf");
console.log(`GF, 1000 puntos: ${JSON.stringify(mil)}`);
comprobar(mil.maxHeroes === 2, "Heroes 0/2");
comprobar(mil.maxUnidades === 5, "Units 1/5");
comprobar(mil.maxModelos === null, "sin limite de modelos en GF estandar: el reglamento no lo menciona");
comprobar(mil.maxCopiasPorUnidad === 2, "Max 2 unit copies");

const dosMil = limitesComposicion(2000, "gf");
console.log(`GF, 2000 puntos: ${JSON.stringify(dosMil)}`);
comprobar(dosMil.maxHeroes === 4, "el doble de puntos, el doble de heroes");
comprobar(dosMil.maxUnidades === 10, "y el doble de unidades");
comprobar(dosMil.maxCopiasPorUnidad === 3, "una copia mas al completar otros 1000");

comprobar(
  JSON.stringify(limitesComposicion(0, "gf")) === JSON.stringify({ maxHeroes: 0, maxUnidades: 0, maxModelos: 0, maxCopiasPorUnidad: 1 }),
  "sin puntos, todo a cero salvo la copia base",
);

// Los tramos redondean hacia arriba: con menos de 500 puntos ya se admite 1
// heroe, no cero.
const chico = limitesComposicion(150, "gf");
comprobar(chico.maxHeroes === 1 && chico.maxUnidades === 1, "una partida pequena admite al menos 1 heroe y 1 unidad", JSON.stringify(chico));

// --- Grimdark Future: Firefight (escaramuza): 150/hero, 30/unidad, 20/modelo, 150/copia.
const gff300 = limitesComposicion(300, "gff");
console.log(`GFF, 300 puntos: ${JSON.stringify(gff300)}`);
comprobar(gff300.maxHeroes === 2, "GFF a 300 pts: 2 heroes");
comprobar(gff300.maxUnidades === 10, "GFF a 300 pts: 10 unidades");
comprobar(gff300.maxModelos === 15, "GFF a 300 pts: 15 modelos");
comprobar(gff300.maxCopiasPorUnidad === 3, "GFF a 300 pts: 3 copias");

// --- Age of Fantasy: Skirmish (escaramuza): 125/hero, 25/unidad, 15/modelo, 125/copia.
const aofs250 = limitesComposicion(250, "aofs");
console.log(`AoFS, 250 puntos: ${JSON.stringify(aofs250)}`);
comprobar(aofs250.maxHeroes === 2, "AoFS a 250 pts: 2 heroes");
comprobar(aofs250.maxUnidades === 10, "AoFS a 250 pts: 10 unidades");
comprobar(aofs250.maxModelos === 16, "AoFS a 250 pts: 16 modelos");
comprobar(aofs250.maxCopiasPorUnidad === 3, "AoFS a 250 pts: 3 copias");

// --- Age of Fantasy estandar: 375/hero, 150/unidad, sin limite de modelos, 750/copia.
const aof1500 = limitesComposicion(1500, "aof");
console.log(`AoF, 1500 puntos: ${JSON.stringify(aof1500)}`);
comprobar(aof1500.maxHeroes === 4, "AoF a 1500 pts: 4 heroes");
comprobar(aof1500.maxUnidades === 10, "AoF a 1500 pts: 10 unidades");
comprobar(aof1500.maxModelos === null, "sin limite de modelos en AoF estandar");
comprobar(aof1500.maxCopiasPorUnidad === 3, "AoF a 1500 pts: 3 copias");

// --- El aviso, que no bloquea, solo dice en que se pasa. GF a 1000 pts.
const unidad = (name, over = {}) => ({ name, rules: [], maxWounds: 1, ...over });

const cumple = [
  unidad("Master Brother", { rules: ["Hero"] }),
  unidad("Master Brother", { rules: ["Hero"] }),
  unidad("Battle Brothers", { maxWounds: 5 }),
];
comprobar(incumplimientosComposicion(1000, cumple, "gf").length === 0, "un ejercito dentro de todos los limites no avisa de nada");

const tresHeroes = [
  unidad("A", { rules: ["Hero"] }),
  unidad("B", { rules: ["Hero"] }),
  unidad("C", { rules: ["Hero"] }),
];
const avisoHeroes = incumplimientosComposicion(1000, tresHeroes, "gf");
comprobar(
  avisoHeroes.length === 1 && avisoHeroes[0].clave === "heroes",
  "3 heroes a 1000 pts (limite 2) avisa solo de heroes",
  JSON.stringify(avisoHeroes),
);

const seisUnidades = Array.from({ length: 6 }, (_, i) => unidad(`Unidad ${i}`));
comprobar(
  incumplimientosComposicion(1000, seisUnidades, "gf").some((a) => a.clave === "unidades"),
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
  incumplimientosComposicion(500, heroeUnido, "gf").length === 0,
  "1 heroe + 2 unidades a 500 pts no avisa: el heroe no gasta cupo de unidad",
  JSON.stringify(incumplimientosComposicion(500, heroeUnido, "gf")),
);
const conTresUnidades = [...heroeUnido, unidad("Destroyers")];
comprobar(
  incumplimientosComposicion(500, conTresUnidades, "gf").length === 0,
  "1 heroe + 3 unidades (el maximo) a 500 pts tampoco avisa",
  JSON.stringify(incumplimientosComposicion(500, conTresUnidades, "gf")),
);
const conCuatroUnidades = [...conTresUnidades, unidad("Support Brothers")];
const avisoCuartaUnidad = incumplimientosComposicion(500, conCuatroUnidades, "gf");
comprobar(
  avisoCuartaUnidad.length === 1 && avisoCuartaUnidad[0].clave === "unidades",
  "pero una cuarta unidad (sin contar el heroe) si avisa",
  JSON.stringify(avisoCuartaUnidad),
);

// --- El limite de modelos solo existe en escaramuza (GFF/AoFS): en GF
// estandar, por muchos modelos que lleve, esa regla no se comprueba.
const muchosModelos = [unidad("Horda", { maxWounds: 60 })];
comprobar(
  !incumplimientosComposicion(1000, muchosModelos, "gf").some((a) => a.clave === "modelos"),
  "60 modelos/Tough a 1000 pts en GF no avisa de modelos: ese sistema no los limita",
);
comprobar(
  incumplimientosComposicion(300, muchosModelos, "gff").some((a) => a.clave === "modelos"),
  "esos mismos 60 modelos/Tough a 300 pts en GFF (limite 15) si avisan",
);

const tresCopias = [unidad("Pathfinders"), unidad("Pathfinders"), unidad("Pathfinders")];
const avisoCopias = incumplimientosComposicion(1000, tresCopias, "gf");
comprobar(
  avisoCopias.some((a) => a.clave === "copias" && a.mensaje.includes("Pathfinders")),
  "3 copias de la misma unidad a 1000 pts (limite 2) avisa de copias, con el nombre",
  JSON.stringify(avisoCopias),
);

// --- El icono verde: cuando cumple todo, se ven todas las reglas del
// sistema, no una lista vacia. En GF son tres (sin modelos); en GFF, cuatro.
const todasLasVerificacionesGf = verificacionesComposicion(1000, cumple, "gf");
comprobar(todasLasVerificacionesGf.length === 3, "un ejercito GF conforme da sus tres reglas (sin modelos)", `${todasLasVerificacionesGf.length}`);
comprobar(
  todasLasVerificacionesGf.every((v) => v.ok),
  "y las tres pasan",
);
comprobar(
  new Set(todasLasVerificacionesGf.map((v) => v.clave)).size === 3,
  "heroes, unidades y copias, cada una una vez",
);

const todasLasVerificacionesGff = verificacionesComposicion(300, cumple, "gff");
comprobar(
  todasLasVerificacionesGff.length === 4 && new Set(todasLasVerificacionesGff.map((v) => v.clave)).has("modelos"),
  "un ejercito GFF conforme da sus cuatro reglas, con modelos incluido",
  `${todasLasVerificacionesGff.length}`,
);

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
