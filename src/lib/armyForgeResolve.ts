import { applyOptions, baseLoadout } from "./loadout";
import type { AppliedOption, LoadoutEntry } from "./loadout";

/**
 * Formas de Army Forge y logica de resolucion de listas, sin dependencias de
 * red ni de Appwrite. Vive aparte para poder ejercitarla desde Node con datos
 * reales: ver scripts/test-import.mjs.
 */

interface ForgeRule {
  name?: string;
  label?: string;
  rating?: string | number;
}

interface ForgeSelectedUpgrade {
  optionId?: string;
  upgradeId?: string;
}

export interface ForgeListUnit {
  id?: string;
  armyId?: string;
  customName?: string;
  selectionId?: string;
  selectedUpgrades?: ForgeSelectedUpgrade[];
  /** Unidad combinada: el doble de miniaturas y el doble de coste. */
  combined?: boolean;
  /** Puesto en la segunda mitad de una unidad combinada. */
  joinToUnit?: string | null;
  notes?: string | null;
}

export interface ArmyForgeList {
  id?: string;
  army_uid?: string;
  game_system?: string;
  details?: {
    armyId?: string;
    armyIds?: string[];
    armyName?: string;
    armyFaction?: string;
    gameSystem?: string;
    listPoints?: number;
  };
  list?: {
    id?: string;
    name?: string;
    gameSystem?: string;
    modelCount?: number;
    pointsLimit?: number;
    description?: string;
    units?: ForgeListUnit[];
  };
  [key: string]: unknown;
}

interface ForgeBookUnit {
  id?: string;
  name?: string;
  size?: number;
  quality?: number;
  defense?: number;
  cost?: number;
  rules?: ForgeRule[];
  weapons?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
}

interface ForgeUpgradeOption {
  id?: string;
  label?: string;
  costs?: Array<{ cost?: number; unitId?: string }>;
  gains?: Array<{ name?: string; label?: string; type?: string; rating?: string | number; count?: number }>;
}

interface ForgeUpgradeSection {
  variant?: string;
  targets?: string[];
  affects?: { type: string; value?: number } | null;
  options?: ForgeUpgradeOption[];
}

/** Una opcion con su seccion: hace falta la seccion para saber que reemplaza. */
interface OptionInSection {
  option: ForgeUpgradeOption;
  section: ForgeUpgradeSection;
}

export interface ForgeArmyBook {
  uid?: string;
  name?: string;
  units?: ForgeBookUnit[];
  upgradePackages?: Array<{ sections?: ForgeUpgradeSection[] }>;
}

export interface ArmyBookSummary {
  uid: string;
  name: string;
  factionName?: string;
  official?: boolean;
}

/** Unidad ya resuelta, lista para guardar o para llevar a una partida. */
export interface ResolvedUnit {
  name: string;
  unitKey: string | null;
  /** Libro propio de origen, cuando se conoce: permite agrupar puntos por faccion. */
  bookKey?: string;
  /** Nombre del tipo de unidad del catalogo, cuando `name` es un nombre propio de heroe. */
  unitTypeName?: string;
  /** `$id` de `hero_classes` elegida. Solo en Star Quest / Fantasy Quest. */
  heroClassId?: string;
  size: number;
  quality: number;
  defense: number;
  maxWounds: number;
  /** Atributos de heroe de quest: solo llegan puestos en heroes de sistemas quest. */
  strength?: number;
  dexterity?: number;
  willpower?: number;
  power?: number;
  /** Fijo en 1 por ahora: subir de nivel jugando no esta modelado todavia. */
  level?: number;
  /** Fijo en 30 (questStartingGold) por ahora: gastarlo en tienda no esta modelado todavia. */
  gold?: number;
  /** Aproximado: no cuenta las mejoras que ya no existen en el libro. */
  cost: number;
  rules: string[];
  /** Armas y equipo tras aplicar los reemplazos elegidos. */
  loadout: LoadoutEntry[];
  /** Las opciones elegidas, tal como las nombra Army Forge. */
  upgrades: string[];
  /** Unidad combinada: `size`, `cost` y `loadout` ya vienen doblados. */
  combined?: boolean;
  /** Anotacion del jugador. */
  notes?: string;
  unresolvedUpgrades: number;
  sortOrder: number;
}

