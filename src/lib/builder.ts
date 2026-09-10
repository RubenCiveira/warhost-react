/**
 * Logica del constructor de ejercitos, sin React ni Appwrite.
 *
 * Trabaja sobre el catalogo propio (`army_units` y `army_upgrade_packages`), no
 * sobre Army Forge, pero produce exactamente la misma forma que la importacion,
 * para que una partida no tenga que saber de donde salio el ejercito.
 */
import { applyOptions, baseLoadout, llevaObjetivo } from "./loadout";
import type { AppliedOption, LoadoutEntry } from "./loadout";
import type { Gain } from "./loadout";
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
  gains?: Gain[];
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
/**
 * Cuantas veces se puede coger algo de esta seccion, sumando todas sus
 * opciones.
 *
 * `affects` y `select` son ejes distintos y confundirlos es facil: `affects`
 * dice a cuantos modelos alcanza la seccion, `select` cuantas opciones
 * distintas se pueden elegir. Que una mejora alcance a todos los modelos no
 * quiere decir que solo puedas comprar una: "Upgrade all models with any" con
 * dos opciones son dos mejoras, cada una para todos los modelos.
 *
 * La excepcion es el reemplazo: "Replace all Bio-Spiners" se lleva los
 * Bio-Spiners enteros, asi que un segundo reemplazo de la misma seccion no
 * tendria ya nada que quitar.
 */
export function maxPicks(section: UpgradeSection, unitSize: number): number {
  const affects = section.affects;
  if (!affects) return Math.max(1, unitSize);
  if (affects.type === "exactly") return Math.max(1, affects.value ?? 1);
  if (affects.type === "up to") return Math.max(1, affects.value ?? 1);
  if (affects.type === "all") {
    return section.variant === "replace" ? 1 : Math.max(1, (section.options ?? []).length);
  }
  return Math.max(1, unitSize);
}

/**
 * Cuantas veces se puede coger **una misma** opcion.
 *
 * Lo que alcanza a todos los modelos ya los alcanza a la primera: comprarlo
 * dos veces no cambia nada y se cobra dos veces.
 */
export function maxPorOpcion(section: UpgradeSection, unitSize: number): number {
  if (section.affects?.type === "all") return 1;
  return maxPicks(section, unitSize);
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
/**
 * Los objetivos de un reemplazo que la unidad no lleva **ahora mismo**.
 *
 * Los Pathfinders de Battle Brothers llevan Flamer Pistol y tienen una seccion
 * "Replace Gravity Pistol": el objetivo no es un nombre mal escrito, es que esa
 * seccion encadena con otra que si da la Gravity Pistol. Hasta comprarla, elegir
 * ahi no puede hacer nada, asi que no se deja.
 */
export function objetivosQueFaltan(
  section: UpgradeSection,
  entry: BuilderEntry,
  sections: UpgradeSection[],
): string[] {
  const targets = section.targets ?? [];
  if (targets.length === 0) return [];
  const actual = entryLoadout(entry, sections);
  return targets.filter((target) => !llevaObjetivo(actual, target));
}

/** En que seccion se consigue lo que a otra le falta, si es que se consigue. */
function dondeSeConsigue(nombre: string, sections: UpgradeSection[]): string | null {
  const busca = nombre.trim().toLowerCase();
  for (const section of sections) {
    for (const option of section.options ?? []) {
      const da = (option.gains ?? []).flatMap((gain) => [gain.name, gain.label]).filter(Boolean) as string[];
      if (da.some((n) => n.toLowerCase() === busca || n.toLowerCase().startsWith(`${busca} (`))) {
        return section.label ?? null;
      }
    }
  }
  return null;
}

export function blockReason(
  section: UpgradeSection,
  option: UpgradeOption,
  entry: BuilderEntry,
  sections: UpgradeSection[] = [],
): string | null {
  const id = optionId(option);
  const current = entry.choices[id] ?? 0;
  const picks = sectionChosenCount(section, entry.choices);

  if (picks >= maxPicks(section, entry.unit.size)) {
    return `Esta seccion admite como mucho ${maxPicks(section, entry.unit.size)}.`;
  }
  if (current >= maxPorOpcion(section, entry.unit.size)) {
    return "Esta mejora ya alcanza a todos los modelos.";
  }
  const limit = maxDistinctOptions(section);
  if (current === 0 && distinctChosen(section, entry.choices) >= limit) {
    return limit === 1 ? "Solo se puede elegir una opcion aqui." : `Como mucho ${limit} opciones distintas.`;
  }

  // Sin `sections` no se puede saber con que ha quedado la unidad, asi que no
  // se bloquea: mas vale dejar elegir de mas que inventarse un motivo.
  if (sections.length > 0) {
    const faltan = objetivosQueFaltan(section, entry, sections);
    if (faltan.length > 0) {
      const lista = faltan.join(" ni ");
      const donde = faltan.map((n) => dondeSeConsigue(n, sections)).find(Boolean);
      return donde
        ? `Esta unidad no lleva ${lista}. Primero hay que cogerlo en "${donde}".`
        : `Esta unidad no lleva ${lista}, asi que no hay nada que reemplazar.`;
    }
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
        applied.push({
          variant: section.variant,
          targets: section.targets,
          affects: section.affects,
          gains: option.gains,
          count,
        });
      }
    }
  }
  return applied;
}

