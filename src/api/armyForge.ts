import { ExecutionMethod } from "appwrite";
import { functions } from "../lib/appwrite";
import { env } from "../lib/env";
import { getGameSystem } from "../lib/gameSystems";
import type { GameSystem } from "../lib/gameSystems";

/** Respuesta del proxy: `data` es lo que devuelve Army Forge tal cual. */
interface ProxyResponse<T> {
  ok: boolean;
  cached?: boolean;
  data?: T;
  reason?: string;
}

async function call<T>(params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const execution = await functions.createExecution({
    functionId: env.armyForgeFunctionId,
    xpath: `/?${query}`,
    method: ExecutionMethod.GET,
    async: false,
  });

  let payload: ProxyResponse<T>;
  try {
    payload = JSON.parse(execution.responseBody) as ProxyResponse<T>;
  } catch {
    throw new Error("El proxy de Army Forge devolvio una respuesta ilegible.");
  }
  if (!payload.ok || payload.data === undefined) {
    throw new Error(payload.reason || "Army Forge no ha devuelto datos.");
  }
  return payload.data;
}

/* Formas de Army Forge -------------------------------------------------------
 * Solo tipamos lo que usamos. Una lista guarda las unidades por referencia, asi
 * que hay que cruzarla con el libro de ejercito para resolver estadisticas. */

interface ForgeRule {
  name?: string;
  label?: string;
  rating?: string | number;
}

interface ForgeSelectedUpgrade {
  optionId?: string;
  upgradeId?: string;
}

interface ForgeListUnit {
  id?: string;
  armyId?: string;
  customName?: string;
  selectionId?: string;
  selectedUpgrades?: ForgeSelectedUpgrade[];
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
}

interface ForgeUpgradeOption {
  id?: string;
  label?: string;
  costs?: Array<{ cost?: number; unitId?: string }>;
  gains?: Array<{ name?: string; label?: string; type?: string; rating?: string | number }>;
}

interface ForgeArmyBook {
  uid?: string;
  name?: string;
  units?: ForgeBookUnit[];
  upgradePackages?: Array<{ sections?: Array<{ options?: ForgeUpgradeOption[] }> }>;
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
  size: number;
  quality: number;
  defense: number;
  maxWounds: number;
  /** Aproximado: no cuenta las mejoras que ya no existen en el libro. */
  cost: number;
  rules: string[];
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

export function fetchList(listId: string): Promise<ArmyForgeList> {
  return call<ArmyForgeList>({ action: "community-list", id: listId });
}

export function fetchArmyBooks(system: GameSystem): Promise<ArmyBookSummary[]> {
  return call<ArmyBookSummary[]>({ action: "army-books", slug: system.armyForgeSlug });
}

function fetchBook(uid: string, gameSystemId: number): Promise<ForgeArmyBook> {
  return call<ForgeArmyBook>({ action: "army-book", uid, gameSystem: String(gameSystemId) });
}

/**
 * Descarga la lista y los libros de ejercito que necesita, y devuelve las
 * unidades con nombre, estadisticas, coste y reglas ya resueltos.
 */
export async function importList(listId: string): Promise<ResolvedList> {
  const raw = await fetchList(listId);
  const list = raw.list ?? {};
  const units = list.units ?? [];

  const systemCode = raw.details?.gameSystem ?? list.gameSystem ?? raw.game_system ?? null;
  const armyForgeId = getGameSystem(systemCode)?.armyForgeId;

  const uids = [...new Set(units.map((unit) => unit.armyId).filter((uid): uid is string => Boolean(uid)))];
  const fallbackUid = raw.army_uid ?? raw.details?.armyId;
  if (!uids.length && fallbackUid) uids.push(fallbackUid);

  const books = new Map<string, ForgeArmyBook>();
  if (armyForgeId) {
    // Un libro que falle no debe tumbar la importacion entera: esas unidades
    // se guardan con los datos que traiga la propia lista.
    await Promise.all(
      uids.map(async (uid) => {
        try {
          books.set(uid, await fetchBook(uid, armyForgeId));
        } catch {
          // Sin libro, la unidad se resuelve con valores por defecto.
        }
      }),
    );
  }

  const resolved = units.map((unit, index) => resolveUnit(unit, books, index));
  const unresolvedUpgrades = resolved.reduce((sum, unit) => sum + unit.unresolvedUpgrades, 0);

  return {
    listId: raw.id ?? list.id ?? listId,
    name: list.name ?? "Lista importada",
    faction: raw.details?.armyFaction ?? raw.details?.armyName ?? null,
    gameSystem: systemCode,
    // El total lo manda Army Forge: es el que se guardo al crear la lista y el
    // unico que cuadra si el libro de ejercito ha cambiado desde entonces.
    points: raw.details?.listPoints ?? resolved.reduce((sum, unit) => sum + unit.cost, 0),
    modelCount: list.modelCount ?? resolved.reduce((sum, unit) => sum + unit.size, 0),
    units: resolved,
    unresolvedUpgrades,
    raw,
  };
}

function resolveUnit(unit: ForgeListUnit, books: Map<string, ForgeArmyBook>, index: number): ResolvedUnit {
  const book = unit.armyId ? books.get(unit.armyId) : undefined;
  const definition = book?.units?.find((candidate) => candidate.id === unit.id);
  const options = optionsById(book);

  const rules = (definition?.rules ?? []).map(ruleLabel).filter(Boolean);
  let cost = definition?.cost ?? 0;

  let unresolvedUpgrades = 0;

  for (const selected of unit.selectedUpgrades ?? []) {
    const option = selected.optionId ? options.get(selected.optionId) : undefined;
    if (!option) {
      unresolvedUpgrades += 1;
      continue;
    }
    cost += costFor(option, unit.id);
    for (const gain of option.gains ?? []) {
      // Las mejoras que dan reglas cuentan para la partida; las armas se quedan
      // en el JSON completo, que se guarda aparte.
      if (gain.type === "ArmyBookRule") rules.push(ruleLabel(gain));
    }
  }

  const size = definition?.size ?? 1;
  const tough = ratingOf((definition?.rules ?? []).find((rule) => rule.name?.toLowerCase() === "tough")?.rating) ?? 1;

  return {
    name: unit.customName || definition?.name || `Unidad ${index + 1}`,
    unitKey: unit.selectionId ?? unit.id ?? null,
    size,
    quality: definition?.quality ?? 4,
    defense: definition?.defense ?? 4,
    maxWounds: size * tough,
    cost,
    rules: [...new Set(rules.filter(Boolean))].slice(0, 20),
    unresolvedUpgrades,
    sortOrder: index,
  };
}

function optionsById(book: ForgeArmyBook | undefined): Map<string, ForgeUpgradeOption> {
  const map = new Map<string, ForgeUpgradeOption>();
  for (const pkg of book?.upgradePackages ?? []) {
    for (const section of pkg.sections ?? []) {
      for (const option of section.options ?? []) {
        if (option.id) map.set(option.id, option);
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
