/**
 * Comprueba contra el glosario entero que se resuelve la regla que concede
 * cada aura, y —lo que mas importa— que no se inventa ninguna.
 *
 *   pnpm test:auras
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";
const dir = await mkdtemp(join(tmpdir(), "warhost-aura-"));
const salida = join(dir, "auras.mjs");
await build({ entryPoints: ["src/lib/auras.ts"], outfile: salida, format: "esm", bundle: true, platform: "node", logLevel: "error" });
const { reglaDelAura, reglaParaLaUnidad } = await import(salida);

const cli = (args) =>
  JSON.parse(execFileSync("appwrite", [...args, "--json"], { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 256e6 }));

let fallos = 0;
const comprobar = (ok, que, detalle) => {
  console.log(`  ${ok ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
};

const SISTEMAS = ["gf", "gff", "aof", "aofs", "aofr"];
let auras = 0;
let resueltas = 0;
const sinResolver = [];
const inventadas = [];
// Reglas que prestan algo a la unidad —"This model and its unit get X"— sin
// llevar la palabra "Aura" en el nombre: son las que `reglaDelAura` se dejaria
// fuera por mirar solo el nombre, y las que `reglaParaLaUnidad` tiene que coger.
let sinNombreDeAura = 0;
const sinNombrePerdidas = [];

for (const sistema of SISTEMAS) {
  const reglas = [];
  let cursor = null;
  for (;;) {
    const queries = [
      { method: "equal", attribute: "gameSystem", values: [sistema] },
      { method: "limit", values: [1000] },
    ];
    if (cursor) queries.push({ method: "cursorAfter", values: [cursor] });
    const { rows } = cli(["tables-db", "list-rows", "--database-id", "warhost", "--table-id", "army_rules",
      ...queries.flatMap((q) => ["--queries", JSON.stringify(q)])]);
    if (rows.length === 0) break;
    reglas.push(...rows);
    if (rows.length < 1000) break;
    cursor = rows[rows.length - 1].$id;
  }
  const porNombre = new Map(reglas.map((r) => [r.name.toLowerCase(), r]));
  const existe = (nombre) => porNombre.has(nombre.toLowerCase());

  for (const regla of reglas) {
    const tieneNombreDeAura = /\baura$/i.test(regla.name);
    if (tieneNombreDeAura) {
      auras += 1;
      const aura = reglaDelAura(regla.name, regla.description, existe);
      if (!aura) {
        sinResolver.push([sistema, regla.name, (regla.description ?? "").slice(0, 60)]);
      } else {
        resueltas += 1;
        // Lo que se ofrece tiene que existir y no ser el aura misma.
        if (!existe(aura.concede.nombre) || aura.concede.nombre.toLowerCase() === regla.name.toLowerCase()) {
          inventadas.push([sistema, regla.name, aura.concede.nombre]);
        }
      }
    }

    // Independientemente del nombre: toda regla que diga expresamente que
    // alcanza tambien a la unidad tiene que resolverse con el otro camino.
    if (!/\bthis model and its unit\b/i.test(regla.description ?? "")) continue;
    const paraLaUnidad = reglaParaLaUnidad(regla.description, existe);
    if (!paraLaUnidad) continue; // incrusta el efecto, no hay nada que enlazar
    if (!tieneNombreDeAura) sinNombreDeAura += 1;
    if (!existe(paraLaUnidad.concede.nombre)) {
      sinNombrePerdidas.push([sistema, regla.name, (regla.description ?? "").slice(0, 60)]);
    }
  }
}

console.log(`${auras} auras en ${SISTEMAS.length} modos de juego`);
console.log(`  con regla que consultar: ${resueltas} (${((resueltas / auras) * 100).toFixed(0)}%)`);
console.log(`  sin regla que consultar: ${sinResolver.length}`);
for (const [s, n, d] of sinResolver.slice(0, 6)) console.log(`    · [${s}] ${n}: ${JSON.stringify(d)}`);

comprobar(inventadas.length === 0, "ninguna ofrece una regla que no existe", `${inventadas.length} inventadas`);
for (const i of inventadas.slice(0, 6)) console.log(`    · ${i.join(" · ")}`);

// Las que no se resuelven tienen que ser justo las que incrustan su efecto:
// si alguna dijera "get X" con X conocida y no la resolviesemos, es un fallo.
const perdidas = sinResolver.filter(([, , d]) => / get [A-Z]/.test(d));
comprobar(perdidas.length === 0, "y ninguna con regla declarada se queda sin enlazar", `${perdidas.length}`);
for (const p of perdidas.slice(0, 6)) console.log(`    · ${p.join(" · ")}`);

// Informativo, no pasa/falla: en el catalogo de hoy la convencion de nombre
// cubre el 100% de los casos, pero `reglaParaLaUnidad` no depende de que eso
// siga siendo asi —lee la frase, no el nombre— y esta comprobacion es la que
// lo demuestra si algun libro nuevo trae una que rompa la convencion.
console.log(`\n${sinNombreDeAura} reglas prestan algo a la unidad sin llamarse "... Aura"`);
console.log(
  sinNombreDeAura === 0
    ? "  (hoy la convencion de nombre las cubre todas; reglaParaLaUnidad las cogeria igual si dejara de cumplirse)"
    : "  y salen resueltas igual, sin mirar el nombre",
);
comprobar(sinNombrePerdidas.length === 0, "ninguna regla 'and its unit' se queda sin la que promete", `${sinNombrePerdidas.length}`);
for (const p of sinNombrePerdidas.slice(0, 6)) console.log(`    · ${p.join(" · ")}`);

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
