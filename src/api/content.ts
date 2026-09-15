import { Query, tables } from "../lib/appwrite";
import { TABLES, env } from "../lib/env";
import type { GameSystemId, Setting } from "../lib/gameSystems";
import type { HeroClass, Mission, QuestShopPackage, Rule } from "../lib/types";

export async function listRules(setting: Setting): Promise<Rule[]> {
  // El indice de reglas es pequeno, asi que se trae entero y se filtra en cliente:
  // asi la busqueda es instantanea y cubre cuerpo y etiquetas, no solo el titulo.
  const result = await tables.listRows<Rule>({
    databaseId: env.databaseId,
    tableId: TABLES.rules,
    queries: [Query.equal("setting", setting), Query.orderAsc("sortOrder"), Query.limit(500)],
  });
  return result.rows;
}

/** Las cartas de un modo de juego, en el orden del mazo (11-66). */
export async function listMissions(setting: Setting, gameSystem?: GameSystemId): Promise<Mission[]> {
  const result = await tables.listRows<Mission>({
    databaseId: env.databaseId,
    tableId: TABLES.missions,
    queries: [
      gameSystem ? Query.equal("gameSystem", gameSystem) : Query.equal("setting", setting),
      Query.orderAsc("sortOrder"),
      Query.limit(200),
    ],
  });
  return result.rows;
}

/** Corrige una carta. Solo lo permite la tabla a quien lleve la etiqueta `editor`. */
export async function saveMission(
  id: string,
  cambios: Partial<Pick<Mission, "name" | "description" | "vp" | "verified">>,
): Promise<Mission> {
  return tables.updateRow<Mission>({
    databaseId: env.databaseId,
    tableId: TABLES.missions,
    rowId: id,
    data: cambios,
  });
}

/** Las clases de heroe de Quest de un sistema, en el orden fijo del libro (default primero). */
export async function listHeroClasses(gameSystem: GameSystemId): Promise<HeroClass[]> {
  const result = await tables.listRows<HeroClass>({
    databaseId: env.databaseId,
    tableId: TABLES.heroClasses,
    queries: [Query.equal("gameSystem", gameSystem), Query.orderAsc("sortOrder"), Query.limit(50)],
  });
  return result.rows;
}

/** Equipamiento comun de tienda inicial Quest, compartido por cualquier heroe del sistema. */
export async function listQuestShopPackages(gameSystem: GameSystemId): Promise<QuestShopPackage[]> {
  const result = await tables.listRows<QuestShopPackage>({
    databaseId: env.databaseId,
    tableId: TABLES.questShopPackages,
    queries: [Query.equal("gameSystem", gameSystem), Query.orderAsc("sortOrder"), Query.limit(100)],
  });
  return result.rows;
}

/** Corrige una clase de heroe. Solo lo permite la tabla a quien lleve la etiqueta `editor`. */
export async function saveHeroClass(
  id: string,
  cambios: Partial<
    Pick<
      HeroClass,
      | "name"
      | "description"
      | "classFeatName"
      | "classFeatText"
      | "skills"
      | "abilityChoices"
      | "combatStatChoices"
      | "skillChoices"
      | "verified"
    >
  >,
): Promise<HeroClass> {
  return tables.updateRow<HeroClass>({
    databaseId: env.databaseId,
    tableId: TABLES.heroClasses,
    rowId: id,
    data: cambios,
  });
}

/** Filtra en memoria por titulo, cuerpo y etiquetas. */
export function filterRules(rules: Rule[], search: string, gameSystem?: GameSystemId): Rule[] {
  const needle = search.trim().toLowerCase();
  return rules.filter((rule) => {
    if (gameSystem && rule.gameSystems?.length && !rule.gameSystems.includes(gameSystem)) return false;
    if (!needle) return true;
    return (
      rule.title.toLowerCase().includes(needle) ||
      rule.body.toLowerCase().includes(needle) ||
      rule.category.toLowerCase().includes(needle) ||
      (rule.tags ?? []).some((tag) => tag.toLowerCase().includes(needle))
    );
  });
}
