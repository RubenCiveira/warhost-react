/**
 * Logica del constructor de ejercitos, sin React ni Appwrite.
 *
 * Trabaja sobre el catalogo propio (`army_units` y `army_upgrade_packages`), no
 * sobre Army Forge, pero produce exactamente la misma forma que la importacion,
 * para que una partida no tenga que saber de donde salio el ejercito.
 */
import { applyOptions, baseLoadout, llevaObjetivo } from "./loadout";
import type { AppliedOption, LoadoutEntry } from "./loadout";
import type { Gain } from "./loadout";
import type { ResolvedUnit } from "./armyForgeResolve";
import { getGameSystem, isQuestSystem } from "./gameSystems";
import type { GameSystemId } from "./gameSystems";
import { perfilInicialQuest, QUEST_STARTING_GOLD, reglasInicialesQuest } from "./questHero";
import type { HeroClass } from "./types";
import { gainIsWeapon, gainName, ruleLabelsFromGains, walkGains } from "./armyForgeGains";

/** Cuantos modelos afecta una seccion, o cuantas opciones deja elegir. */
export interface Quantifier {
  type: "exactly" | "up to" | "any" | "all";
  value?: number;
}

export interface UpgradeOption {
  id?: string;
  uid?: string;
  label?: string;
  parentSectionUid?: string;
  parentSectionId?: string;
  costs?: Array<{ cost?: number; unitId?: string }>;
  gains?: Gain[];
}

export interface UpgradeSection {
  id?: string;
  uid?: string;
  label?: string;
  variant?: "replace" | "upgrade" | "attachment" | string;
  targets?: string[];
  affects?: Quantifier | null;
  select?: Quantifier | null;
  options?: UpgradeOption[];
  parentPackageUid?: string;
}

/** Unidad del catalogo, con lo que el constructor necesita de ella. */
export interface CatalogUnitLike {
  /** Libro al que pertenece: `unitId` solo es unico dentro de su libro. */
  bookKey: string;
  unitId: string;
  name: string;
  size: number;
  quality: number;
  defense: number;
  cost: number;
  rules: string[];
  upgradePackageUids: string[];
  /** JSON del catalogo; hace falta para saber con que armas parte la unidad. */
  weapons?: string | null;
  items?: string | null;
}

/** Una unidad puesta en la lista. La misma unidad puede repetirse. */
export interface BuilderEntry {
  key: string;
  unit: CatalogUnitLike;
  /** optionId -> cuantas veces se ha cogido esa opcion. */
  choices: Record<string, number>;
  /**
   * Unidad combinada ("combined" en Army Forge): el doble de miniaturas y el
   * doble de coste.
   */
  combined?: boolean;
  /** Anotacion del jugador sobre esta unidad concreta. */
  notes?: string;
  /**
   * `key` de la entrada a la que se une este heroe. Solo lo llevan los heroes
   * de `Tough(6)` o menos, que en el juego se despliegan dentro de otra unidad.
   */
  attachedTo?: string;
  /**
   * `$id` de la fila de `hero_classes` elegida para este heroe. Solo tiene
   * sentido en Star Quest / Fantasy Quest, donde un heroe elige una clase en
   * vez de unirse a una unidad.
   */
  heroClassId?: string;
  /**
   * Nombre propio del heroe, puesto por el jugador. En quest cada heroe es un
   * personaje con nombre, no una unidad generica del catalogo: sin esto la
   * ficha solo podria mostrar el nombre del tipo de unidad, igual para todos
   * los heroes de la misma clase.
   */
  customName?: string;
}

/**
 * Una unidad combinada se **configura como la normal** y se duplica despues.
 *
 * Los limites de cada seccion siguen contando sobre la unidad de siempre, asi
 * que unos Pathfinders de 5 con Heavy Rifle a los que se les ponen 3 Sniper
 * Rifle quedan en 2 Heavy y 3 Sniper; combinados son 10 miniaturas, 4 Heavy y 6
 * Sniper, y el doble de puntos.
 */
export const FACTOR_COMBINADA = 2;

export function factorCombinada(entry: BuilderEntry): number {
  return entry.combined ? FACTOR_COMBINADA : 1;
}

