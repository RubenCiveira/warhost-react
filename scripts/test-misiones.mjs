/**
 * Comprueba que las cartas de mision estan completas y consultables como las
 * lee la aplicacion: 36 por modo, los codigos 11-66 sin huecos, y ninguna sin
 * nombre. No comprueba el texto: sale de un OCR y se repasa a mano.
 *
 *   pnpm test:misiones
 */
import { execFileSync } from "node:child_process";

const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";
const cli = (args) =>
  JSON.parse(execFileSync("appwrite", [...args, "--json"], { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 256e6 }));

let fallos = 0;
const comprobar = (ok, que, detalle) => {
  console.log(`  ${ok ? "✓" : "✗"} ${que}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos += 1;
};

const filas = [];
let cursor = null;
for (;;) {
  const queries = [{ method: "limit", values: [1000] }];
  if (cursor) queries.push({ method: "cursorAfter", values: [cursor] });
  const { rows } = cli(["tables-db", "list-rows", "--database-id", "warhost", "--table-id", "missions",
    ...queries.flatMap((q) => ["--queries", JSON.stringify(q)])]);
  if (rows.length === 0) break;
  filas.push(...rows);
  if (rows.length < 1000) break;
  cursor = rows[rows.length - 1].$id;
}

const SISTEMAS = ["gf", "gff", "aof", "aofs", "aofr"];
const ESPERADOS = new Set(
  Array.from({ length: 6 }, (_, d) => Array.from({ length: 6 }, (_, u) => 11 + d * 10 + u)).flat(),
);

console.log(`${filas.length} cartas en la tabla`);
for (const sistema of SISTEMAS) {
  const suyas = filas.filter((f) => f.gameSystem === sistema);
  const codigos = new Set(suyas.map((f) => f.code));
  const faltan = [...ESPERADOS].filter((c) => !codigos.has(c));
  const sinPuntos = suyas.filter((f) => f.vp === null || f.vp === undefined).length;
  const repasadas = suyas.filter((f) => f.verified).length;
  comprobar(suyas.length === 36, `${sistema}: 36 cartas`, `${suyas.length}`);
  comprobar(faltan.length === 0, `${sistema}: el mazo 11-66 esta completo`, `faltan ${faltan.join(", ")}`);
  comprobar(suyas.every((f) => (f.name ?? "").trim()), `${sistema}: todas tienen nombre`);
  console.log(`      ${repasadas}/36 repasadas · ${sinPuntos} sin puntos leidos`);
}

// Lo que entra por OCR tiene que decir de donde sale, o no hay como repasarlo.
comprobar(
  filas.every((f) => f.sourceUrl && f.sourceVersion),
  "todas dicen de que PDF y version salen",
);

console.log(fallos === 0 ? "\nTodo correcto." : `\n${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);
