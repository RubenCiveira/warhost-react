import { ExecutionMethod } from "appwrite";
import { functions } from "../lib/appwrite";
import { env } from "../lib/env";
import type { GameSystem } from "../lib/gameSystems";

/** Respuesta cruda del proxy: `data` es lo que devuelve Army Forge tal cual. */
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

/** Forma minima de una lista de Army Forge; solo tipamos lo que usamos. */
export interface ArmyForgeUnit {
  id?: string;
  name?: string;
  size?: number;
  quality?: number | string;
  defense?: number | string;
  cost?: number;
  rules?: Array<{ name?: string; rating?: string | number }>;
  specialRules?: Array<{ name?: string; rating?: string | number }>;
  loadout?: Array<{ name?: string }>;
}

export interface ArmyForgeList {
  id?: string;
  name?: string;
  gameSystem?: string | number;
  points?: number;
  pointsLimit?: number;
  units?: ArmyForgeUnit[];
  [key: string]: unknown;
}

export interface ArmyBookSummary {
  uid: string;
  name: string;
  factionName?: string;
  official?: boolean;
}

/** Acepta un id pelado o cualquier URL de Army Forge que lo contenga. */
export function extractListId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z0-9_-]{4,64}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.searchParams.get("id") ?? url.pathname.split("/").filter(Boolean).pop() ?? null;
  } catch {
    return null;
  }
}

export function fetchList(listId: string): Promise<ArmyForgeList> {
  return call<ArmyForgeList>({ action: "list", id: listId });
}

export function fetchArmyBooks(system: GameSystem): Promise<ArmyBookSummary[]> {
  return call<ArmyBookSummary[]>({ action: "army-books", slug: system.armyForgeSlug });
}

export function fetchArmyBook(uid: string, system: GameSystem): Promise<unknown> {
  return call<unknown>({ action: "army-book", uid, gameSystem: String(system.armyForgeId) });
}

export function listUrl(listId: string): string {
  return `https://army-forge.onepagerules.com/share?id=${encodeURIComponent(listId)}`;
}

function ratingOf(value: number | string | undefined): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const digits = value.match(/\d+/);
    if (digits) return Number(digits[0]);
  }
  return undefined;
}

/** Reduce una lista de Army Forge a las unidades que la vista de partida necesita. */
export function summarizeUnits(list: ArmyForgeList) {
  const units = Array.isArray(list.units) ? list.units : [];
  return units.map((unit, index) => {
    const rules = [...(unit.rules ?? []), ...(unit.specialRules ?? [])]
      .map((rule) => (rule.rating ? `${rule.name}(${rule.rating})` : rule.name))
      .filter((name): name is string => Boolean(name));

    const tough = [...(unit.rules ?? []), ...(unit.specialRules ?? [])].find(
      (rule) => rule.name?.toLowerCase() === "tough",
    );
    const size = unit.size ?? 1;
    const toughValue = ratingOf(tough?.rating) ?? 1;

    return {
      name: unit.name ?? `Unidad ${index + 1}`,
      unitKey: unit.id ?? null,
      size,
      quality: ratingOf(unit.quality) ?? 4,
      defense: ratingOf(unit.defense) ?? 4,
      maxWounds: size * toughValue,
      rules: rules.slice(0, 20),
      sortOrder: index,
    };
  });
}

export function totalPoints(list: ArmyForgeList): number {
  if (typeof list.points === "number") return list.points;
  const units = Array.isArray(list.units) ? list.units : [];
  return units.reduce((sum, unit) => sum + (unit.cost ?? 0), 0);
}

export function modelCount(list: ArmyForgeList): number {
  const units = Array.isArray(list.units) ? list.units : [];
  return units.reduce((sum, unit) => sum + (unit.size ?? 1), 0);
}