export interface ResolvedList {
  listId: string;
  name: string;
  faction: string | null;
  gameSystem: string | null;
  points: number;
  modelCount: number;
  units: ResolvedUnit[];
  /**
   * Mejoras que la lista referencia pero que ya no existen en el libro de
   * ejercito. Pasa cuando la lista se guardo con una version anterior del libro:
   * Army Forge conserva el total original y no lo recalcula, asi que nosotros
   * tampoco. Solo afecta al coste por unidad, no al total del ejercito.
   */
  unresolvedUpgrades: number;
  raw: ArmyForgeList;
}

/**
 * Acepta un id pelado o una URL de Army Forge. Las listas de comunidad usan
 * `?listId=`, y las compartidas `?id=`; el ultimo segmento de la ruta es el
 * nombre del sistema de juego, nunca un id, asi que no sirve como respaldo.
 */
export function extractListId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z0-9_-]{4,64}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("listId") ?? url.searchParams.get("id") ?? null;
  } catch {
    return null;
  }
}

/**
 * Cruza una lista con los libros de ejercito ya descargados y devuelve las
 * unidades con nombre, estadisticas, coste y reglas resueltos.
 */
export function resolveList(
  raw: ArmyForgeList,
  books: Map<string, ForgeArmyBook>,
  listId: string,
): ResolvedList {
  const list = raw.list ?? {};
  // La segunda mitad de una unidad combinada es la misma unidad, no otra: viene
  // con `joinToUnit` apuntando a la primera y sin mejoras propias. Importarla
  // dejaria la unidad dos veces en la lista, y ademas sin configurar.
  const units = (list.units ?? []).filter((unit) => !unit.joinToUnit);
  const resolved = units.map((unit, index) => resolveUnit(unit, books, index));
  const unresolvedUpgrades = resolved.reduce((sum, unit) => sum + unit.unresolvedUpgrades, 0);

  return {
    listId: raw.id ?? list.id ?? listId,
    name: list.name ?? "Lista importada",
    faction: raw.details?.armyFaction ?? raw.details?.armyName ?? null,
    gameSystem: raw.details?.gameSystem ?? list.gameSystem ?? raw.game_system ?? null,
    // El total lo manda Army Forge: es el que se guardo al crear la lista y el
    // unico que cuadra si el libro de ejercito ha cambiado desde entonces.
    points: raw.details?.listPoints ?? resolved.reduce((sum, unit) => sum + unit.cost, 0),
    modelCount: list.modelCount ?? resolved.reduce((sum, unit) => sum + unit.size, 0),
    units: resolved,
    unresolvedUpgrades,
    raw,
  };
}

/** Uids de los libros de ejercito que hacen falta para resolver una lista. */
export function requiredBookUids(raw: ArmyForgeList): string[] {
  const units = raw.list?.units ?? [];
  const uids = [...new Set(units.map((unit) => unit.armyId).filter((uid): uid is string => Boolean(uid)))];
  const fallback = raw.army_uid ?? raw.details?.armyId;
  if (!uids.length && fallback) uids.push(fallback);
  return uids;
}

export function gameSystemOf(raw: ArmyForgeList): string | null {
  return raw.details?.gameSystem ?? raw.list?.gameSystem ?? raw.game_system ?? null;
}