/**
 * Una unidad de un solo modelo no se puede combinar: combinar es juntar dos
 * unidades iguales, y un Heroe es una miniatura.
 */
export function sePuedeCombinar(unit: CatalogUnitLike): boolean {
  return unit.size > 1;
}

export function parseSections(json: string | null | undefined): UpgradeSection[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as UpgradeSection[])
      .map((section) => ({
        ...section,
        options: (section.options ?? []).filter(
          (option) =>
            !option.parentSectionUid ||
            [section.uid, section.id].includes(option.parentSectionUid) ||
            [section.uid, section.id].includes(option.parentSectionId),
        ),
      }))
      .filter((section) => (section.options ?? []).length > 0);
  } catch {
    return [];
  }
}

/**
 * `packages` viene indexado por `${bookKey}:${packageUid}` (ver
 * `listUpgradePackages`): el uid de un paquete solo es unico dentro de su
 * libro, igual que pasa con las unidades.
 */
export function sectionsForUnit(
  unit: CatalogUnitLike,
  packages: Map<string, UpgradeSection[]>,
): UpgradeSection[] {
  return unit.upgradePackageUids.flatMap((uid) => packages.get(claveEnLibro(unit.bookKey, uid)) ?? []);
}

export type ExtraSectionsForEntry = (entry: BuilderEntry, baseSections: UpgradeSection[]) => UpgradeSection[];

export function sectionsForEntry(
  entry: BuilderEntry,
  packages: Map<string, UpgradeSection[]>,
  extraSections?: ExtraSectionsForEntry,
): UpgradeSection[] {
  const baseSections = sectionsForUnit(entry.unit, packages);
  return extraSections ? [...baseSections, ...extraSections(entry, baseSections)] : baseSections;
}

export function optionId(option: UpgradeOption): string {
  return option.id ?? option.uid ?? "";
}

/** El coste de una opcion depende de que unidad la compre. */
export function optionCost(option: UpgradeOption, unitId: string): number {
  const costs = option.costs ?? [];
  const exact = costs.find((entry) => entry.unitId === unitId);
  const common = costs.find((entry) => entry.unitId === "*");
  return exact?.cost ?? common?.cost ?? costs[0]?.cost ?? 0;
}

function isQuestSystemId(gameSystem: GameSystemId | undefined): gameSystem is GameSystemId {
  return gameSystem !== undefined && isQuestSystem(gameSystem);
}

function optionGains(option: UpgradeOption): Gain[] {
  return option.gains ?? [];
}

function gainHasForbiddenQuestRule(gain: Gain): boolean {
  const name = gainName(gain);
  const forbidden = name === "Spawn" || name === "Summon" || name.endsWith("Guard");
  let nestedForbidden = false;
  walkGains(gain.content, (nested) => {
    if (gainHasForbiddenQuestRule(nested)) nestedForbidden = true;
  });
  walkGains(gain.specialRules, (nested) => {
    if (gainHasForbiddenQuestRule(nested)) nestedForbidden = true;
  });
  return forbidden || nestedForbidden;
}

export function isForbiddenQuestPurchase(option: UpgradeOption): boolean {
  return optionGains(option).some(gainHasForbiddenQuestRule);
}

function questDefaultGearOptions(entry: BuilderEntry, sections: UpgradeSection[], gameSystem?: GameSystemId): UpgradeOption[] {
  if (!isQuestSystemId(gameSystem) || !esHeroe(entry.unit.rules)) return [];

  const opciones: UpgradeOption[] = [];
  let spent = 0;
  const add = (option: UpgradeOption | undefined) => {
    if (!option) return;
    const cost = optionCost(option, entry.unit.unitId);
    if (spent + cost > QUEST_STARTING_GOLD) return;
    spent += cost;
    opciones.push(option);
  };
  const find = (name: string) => {
    for (const section of sections) {
      for (const option of section.options ?? []) {
        const cost = optionCost(option, entry.unit.unitId);
        if (spent + cost > QUEST_STARTING_GOLD) continue;
        if (optionGains(option).some((gain) => gainName(gain) === name)) return option;
      }
    }
    return undefined;
  };

  if (entry.heroClassId?.endsWith("-pathfinder")) {
    let best: { option: UpgradeOption; cost: number } | undefined;
    for (const section of sections) {
      for (const option of section.options ?? []) {
        const cost = optionCost(option, entry.unit.unitId);
        if (cost > 25 || spent + cost > QUEST_STARTING_GOLD) continue;
        if (!optionGains(option).some((gain) => gainIsWeapon(gain) && (gain.range ?? 0) > 0)) continue;
        if (!best || cost > best.cost) best = { option, cost };
      }
    }
    add(best?.option);
  }

  add(find("Mystic Warding"));
  add(find("Light Armor"));

  for (const [first, second] of [
    ["Health Potion", "Med Kit"],
    ["Curing Potion", "Curing Kit"],
  ] as const) {
    for (let attempts = 0; attempts < 10 && spent < QUEST_STARTING_GOLD; attempts += 1) {
      const option = find(first) ?? find(second);
      if (!option) break;
      add(option);
    }
  }

  return opciones;
}

