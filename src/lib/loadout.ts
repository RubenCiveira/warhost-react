/**
 * Equipamiento final de una unidad tras aplicar las mejoras elegidas.
 *
 * Army Forge no guarda el resultado: guarda el armamento de partida del libro y
 * las opciones seleccionadas. Las secciones con variante `replace` declaran en
 * `targets` que armas quitan, asi que hay que aplicarlas para saber con que
 * acaba la unidad. Sin esto, una unidad que cambio su pistola por un martillo
 * seguiria apareciendo con la pistola.
 *
 * Las entradas se guardan con sus campos sueltos —alcance, ataques, reglas— y
 * no como la cadena ya montada, para poder pintarlas en tabla.
 */

export interface LoadoutEntry {
  name: string;
  label: string;
  count: number;
  /** Alcance en pulgadas; null en cuerpo a cuerpo, y en el equipo que no es arma. */
  range: number | null;
  /** Ataques del arma; null si la entrada no es un arma. */
  attacks: number | null;
  rules: string[];
  kind: "weapon" | "gear";
}

export interface Gain {
  name?: string;
  label?: string;
  type?: string;
  count?: number;
  /** Presente cuando la ganancia es una regla, no un arma: Tough(3). */
  rating?: string | number;
  range?: number;
  attacks?: number;
  specialRules?: Array<{ name?: string; label?: string; rating?: string | number }>;
  content?: Array<{ name?: string; label?: string; rating?: string | number }>;
}

/** Una opcion elegida, con lo que hace falta saber para aplicarla. */
export interface AppliedOption {
  variant?: string;
  targets?: string[];
  gains?: Gain[];
  /** A cuantos modelos alcanza la seccion. `all` reemplaza todo de una vez. */
  affects?: { type: string; value?: number } | null;
  /** Cuantas veces se ha cogido. */
  count: number;
}

interface RawEquipment {
  name?: string;
  label?: string;
  count?: number;
  range?: number;
  attacks?: number;
  specialRules?: Array<{ name?: string; label?: string; rating?: string | number }>;
  content?: Array<{
    name?: string;
    label?: string;
    rating?: string | number;
    type?: string;
    count?: number;
    range?: number;
    attacks?: number;
    specialRules?: Array<{ name?: string; label?: string; rating?: string | number }>;
  }>;
}

function ruleLabel(rule: { name?: string; label?: string; rating?: string | number }): string {
  if (rule.label) return rule.label;
  if (!rule.name) return "";
  return rule.rating ? `${rule.name}(${rule.rating})` : rule.name;
}

/**
 * Lo que un objeto lleva dentro no siempre son reglas: tambien hay **armas**.
 * El Combat Shield concede `Bash`, que es un cuerpo a cuerpo, y la Custodian
 * Jetbike trae un `Heavy Rifle Array (24", A6, AP(1))`. Son 96 en 30 libros.
 */
function esArma(pieza: { name?: string; label?: string; type?: string; range?: number; attacks?: number }): boolean {
  if (pieza.type) return pieza.type.includes("Weapon");
  return typeof pieza.attacks === "number" || typeof pieza.range === "number";
}

function toEntry(raw: RawEquipment, kind: "weapon" | "gear"): LoadoutEntry {
  const dentro = raw.specialRules ?? raw.content ?? [];
  // De un arma, todo lo que lleva dentro son sus reglas. De un objeto, hay que
  // separar: las armas salen aparte, con su perfil, en `armasDe`.
  const rules = (kind === "weapon" ? dentro : dentro.filter((pieza) => !esArma(pieza))).map(ruleLabel).filter(Boolean);
  return {
    name: raw.name ?? raw.label ?? "",
    label: raw.label ?? raw.name ?? "",
    count: raw.count ?? 1,
    range: typeof raw.range === "number" && raw.range > 0 ? raw.range : null,
    attacks: typeof raw.attacks === "number" ? raw.attacks : null,
    rules,
    kind,
  };
}

