import { Query, tables } from "../lib/appwrite";
import { TABLES, env } from "../lib/env";
import type { GameSystemId, Setting } from "../lib/gameSystems";
import type { Mission, Rule } from "../lib/types";

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

export async function listMissions(setting: Setting, gameSystem?: GameSystemId): Promise<Mission[]> {
  const result = await tables.listRows<Mission>({
    databaseId: env.databaseId,
    tableId: TABLES.missions,
    queries: [Query.equal("setting", setting), Query.orderAsc("sortOrder"), Query.limit(200)],
  });
  if (!gameSystem) return result.rows;
  return result.rows.filter((mission) => !mission.gameSystems?.length || mission.gameSystems.includes(gameSystem));
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