/**
 * Cuantas veces como maximo se puede coger una opcion de esta seccion.
 * `affects` habla de modelos: "exactly 1" es una vez, "up to 2" hasta dos, y
 * "any"/"all"/sin dato se limitan al tamano de la unidad.
 */
/**
 * Cuantas veces se puede coger algo de esta seccion, sumando todas sus
 * opciones.
 *
 * `affects` y `select` son ejes distintos y confundirlos es facil: `affects`
 * dice a cuantos modelos alcanza la seccion, `select` cuantas opciones
 * distintas se pueden elegir. Que una mejora alcance a todos los modelos no
 * quiere decir que solo puedas comprar una: "Upgrade all models with any" con
 * dos opciones son dos mejoras, cada una para todos los modelos.
 *
 * La excepcion es el reemplazo: "Replace all Bio-Spiners" se lleva los
 * Bio-Spiners enteros, asi que un segundo reemplazo de la misma seccion no
 * tendria ya nada que quitar.
 */
export function maxPicks(section: UpgradeSection, unitSize: number): number {
  const affects = section.affects;
  if (!affects) return Math.max(1, unitSize);
  if (affects.type === "exactly") return Math.max(1, affects.value ?? 1);
  if (affects.type === "up to") return Math.max(1, affects.value ?? 1);
  if (affects.type === "all") {
    return section.variant === "replace" ? 1 : Math.max(1, (section.options ?? []).length);
  }
  return Math.max(1, unitSize);
}

/**
 * Cuantas veces se puede coger **una misma** opcion.
 *
 * Lo que alcanza a todos los modelos ya los alcanza a la primera: comprarlo
 * dos veces no cambia nada y se cobra dos veces.
 */
export function maxPorOpcion(section: UpgradeSection, unitSize: number): number {
  if (section.affects?.type === "all") return 1;
  return maxPicks(section, unitSize);
}

/**
 * Cuantas opciones distintas de la seccion se pueden tener a la vez.
 *
 * `select: exactly N` limita las distintas solo cuando la seccion se compra
 * de una vez para toda la unidad (`affects` ausente, "all", o "exactly 1"):
 * ahi si es "elige N de estas". Pero "Upgrade up to 3 models with one:
 * Sergeant, Banner, Musician" es al reves — `affects: up to 3` son 3 ranuras
 * independientes, cada una resuelta por su cuenta segun `select`, asi que un
 * `select` de "exactly 1" no dice "el mismo 1 para toda la seccion": dice "1
 * por ranura", y las ranuras pueden salir distintas (un Sergeant, un Banner y
 * un Musician). Ahi no hay tope de distintas mas alla del que ya pone
 * `maxPicks` con las ranuras disponibles.
 */
export function maxDistinctOptions(section: UpgradeSection): number {
  const select = section.select;
  if (select?.type !== "exactly") return Number.POSITIVE_INFINITY;
  const affects = section.affects;
  const ranurasIndependientes = affects?.type === "up to" || (affects?.type === "exactly" && (affects.value ?? 1) > 1);
  if (ranurasIndependientes) return Number.POSITIVE_INFINITY;
  return Math.max(1, select.value ?? 1);
}

export function sectionChosenCount(section: UpgradeSection, choices: Record<string, number>): number {
  return (section.options ?? []).reduce((sum, option) => sum + (choices[optionId(option)] ?? 0), 0);
}

