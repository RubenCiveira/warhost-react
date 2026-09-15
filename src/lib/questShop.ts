import { entryRules, esHeroe, parseSections, toughOf } from "./builder";
import type { BuilderEntry, UpgradeSection } from "./builder";
import { isQuestSystem } from "./gameSystems";
import type { GameSystemId } from "./gameSystems";
import { reglasInicialesQuest } from "./questHero";
import type { HeroClass, QuestShopPackage } from "./types";

export function questShopSectionsForEntry(
  entry: BuilderEntry,
  baseSections: UpgradeSection[],
  shopPackages: QuestShopPackage[],
  heroClasses: HeroClass[],
  gameSystem?: GameSystemId,
): UpgradeSection[] {
  if (!gameSystem || !isQuestSystem(gameSystem) || !esHeroe(entry.unit.rules)) return [];

  const heroClass = entry.heroClassId ? heroClasses.find((candidate) => candidate.$id === entry.heroClassId) : undefined;
  const rules = reglasInicialesQuest(heroClass, entryRules(entry, baseSections));
  const tough = toughOf(entry.unit.rules);
  const hasCaster = rules.some((rule) => /^caster(?:\(\d+\))?$/i.test(rule.trim()));

  return shopPackages.flatMap((shopPackage) => {
    if (shopPackage.classKeys.length > 0 && (!heroClass || !shopPackage.classKeys.includes(heroClass.classKey))) return [];
    if (shopPackage.requiresCaster && !hasCaster) return [];
    if (shopPackage.minTough !== null && tough < shopPackage.minTough) return [];
    if (shopPackage.maxTough !== null && tough > shopPackage.maxTough) return [];
    return parseSections(shopPackage.sections);
  });
}
