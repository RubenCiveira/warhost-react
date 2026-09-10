/**
 * Como se guarda un ejercito compuesto desde el catalogo.
 *
 * Vive aparte porque hay dos caminos que llevan aqui —el constructor y el
 * asistente de anadir unidad— y si cada uno montara su propio JSON acabarian
 * divergiendo en silencio.
 */
import { buildArmy, serializeEntries } from "./builder";
import type { BuilderEntry, UpgradeSection } from "./builder";
import type { GameSystemId, Setting } from "./gameSystems";

export interface LibroDeOrigen {
  $id: string;
  name: string;
  setting: Setting;
  gameSystem: GameSystemId;
  factionName: string | null;
  versionString: string | null;
}

export interface ArmyPayload {
  name: string;
  setting: Setting;
  gameSystem: GameSystemId;
  faction: string;
  points: number;
  modelCount: number;
  listJson: string;
}

export function composeArmyPayload(
  entries: BuilderEntry[],
  packages: Map<string, UpgradeSection[]>,
  book: LibroDeOrigen,
  name: string,
  listId = "",
): ArmyPayload {
  const built = buildArmy(entries, packages);
  const nombre = name.trim() || book.name;
  const faccion = book.factionName ?? book.name;

  const listJson = JSON.stringify({
    listId,
    name: nombre,
    faction: faccion,
    gameSystem: book.gameSystem,
    points: built.points,
    modelCount: built.modelCount,
    // Las unidades resueltas son para consultar y para jugar; las elecciones,
    // lo unico que permite volver a editarlas.
    units: built.units,
    entries: serializeEntries(entries),
    unresolvedUpgrades: 0,
    // De donde salio y con que version del libro, para poder avisar cuando el
    // catalogo se actualice y la lista quede desfasada.
    source: { builder: "warhost", bookKey: book.$id, bookVersion: book.versionString },
  });

  return {
    name: nombre,
    setting: book.setting,
    gameSystem: book.gameSystem,
    faction: faccion,
    points: built.points,
    modelCount: built.modelCount,
    listJson,
  };
}
