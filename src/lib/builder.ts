/**
 * Logica del constructor de ejercitos, sin React ni Appwrite.
 *
 * Trabaja sobre el catalogo propio (`army_units` y `army_upgrade_packages`), no
 * sobre Army Forge, pero produce exactamente la misma forma que la importacion,
 * para que una partida no tenga que saber de donde salio el ejercito.
 */
import { applyOptions, baseLoadout, formatLoadout } from "./loadout";
import type { AppliedOption } from "./loadout";
import type { ResolvedUnit } from "./armyForgeResolve";

/** Cuantos modelos afecta una seccion, o cuantas opciones deja elegir. */
export interface Quantifier {
  type: "exactly" | "up to" | "any" | "all";
  value?: number;
}

export interface UpgradeOption {
  id?: string;
  uid?: string;
  label?: string;
  costs?: Array<{ cost?: number; unitId?: string }>;
  gains?: Array<{ name?: string; label?: string; type?: string; rating?: string | number; count?: number }>;
}

export interface UpgradeSection {
  id?: string;
  uid?: string;
  label?: string;
  variant?: "replace" | "upgrade" | "attachment" | string;
  targets?: string[];
  affects?: Quantifier | null;
  select?: Quantifier | null;
  options?: UpgradeOption[];
  parentPackageUid?: string;
}

/** Unidad del catalogo, con lo que el constructor necesita de ella. */
export interface CatalogUnitLike {
  unitId: string;
  name: string;
  size: number;
  quality: number;
  defense: number;
  cost: number;
  rules: string[];
  upgradePackageUids: string[];
  /** JSON del catalogo; hace falta para saber con que armas parte la unidad. */
  weapons?: string | null;
  items?: string | null;
}

/** Una unidad puesta en la lista. La misma unidad puede repetirse. */
export interface BuilderEntry {
  key: string;
  unit: CatalogUnitLike;
  /** optionId -> cuantas veces se ha cogido esa opcion. */
  choices: Record<string, number>;
}

export function parseSections(json: string | null | undefined): UpgradeSection[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as UpgradeSection[]) : [];
  } catch {
    return [];
  }
}

export function sectionsForUnit(
  unit: CatalogUnitLike,
  packages: Map<string, UpgradeSection[]>,
): UpgradeSection[] {
  return unit.upgradePackageUids.flatMap((uid) => packages.get(uid) ?? []);
}

export function optionId(option: UpgradeOption): string {
  return option.id ?? option.uid ?? "";
}

/** El coste de una opcion depende de que unidad la compre. */
export function optionCost(option: UpgradeOption, unitId: string): number {
  const costs = option.costs ?? [];
  const exact = costs.find((entry) => entry.unitId === unitId);
  return exact?.cost ?? costs[0]?.cost ?? 0;
}

/**
 * Cuantas veces como maximo se puede coger una opcion de esta seccion.
 * `affects` habla de modelos: "exactly 1" es una vez, "up to 2" hasta dos, y
 * "any"/"all"/sin dato se limitan al tamano de la unidad.
 */
export function maxPicks(section: UpgradeSection, unitSize: number): number {
  const affects = section.affects;
  if (!affects) return Math.max(1, unitSize);
  if (affects.type === "exactly") return Math.max(1, affects.value ?? 1);
  if (affects.type === "up to") return Math.max(1, affects.value ?? 1);
  return Math.max(1, unitSize);
}

/** Cuantas opciones distintas de la seccion se pueden tener a la vez. */
export function maxDistinctOptions(section: UpgradeSection): number {
  const select = section.select;
  if (select?.type === "exactly") return Math.max(1, select.value ?? 1);
  return Number.POSITIVE_INFINITY;
}

export function sectionChosenCount(section: UpgradeSection, choices: Record<string, number>): number {
  return (section.options ?? []).reduce((sum, option) => sum + (choices[optionId(option)] ?? 0), 0);
}

function distinctChosen(section: UpgradeSection, choices: Record<string, number>): number {
  return (section.options ?? []).filter((option) => (choices[optionId(option)] ?? 0) > 0).length;
}

