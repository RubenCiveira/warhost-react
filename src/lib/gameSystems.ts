export type Setting = "grimdark" | "fantasy";
export type GameSystemId = "gf" | "gff" | "aof" | "aofs" | "aofr";

export interface GameSystem {
  id: GameSystemId;
  setting: Setting;
  name: string;
  short: string;
  /** Escala tipica de la partida, para orientar al usuario al elegir. */
  scale: string;
  /**
   * Escaramuza: cada miniatura combate suelta, sin unidades de varios
   * modelos. La regla de `Hero` de estos sistemas no da la opcion de unirse a
   * una unidad —no hay a que unirse—, asi que aqui nunca se ofrece.
   */
  escaramuza: boolean;
  /** Id numerico del sistema en Army Forge, necesario para el proxy. */
  armyForgeId: number;
  armyForgeSlug: string;
}

export const SETTINGS: Record<Setting, { id: Setting; name: string; blurb: string }> = {
  grimdark: {
    id: "grimdark",
    name: "Grimdark",
    blurb: "Ciencia ficcion sombria: ejercitos mecanizados, armas de fusion y guerra sin fin.",
  },
  fantasy: {
    id: "fantasy",
    name: "Age of Fantasy",
    blurb: "Fantasia clasica: regimientos, magia y monstruos.",
  },
};

export const GAME_SYSTEMS: GameSystem[] = [
  { id: "gf", setting: "grimdark", name: "Grimdark Future", short: "GF", scale: "Batallas de 150-3000 pts", escaramuza: false, armyForgeId: 2, armyForgeSlug: "grimdark-future" },
  { id: "gff", setting: "grimdark", name: "Grimdark Future: Firefight", short: "GFF", scale: "Escaramuza de 150-500 pts", escaramuza: true, armyForgeId: 3, armyForgeSlug: "grimdark-future-firefight" },
  { id: "aof", setting: "fantasy", name: "Age of Fantasy", short: "AoF", scale: "Batallas de 150-3000 pts", escaramuza: false, armyForgeId: 4, armyForgeSlug: "age-of-fantasy" },
  { id: "aofs", setting: "fantasy", name: "Age of Fantasy: Skirmish", short: "AoFS", scale: "Escaramuza de 150-500 pts", escaramuza: true, armyForgeId: 5, armyForgeSlug: "age-of-fantasy-skirmish" },
  { id: "aofr", setting: "fantasy", name: "Age of Fantasy: Regiments", short: "AoFR", scale: "Formaciones de regimiento", escaramuza: false, armyForgeId: 6, armyForgeSlug: "age-of-fantasy-regiments" },
];

const BY_ID = new Map(GAME_SYSTEMS.map((system) => [system.id, system]));

export function getGameSystem(id: string | null | undefined): GameSystem | undefined {
  return id ? BY_ID.get(id as GameSystemId) : undefined;
}

export function systemsFor(setting: Setting): GameSystem[] {
  return GAME_SYSTEMS.filter((system) => system.setting === setting);
}

export function isGameSystemId(value: string | null | undefined): value is GameSystemId {
  return Boolean(value && BY_ID.has(value as GameSystemId));
}