function distinctChosen(section: UpgradeSection, choices: Record<string, number>): number {
  return (section.options ?? []).filter((option) => (choices[optionId(option)] ?? 0) > 0).length;
}

/** Si no se puede subir una opcion mas, devuelve por que. */
/**
 * Los objetivos de un reemplazo que la unidad no lleva **ahora mismo**.
 *
 * Los Pathfinders de Battle Brothers llevan Flamer Pistol y tienen una seccion
 * "Replace Gravity Pistol": el objetivo no es un nombre mal escrito, es que esa
 * seccion encadena con otra que si da la Gravity Pistol. Hasta comprarla, elegir
 * ahi no puede hacer nada, asi que no se deja.
 */
export function objetivosQueFaltan(
  section: UpgradeSection,
  entry: BuilderEntry,
  sections: UpgradeSection[],
): string[] {
  const targets = section.targets ?? [];
  if (targets.length === 0) return [];
  const actual = entryLoadout(entry, sections);
  return targets.filter((target) => !llevaObjetivo(actual, target));
}

/** En que seccion se consigue lo que a otra le falta, si es que se consigue. */
function dondeSeConsigue(nombre: string, sections: UpgradeSection[]): string | null {
  const busca = nombre.trim().toLowerCase();
  for (const section of sections) {
    for (const option of section.options ?? []) {
      const da = (option.gains ?? []).flatMap((gain) => [gain.name, gain.label]).filter(Boolean) as string[];
      if (da.some((n) => n.toLowerCase() === busca || n.toLowerCase().startsWith(`${busca} (`))) {
        return section.label ?? null;
      }
    }
  }
  return null;
}

export function blockReason(
  section: UpgradeSection,
  option: UpgradeOption,
  entry: BuilderEntry,
  sections: UpgradeSection[] = [],
  gameSystem?: GameSystemId,
): string | null {
  const id = optionId(option);
  const current = entry.choices[id] ?? 0;
  const picks = sectionChosenCount(section, entry.choices);

  if (picks >= maxPicks(section, entry.unit.size)) {
    return `Esta seccion admite como mucho ${maxPicks(section, entry.unit.size)}.`;
  }
  if (current >= maxPorOpcion(section, entry.unit.size)) {
    return "Esta mejora ya alcanza a todos los modelos.";
  }
  const limit = maxDistinctOptions(section);
  if (current === 0 && distinctChosen(section, entry.choices) >= limit) {
    return limit === 1 ? "Solo se puede elegir una opcion aqui." : `Como mucho ${limit} opciones distintas.`;
  }
  if (isQuestSystemId(gameSystem) && esHeroe(entry.unit.rules)) {
    if (isForbiddenQuestPurchase(option)) return "Esta mejora no esta disponible para heroes de Quest.";
    const spent = questGoldSpent(entry, sections, gameSystem);
    const cost = optionCost(option, entry.unit.unitId);
    if (spent + cost > QUEST_STARTING_GOLD) {
      return `La tienda inicial admite como mucho ${QUEST_STARTING_GOLD} monedas.`;
    }
  }

  // Sin `sections` no se puede saber con que ha quedado la unidad, asi que no
  // se bloquea: mas vale dejar elegir de mas que inventarse un motivo.
  if (sections.length > 0) {
    const faltan = objetivosQueFaltan(section, entry, sections);
    if (faltan.length > 0) {
      const lista = faltan.join(" ni ");
      const donde = faltan.map((n) => dondeSeConsigue(n, sections)).find(Boolean);
      return donde
        ? `Esta unidad no lleva ${lista}. Primero hay que cogerlo en "${donde}".`
        : `Esta unidad no lleva ${lista}, asi que no hay nada que reemplazar.`;
    }
  }
  return null;
}

export function entryCost(entry: BuilderEntry, sections: UpgradeSection[]): number {
  let cost = entry.unit.cost;
  for (const section of sections) {
    for (const option of section.options ?? []) {
      const count = entry.choices[optionId(option)] ?? 0;
      if (count > 0) cost += optionCost(option, entry.unit.unitId) * count;
    }
  }
  // El combinar dobla el total, mejoras incluidas: son dos unidades iguales.
  return cost * factorCombinada(entry);
}

