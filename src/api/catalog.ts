import { ID, Permission, Query, Role, storage, tables } from "../lib/appwrite";
import { TABLES, env } from "../lib/env";
import type { GameSystemId, Setting } from "../lib/gameSystems";
import type { Row } from "../lib/types";

const ACCEPTED = Role.label("aceptado");

export interface ArmyBook extends Row {
  uid: string;
  gameSystem: GameSystemId;
  setting: Setting;
  name: string;
  factionName: string | null;
  factionId: string | null;
  official: boolean;
  versionString: string | null;
  unitCount: number;
  hint: string | null;
  coverImagePath: string | null;
  bannerImagePath: string | null;
  popularity: number;
  spells: string | null;
  syncedAt: string | null;
  syncedVersion: string | null;
}

export interface ArmyUnit extends Row {
  bookKey: string;
  bookUid: string;
  gameSystem: GameSystemId;
  unitId: string;
  name: string;
  size: number;
  quality: number;
  defense: number;
  cost: number;
  rules: string[];
  weapons: string | null;
  items: string | null;
  upgradePackageUids: string[];
  sortOrder: number;
}

export type ImageScope = "faction" | "unit";

export interface CatalogImage extends Row {
  targetKey: string;
  scope: ImageScope;
  bookKey: string;
  bookUid: string;
  bookName: string | null;
  gameSystem: GameSystemId;
  setting: Setting;
  unitId: string | null;
  unitName: string | null;
  fileId: string;
  caption: string | null;
  isPrimary: boolean;
  uploadedBy: string;
  uploadedByName: string | null;
  uploadedAt: string | null;
}

/** Clave de agrupacion de imagenes. Una faccion es su libro; una unidad, el par. */
export function targetKeyFor(bookKey: string, unitId?: string | null): string {
  return unitId ? `unit:${bookKey}:${unitId}` : `faction:${bookKey}`;
}

export async function listBooks(gameSystem: GameSystemId): Promise<ArmyBook[]> {
  const result = await tables.listRows<ArmyBook>({
    databaseId: env.databaseId,
    tableId: TABLES.armyBooks,
    queries: [Query.equal("gameSystem", gameSystem), Query.orderAsc("name"), Query.limit(200)],
  });
  return result.rows;
}

export async function getBook(bookKey: string): Promise<ArmyBook> {
  return tables.getRow<ArmyBook>({
    databaseId: env.databaseId,
    tableId: TABLES.armyBooks,
    rowId: bookKey,
  });
}

export async function listUnits(bookKey: string): Promise<ArmyUnit[]> {
  const result = await tables.listRows<ArmyUnit>({
    databaseId: env.databaseId,
    tableId: TABLES.armyUnits,
    queries: [Query.equal("bookKey", bookKey), Query.orderAsc("sortOrder"), Query.limit(200)],
  });
  return result.rows;
}

/** Todas las imagenes de un libro: las de la faccion y las de sus unidades. */
export async function listBookImages(bookKey: string): Promise<CatalogImage[]> {
  const result = await tables.listRows<CatalogImage>({
    databaseId: env.databaseId,
    tableId: TABLES.catalogImages,
    queries: [Query.equal("bookKey", bookKey), Query.orderDesc("isPrimary"), Query.limit(500)],
  });
  return result.rows;
}

export async function listFactionImages(gameSystem: GameSystemId): Promise<CatalogImage[]> {
  const result = await tables.listRows<CatalogImage>({
    databaseId: env.databaseId,
    tableId: TABLES.catalogImages,
    queries: [
      Query.equal("scope", "faction"),
      Query.equal("gameSystem", gameSystem),
      Query.orderDesc("isPrimary"),
      Query.limit(500),
    ],
  });
  return result.rows;
}

export interface UploadTarget {
  scope: ImageScope;
  book: ArmyBook;
  unit?: ArmyUnit;
}

export async function uploadCatalogImage(
  file: File,
  target: UploadTarget,
  user: { $id: string; name: string; email: string },
  caption?: string,
): Promise<CatalogImage> {
  const fileId = ID.unique();
  await storage.createFile({
    bucketId: env.catalogBucketId,
    fileId,
    file,
    // La imagen la ve cualquier aceptado, pero solo quien la subio puede
    // reemplazarla o borrarla.
    permissions: [
      Permission.read(ACCEPTED),
      Permission.update(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id)),
    ],
  });

  return tables.createRow<CatalogImage>({
    databaseId: env.databaseId,
    tableId: TABLES.catalogImages,
    rowId: ID.unique(),
    data: {
      targetKey: targetKeyFor(target.book.$id, target.unit?.unitId),
      scope: target.scope,
      bookKey: target.book.$id,
      bookUid: target.book.uid,
      bookName: target.book.name,
      gameSystem: target.book.gameSystem,
      setting: target.book.setting,
      unitId: target.unit?.unitId ?? null,
      unitName: target.unit?.name ?? null,
      fileId,
      caption: caption?.trim() || null,
      isPrimary: false,
      uploadedBy: user.$id,
      uploadedByName: user.name || user.email,
      uploadedAt: new Date().toISOString(),
    },
    permissions: [
      Permission.read(ACCEPTED),
      Permission.update(Role.user(user.$id)),
      Permission.delete(Role.user(user.$id)),
    ],
  });
}

export async function deleteCatalogImage(image: CatalogImage): Promise<void> {
  // Primero la fila: si el fichero ya no estuviera, la fila quedaria colgada
  // apuntando a nada, que es peor que un fichero suelto en el bucket.
  await tables.deleteRow({
    databaseId: env.databaseId,
    tableId: TABLES.catalogImages,
    rowId: image.$id,
  });
  await storage.deleteFile({ bucketId: env.catalogBucketId, fileId: image.fileId }).catch(() => undefined);
}

/** Marca una imagen como principal y desmarca las demas del mismo objetivo. */
export async function setPrimaryImage(image: CatalogImage, siblings: CatalogImage[]): Promise<void> {
  await Promise.all(
    siblings
      .filter((candidate) => candidate.isPrimary && candidate.$id !== image.$id)
      .map((candidate) =>
        tables
          .updateRow({
            databaseId: env.databaseId,
            tableId: TABLES.catalogImages,
            rowId: candidate.$id,
            data: { isPrimary: false },
          })
          // Solo quien subio una imagen puede editarla: si es de otro, se queda
          // como esta y se acepta tener dos marcadas.
          .catch(() => undefined),
      ),
  );
  await tables.updateRow({
    databaseId: env.databaseId,
    tableId: TABLES.catalogImages,
    rowId: image.$id,
    data: { isPrimary: true },
  });
}

export function catalogImageUrl(fileId: string): string {
  return storage.getFileView({ bucketId: env.catalogBucketId, fileId });
}

/** Agrupa por objetivo, para pintar cada faccion o unidad con lo suyo. */
export function groupImages(images: CatalogImage[]): Map<string, CatalogImage[]> {
  const map = new Map<string, CatalogImage[]>();
  for (const image of images) {
    const list = map.get(image.targetKey);
    if (list) list.push(image);
    else map.set(image.targetKey, [image]);
  }
  return map;
}

/** La principal si la hay, si no la primera subida. */
export function pickCover(images: CatalogImage[] | undefined): CatalogImage | null {
  if (!images?.length) return null;
  return images.find((image) => image.isPrimary) ?? images[0];
}
