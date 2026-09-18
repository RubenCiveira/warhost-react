import type { Gain } from "./loadout";

export interface RuleLike {
  name?: string;
  label?: string;
  rating?: string | number;
}

export function gainLabel(gain: RuleLike): string {
  if (gain.label) return gain.label;
  if (!gain.name) return "";
  return gain.rating === undefined || gain.rating === null || gain.rating === ""
    ? gain.name
    : `${gain.name}(${gain.rating})`;
}

export function gainName(gain: RuleLike): string {
  return gain.name ?? gain.label ?? "";
}

export function gainIsWeapon(gain: Gain): boolean {
  return gain.type?.includes("Weapon") === true || typeof gain.attacks === "number" || typeof gain.range === "number";
}

export function gainIsRule(gain: Gain): boolean {
  if (gain.type) return gain.type.includes("Rule");
  return gain.range === undefined && gain.attacks === undefined && !gain.specialRules && !gain.content;
}

export function walkGains(gains: readonly Gain[] | undefined, visit: (gain: Gain) => void): void {
  for (const gain of gains ?? []) {
    visit(gain);
    walkGains(gain.content, visit);
    walkGains(gain.specialRules, visit);
  }
}

export function ruleLabelsFromGains(gains: readonly Gain[] | undefined): string[] {
  const rules: string[] = [];
  walkGains(gains, (gain) => {
    if (gainIsRule(gain)) rules.push(gainLabel(gain));
  });
  return rules.filter(Boolean);
}
