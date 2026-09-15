import type { Models } from "appwrite";
import type { GameSystemId, Setting } from "./gameSystems";

export type Row = Models.Row;

export interface Army extends Row {
  userId: string;
  name: string;
  setting: Setting;
  gameSystem: GameSystemId;
  /** Faccion con mas peso en puntos; vacia en quest, donde no hay principal. */
  faction: string | null;
  /** Las demas facciones presentes, con menos peso en puntos (o todas, en quest). */
  alliedFactions: string[];
  points: number;
  /** Limite de puntos objetivo, elegido aparte del coste real de la lista. 0 = sin fijar, se usa `points`. */
  pointsLimit: number;
  /** Margen de tolerancia sobre `pointsLimit`, en tanto por ciento. */
  pointsMargin: number;
  modelCount: number;
  listId: string | null;
  sourceUrl: string | null;
  listJson: string | null;
  coverId: string | null;
  imageIds: string[];
  notes: string | null;
  shared: boolean;
  updatedAt: string | null;
  /** Identifica al ejercito a lo largo de todas sus versiones. */
  lineageId: string | null;
  status: ArmyStatus;
  /**
   * Ranuras. Valen `lineageId` cuando la fila ocupa ese papel y nulo cuando no.
   * Tienen indice unico, asi que la base de datos hace imposible un segundo
   * activo o un segundo borrador de la misma linea: no es una comprobacion del
   * front que se pueda saltar.
   */
  activeKey: string | null;
  draftKey: string | null;
  version: number;
  basedOn: string | null;
  publishedAt: string | null;
  obsoletedAt: string | null;
}

export type ArmyStatus = "active" | "draft" | "obsolete";

export interface Association extends Row {
  name: string;
  slug: string;
  ownerId: string;
  description: string | null;
  city: string | null;
  visibility: "public" | "private";
  createdAt: string | null;
}

export type MemberRole = "owner" | "admin" | "member";

export interface AssociationMember extends Row {
  associationId: string;
  userId: string;
  displayName: string | null;
  role: MemberRole;
  joinedAt: string | null;
}

export type GameStatus = "setup" | "active" | "finished";

export interface Game extends Row {
  name: string;
  setting: Setting;
  gameSystem: GameSystemId;
  associationId: string | null;
  missionId: string | null;
  missionName: string | null;
  pointsLimit: number;
  status: GameStatus;
  round: number;
  activePlayerId: string | null;
  createdBy: string;
  startedAt: string | null;
  endedAt: string | null;
  notes: string | null;
}

export type GameResult = "win" | "loss" | "draw";

export interface GamePlayer extends Row {
  gameId: string;
  userId: string | null;
  displayName: string;
  armyId: string | null;
  armyName: string | null;
  faction: string | null;
  points: number;
  score: number;
  victoryPoints: number;
  commandPoints: number;
  result: GameResult | null;
  color: string | null;
}

export interface GameUnit extends Row {
  gameId: string;
  playerId: string;
  name: string;
  unitKey: string | null;
  size: number;
  quality: number;
  defense: number;
  wounds: number;
  maxWounds: number;
  state: string;
  activated: boolean;
  shaken: boolean;
  fatigued: boolean;
  destroyed: boolean;
  tokens: string | null;
  rules: string[];
  sortOrder: number;
}

export interface Rule extends Row {
  setting: Setting;
  gameSystems: GameSystemId[];
  category: string;
  title: string;
  body: string;
  tags: string[];
  sourceUrl: string | null;
  sortOrder: number;
}

/**
 * Una carta de mision. Sale de un OCR sobre el PDF oficial —las cartas ahi son
 * imagenes, no texto—, asi que `verified` dice si alguien la ha repasado ya.
 */
export interface Mission extends Row {
  gameSystem: GameSystemId;
  setting: Setting;
  deck: string | null;
  /** El numero del rombo, 11-66: se tiran 2D6 y sale la carta. */
  code: number | null;
  name: string;
  description: string | null;
  /** Puntos de victoria. Null cuando el OCR no pudo leerlos. */
  vp: number | null;
  verified: boolean;
  sourceUrl: string | null;
  sourceVersion: string | null;
  sortOrder: number;
}

export type HeroSkillStat = "strength" | "dexterity" | "willpower";

/** Una habilidad de heroe de Quest: de clase (tiers 0-3) o del set comun a todas. */
export interface HeroSkill {
  tier: 0 | 1 | 2 | 3;
  stat: HeroSkillStat;
  name: string;
  description: string;
  sortOrder: number;
}

/**
 * Una clase de heroe de Quest (Star Quest / Fantasy Quest), con su feat y sus
 * habilidades de tier 0 (iniciales) a 3 (Lvl. 9). `classKey` es el slug estable
 * que empareja la misma clase entre sistemas con nombres distintos (p.ej.
 * "berserker" es Berserker en GFSQ y Barbarian en AoFQ); `classKey === "default"`
 * es el set de habilidades comun a todas las clases del sistema.
 */
export interface HeroClass extends Row {
  gameSystem: GameSystemId;
  setting: Setting;
  classKey: string;
  name: string;
  description: string | null;
  classFeatName: string | null;
  classFeatText: string | null;
  /** Lista de `HeroSkill`, serializada en JSON. */
  skills: string;
  verified: boolean;
  sourceVersion: string | null;
  sortOrder: number;
}

export function parseHeroSkills(raw: string | null | undefined): HeroSkill[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as HeroSkill[]) : [];
  } catch {
    return [];
  }
}

/** Contadores libres por unidad, serializados en la columna `tokens`. */
export type TokenMap = Record<string, number>;

export function parseTokens(raw: string | null | undefined): TokenMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === "number")
        .map(([key, value]) => [key, value as number]),
    );
  } catch {
    return {};
  }
}
