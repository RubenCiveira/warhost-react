import { ExecutionMethod } from "appwrite";
import { Query, functions, tables } from "../lib/appwrite";
import { TABLES, env } from "../lib/env";
import type { Row } from "../lib/types";

export interface MiniatureProduct extends Row {
  manufacturer: string;
  name: string;
  faction: string | null;
  category: string | null;
  gameSystems: string[];
  settings: string[];
  imageUrl: string;
  url: string | null;
}

/**
 * Los `gameSystems` del catalogo de WarHub. Es una lista cerrada de la
 * fuente (63 en la ultima sincronizacion) y Appwrite no tiene forma de
 * consultar valores distintos de una columna, asi que va a mano; si
 * `sync_miniature_catalog` empieza a traer sistemas nuevos, se anaden aqui.
 */
export const WARHUB_GAME_SYSTEMS = [
  "A Song of Ice and Fire", "Achtung Panzer!", "Adeptus Titanicus", "Aeronautica Imperialis",
  "Age of Sigmar", "Aristeia!", "Armada", "Beyond the Gates of Antares", "Black Powder",
  "Black Seas", "Blood Bowl", "Blood Red Skies", "Bolt Action", "Conquest", "Cruel Seas",
  "Deadzone", "DreadBall", "Dungeon Saga", "Epic Black Powder", "Epic Encounters",
  "Epic Hail Caesar", "Epic Pike & Shotte", "Epic Warpath", "Firefight", "Frostgrave",
  "Godtear", "Guild Ball", "Hail Caesar", "Halo: Flashpoint", "Hellboy: The Board Game",
  "Horus Heresy", "Infinity", "Judge Dredd", "Kill Team", "Kings of War", "Konflikt '47",
  "Legions Imperialis", "Malifaux", "Marvel Crisis Protocol", "Middle-earth", "Necromunda",
  "Oathmark: Battles of the Lost Age", "Other Games", "OverDrive", "Pike & Shotte", "SPQR",
  "Star Saga", "Star Wars Armada", "Star Wars Legion", "Star Wars Shatterpoint",
  "Star Wars X-Wing", "Stargrave", "The Old World", "The Other Side",
  "The Walking Dead: All Out War", "Victory at Sea", "Warcrow", "Warhammer 40,000",
  "Warhammer Fantasy Battle", "Warhammer Underworlds", "Warlords of Erehwon", "Warmachine",
  "Warpath",
] as const;

export async function searchMiniatures({
  gameSystem,
  query,
  limit = 60,
}: {
  gameSystem?: string;
  query?: string;
  limit?: number;
}): Promise<MiniatureProduct[]> {
  const queries = [Query.limit(limit), Query.orderAsc("name")];
  if (gameSystem) queries.push(Query.contains("gameSystems", [gameSystem]));
  if (query?.trim()) queries.push(Query.search("name", query.trim()));
  const result = await tables.listRows<MiniatureProduct>({
    databaseId: env.databaseId,
    tableId: TABLES.miniatureCatalog,
    queries,
  });
  return result.rows;
}

interface ProxyImageResponse {
  ok: boolean;
  contentType?: string;
  base64?: string;
  reason?: string;
}

/** Descarga la foto de un producto a traves del proxy y la deja como File. */
export async function fetchMiniatureImage(imageUrl: string): Promise<File> {
  // POST con el body en JSON: en esta version de Appwrite un GET con la url
  // en la query no le llega a `req.query` dentro de la funcion.
  const execution = await functions.createExecution({
    functionId: env.miniatureProxyFunctionId,
    body: JSON.stringify({ url: imageUrl }),
    method: ExecutionMethod.POST,
    async: false,
  });

  let payload: ProxyImageResponse;
  try {
    payload = JSON.parse(execution.responseBody) as ProxyImageResponse;
  } catch {
    throw new Error("El proxy de miniaturas devolvio una respuesta ilegible.");
  }
  if (!payload.ok || !payload.base64 || !payload.contentType) {
    throw new Error(payload.reason || "No se pudo descargar la miniatura.");
  }

  const binary = atob(payload.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const name = imageUrl.split("/").pop()?.split("?")[0] || "miniatura.jpg";
  return new File([bytes], name, { type: payload.contentType });
}
