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
  content?: Array<{ name?: string; label?: string; rating?: string | number }>;
}

function ruleLabel(rule: { name?: string; label?: string; rating?: string | number }): string {
  if (rule.label) return rule.label;
  if (!rule.name) return "";
  return rule.rating ? `${rule.name}(${rule.rating})` : rule.name;
}

function toEntry(raw: RawEquipment, kind: "weapon" | "gear"): LoadoutEntry {
  const rules = (raw.specialRules ?? raw.content ?? []).map(ruleLabel).filter(Boolean);
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
    ...asArray(items).filter((i) => i.name || i.label).map((i) => toEntry(i, "gear")),
  ];
}

function add(entries: LoadoutEntry[], entry: LoadoutEntry): void {
  const existing = entries.find((candidate) => candidate.label === entry.label);
  if (existing) existing.count += entry.count;
  else entries.push({ ...entry });
}

/** Quita una unidad del arma indicada, si la unidad la lleva. */
function removeOne(entries: LoadoutEntry[], name: string): void {
  const index = entries.findIndex((entry) => entry.name === name || entry.label === name);
  if (index === -1) return;
  const entry = entries[index];
  if (entry.count > 1) entry.count -= 1;
  else entries.splice(index, 1);
}

/**
 * Aplica las opciones elegidas al equipo de partida. Las de tipo `replace`
 * quitan antes lo que declaran en `targets`; las demas solo anaden.
 */
export function applyOptions(base: LoadoutEntry[], options: AppliedOption[]): LoadoutEntry[] {
  const result = base.map((entry) => ({ ...entry }));

  for (const option of options) {
    for (let i = 0; i < option.count; i += 1) {
      if (option.variant === "replace") {
        for (const target of option.targets ?? []) removeOne(result, target);
      }
      for (const gain of option.gains ?? []) {
        // Las reglas ganadas se tratan aparte; aqui solo armas y equipo.
        if (gain.type === "ArmyBookRule") continue;
        if (!(gain.label ?? gain.name)) continue;
        add(result, toEntry(gain, gain.type === "ArmyBookItem" ? "gear" : "weapon"));
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
