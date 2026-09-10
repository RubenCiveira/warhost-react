/**
 * Escribe el informe en markdown, en ingles, para poder reportarlo aguas
 * arriba, a partir de los hallazgos que dejo `audit-opciones.mjs`.
 *
 *   node scripts/informe-opciones.mjs > ../warhost-appwrite/ARMY-FORGE-DATA-ISSUES.md
 */
import { readFileSync } from "node:fs";

const CACHE = process.env.HALLAZGOS ?? "/tmp/warhost-hallazgos.json";
const { hallazgos, alcance } = JSON.parse(readFileSync(CACHE, "utf8"));

/**
 * Cuantas unidades usan las dos grafias a la vez. Se calcula en vez de
 * afirmarse: es el dato que sostiene que ninguna de las dos es la buena, y
 * mandarlo mal aguas arriba seria peor que no mandarlo.
 */
function mezcla() {
  const clave = (x) => `${x.libro}|${x.sistema}|${x.unidad}`;
  const conPlural = new Set(hallazgos.filter((x) => x.tipo === "replace-target-plural").map(clave));
  const conSingular = new Set(hallazgos.filter((x) => x.tipo === "replace-target-singular").map(clave));
  const ambas = [...conPlural].filter((k) => conSingular.has(k));
  if (ambas.length === 0) return "The two spellings do not appear together, so one of them may simply be the canonical form.";
  const [libro, sistema, unidad] = ambas[0].split("|");
  return (
    `Both spellings are in use, and ${ambas.length} unit${ambas.length === 1 ? " uses" : "s use"} both at once ` +
    `(for instance ${unidad}, in ${libro}), so neither can be treated as the canonical name.`
  );
}

const CATEGORIAS = {
  "replace-target-plural": {
    titulo: "Replacement target is pluralised, the equipment is not",
    que: 'A `replace` section declares a target such as `"Bio-Spiners"`, but the unit carries an item named `"Bio-Spiner"`.',
    porque:
      "The target string is written to read naturally inside the section label (*Replace all Bio-Spiners*) rather than to name the item it removes. " +
      "A tool that matches targets against the unit's equipment by name finds nothing, so the replacement removes nothing while still granting what it adds. " +
      "The unit ends up with both the old and the new weapon, and its points cost no longer matches its profile.",
  },
  "replace-target-singular": {
    titulo: "Replacement target is singular, the equipment is pluralised",
    que: 'A `replace` section declares a target such as `"Heavy Razor Claw"`, but the unit carries an item named `"Heavy Razor Claws"`.',
    porque:
      "Same mismatch as above, in the opposite direction: here it is the equipment entry that is pluralised while the target is not. " +
      mezcla(),
  },
  "replace-target-quantity-prefix": {
    titulo: "Replacement target carries a quantity inside the name",
    que: 'A `replace` section declares a target such as `"3x Heavy Razor Claws"`, where `3x` is a quantity and not part of any item name.',
    porque:
      "The quantity belongs in the section's `affects` quantifier, which already exists and is used elsewhere for exactly this. " +
      "Encoding it in the target string means the target no longer names anything the unit carries, and it also makes the quantity unreadable to anything that does not parse the prefix. " +
      "Two different mechanisms end up expressing the same fact, and only one of them is machine-readable.",
  },
  "select-exceeds-options": {
    titulo: "Section allows more picks than it offers options",
    que: "A section declares `select: up to N` while offering fewer than N options.",
    porque:
      "The limit can never be reached. Either the limit is wrong, or options are missing from the section.",
  },
  "replace-target-unknown": {
    titulo: "Replacement target matches nothing",
    que: "A `replace` section declares a target that matches no item the unit carries, and no item any other option in the unit can grant.",
    porque:
      "The replacement can never remove anything, whatever the player picks.",
  },
};

/**
 * Los desajustes de plural son el 93% de los hallazgos y son todos la misma
 * frase repetida, asi que sepultarian lo demas. Van al final, en su propia
 * seccion; delante queda lo que hay que mirar uno por uno.
 */
const PLURALES = ["replace-target-plural", "replace-target-singular"];
const ORDEN = ["replace-target-quantity-prefix", "select-exceeds-options", "replace-target-unknown", ...PLURALES];
const esPlural = (t) => PLURALES.includes(t);
const SISTEMAS = { gf: "Grimdark Future", gff: "Grimdark Future: Firefight", aof: "Age of Fantasy", aofs: "Age of Fantasy: Skirmish", aofr: "Age of Fantasy: Regiments" };

const porTipo = {};
for (const h of hallazgos) (porTipo[h.tipo] ??= []).push(h);
const usados = ORDEN.filter((t) => porTipo[t]?.length);
const unidadesAfectadas = new Set(hallazgos.map((h) => `${h.libro}|${h.sistema}|${h.unidad}`));
const librosAfectados = new Set(hallazgos.map((h) => `${h.libro}|${h.sistema}`));

const P = (s) => console.log(s);

