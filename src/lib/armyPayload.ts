/**
 * Como se guarda un ejercito compuesto desde el catalogo.
 *
 * Vive aparte porque hay dos caminos que llevan aqui —el constructor y el
 * asistente de anadir unidad— y si cada uno montara su propio JSON acabarian
 * divergiendo en silencio.
 */
import { buildArmy, serializeEntries } from "./builder";
import type { BuilderEntry, UpgradeSection } from "./builder";
import { getGameSystem } from "./gameSystems";
import type { GameSystemId, Setting } from "./gameSystems";
import type { HeroClass } from "./types";

export interface LibroDeOrigen {
  $id: string;
  name: string;
  setting: Setting;
  gameSystem: GameSystemId;
  factionName: string | null;
  versionString: string | null;
}

export interface SourceBook {
  bookKey: string;
  bookVersion: string | null;
  factionName: string | null;
}

export interface ArmyPayload {
  name: string;
  setting: Setting;
  gameSystem: GameSystemId;
  faction: string | null;
  /** Facciones con menos peso en puntos que la principal (o todas, en quest). */
  alliedFactions: string[];
  points: number;
  modelCount: number;
  listJson: string;
}

/**
 * Los libros implicados en una lista guardada. Antes de poder mezclar
 * facciones se guardaba un `bookKey` suelto en `source`; ahora se guarda un
 * array `books`, uno por faccion presente, pero las listas de antes se siguen
 * leyendo igual, sin tener que migrar nada.
 */
export function sourceBooks(listJson: string | null | undefined): SourceBook[] {
  if (!listJson) return [];
  try {
    const parsed = JSON.parse(listJson) as {
      source?: { bookKey?: string; bookVersion?: string | null; books?: SourceBook[] };
    };
    if (Array.isArray(parsed.source?.books)) return parsed.source.books;
    const bookKey = parsed.source?.bookKey;
    if (!bookKey) return [];
    return [{ bookKey, bookVersion: parsed.source?.bookVersion ?? null, factionName: null }];
  } catch {
    return [];
  }
}

function nombreFaccion(book: LibroDeOrigen): string {
  return book.factionName ?? book.name;
}

function esQuest(gameSystem: GameSystemId | undefined): boolean {
  const id = getGameSystem(gameSystem)?.id;
  return id === "gfsq" || id === "aofq";
}

export function composeArmyPayload(
  entries: BuilderEntry[],
  packages: Map<string, UpgradeSection[]>,
  books: LibroDeOrigen[],
  name: string,
  listId = "",
  heroClasses: HeroClass[] = [],
): ArmyPayload {
  const principal = books[0];
  const built = buildArmy(entries, packages, heroClasses, principal?.gameSystem);
  const nombre = name.trim() || principal?.name || "";

  // Puntos por libro, para saber cual pesa mas: los libros que se quedaron
  // sin ninguna unidad (se le quitaron todas) no cuentan para nada de esto.
  const porLibro = new Map<string, { book: LibroDeOrigen; puntos: number }>();
  for (const unit of built.units) {
    if (!unit.bookKey) continue;
    const book = books.find((candidate) => candidate.$id === unit.bookKey);
    if (!book) continue;
    const actual = porLibro.get(unit.bookKey);
    if (actual) actual.puntos += unit.cost;
    else porLibro.set(unit.bookKey, { book, puntos: unit.cost });
  }
  const grupos = [...porLibro.values()].sort((a, b) => b.puntos - a.puntos);

  // En quest no hay principal: la mezcla es narrativa, no una jerarquia por
  // puntos, asi que se listan todas las facciones igual en `alliedFactions`.
  const quest = esQuest(principal?.gameSystem);
  const faction = quest ? null : (grupos[0] ? nombreFaccion(grupos[0].book) : null);
  const alliedFactions = quest
    ? grupos.map((grupo) => nombreFaccion(grupo.book))
    : grupos.slice(1).map((grupo) => nombreFaccion(grupo.book));

  const listJson = JSON.stringify({
    listId,
    name: nombre,
    faction,
    gameSystem: principal?.gameSystem,
    points: built.points,
    modelCount: built.modelCount,
    // Las unidades resueltas son para consultar y para jugar; las elecciones,
    // lo unico que permite volver a editarlas.
    units: built.units,
    entries: serializeEntries(entries),
    unresolvedUpgrades: 0,
    // De donde salio cada faccion presente y con que version de su libro,
    // para poder avisar cuando el catalogo se actualice y quede desfasada.
    source: {
      builder: "warhost",
      books: grupos.map(({ book }) => ({
        bookKey: book.$id,
        bookVersion: book.versionString,
        factionName: nombreFaccion(book),
      })),
    },
  });

  return {
    name: nombre,
    setting: principal!.setting,
    gameSystem: principal!.gameSystem,
    faction,
    alliedFactions,
    points: built.points,
    modelCount: built.modelCount,
    listJson,
  };
}
