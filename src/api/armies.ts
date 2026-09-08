import { ID, Permission, Query, Role, storage, tables } from "../lib/appwrite";
import { TABLES, env } from "../lib/env";
import type { GameSystemId, Setting } from "../lib/gameSystems";
import type { Army } from "../lib/types";

export interface ArmyDraft {
  name: string;
  setting: Setting;
  gameSystem: GameSystemId;
  faction?: string | null;
  points?: number;
  modelCount?: number;
  listId?: string | null;
  sourceUrl?: string | null;
  listJson?: string | null;
  notes?: string | null;
  shared?: boolean;
  coverId?: string | null;
  imageIds?: string[];
}

export async function listArmies(userId: string, gameSystem?: GameSystemId): Promise<Army[]> {
  const queries = [Query.equal("userId", userId), Query.orderDesc("$updatedAt"), Query.limit(100)];
  if (gameSystem) queries.push(Query.equal("gameSystem", gameSystem));

  const result = await tables.listRows<Army>({
    databaseId: env.databaseId,
    tableId: TABLES.armies,
    queries,
  });
  return result.rows;
}

export async function getArmy(armyId: string): Promise<Army> {
  return tables.getRow<Army>({ databaseId: env.databaseId, tableId: TABLES.armies, rowId: armyId });
}

export async function createArmy(userId: string, draft: ArmyDraft): Promise<Army> {
  return tables.createRow<Army>({
    databaseId: env.databaseId,
    tableId: TABLES.armies,
    rowId: ID.unique(),
    data: {
      userId,
      name: draft.name.trim(),
      setting: draft.setting,
      gameSystem: draft.gameSystem,
      faction: draft.faction?.trim() || null,
      points: draft.points ?? 0,
      modelCount: draft.modelCount ?? 0,
      listId: draft.listId ?? null,
      sourceUrl: draft.sourceUrl ?? null,
      listJson: draft.listJson ?? null,
      coverId: draft.coverId ?? null,
      imageIds: draft.imageIds ?? [],
      notes: draft.notes?.trim() || null,
      shared: draft.shared ?? false,
      updatedAt: new Date().toISOString(),
    },
    // El dueno manda. Si el ejercito es publico, cualquier aceptado puede leerlo.
    permissions: [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
      ...(draft.shared ? [Permission.read(Role.label("aceptado"))] : []),
    ],
  });
}

export async function updateArmy(armyId: string, draft: Partial<ArmyDraft>): Promise<Army> {
  return tables.updateRow<Army>({
    databaseId: env.databaseId,
    tableId: TABLES.armies,
    rowId: armyId,
    data: { ...normalize(draft), updatedAt: new Date().toISOString() },
  });
}

export async function deleteArmy(army: Army): Promise<void> {
  await Promise.all(army.imageIds.map((fileId) => deleteImage(fileId).catch(() => undefined)));
  await tables.deleteRow({ databaseId: env.databaseId, tableId: TABLES.armies, rowId: army.$id });
}

export async function uploadImage(userId: string, file: File): Promise<string> {
  const created = await storage.createFile({
    bucketId: env.bucketId,
    fileId: ID.unique(),
    file,
    permissions: [
      Permission.read(Role.label("aceptado")),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ],
  });
  return created.$id;
}

export async function deleteImage(fileId: string): Promise<void> {
  await storage.deleteFile({ bucketId: env.bucketId, fileId });
}

export function imageUrl(fileId: string): string {
  return storage.getFileView({ bucketId: env.bucketId, fileId });
}

function normalize<T extends Partial<ArmyDraft>>(draft: T): Record<string, unknown> {
  const data: Record<string, unknown> = { ...draft };
  if (typeof draft.name === "string") data.name = draft.name.trim();
  if (draft.faction !== undefined) data.faction = draft.faction?.trim() || null;
  if (draft.notes !== undefined) data.notes = draft.notes?.trim() || null;
  return data;
}
