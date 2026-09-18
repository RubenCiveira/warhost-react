import { ID, Permission, Query, Role, storage, tables } from "../lib/appwrite";
import { TABLES, env } from "../lib/env";
import type { GameSystemId, Setting } from "../lib/gameSystems";
import type { Row } from "../lib/types";
import { parseSections } from "../lib/builder";
import type { UpgradeSection } from "../lib/builder";

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
  lore: string | null;
  loreSyncedAt: string | null;
  syncedAt: string | null;
  syncedVersion: string | null;
  /** Reglas que publica este libro; el glosario es comun y no lo dice. */
  ruleNames: string[];
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
  lore: string | null;
}

export interface UpgradePackageRow extends Row {
  bookKey: string;
  bookUid: string;
  gameSystem: GameSystemId;
  packageUid: string;
  sections: string;
}

export type ImageScope = "faction" | "unit";
export type CatalogImageType = "gallery" | "avatar" | "miniature";

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
  imageType?: CatalogImageType | null;
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

/**
 * Busca el libro propio por el uid que usa Army Forge, no por nuestra clave.
 * Hace falta para los ejercitos importados: no guardan la clave propia del
 * libro (eso solo lo hace el constructor), pero cada unidad de la lista
 * importada si trae el uid del libro de Army Forge del que salio.
 */
export async function getBookByUid(uid: string, gameSystem: GameSystemId): Promise<ArmyBook | null> {
  const result = await tables.listRows<ArmyBook>({
    databaseId: env.databaseId,
    tableId: TABLES.armyBooks,
    queries: [Query.equal("uid", uid), Query.equal("gameSystem", gameSystem), Query.limit(1)],
  });
  return result.rows[0] ?? null;
}

export async function listUnits(bookKey: string): Promise<ArmyUnit[]> {
  const result = await tables.listRows<ArmyUnit>({
    databaseId: env.databaseId,
    tableId: TABLES.armyUnits,
    queries: [Query.equal("bookKey", bookKey), Query.orderAsc("sortOrder"), Query.limit(200)],
  });
  return result.rows;
}

/**
 * Paquetes de mejora del libro, indexados por `${bookKey}:${packageUid}` para
 * cruzarlos con las unidades: el uid de un paquete solo es unico dentro de su
 * libro, y con varias facciones a la vez sus mapas se acaban juntando.
 */
export async function listUpgradePackages(bookKey: string): Promise<Map<string, UpgradeSection[]>> {
  const map = new Map<string, UpgradeSection[]>();
  let cursor: string | null = null;
  for (;;) {
    const queries = [Query.equal("bookKey", bookKey), Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page: { rows: UpgradePackageRow[] } = await tables.listRows<UpgradePackageRow>({
      databaseId: env.databaseId,
      tableId: TABLES.armyUpgradePackages,
      queries,
    });
    for (const row of page.rows) map.set(`${bookKey}:${row.packageUid}`, parseSections(row.sections));
    if (page.rows.length < 100) return map;
    cursor = page.rows[page.rows.length - 1].$id;
  }
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
  imageType?: CatalogImageType;
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
    permissions: [Permission.read(Role.any())],
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
      imageType: target.imageType ?? "gallery",
      isPrimary: false,
      uploadedBy: user.$id,
      uploadedByName: user.name || user.email,
      uploadedAt: new Date().toISOString(),
    },
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
      .filter((candidate) => (candidate.imageType ?? "gallery") === (image.imageType ?? "gallery"))
      .filter((candidate) => candidate.isPrimary && candidate.$id !== image.$id)
      .map((candidate) =>
        tables.updateRow({
          databaseId: env.databaseId,
          tableId: TABLES.catalogImages,
          rowId: candidate.$id,
          data: { isPrimary: false },
        }),
      ),
  );
  await tables.updateRow({
    databaseId: env.databaseId,
    tableId: TABLES.catalogImages,
    rowId: image.$id,
    data: { isPrimary: true },
  });
}

export async function updateUnitLore(unit: ArmyUnit, lore: string): Promise<ArmyUnit> {
  return tables.updateRow<ArmyUnit>({
    databaseId: env.databaseId,
    tableId: TABLES.armyUnits,
    rowId: unit.$id,
    data: { lore: lore.trim() || null },
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

export function pickImageByType(images: CatalogImage[] | undefined, imageType: CatalogImageType): CatalogImage | null {
  return pickCover(images?.filter((image) => (image.imageType ?? "gallery") === imageType));
}

export interface CatalogRule extends Row {
  name: string;
  gameSystem: GameSystemId;
  setting: Setting;
  description: string;
  hasRating: boolean;
  /**
   * Marcado en las reglas del reglamento —AP, Ambush, Deadly— y nulo en las que
   * publica la faccion. Es lo que separa "las reglas de esta faccion" del resto.
   */
  coreType: number | null;
  /** 1 en reglas de unidad, 2 en reglas de arma. */
  targetType: number | null;
  sourceBook: string | null;
}

/**
 * Glosario de reglas de un modo de juego, indexado por nombre.
 *
 * Es comun a todos los libros a proposito: cada uno solo describe las suyas, y
 * juntandolos se cubre la gran mayoria de las que usan las unidades.
 */
export async function listRuleGlossary(gameSystem: GameSystemId): Promise<Map<string, CatalogRule>> {
  const glosario = new Map<string, CatalogRule>();
  let cursor: string | null = null;
  for (;;) {
    const queries = [Query.equal("gameSystem", gameSystem), Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page: { rows: CatalogRule[] } = await tables.listRows<CatalogRule>({
      databaseId: env.databaseId,
      tableId: TABLES.armyRules,
      queries,
    });
    for (const row of page.rows) glosario.set(row.name.toLowerCase(), row);
    if (page.rows.length < 100) return glosario;
    cursor = page.rows[page.rows.length - 1].$id;
  }
}
