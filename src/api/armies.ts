import { ID, Permission, Query, Role, storage, tables } from "../lib/appwrite";
import { TABLES, env } from "../lib/env";
import type { GameSystemId, Setting } from "../lib/gameSystems";
import type { Army } from "../lib/types";

export interface ArmyDraft {
  name: string;
  setting: Setting;
  gameSystem: GameSystemId;
  faction?: string | null;
  alliedFactions?: string[];
  points?: number;
  pointsLimit?: number;
  pointsMargin?: number;
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
  // Solo los activos: los borradores y las versiones viejas no son ejercitos
  // distintos, son estados del mismo.
  const queries = [
    Query.equal("userId", userId),
    Query.equal("status", "active"),
    Query.orderDesc("$updatedAt"),
    Query.limit(100),
  ];
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
  // El id de la fila estrena la linea de versiones: el primer activo es su
  // propio origen.
  const rowId = ID.unique();
  return tables.createRow<Army>({
    databaseId: env.databaseId,
    tableId: TABLES.armies,
    rowId,
    data: {
      userId,
      lineageId: rowId,
      status: "active",
      activeKey: rowId,
      draftKey: null,
      version: 1,
      basedOn: null,
      publishedAt: new Date().toISOString(),
      obsoletedAt: null,
      name: draft.name.trim(),
      setting: draft.setting,
      gameSystem: draft.gameSystem,
      faction: draft.faction?.trim() || null,
      alliedFactions: draft.alliedFactions ?? [],
      points: draft.points ?? 0,
      pointsLimit: draft.pointsLimit ?? 0,
      pointsMargin: draft.pointsMargin ?? 5,
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
    permissions: ownerPermissions(userId, draft.shared ?? false),
  });
}

/** El dueno manda. Si el ejercito es publico, cualquier aceptado puede leerlo. */
function ownerPermissions(userId: string, shared: boolean): string[] {
  return [
    Permission.read(Role.user(userId)),
    Permission.update(Role.user(userId)),
    Permission.delete(Role.user(userId)),
    ...(shared ? [Permission.read(Role.label("aceptado"))] : []),
  ];
}

export async function updateArmy(armyId: string, draft: Partial<ArmyDraft>): Promise<Army> {
  return tables.updateRow<Army>({
    databaseId: env.databaseId,
    tableId: TABLES.armies,
    rowId: armyId,
    data: { ...normalize(draft), updatedAt: new Date().toISOString() },
  });
}

/**
 * Borra el ejercito entero: la version publicada, su borrador y todo el
 * historial. Borrar solo la fila activa dejaria las demas huerfanas, y el
 * borrador seguiria apareciendo al abrir esa linea.
 */
export async function deleteArmy(army: Army): Promise<void> {
  const lineageId = army.lineageId ?? army.$id;
  const versiones = await listLineage(lineageId);
  const filas = versiones.length > 0 ? versiones : [army];

  // Las imagenes se comparten entre versiones, asi que se borra cada fichero
  // una sola vez.
  const ficheros = new Set(filas.flatMap((fila) => fila.imageIds ?? []));
  await Promise.all([...ficheros].map((fileId) => deleteImage(fileId).catch(() => undefined)));
  await Promise.all(
    filas.map((fila) =>
      tables.deleteRow({ databaseId: env.databaseId, tableId: TABLES.armies, rowId: fila.$id }),
    ),
  );
}

/** Todas las versiones de un ejercito: activa, borrador y archivadas. */
export async function listLineage(lineageId: string): Promise<Army[]> {
  const result = await tables.listRows<Army>({
    databaseId: env.databaseId,
    tableId: TABLES.armies,
    queries: [Query.equal("lineageId", lineageId), Query.orderDesc("version"), Query.limit(100)],
  });
  return result.rows;
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

/* Borradores ------------------------------------------------------------------
 *
 * Un ejercito no se edita en sitio: se edita un **borrador**, que se guarda solo
 * a cada cambio, y al aceptarlo pasa a ser el activo y el anterior queda como
 * obsoleto. Asi nunca hay un ejercito a medias, y se puede volver atras.
 *
 * Que solo haya un activo y un borrador por linea no lo vigila este codigo: lo
 * garantizan los indices unicos de `activeKey` y `draftKey`. Aqui solo se
 * respeta el contrato.
 */

/** Cuantas versiones obsoletas se conservan de cada ejercito. */
const HISTORIAL = 5;

export async function getDraftFor(lineageId: string): Promise<Army | null> {
  const result = await tables.listRows<Army>({
    databaseId: env.databaseId,
    tableId: TABLES.armies,
    queries: [Query.equal("draftKey", lineageId), Query.limit(1)],
  });
  return result.rows[0] ?? null;
}

/**
 * Devuelve el borrador en curso, o crea uno copiando el activo. Es idempotente:
 * volver a entrar a editar no crea un segundo borrador.
 */
export async function startDraft(active: Army, userId: string): Promise<Army> {
  const lineageId = active.lineageId ?? active.$id;
  const existing = await getDraftFor(lineageId);
  if (existing) return existing;

  const { $id, $sequence, $createdAt, $updatedAt, $permissions, $databaseId, $tableId, ...copia } = active;
  void $id, $sequence, $createdAt, $updatedAt, $permissions, $databaseId, $tableId;

  return tables.createRow<Army>({
    databaseId: env.databaseId,
    tableId: TABLES.armies,
    rowId: ID.unique(),
    data: {
      ...copia,
      lineageId,
      status: "draft",
      activeKey: null,
      draftKey: lineageId,
      version: (active.version ?? 1) + 1,
      basedOn: active.$id,
      publishedAt: null,
      obsoletedAt: null,
      updatedAt: new Date().toISOString(),
    },
    permissions: ownerPermissions(userId, Boolean(active.shared)),
  });
}

export async function saveDraft(draftId: string, draft: Partial<ArmyDraft>): Promise<Army> {
  return updateArmy(draftId, draft);
}

/**
 * Acepta el borrador: pasa a activo y el anterior queda obsoleto, **en una sola
 * transaccion**. Sin ella hay un instante en el que el ejercito no tiene ningun
 * activo, y si la segunda escritura falla se queda asi.
 */
export async function publishDraft(draft: Army): Promise<Army> {
  const lineageId = draft.lineageId ?? draft.$id;
  const now = new Date().toISOString();
  const transaction = await tables.createTransaction({});

  try {
    const active = await getActiveFor(lineageId);
    if (active && active.$id !== draft.$id) {
      // Primero se libera la ranura; ocuparla antes de soltarla choca con el
      // indice unico aunque sea dentro de la transaccion.
      await tables.updateRow({
        databaseId: env.databaseId,
        tableId: TABLES.armies,
        rowId: active.$id,
        data: { status: "obsolete", activeKey: null, draftKey: null, obsoletedAt: now },
        transactionId: transaction.$id,
      });
    }
    await tables.updateRow({
      databaseId: env.databaseId,
      tableId: TABLES.armies,
      rowId: draft.$id,
      data: { status: "active", activeKey: lineageId, draftKey: null, publishedAt: now },
      transactionId: transaction.$id,
    });
    await tables.updateTransaction({ transactionId: transaction.$id, commit: true });
  } catch (err) {
    await tables.updateTransaction({ transactionId: transaction.$id, rollback: true }).catch(() => undefined);
    throw err;
  }

  await prunerHistorial(lineageId);
  return getArmy(draft.$id);
}

export async function discardDraft(draft: Army): Promise<void> {
  await tables.deleteRow({ databaseId: env.databaseId, tableId: TABLES.armies, rowId: draft.$id });
}

export async function getActiveFor(lineageId: string): Promise<Army | null> {
  const result = await tables.listRows<Army>({
    databaseId: env.databaseId,
    tableId: TABLES.armies,
    queries: [Query.equal("activeKey", lineageId), Query.limit(1)],
  });
  return result.rows[0] ?? null;
}

export async function listHistory(lineageId: string): Promise<Army[]> {
  const result = await tables.listRows<Army>({
    databaseId: env.databaseId,
    tableId: TABLES.armies,
    queries: [
      Query.equal("lineageId", lineageId),
      Query.equal("status", "obsolete"),
      Query.orderDesc("version"),
      Query.limit(HISTORIAL + 10),
    ],
  });
  return result.rows;
}

/** Conserva las ultimas HISTORIAL versiones y borra las mas viejas. */
async function prunerHistorial(lineageId: string): Promise<void> {
  const historia = await listHistory(lineageId);
  await Promise.all(
    historia.slice(HISTORIAL).map((row) =>
      tables.deleteRow({ databaseId: env.databaseId, tableId: TABLES.armies, rowId: row.$id }).catch(() => undefined),
    ),
  );
}

/**
 * Resuelve un ejercito desde una URL. Al publicar cambia la fila activa, asi
 * que un enlace guardado apuntaria a una version archivada: se acepta tanto el
 * id de una fila cualquiera de la linea como el propio `lineageId`, y siempre
 * se devuelve la version activa con su borrador si lo hay.
 */
export async function resolveArmy(idOrLineage: string): Promise<{ active: Army; draft: Army | null }> {
  let row: Army | null = null;
  try {
    row = await getArmy(idOrLineage);
  } catch {
    // La fila pudo caer del historial al podarlo; queda intentarlo como linea.
  }

  const lineageId = row?.lineageId ?? idOrLineage;
  const active = row?.status === "active" ? row : await getActiveFor(lineageId);
  if (!active) throw new Error("Este ejercito ya no existe.");

  return { active, draft: await getDraftFor(active.lineageId ?? active.$id) };
}