export function entryRules(entry: BuilderEntry, sections: UpgradeSection[]): string[] {
  const rules = [...entry.unit.rules];
  for (const section of sections) {
    for (const option of section.options ?? []) {
      if (!(entry.choices[optionId(option)] ?? 0)) continue;
      rules.push(...ruleLabelsFromGains(option.gains));
    }
  }
  return [...new Set(rules.filter(Boolean))];
}

export function questGoldSpent(entry: BuilderEntry, sections: UpgradeSection[], gameSystem?: GameSystemId): number {
  if (!isQuestSystemId(gameSystem) || !esHeroe(entry.unit.rules)) return 0;
  let spent = questDefaultGearOptions(entry, sections, gameSystem).reduce(
    (sum, option) => sum + optionCost(option, entry.unit.unitId),
    0,
  );
  for (const section of sections) {
    for (const option of section.options ?? []) {
      const count = entry.choices[optionId(option)] ?? 0;
      if (count > 0) spent += optionCost(option, entry.unit.unitId) * count;
    }
  }
  return spent;
}

/** Las opciones elegidas, en texto, para poder leer la lista de un vistazo. */
export function entryUpgradeLabels(entry: BuilderEntry, sections: UpgradeSection[]): string[] {
  const labels: string[] = [];
  for (const section of sections) {
    for (const option of section.options ?? []) {
      const count = entry.choices[optionId(option)] ?? 0;
      if (count > 0) labels.push(count > 1 ? `${count}× ${option.label ?? ""}` : option.label ?? "");
    }
  }
  return labels.filter(Boolean);
}

export function toughOf(rules: string[]): number {
  for (const rule of rules) {
    const match = /^tough\((\d+)\)$/i.exec(rule.trim());
    if (match) return Number(match[1]);
  }
  return 1;
}

export function esHeroe(rules: string[]): boolean {
  return rules.some((rule) => rule.trim().toLowerCase() === "hero");
}

/**
 * Un heroe de `Tough(6)` o menos puede unirse a otra unidad en el despliegue.
 * Se mira sobre las reglas ya resueltas: una mejora podria darle o quitarle
 * `Hero`, o subirle el `Tough`.
 *
 * Solo aplica en sistemas de batalla (GF, AoF, AoFR): en escaramuza (GFF,
 * AoFS) y en Quest (GFSQ, AoFQ) cada miniatura combate suelta y la carta de
 * `Hero` de esos sistemas no ofrece la opcion de unirse, porque no hay
 * unidades de varios modelos a las que hacerlo.
 */
export function puedeAdjuntarse(entry: BuilderEntry, sections: UpgradeSection[], gameSystem: GameSystemId): boolean {
  if (getGameSystem(gameSystem)?.escaramuza) return false;
  const rules = entryRules(entry, sections);
  return esHeroe(rules) && toughOf(rules) <= 6;
}

/**
 * En Star Quest / Fantasy Quest, todo heroe elige una clase del catalogo
 * `hero_classes` al meterlo en la lista: es lo que determina su feat y sus
 * habilidades de skill action, y estos sistemas no tienen otra forma de
 * elegirla (no hay "unirse a una unidad" como en batalla).
 */
export function necesitaClaseDeHeroe(entry: BuilderEntry, sections: UpgradeSection[], gameSystem: GameSystemId): boolean {
  return isQuestSystem(gameSystem) && esHeroe(entryRules(entry, sections));
}

/** Las opciones elegidas, con la seccion que dice a que sustituyen. */
export function appliedOptions(entry: BuilderEntry, sections: UpgradeSection[], gameSystem?: GameSystemId): AppliedOption[] {
  const applied: AppliedOption[] = [];
  const defaultCounts = new Map<string, number>();
  for (const option of questDefaultGearOptions(entry, sections, gameSystem)) {
    const id = optionId(option);
    defaultCounts.set(id, (defaultCounts.get(id) ?? 0) + 1);
  }
  for (const section of sections) {
    // Los limites se respetan al elegir, pero lo guardado puede venir de una
    // importacion o de una version anterior del libro. Sin acotar aqui, una
    // eleccion repetida de mas pinta cosas imposibles —quince rifles en una
    // unidad de cinco— sin que nada avise.
    const tope = maxPorOpcion(section, entry.unit.size);
    for (const option of section.options ?? []) {
      const id = optionId(option);
      const count = Math.min(entry.choices[id] ?? 0, tope) + (defaultCounts.get(id) ?? 0);
      if (count > 0) {
        applied.push({
          variant: section.variant,
          targets: section.targets,
          affects: section.affects,
          gains: option.gains,
          count,
        });
      }
    }
  }
  return applied;
}

