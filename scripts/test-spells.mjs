/**
 * Comprueba que los hechizos de todos los libros se leen bien, con el modulo
 * que se despliega.
 *
 *   pnpm test:spells
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI_CWD = process.env.APPWRITE_DIR ?? "../warhost-appwrite";

const dir = await mkdtemp(join(tmpdir(), "warhost-"));
const outfile = join(dir, "spells.mjs");
await build({ entryPoints: ["src/lib/spells.ts"], outfile, format: "esm", bundle: true, platform: "node", logLevel: "error" });
const { parseSpells, byThreshold } = await import(outfile);

const books = rows("army_books");
let fallos = 0;
let total = 0;
let sinHechizos = 0;

for (const book of books) {
  const spells = parseSpells(book.spells);
  total += spells.length;
  if (spells.length === 0) { sinHechizos += 1; continue; }

  for (const spell of spells) {
    if (!spell.name || !spell.effect) { console.log(`✗ ${book.name}: hechizo incompleto`); fallos += 1; }
    if (!(spell.threshold >= 1 && spell.threshold <= 6)) {
      console.log(`✗ ${book.name}/${spell.name}: umbral ${spell.threshold} fuera de 1-6`); fallos += 1;
    }
  }
  const ordenado = spells.every((s, i) => i === 0 || spells[i - 1].threshold <= s.threshold);
  if (!ordenado) { console.log(`✗ ${book.name}: no salen ordenados por umbral`); fallos += 1; }
  const agrupados = byThreshold(spells).reduce((n, [, list]) => n + list.length, 0);
  if (agrupados !== spells.length) { console.log(`✗ ${book.name}: la agrupacion pierde hechizos`); fallos += 1; }
}

// Entradas rotas: no deben tumbar la pagina.
for (const basura of [null, "", "null", "[]", "{}", "no es json", '[{"name":"sin efecto"}]']) {
  if (parseSpells(basura).length !== 0) { console.log(`✗ parseSpells(${JSON.stringify(basura)}) deberia dar 0`); fallos += 1; }
}

console.log(`${books.length} libros · ${total} hechizos · ${sinHechizos} libros sin hechizos`);
await rm(dir, { recursive: true, force: true });
console.log(fallos === 0 ? "Todo correcto." : `${fallos} comprobaciones fallidas.`);
process.exit(fallos === 0 ? 0 : 1);

function rows(table) {
  const out = []; let cursor = null;
  for (;;) {
    const q = [{ method: "limit", values: [100] }];
    if (cursor) q.push({ method: "cursorAfter", values: [cursor] });
    const args = ["tables-db", "list-rows", "--database-id", "warhost", "--table-id", table, "--json", "--queries", ...q.map((x) => JSON.stringify(x))];
    const page = JSON.parse(execFileSync("appwrite", args, { encoding: "utf8", cwd: CLI_CWD, maxBuffer: 64 * 1024 * 1024 }));
    out.push(...page.rows);
    if (page.rows.length < 100) return out;
    cursor = page.rows[page.rows.length - 1].$id;
  }
}
