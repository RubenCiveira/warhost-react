/**
 * Lectura del armamento y el equipo de una unidad del catalogo, sin React.
 *
 * Army Forge guarda cada arma con su `label` ya montado —"Heavy Rifle (24", A1,
 * AP(1))"— pero tambien con los campos sueltos, que es lo que permite pintarlo
 * en tabla y no como una cadena.
 */

export interface ForgeWeapon {
  id?: string;
  name?: string;
  label?: string;
  count?: number;
  range?: number;
  attacks?: number;
  specialRules?: Array<{ name?: string; label?: string; rating?: string | number }>;
}

export interface ForgeItem {
  id?: string;
  name?: string;
  count?: number;
  content?: Array<{ name?: string; label?: string; rating?: string | number }>;
}

export interface WeaponLine {
  key: string;
  count: number;
  name: string;
  /** Alcance en pulgadas, o null si es cuerpo a cuerpo. */
  range: number | null;
  attacks: number;
  rules: string[];
}

export interface ItemLine {
  key: string;
  count: number;
  name: string;
  grants: string[];
}

function ruleLabel(rule: { name?: string; label?: string; rating?: string | number }): string {
  if (rule.label) return rule.label;
  if (!rule.name) return "";
  return rule.rating ? `${rule.name}(${rule.rating})` : rule.name;
}

function parseArray<T>(json: string | null | undefined): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function parseWeapons(json: string | null | undefined): WeaponLine[] {
  return parseArray<ForgeWeapon>(json).map((weapon, index) => ({
    key: weapon.id ?? `${weapon.name ?? "arma"}-${index}`,
    count: weapon.count ?? 1,
    name: weapon.name ?? "Arma",
    range: weapon.range && weapon.range > 0 ? weapon.range : null,
    attacks: weapon.attacks ?? 0,
    rules: (weapon.specialRules ?? []).map(ruleLabel).filter(Boolean),
  }));
}

export function parseItems(json: string | null | undefined): ItemLine[] {
  return parseArray<ForgeItem>(json).map((item, index) => ({
    key: item.id ?? `${item.name ?? "objeto"}-${index}`,
    count: item.count ?? 1,
    name: item.name ?? "Objeto",
    grants: (item.content ?? []).map(ruleLabel).filter(Boolean),
  }));
}

/** "24\"" para las de tiro, "CaC" para las de cuerpo a cuerpo. */
export function rangeLabel(range: number | null): string {
  return range === null ? "CaC" : `${range}"`;
}