/**
 * El equipo de la unidad **normal**, ya configurada.
 *
 * Sin doblar aunque este combinada, a proposito: de aqui sale con que cuenta la
 * unidad para decidir que reemplazos estan disponibles, y esos se resuelven
 * sobre la unidad de siempre. Doblar aqui haria que un "Replace all" tuviera
 * que quitar diez cosas donde el catalogo cuenta cinco.
 */
export function entryLoadout(entry: BuilderEntry, sections: UpgradeSection[], gameSystem?: GameSystemId): LoadoutEntry[] {
  const base = baseLoadout(entry.unit.weapons ?? null, entry.unit.items ?? null);
  return applyOptions(base, appliedOptions(entry, sections, gameSystem));
}

/** El equipo que sale a la mesa: el de la unidad normal, doblado si va combinada. */
export function entryLoadoutFinal(entry: BuilderEntry, sections: UpgradeSection[], gameSystem?: GameSystemId): LoadoutEntry[] {
  const equipo = entryLoadout(entry, sections, gameSystem);
  const factor = factorCombinada(entry);
  return factor === 1 ? equipo : equipo.map((pieza) => ({ ...pieza, count: pieza.count * factor }));
}

export function toResolvedUnit(
  entry: BuilderEntry,
  sections: UpgradeSection[],
  index: number,
  heroClasses: HeroClass[] = [],
  gameSystem?: GameSystemId,
): ResolvedUnit {
  const size = entry.unit.size * factorCombinada(entry);
  // Un heroe de quest tiene perfil propio aunque todavia no haya elegido
  // clase (el asistente ya lo ensena asi, con el perfil base): el mismo
  // criterio de `necesitaClaseDeHeroe`, no si `heroClassId` esta puesto.
  const esHeroeDeQuest = gameSystem !== undefined && necesitaClaseDeHeroe(entry, sections, gameSystem);
  const clase = entry.heroClassId ? heroClasses.find((c) => c.$id === entry.heroClassId) : undefined;
  const rules = esHeroeDeQuest ? reglasInicialesQuest(clase, entryRules(entry, sections)) : entryRules(entry, sections);
  const perfilQuest = esHeroeDeQuest ? perfilInicialQuest(clase, toughOf(rules)) : null;
  const oroQuest = perfilQuest ? Math.max(0, QUEST_STARTING_GOLD - questGoldSpent(entry, sections, gameSystem)) : undefined;
  return {
    // Con nombre propio, ese es el que se ve; el tipo de unidad del catalogo
    // se guarda aparte en `unitTypeName`, para el subtitulo de la ficha.
    name: entry.customName || entry.unit.name,
    unitTypeName: entry.unit.name,
    heroClassId: entry.heroClassId,
    unitKey: entry.unit.unitId,
    bookKey: entry.unit.bookKey,
    size,
    quality: perfilQuest?.quality ?? entry.unit.quality,
    defense: perfilQuest?.defense ?? entry.unit.defense,
    maxWounds: perfilQuest ? perfilQuest.tough : size * toughOf(rules),
    ...(perfilQuest
      ? {
          strength: perfilQuest.strength,
          dexterity: perfilQuest.dexterity,
          willpower: perfilQuest.willpower,
          power: perfilQuest.power,
          level: perfilQuest.level,
          experience: perfilQuest.experience,
          gold: oroQuest,
        }
      : {}),
    cost: entryCost(entry, sections),
    rules: rules.slice(0, 20),
    loadout: entryLoadoutFinal(entry, sections, gameSystem),
    combined: entry.combined ? true : undefined,
    notes: entry.notes || undefined,
    upgrades: entryUpgradeLabels(entry, sections),
    unresolvedUpgrades: 0,
    sortOrder: index,
  };
}

export interface BuiltArmy {
  units: ResolvedUnit[];
  points: number;
  modelCount: number;
}

