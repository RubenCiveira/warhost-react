/**
 * Equipamiento final de una unidad tras aplicar las mejoras elegidas.
 *
 * Army Forge no guarda el resultado: guarda el armamento de partida del libro y
 * las opciones seleccionadas. Las secciones con variante `replace` declaran en
 * `targets` que armas quitan, asi que hay que aplicarlas para saber con que
 * acaba la unidad. Sin esto, una unidad que cambio su pistola por un martillo
 * seguiria apareciendo con la pistola.
 */

export interface LoadoutEntry {
  name: string;
  label: string;
  count: number;
}

export interface Gain {
  name?: string;
  label?: string;
  type?: string;
  count?: number;
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
}

function toEntries(raw: RawEquipment[]): LoadoutEntry[] {
  return raw
    .filter((item) => item.name || item.label)
    .map((item) => ({
      name: item.name ?? item.label ?? "",
      label: item.label ?? item.name ?? "",
      count: item.count ?? 1,
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

/** Armamento y equipo de partida, antes de aplicar ninguna mejora. */
export function baseLoadout(
  weapons: string | RawEquipment[] | null | undefined,
  items?: string | RawEquipment[] | null,
): LoadoutEntry[] {
  const w = typeof weapons === "string" || weapons == null ? parse(weapons) : weapons;
  const i = typeof items === "string" || items == null ? parse(items) : items;
  return [...toEntries(w), ...toEntries(i)];
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
        const label = gain.label ?? gain.name;
        if (!label) continue;
        add(result, { name: gain.name ?? label, label, count: gain.count ?? 1 });
      }
    }
  }

  return result;
}

/** "2× Heavy Rifle (24\", A1, AP(1))", para pintar la lista de un vistazo. */
export function formatLoadout(entries: LoadoutEntry[]): string[] {
  return entries.map((entry) => (entry.count > 1 ? `${entry.count}× ${entry.label}` : entry.label));
}