export function entryLoadout(entry: BuilderEntry, sections: UpgradeSection[]): LoadoutEntry[] {
  const base = baseLoadout(entry.unit.weapons ?? null, entry.unit.items ?? null);
  return applyOptions(base, appliedOptions(entry, sections));
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

/* Persistencia de la composicion ---------------------------------------------
 *
 * Un ejercito guardado lleva las unidades ya resueltas, que es lo que necesitan
 * la ficha y la partida. Pero para poder *editarlo* hace falta lo que se eligio,
 * no el resultado: que unidad del catalogo era y que opciones se marcaron. Eso
 * se guarda aparte, y es lo que permite reabrir el constructor sin perder nada.
 */

export interface StoredEntry {
  unitId: string;
  choices: Record<string, number>;
}

export function serializeEntries(entries: BuilderEntry[]): StoredEntry[] {
  return entries.map((entry) => ({ unitId: entry.unit.unitId, choices: { ...entry.choices } }));
}

function newKey(unitId: string, index: number): string {
  return `${unitId}-${index}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Reconstruye la composicion a partir de lo guardado. Las unidades que ya no
 * existen en el catalogo se descartan: el libro pudo cambiar de version.
 */
export function rehydrateEntries(stored: unknown, units: CatalogUnitLike[]): BuilderEntry[] {
  if (!Array.isArray(stored)) return [];
  const byId = new Map(units.map((unit) => [unit.unitId, unit]));

  return stored.flatMap((raw, index) => {
    const item = raw as Partial<StoredEntry>;
    const unit = item.unitId ? byId.get(item.unitId) : undefined;
    if (!unit) return [];
    const choices: Record<string, number> = {};
    for (const [id, count] of Object.entries(item.choices ?? {})) {
      if (typeof count === "number" && count > 0) choices[id] = count;
    }
    return [{ key: newKey(unit.unitId, index), unit, choices }];
  });
}

/** Forma minima de una lista de Army Forge, para reconstruir una importacion. */
interface ForgeListShape {
  list?: { units?: Array<{ id?: string; selectedUpgrades?: Array<{ optionId?: string }> }> };
}

/**
 * Reconstruye la composicion de un ejercito importado. Los identificadores de
 * unidad y de opcion son los mismos que usa nuestro catalogo, porque salen de
 * la misma fuente; las opciones que ya no existan se pierden, igual que se
 * pierden al importar.
 */
export function entriesFromForgeList(raw: unknown, units: CatalogUnitLike[]): BuilderEntry[] {
  const list = (raw as ForgeListShape)?.list?.units;
  if (!Array.isArray(list)) return [];
  const byId = new Map(units.map((unit) => [unit.unitId, unit]));

  return list.flatMap((forgeUnit, index) => {
    const unit = forgeUnit.id ? byId.get(forgeUnit.id) : undefined;
    if (!unit) return [];
    const choices: Record<string, number> = {};
    for (const selected of forgeUnit.selectedUpgrades ?? []) {
      if (!selected.optionId) continue;
      choices[selected.optionId] = (choices[selected.optionId] ?? 0) + 1;
    }
    return [{ key: newKey(unit.unitId, index), unit, choices }];
  });
}
