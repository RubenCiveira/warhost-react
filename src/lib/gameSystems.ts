export type Setting = "grimdark" | "fantasy";
export type GameSystemId = "gf" | "gff" | "gfsq" | "aof" | "aofs" | "aofr" | "aofq";

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
  { id: "gfsq", setting: "grimdark", name: "Grimdark Future: Star Quest", short: "GFSQ", scale: "Banda de heroes en campana narrativa", escaramuza: true, armyForgeId: 9, armyForgeSlug: "grimdark-future-star-quest" },
  { id: "aof", setting: "fantasy", name: "Age of Fantasy", short: "AoF", scale: "Batallas de 150-3000 pts", escaramuza: false, armyForgeId: 4, armyForgeSlug: "age-of-fantasy" },
  { id: "aofs", setting: "fantasy", name: "Age of Fantasy: Skirmish", short: "AoFS", scale: "Escaramuza de 150-500 pts", escaramuza: true, armyForgeId: 5, armyForgeSlug: "age-of-fantasy-skirmish" },
  { id: "aofr", setting: "fantasy", name: "Age of Fantasy: Regiments", short: "AoFR", scale: "Formaciones de regimiento", escaramuza: false, armyForgeId: 6, armyForgeSlug: "age-of-fantasy-regiments" },
  { id: "aofq", setting: "fantasy", name: "Age of Fantasy: Quest", short: "AoFQ", scale: "Banda de heroes en campana narrativa", escaramuza: true, armyForgeId: 7, armyForgeSlug: "age-of-fantasy-quest" },
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

export interface ArmyNoun {
  singular: string;
  singularCap: string;
  plural: string;
  pluralCap: string;
  article: "el" | "la";
  articleCap: "El" | "La";
  pluralArticle: "los" | "las";
  indefArticle: "un" | "una";
  /** "primero"/"primera", ya concordado con el genero del termino. */
  first: "primero" | "primera";
  /** "nuevo"/"nueva", ya concordado con el genero del termino. */
  newForm: "nuevo" | "nueva";
  /** "este"/"esta", ya concordado con el genero del termino. */
  demonstrative: "este" | "esta";
  demonstrativeCap: "Este" | "Esta";
  /** Pronombre de objeto directo: "impórta**lo**"/"impórta**la**". */
  pronoun: "lo" | "la";
  /** "a" + articulo, con la contraccion "al" para el masculino. */
  toThe: "al" | "a la";
  /** "de" + articulo, con la contraccion "del" para el masculino. */
  ofThe: "del" | "de la";
  /** Desinencia de genero para concordar adjetivos y participios sueltos. */
  genderSuffix: "o" | "a";
}

const ARMY_NOUNS: Record<"ejercito" | "destacamento" | "escuadra" | "celula" | "comitiva" | "lista", ArmyNoun> = {
  ejercito: { singular: "ejercito", singularCap: "Ejercito", plural: "ejercitos", pluralCap: "Ejercitos", article: "el", articleCap: "El", pluralArticle: "los", indefArticle: "un", first: "primero", newForm: "nuevo", demonstrative: "este", demonstrativeCap: "Este", pronoun: "lo", toThe: "al", ofThe: "del", genderSuffix: "o" },
  destacamento: { singular: "destacamento", singularCap: "Destacamento", plural: "destacamentos", pluralCap: "Destacamentos", article: "el", articleCap: "El", pluralArticle: "los", indefArticle: "un", first: "primero", newForm: "nuevo", demonstrative: "este", demonstrativeCap: "Este", pronoun: "lo", toThe: "al", ofThe: "del", genderSuffix: "o" },
  escuadra: { singular: "escuadra", singularCap: "Escuadra", plural: "escuadras", pluralCap: "Escuadras", article: "la", articleCap: "La", pluralArticle: "las", indefArticle: "una", first: "primera", newForm: "nueva", demonstrative: "esta", demonstrativeCap: "Esta", pronoun: "la", toThe: "a la", ofThe: "de la", genderSuffix: "a" },
  celula: { singular: "celula", singularCap: "Celula", plural: "celulas", pluralCap: "Celulas", article: "la", articleCap: "La", pluralArticle: "las", indefArticle: "una", first: "primera", newForm: "nueva", demonstrative: "esta", demonstrativeCap: "Esta", pronoun: "la", toThe: "a la", ofThe: "de la", genderSuffix: "a" },
  comitiva: { singular: "comitiva", singularCap: "Comitiva", plural: "comitivas", pluralCap: "Comitivas", article: "la", articleCap: "La", pluralArticle: "las", indefArticle: "una", first: "primera", newForm: "nueva", demonstrative: "esta", demonstrativeCap: "Esta", pronoun: "la", toThe: "a la", ofThe: "de la", genderSuffix: "a" },
  lista: { singular: "lista", singularCap: "Lista", plural: "listas", pluralCap: "Listas", article: "la", articleCap: "La", pluralArticle: "las", indefArticle: "una", first: "primera", newForm: "nueva", demonstrative: "esta", demonstrativeCap: "Esta", pronoun: "la", toThe: "a la", ofThe: "de la", genderSuffix: "a" },
};

/**
 * Nombre a mostrar para "ejercito" segun el sistema: cada modo de escaramuza
 * tiene su propio termino (Firefight escuadra, Star Quest celula, AoF
 * Skirmish destacamento, AoF Quest comitiva); fuera de escaramuza o sin
 * sistema conocido se usa el generico (ejercito/lista).
 */
export function armyNounFor(system: GameSystem | null | undefined): ArmyNoun {
  if (!system) return ARMY_NOUNS.lista;
  switch (system.id) {
    case "gff":
      return ARMY_NOUNS.escuadra;
    case "gfsq":
      return ARMY_NOUNS.celula;
    case "aofs":
      return ARMY_NOUNS.destacamento;
    case "aofq":
      return ARMY_NOUNS.comitiva;
    default:
      return ARMY_NOUNS.ejercito;
  }
}

/**
 * Texto de facciones para una tarjeta o cabecera: en quest no hay principal
 * —la mezcla es narrativa, no jerarquica por puntos— asi que se listan todas
 * igual; en el resto de sistemas la principal va primero y las demas como
 * aliadas, recortando a dos nombres para no desbordar una linea.
 */
export function resumenFaccion(
  faction: string | null,
  alliedFactions: string[],
  gameSystem: GameSystemId | null | undefined,
): string {
  const id = getGameSystem(gameSystem ?? undefined)?.id;
  const quest = id === "gfsq" || id === "aofq";
  if (quest) return alliedFactions.length > 0 ? alliedFactions.join(", ") : "Sin faccion";

  const base = faction ?? "Sin faccion";
  if (alliedFactions.length === 0) return base;
  const listados = alliedFactions.slice(0, 2).join(", ");
  const resto = alliedFactions.length - 2;
  return `${base} · Aliados: ${listados}${resto > 0 ? ` y ${resto} mas` : ""}`;
}