export function buildArmy(
  entries: BuilderEntry[],
  packages: Map<string, UpgradeSection[]>,
  heroClasses: HeroClass[] = [],
  gameSystem?: GameSystemId,
  extraSections?: ExtraSectionsForEntry,
): BuiltArmy {
  const units = entries.map((entry, index) =>
    toResolvedUnit(entry, sectionsForEntry(entry, packages, extraSections), index, heroClasses, gameSystem),
  );
  return {
    units,
    points: units.reduce((sum, unit) => sum + unit.cost, 0),
    modelCount: units.reduce((sum, unit) => sum + unit.size, 0),
  };
}

/* Persistencia de la composicion ---------------------------------------------
 *
 * Un ejercito guardado lleva las unidades ya resueltas, que es lo que necesitan
 * la ficha y la partida. Pero para poder *editarlo* hace falta lo que se eligio,
 * no el resultado: que unidad del catalogo era y que opciones se marcaron. Eso
 * se guarda aparte, y es lo que permite reabrir el constructor sin perder nada.
 */

export interface StoredEntry {
  /** Libro al que pertenece: `unitId` solo es unico dentro de su libro. */
  bookKey: string;
  unitId: string;
  choices: Record<string, number>;
  /** Solo se guarda cuando es cierto, para no engordar el JSON. */
  combined?: boolean;
  notes?: string;
  /**
   * Indice, en este mismo array, de la unidad a la que se une el heroe. Se
   * guarda por posicion porque la `key` de cada entrada es de usar y tirar.
   */
  attachedTo?: number;
  /** `$id` de `hero_classes` elegida. Solo se usa en Star Quest / Fantasy Quest. */
  heroClassId?: string;
  /** Nombre propio del heroe, puesto por el jugador. */
  customName?: string;
}

export function serializeEntries(entries: BuilderEntry[]): StoredEntry[] {
  const indicePorKey = new Map(entries.map((entry, index) => [entry.key, index]));
  return entries.map((entry) => {
    const indiceUnion = entry.attachedTo ? indicePorKey.get(entry.attachedTo) : undefined;
    return {
      bookKey: entry.unit.bookKey,
      unitId: entry.unit.unitId,
      choices: { ...entry.choices },
      ...(entry.combined ? { combined: true } : {}),
      ...(entry.notes ? { notes: entry.notes } : {}),
      ...(indiceUnion !== undefined ? { attachedTo: indiceUnion } : {}),
      ...(entry.heroClassId ? { heroClassId: entry.heroClassId } : {}),
      ...(entry.customName ? { customName: entry.customName } : {}),
    };
  });
}