P("# Army book data inconsistencies");
P("");
P("Findings from an automated pass over the army book data served by the Army Forge API");
P("(`/api/army-books/<uid>?gameSystem=<id>`), looking only at unit upgrade sections.");
P("");
P("Everything below is a mismatch **inside a single unit's own data**: a section says it");
P("replaces something the same unit does not carry under that name. None of it depends on");
P("how a particular tool is written, and none of it is a matter of interpretation.");
P("");
P("| | |");
P("|---|---|");
P(`| Army books scanned | ${alcance.libros ?? "?"} |`);
P(`| Units scanned | ${alcance.unidades ?? "?"} |`);
P(`| Upgrade options scanned | ${alcance.opciones ?? "?"} |`);
P(`| Findings | ${hallazgos.length} |`);
P(`| Units affected | ${unidadesAfectadas.size} |`);
P(`| Army books affected | ${librosAfectados.size} |`);
P("");
P("## Summary");
P("");
P("| Category | Findings | Units |");
P("|---|--:|--:|");
for (const t of usados.filter((x) => !esPlural(x))) {
  const u = new Set(porTipo[t].map((h) => `${h.libro}|${h.sistema}|${h.unidad}`)).size;
  P(`| ${CATEGORIAS[t].titulo} | ${porTipo[t].length} | ${u} |`);
}
for (const t of usados.filter(esPlural)) {
  const u = new Set(porTipo[t].map((h) => `${h.libro}|${h.sistema}|${h.unidad}`)).size;
  P(`| ${CATEGORIAS[t].titulo} | ${porTipo[t].length} | ${u} |`);
}
P("");

P("## Why each of these is an inconsistency");
P("");
for (const t of usados) {
  const c = CATEGORIAS[t];
  const ej = porTipo[t][0];
  P(`### ${c.titulo}`);
  P("");
  P(`**What the data says.** ${c.que}`);
  P("");
  P(`**Why it is inconsistent.** ${c.porque}`);
  P("");
  P("**Example.**");
  P("");
  P("```");
  P(`${ej.libro} (${SISTEMAS[ej.sistema] ?? ej.sistema}) — ${ej.unidad}`);
  P(`  section : ${ej.seccion}`);
  if (ej.objetivo) P(`  target  : "${ej.objetivo}"`);
  if (ej.lleva) P(`  carries : ${ej.lleva}`);
  if (ej.limite !== undefined) P(`  limit   : up to ${ej.limite}, options available: ${ej.opciones}`);
  P("```");
  P("");
}

P("## What a consumer of the API has to do today");
P("");
P("None of this stops a tool from working, but it forces guessing. To make a replacement");
P("remove what its label says it removes, the target has to be matched against the unit's");
P("equipment under **all** of these forms:");
P("");
P("- the target as written;");
P("- the target with a leading quantity (`3x `) stripped;");
P("- the target with a trailing `s` or `es` removed;");
P("- the target with a trailing `s` or `es` added;");
P("- all of the above case-insensitively, including the suffix: the catalogue writes");
P("  `\"CCWS\"` for a weapon named `CCW`, so lowercasing has to happen before the plural");
P("  is stripped, not after.");
P("");
P("That is guesswork, and it fails in the direction that is hardest to notice: the option");
P("still adds the new weapon, so the unit looks configured, and only the points and the");
P("weapon list are wrong. Nothing errors.");
P("");
P("A stable `targetId` on the section, pointing at the equipment entry the way");
P("`costs[].unitId` already points at a unit, would remove the ambiguity entirely.");
P("");
function listadoPorLibro(lista, conCategoria) {
  const porLibro = {};
  for (const h of lista) ((porLibro[`${h.libro}|${h.sistema}`] ??= {})[h.unidad] ??= []).push(h);

  for (const clave of Object.keys(porLibro).sort()) {
    const [libro, sistema] = clave.split("|");
    const unidades = porLibro[clave];
    const total = Object.values(unidades).reduce((n, l) => n + l.length, 0);
    const nUnidades = Object.keys(unidades).length;
    P(`### ${libro} — ${SISTEMAS[sistema] ?? sistema}`);
    P("");
    P(`${nUnidades} unit${nUnidades === 1 ? "" : "s"}, ${total} finding${total === 1 ? "" : "s"}.`);
    P("");
    P(conCategoria ? "| Unit | Section | Target | Unit carries | Category |" : "| Unit | Section | Target | Unit carries |");
    P(conCategoria ? "|---|---|---|---|---|" : "|---|---|---|---|");
    for (const unidad of Object.keys(unidades).sort()) {
      for (const h of unidades[unidad]) {
        const objetivo = h.objetivo ? `\`${h.objetivo}\`` : `_limit: up to ${h.limite}_`;
        const lleva = h.lleva ? `\`${h.lleva}\`` : `_${h.opciones} option(s)_`;
        const fila = `| ${unidad} | ${h.seccion ?? ""} | ${objetivo} | ${lleva} |`;
        P(conCategoria ? `${fila} ${CATEGORIAS[h.tipo].titulo} |` : fila);
      }
    }
    P("");
  }
}

const otros = hallazgos.filter((h) => !esPlural(h.tipo));
const plurales = hallazgos.filter((h) => esPlural(h.tipo));

P("## Findings by army book");
P("");
if (otros.length === 0) {
  P("None outside the pluralisation mismatches listed further down.");
  P("");
} else {
  P(
    "Everything except the pluralisation mismatches, which are listed separately at the end " +
      `because they are ${plurales.length} repetitions of the same two shapes.`,
  );
  P("");
  listadoPorLibro(otros, true);
}

P("## Pluralisation mismatches, by army book");
P("");
P(
  `The two naming shapes described above: ${porTipo["replace-target-plural"]?.length ?? 0} where the target is pluralised ` +
    `and the equipment is not, and ${porTipo["replace-target-singular"]?.length ?? 0} the other way round. ` +
    "Which of the two a row is can be read straight off the pair of columns: **Target** is what the " +
    "section declares, **Unit carries** is the equipment entry it was meant to name.",
);
P("");
listadoPorLibro(plurales, false);