/**
 * Las armas que trae un objeto, como entradas propias.
 *
 * Sin esto, un arma metida en un objeto no existe para nada: no sale en la
 * tabla de armas, se pinta como si fuera una regla, y un "Replace Heavy Rifle
 * Array" nunca encuentra a que apuntar aunque la unidad lo lleve puesto.
 */
function armasDe(raw: RawEquipment): LoadoutEntry[] {
  if (!raw.content) return [];
  return raw.content
    .filter(esArma)
    .filter((pieza) => pieza.name || pieza.label)
    .map((pieza) => ({
      ...toEntry(pieza as RawEquipment, "weapon"),
      count: (raw.count ?? 1) * ((pieza as RawEquipment).count ?? 1),
    }));
}

function parse(json: string | null | undefined): RawEquipment[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as RawEquipment[]) : [];
  } catch {
    return [];
  }
}

function asArray(value: string | RawEquipment[] | null | undefined): RawEquipment[] {
  return typeof value === "string" || value == null ? parse(value) : value;
}

/** Armamento y equipo de partida, antes de aplicar ninguna mejora. */
export function baseLoadout(
  weapons: string | RawEquipment[] | null | undefined,
  items?: string | RawEquipment[] | null,
): LoadoutEntry[] {
  return [
    ...asArray(weapons).filter((w) => w.name || w.label).map((w) => toEntry(w, "weapon")),
    ...asArray(items).filter((i) => i.name || i.label).flatMap((i) => [toEntry(i, "gear"), ...armasDe(i)]),
  ];
}

function add(entries: LoadoutEntry[], entry: LoadoutEntry): void {
  const existing = entries.find((candidate) => candidate.label === entry.label);
  if (existing) existing.count += entry.count;
  else entries.push({ ...entry });
}

const CANTIDAD_EN_OBJETIVO = /^\s*\d+\s*x\s+/i;

/**
 * Como se puede estar escribiendo el mismo objeto: el catalogo no es
 * consistente y las tres formas aparecen, a veces en la misma unidad.
 *
 *  - con la cantidad dentro del nombre: "3x Heavy Razor Claws"
 *  - en plural cuando el equipo va en singular: "Bio-Spiners" / "Bio-Spiner"
 *  - en singular cuando el equipo va en plural: "Heavy Razor Claw" / "...Claws"
 *
 * Son 443 desajustes en 60 libros; estan inventariados en
 * warhost-appwrite/ARMY-FORGE-DATA-ISSUES.md.
 */
function formasDelObjetivo(name: string): string[] {
  // En minusculas desde el principio: la comparacion no distingue mayusculas,
  // pero el recorte del plural si lo haria, y el catalogo escribe "CCWS".
  const base = name.trim().toLowerCase();
  const sinCantidad = base.replace(CANTIDAD_EN_OBJETIVO, "");
  const formas = new Set<string>();
  for (const raiz of [base, sinCantidad]) {
    formas.add(raiz);
    if (raiz.endsWith("es")) formas.add(raiz.slice(0, -2));
    if (raiz.endsWith("s")) formas.add(raiz.slice(0, -1));
    else {
      formas.add(`${raiz}s`);
      formas.add(`${raiz}es`);
    }
  }
  return [...formas].filter(Boolean);
}

/**
 * Busca lo que una seccion dice reemplazar, y solo eso.
 *
 * Se toleran las tres formas en que el catalogo escribe el mismo objeto
 * —plural, singular y con la cantidad delante— y nada mas. Hubo aqui una
 * adivinanza: cuando el objetivo no aparecia se caia sobre el CCW, con la idea
 * de que es el arma que todo modelo lleva de serie. Quitaba lo que no tocaba.
 * Un "Replace Gravity Pistol" en una unidad que lleva Flamer Pistol no es un
 * objetivo mal escrito: es una seccion que solo se puede usar despues de
 * comprar la Gravity Pistol en otra. Eso se resuelve no dejandola elegir
 * —`objetivosQueFaltan` en builder.ts—, no adivinando sobre que caer.
 */
