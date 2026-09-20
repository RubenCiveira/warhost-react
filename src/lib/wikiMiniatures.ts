/**
 * Lee la pagina "<Faccion> Miniatures" de onepagefan.wiki para sugerir con
 * que miniatura de otra marca buscar en WarHub. La wiki solo tiene esta
 * tabla para facciones que son proxy de un fabricante externo (tipico de
 * Grimdark Future); una faccion con miniatura propia de OPR simplemente no
 * tiene pagina, y se devuelve un mapa vacio sin que eso sea un error.
 *
 * Se pide directo desde el navegador (con `origin=*`, que MediaWiki exige
 * para responder con CORS abierto): a diferencia de miniset.net o
 * warhammer.com, el wiki no bloquea peticiones automatizadas.
 */
const WIKI = "https://onepagefan.wiki";

export async function fetchWikiSuggestions(factionName: string): Promise<Map<string, string[]>> {
  const title = `${factionName.trim().replace(/\s+/g, "_")}_Miniatures`;
  const url = `${WIKI}/api.php?${new URLSearchParams({
    action: "query",
    titles: title,
    prop: "revisions",
    rvprop: "content",
    format: "json",
    formatversion: "2",
    origin: "*",
  })}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const page = (data?.query?.pages ?? [])[0];
  const content = page?.revisions?.[0]?.content;
  if (typeof content !== "string") return new Map();
  return parseSuggestions(content);
}

/** Busca por nombre exacto y, si no hay, alternando singular/plural (la wiki mezcla ambos). */
export function suggestionsFor(map: Map<string, string[]>, unitName: string): string[] {
  const key = unitName.trim().toLowerCase();
  const direct = map.get(key);
  if (direct) return direct;
  const alt = key.endsWith("s") ? key.slice(0, -1) : `${key}s`;
  return map.get(alt) ?? [];
}

/**
 * Cada fila de la tabla wiki es `|NombreUnidad` seguido de una celda por
 * fabricante con enlaces `[url etiqueta]` o vinetas sueltas ("* Tactical
 * Marines"). Se guarda la etiqueta, nunca la url: esas apuntan a tiendas que
 * bloquean el scraping, y aqui solo hace falta el nombre para buscarlo en el
 * catalogo propio (WarHub), no la pagina del fabricante.
 */
function parseSuggestions(wikitext: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const tableChunks = wikitext.split(/\{\|[^\n]*/).slice(1);

  for (const chunk of tableChunks) {
    const end = chunk.indexOf("|}");
    const table = end === -1 ? chunk : chunk.slice(0, end);
    // La primera "fila" es la cabecera (celdas con !), no una unidad.
    const rows = table.split(/\n\|-/).slice(1);

    for (const row of rows) {
      const cells = row.split(/\n\|(?!\|)/).map((cell) => cell.replace(/^\|/, ""));
      if (cells[0]?.trim() === "") cells.shift();
      if (cells.length < 2) continue;

      const unitName = cells[0].replace(/'''?/g, "").trim();
      if (!unitName || unitName.length > 60 || unitName.startsWith("!")) continue;

      const candidates: string[] = [];
      for (const cell of cells.slice(1)) {
        for (const match of cell.matchAll(/\[https?:\/\/\S+\s+([^\]]+)\]/g)) {
          candidates.push(match[1].replace(/'''?/g, "").trim());
        }
        for (const line of cell.split("\n")) {
          const bullet = line.match(/^\*\s*(.+)$/);
          if (bullet && !bullet[1].includes("[") && !bullet[1].includes("http")) {
            candidates.push(bullet[1].replace(/'''?/g, "").trim());
          }
        }
      }
      if (candidates.length > 0) map.set(unitName.toLowerCase(), [...new Set(candidates)]);
    }
  }
  return map;
}