function resolveUnit(unit: ForgeListUnit, books: Map<string, ForgeArmyBook>, index: number): ResolvedUnit {
  const book = unit.armyId ? books.get(unit.armyId) : undefined;
  const definition = book?.units?.find((candidate) => candidate.id === unit.id);
  const options = optionsById(book);

  const rules = (definition?.rules ?? []).map(ruleLabel).filter(Boolean);
  const upgrades: string[] = [];
  const applied: AppliedOption[] = [];
  let cost = definition?.cost ?? 0;
  let unresolvedUpgrades = 0;

  for (const selected of unit.selectedUpgrades ?? []) {
    const found = selected.optionId ? options.get(selected.optionId) : undefined;
    if (!found) {
      unresolvedUpgrades += 1;
      continue;
    }
    const { option, section } = found;
    cost += costFor(option, unit.id);
    if (option.label) upgrades.push(option.label);

    for (const gain of option.gains ?? []) {
      if (gain.type === "ArmyBookRule") rules.push(ruleLabel(gain));
    }
    // Cada seleccion cuenta como una aplicacion: si la misma opcion aparece dos
    // veces en la lista, reemplaza y anade dos veces.
    applied.push({
      variant: section.variant,
      targets: section.targets,
      affects: section.affects,
      gains: option.gains,
      count: 1,
    });
  }

  const base = definition?.size ?? 1;
  // Combinada: se configura como la unidad normal y se dobla el resultado.
  // Un Heroe es una miniatura y no se puede combinar, aunque venga marcado.
  const combinada = Boolean(unit.combined) && base > 1;
  const factor = combinada ? 2 : 1;
  const size = base * factor;
  const tough = ratingOf((definition?.rules ?? []).find((rule) => rule.name?.toLowerCase() === "tough")?.rating) ?? 1;
  const loadout = applyOptions(baseLoadout(definition?.weapons ?? [], definition?.items ?? []), applied).map((pieza) =>
    factor === 1 ? pieza : { ...pieza, count: pieza.count * factor },
  );

  return {
    name: unit.customName || definition?.name || `Unidad ${index + 1}`,
    unitTypeName: definition?.name,
    unitKey: unit.selectionId ?? unit.id ?? null,
    size,
    quality: definition?.quality ?? 4,
    defense: definition?.defense ?? 4,
    maxWounds: size * tough,
    cost: cost * factor,
    rules: [...new Set(rules.filter(Boolean))].slice(0, 20),
    loadout,
    upgrades,
    unresolvedUpgrades,
    ...(combinada ? { combined: true } : {}),
    ...(unit.notes ? { notes: unit.notes } : {}),
    sortOrder: index,
  };
}

function optionsById(book: ForgeArmyBook | undefined): Map<string, OptionInSection> {
  const map = new Map<string, OptionInSection>();
  for (const pkg of book?.upgradePackages ?? []) {
    for (const section of pkg.sections ?? []) {
      for (const option of section.options ?? []) {
        if (option.id) map.set(option.id, { option, section });
      }
    }
  }
  return map;
}

/** Los costes de una opcion varian segun la unidad que la compre. */
function costFor(option: ForgeUpgradeOption, unitId: string | undefined): number {
  const costs = option.costs ?? [];
  const exact = costs.find((entry) => entry.unitId === unitId);
  return exact?.cost ?? costs[0]?.cost ?? 0;
}

function ruleLabel(rule: { name?: string; label?: string; rating?: string | number }): string {
  if (rule.label) return rule.label;
  if (!rule.name) return "";
  return rule.rating ? `${rule.name}(${rule.rating})` : rule.name;
}

function ratingOf(value: number | string | undefined): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const digits = value.match(/\d+/);
    if (digits) return Number(digits[0]);
  }
  return undefined;
}

export function listUrl(listId: string): string {
  return `https://army-forge.onepagerules.com/share?id=${encodeURIComponent(listId)}`;
}

/**
 * Las unidades ya resueltas se guardan en la columna `listJson` del ejercito,
 * junto al JSON original. Esto las recupera para pintarlas o llevarlas a una
 * partida sin volver a llamar a Army Forge.
 */
export function parseStoredList(listJson: string | null | undefined): ResolvedUnit[] {
  if (!listJson) return [];
  try {
    const parsed = JSON.parse(listJson) as Partial<ResolvedList>;
    return Array.isArray(parsed.units) ? parsed.units : [];
  } catch {
    return [];
  }
}
