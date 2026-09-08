import { ExecutionMethod } from "appwrite";
import { functions } from "../lib/appwrite";
import { env } from "../lib/env";
import { getGameSystem } from "../lib/gameSystems";
import { gameSystemOf, requiredBookUids, resolveList } from "../lib/armyForgeResolve";
import type { ArmyBookSummary, ArmyForgeList, ForgeArmyBook, ResolvedList } from "../lib/armyForgeResolve";
import type { GameSystem } from "../lib/gameSystems";

export { extractListId, listUrl, parseStoredList } from "../lib/armyForgeResolve";
export type { ArmyBookSummary, ArmyForgeList, ResolvedList, ResolvedUnit } from "../lib/armyForgeResolve";

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

export function fetchList(listId: string): Promise<ArmyForgeList> {
  return call<ArmyForgeList>({ action: "community-list", id: listId });
}

export function fetchArmyBooks(system: GameSystem): Promise<ArmyBookSummary[]> {
  return call<ArmyBookSummary[]>({ action: "army-books", slug: system.armyForgeSlug });
}

export function fetchBook(uid: string, gameSystemId: number): Promise<ForgeArmyBook> {
  return call<ForgeArmyBook>({ action: "army-book", uid, gameSystem: String(gameSystemId) });
}

/**
 * Descarga la lista y los libros de ejercito que necesita, y devuelve las
 * unidades ya resueltas.
 */
export async function importList(listId: string): Promise<ResolvedList> {
  const raw = await fetchList(listId);
  const armyForgeId = getGameSystem(gameSystemOf(raw))?.armyForgeId;

  const books = new Map<string, ForgeArmyBook>();
  if (armyForgeId) {
    // Un libro que falle no debe tumbar la importacion entera: esas unidades
    // se resuelven con lo que traiga la propia lista.
    await Promise.all(
      requiredBookUids(raw).map(async (uid) => {
        try {
          books.set(uid, await fetchBook(uid, armyForgeId));
        } catch {
          // Sin libro, la unidad cae a valores por defecto.
        }
      }),
    );
  }

  return resolveList(raw, books, listId);
}