function findTarget(entries: LoadoutEntry[], name: string): number {
  const busca = (aguja: string) =>
    entries.findIndex(
      (entry) => entry.name.toLowerCase() === aguja.toLowerCase() || entry.label.toLowerCase() === aguja.toLowerCase(),
    );

  for (const candidato of formasDelObjetivo(name)) {
    const encontrado = busca(candidato);
    if (encontrado !== -1) return encontrado;
  }
  return -1;
}

/** Si la unidad lleva ahora mismo lo que una seccion dice reemplazar. */
export function llevaObjetivo(entries: LoadoutEntry[], name: string): boolean {
  return findTarget(entries, name) !== -1;
}

/** Quita una unidad del arma indicada, si la unidad la lleva. */
function removeOne(entries: LoadoutEntry[], name: string): void {
  const index = findTarget(entries, name);
  if (index === -1) return;
  const entry = entries[index];
  if (entry.count > 1) entry.count -= 1;
  else entries.splice(index, 1);
}

/** Quita todas las que lleve, y dice cuantas eran. */
function removeAll(entries: LoadoutEntry[], name: string): number {
  const index = findTarget(entries, name);
  if (index === -1) return 0;
  const cuantas = entries[index].count;
  entries.splice(index, 1);
  return cuantas;
}

/**
 * Aplica las opciones elegidas al equipo de partida. Las de tipo `replace`
 * quitan antes lo que declaran en `targets`; las demas solo anaden.
 */
export function applyOptions(base: LoadoutEntry[], options: AppliedOption[]): LoadoutEntry[] {
  const result = base.map((entry) => ({ ...entry }));

  for (const option of options) {
    // "Replace all" se coge una vez y cambia todas las copias a la vez, asi que
    // lo que se gana viene multiplicado por lo que se quito: tres modelos que
    // cambian su equipo acaban con tres del nuevo, no con uno.
    const todas = option.variant === "replace" && option.affects?.type === "all";

    for (let i = 0; i < option.count; i += 1) {
      let quitadas = 1;
      if (option.variant === "replace") {
        for (const target of option.targets ?? []) {
          if (todas) quitadas = Math.max(quitadas, removeAll(result, target));
          else removeOne(result, target);
        }
      }
      for (const gain of option.gains ?? []) {
        // Las reglas ganadas se tratan aparte; aqui solo armas y equipo.
        if (gain.type === "ArmyBookRule") continue;
        if (!(gain.label ?? gain.name)) continue;
        const esObjeto = gain.type === "ArmyBookItem";
        const entradas = [toEntry(gain, esObjeto ? "gear" : "weapon"), ...(esObjeto ? armasDe(gain) : [])];
        for (const entrada of entradas) {
          add(result, todas ? { ...entrada, count: entrada.count * quitadas } : entrada);
        }
      }
    }
  }

  return result;
}

/** "2× Heavy Rifle (24\", A1, AP(1))", para listados de una linea. */
export function formatLoadout(entries: LoadoutEntry[]): string[] {
  return entries.map((entry) => (entry.count > 1 ? `${entry.count}× ${entry.label}` : entry.label));
}

/**
 * Acepta tanto las entradas estructuradas de ahora como las cadenas que se
 * guardaron en las primeras listas, para que un ejercito antiguo siga
 * pintandose aunque sea sin tabla.
 */
export function normalizeLoadout(stored: unknown): LoadoutEntry[] {
  if (!Array.isArray(stored)) return [];
  return stored.map((item) => {
    if (typeof item === "string") {
      const match = /^(\d+)×\s*(.*)$/.exec(item);
      const label = match ? match[2] : item;
      return { name: label, label, count: match ? Number(match[1]) : 1, range: null, attacks: null, rules: [], kind: "weapon" as const };
    }
    const entry = item as Partial<LoadoutEntry>;
    return {
      name: entry.name ?? entry.label ?? "",
      label: entry.label ?? entry.name ?? "",
      count: entry.count ?? 1,
      range: entry.range ?? null,
      attacks: entry.attacks ?? null,
      rules: entry.rules ?? [],
      kind: entry.kind === "gear" ? "gear" : "weapon",
    };
  });
}