function newKey(unitId: string, index: number): string {
  return `${unitId}-${index}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Clave compuesta para localizar algo del catalogo (unidad o paquete de
 * mejoras): sus identificadores solo son unicos dentro de su libro, asi que
 * con varias facciones a la vez hace falta el par completo para no confundir
 * lo de un libro con lo de otro.
 */
function claveEnLibro(bookKey: string, id: string): string {
  return `${bookKey}:${id}`;
}

/**
 * Reconstruye la composicion a partir de lo guardado. Las unidades que ya no
 * existen en el catalogo se descartan: el libro pudo cambiar de version.
 * `units` es la union de las unidades de todos los libros implicados;
 * `defaultBookKey` cubre las entradas guardadas antes de que cada una
 * llevara su propio `bookKey` (ejercitos de una sola faccion, de antes de
 * poder mezclar varias).
 */
export function rehydrateEntries(
  stored: unknown,
  units: CatalogUnitLike[],
  defaultBookKey?: string,
): BuilderEntry[] {
  if (!Array.isArray(stored)) return [];
  const byId = new Map(units.map((unit) => [claveEnLibro(unit.bookKey, unit.unitId), unit]));

  // Primero se materializan las entradas, guardando de que posicion vienen: los
  // adjuntos se apuntan por indice y hay que reconvertirlos a la `key` nueva
  // saltandose las unidades que ya no existan en el libro.
  const conOrigen = stored.flatMap((raw, indice) => {
    const item = raw as Partial<StoredEntry>;
    const bookKey = item.bookKey ?? defaultBookKey;
    const unit = item.unitId && bookKey ? byId.get(claveEnLibro(bookKey, item.unitId)) : undefined;
    if (!unit) return [];
    const choices: Record<string, number> = {};
    for (const [id, count] of Object.entries(item.choices ?? {})) {
      if (typeof count === "number" && count > 0) choices[id] = count;
    }
    const entry: BuilderEntry = {
      key: newKey(unit.unitId, indice),
      unit,
      choices,
      ...(item.combined ? { combined: true } : {}),
      ...(typeof item.notes === "string" && item.notes ? { notes: item.notes } : {}),
      ...(typeof item.heroClassId === "string" && item.heroClassId ? { heroClassId: item.heroClassId } : {}),
      ...(typeof item.customName === "string" && item.customName ? { customName: item.customName } : {}),
    };
    return [{ entry, indice, attachedTo: typeof item.attachedTo === "number" ? item.attachedTo : undefined }];
  });

  const keyPorIndice = new Map(conOrigen.map(({ entry, indice }) => [indice, entry.key]));
  return conOrigen.map(({ entry, attachedTo }) => {
    const destino = attachedTo === undefined ? undefined : keyPorIndice.get(attachedTo);
    return destino ? { ...entry, attachedTo: destino } : entry;
  });
}

/** Forma minima de una lista de Army Forge, para reconstruir una importacion. */
interface ForgeListShape {
  list?: {
    units?: Array<{
      id?: string;
      /** Uid del libro de Army Forge del que viene esta unidad concreta. */
      armyId?: string;
      selectedUpgrades?: Array<{ optionId?: string }>;
      combined?: boolean;
      notes?: string | null;
      /** Nombre propio puesto en Army Forge, para heroes de quest. */
      customName?: string | null;
      /** Puesto en la segunda mitad de una unidad combinada. */
      joinToUnit?: string | null;
    }>;
  };
}

/**
 * Reconstruye la composicion de un ejercito importado. Los identificadores de
 * unidad y de opcion son los mismos que usa nuestro catalogo, porque salen de
 * la misma fuente; las opciones que ya no existan se pierden, igual que se
 * pierden al importar.
 *
 * Una lista de Army Forge puede mezclar varias facciones: cada unidad trae su
 * propio `armyId` (el uid del libro de Army Forge del que viene), y
 * `uidToBookKey` lo traduce al `bookKey` de nuestro catalogo para saber en que
 * unidades de `units` buscarla.
 */
export function entriesFromForgeList(
  raw: unknown,
  units: CatalogUnitLike[],
  uidToBookKey: Map<string, string>,
): BuilderEntry[] {
  const list = (raw as ForgeListShape)?.list?.units;
  if (!Array.isArray(list)) return [];
  const byId = new Map(units.map((unit) => [claveEnLibro(unit.bookKey, unit.unitId), unit]));

  return list.flatMap((forgeUnit, index) => {
    // Army Forge guarda una unidad combinada como **dos** selecciones: las dos
    // con `combined`, y la segunda apuntando a la primera con `joinToUnit`. Esa
    // segunda es la otra mitad, no otra unidad, y las mejoras van todas en la
    // primera: importarla aparte duplicaria la unidad en la lista.
    if (forgeUnit.joinToUnit) return [];
    const bookKey = forgeUnit.armyId ? uidToBookKey.get(forgeUnit.armyId) : undefined;
    const unit = forgeUnit.id && bookKey ? byId.get(claveEnLibro(bookKey, forgeUnit.id)) : undefined;
    if (!unit) return [];
    const choices: Record<string, number> = {};
    for (const selected of forgeUnit.selectedUpgrades ?? []) {
      if (!selected.optionId) continue;
      choices[selected.optionId] = (choices[selected.optionId] ?? 0) + 1;
    }
    return [
      {
        key: newKey(unit.unitId, index),
        unit,
        choices,
        ...(forgeUnit.combined && sePuedeCombinar(unit) ? { combined: true } : {}),
        ...(typeof forgeUnit.notes === "string" && forgeUnit.notes ? { notes: forgeUnit.notes } : {}),
        ...(typeof forgeUnit.customName === "string" && forgeUnit.customName ? { customName: forgeUnit.customName } : {}),
      },
    ];
  });
}