/** Si no se puede subir una opcion mas, devuelve por que. */
export function blockReason(
  section: UpgradeSection,
  option: UpgradeOption,
  entry: BuilderEntry,
): string | null {
  const id = optionId(option);
  const current = entry.choices[id] ?? 0;
  const picks = sectionChosenCount(section, entry.choices);

  if (picks >= maxPicks(section, entry.unit.size)) {
    return `Esta seccion admite como mucho ${maxPicks(section, entry.unit.size)}.`;
  }
  const limit = maxDistinctOptions(section);
  if (current === 0 && distinctChosen(section, entry.choices) >= limit) {
    return limit === 1 ? "Solo se puede elegir una opcion aqui." : `Como mucho ${limit} opciones distintas.`;
  }
  return null;
}

export function entryCost(entry: BuilderEntry, sections: UpgradeSection[]): number {
  let cost = entry.unit.cost;
  for (const section of sections) {
    for (const option of section.options ?? []) {
      const count = entry.choices[optionId(option)] ?? 0;
      if (count > 0) cost += optionCost(option, entry.unit.unitId) * count;
    }
  }
  return cost;
}

export function entryRules(entry: BuilderEntry, sections: UpgradeSection[]): string[] {
  const rules = [...entry.unit.rules];
  for (const section of sections) {
    for (const option of section.options ?? []) {
      if (!(entry.choices[optionId(option)] ?? 0)) continue;
      for (const gain of option.gains ?? []) {
        if (gain.type !== "ArmyBookRule") continue;
        rules.push(gain.label ?? (gain.rating ? `${gain.name}(${gain.rating})` : gain.name ?? ""));
      }
    }
  }
  return [...new Set(rules.filter(Boolean))];
}

/** Las opciones elegidas, en texto, para poder leer la lista de un vistazo. */
export function entryUpgradeLabels(entry: BuilderEntry, sections: UpgradeSection[]): string[] {
  const labels: string[] = [];
  for (const section of sections) {
    for (const option of section.options ?? []) {
      const count = entry.choices[optionId(option)] ?? 0;
      if (count > 0) labels.push(count > 1 ? `${count}× ${option.label ?? ""}` : option.label ?? "");
    }
  }
  return labels.filter(Boolean);
}

function toughOf(rules: string[]): number {
  for (const rule of rules) {
    const match = /^tough\((\d+)\)$/i.exec(rule.trim());
    if (match) return Number(match[1]);
  }
  return 1;
}

/** Las opciones elegidas, con la seccion que dice a que sustituyen. */
export function appliedOptions(entry: BuilderEntry, sections: UpgradeSection[]): AppliedOption[] {
  const applied: AppliedOption[] = [];
  for (const section of sections) {
    for (const option of section.options ?? []) {
      const count = entry.choices[optionId(option)] ?? 0;
      if (count > 0) {
        applied.push({ variant: section.variant, targets: section.targets, gains: option.gains, count });
      }
    }
  }
  return applied;
}

export function entryLoadout(entry: BuilderEntry, sections: UpgradeSection[]): string[] {
  const base = baseLoadout(entry.unit.weapons ?? null, entry.unit.items ?? null);
  return formatLoadout(applyOptions(base, appliedOptions(entry, sections)));
}

export function toResolvedUnit(
  entry: BuilderEntry,
  sections: UpgradeSection[],
  index: number,
): ResolvedUnit {
  const rules = entryRules(entry, sections);
  return {
    name: entry.unit.name,
    unitKey: entry.unit.unitId,
    size: entry.unit.size,
    quality: entry.unit.quality,
    defense: entry.unit.defense,
    maxWounds: entry.unit.size * toughOf(rules),
    cost: entryCost(entry, sections),
    rules: rules.slice(0, 20),
    loadout: entryLoadout(entry, sections),
    upgrades: entryUpgradeLabels(entry, sections),
    unresolvedUpgrades: 0,
    sortOrder: index,
  };
}

export interface BuiltArmy {
  units: ResolvedUnit[];
  points: number;
  modelCount: number;
}

export function buildArmy(
  entries: BuilderEntry[],
  packages: Map<string, UpgradeSection[]>,
): BuiltArmy {
  const units = entries.map((entry, index) =>
    toResolvedUnit(entry, sectionsForUnit(entry.unit, packages), index),
  );
  return {
    units,
    points: units.reduce((sum, unit) => sum + unit.cost, 0),
    modelCount: units.reduce((sum, unit) => sum + unit.size, 0),
  };
}
