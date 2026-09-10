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
const { reglaDelAura } = await import(salida);

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
    if (!/\baura$/i.test(regla.name)) continue;
    auras += 1;
    const aura = reglaDelAura(regla.name, regla.description, existe);
    if (!aura) {
      sinResolver.push([sistema, regla.name, (regla.description ?? "").slice(0, 60)]);
      continue;
    }
    resueltas += 1;
    // Lo que se ofrece tiene que existir y no ser el aura misma.
    if (!existe(aura.concede.nombre) || aura.concede.nombre.toLowerCase() === regla.name.toLowerCase()) {
      inventadas.push([sistema, regla.name, aura.concede.nombre]);
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

await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
