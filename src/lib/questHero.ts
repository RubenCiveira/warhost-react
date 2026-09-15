/**
 * Perfil inicial de un heroe de Quest (Star Quest / Fantasy Quest).
 *
 * Ingenieria inversa del creador de heroes de Army Forge: los valores de
 * partida son los mismos para cualquier heroe (Calidad 5+, Defensa 6+,
 * Fuerza/Destreza/Voluntad 6+, Poder 3), y la clase elegida no los sobreescribe
 * — les suma encima 2 elecciones de atributo y 2 elecciones de estadistica de
 * combate ya aplicadas, las mismas opciones que se ofrecen al subir de nivel.
 * Defensa no la toca nada: ni la unidad base, ni ninguna clase, ni ninguna de
 * las elecciones de combate.
 */
import type { HeroClass, HeroSkill } from "./types";
import { parseHeroSkills } from "./types";

export const HERO_ABILITY_CHOICES = ["strength", "dexterity", "willpower"] as const;
export type HeroAbilityChoice = (typeof HERO_ABILITY_CHOICES)[number];

export const QUEST_STARTING_GOLD = 30;

export const HERO_ABILITY_LABEL: Record<HeroAbilityChoice, string> = {
  strength: "Fuerza",
  dexterity: "Destreza",
  willpower: "Voluntad",
};

/**
 * Las nueve mejoras de combate del reglamento de Quest, con su efecto sobre
 * el perfil. `twoSkills`, `oneSkill` y `oneCaster` no tocan ningun atributo de
 * la ficha (huecos de habilidad y la regla Caster van aparte).
 */
export const HERO_COMBAT_STAT_CHOICES = [
  "twoSkills",
  "oneSkillOneEnd",
  "twoEnd",
  "oneQua",
  "oneCaster",
  "oneSkill",
  "oneEnd",
  "twoTough",
  "minusQuaTwoSkillsTwoPow",
] as const;
export type HeroCombatStatChoice = (typeof HERO_COMBAT_STAT_CHOICES)[number];

export const HERO_COMBAT_STAT_LABEL: Record<HeroCombatStatChoice, string> = {
  twoSkills: "2 huecos de habilidad",
  oneSkillOneEnd: "1 hueco de habilidad + 1 Poder",
  twoEnd: "2 Poder",
  oneQua: "1 Calidad",
  oneCaster: "1 Poder de conjuro (Caster)",
  oneSkill: "1 hueco de habilidad",
  oneEnd: "1 Poder",
  twoTough: "2 Aguante",
  minusQuaTwoSkillsTwoPow: "-1 Calidad, 2 huecos de habilidad, 2 Poder",
};

export interface PerfilQuest {
  quality: number;
  defense: number;
  strength: number;
  dexterity: number;
  willpower: number;
  power: number;
  tough: number;
  /** Fijo en 1: subir de nivel jugando no esta modelado todavia. */
  level: number;
  /** Fijo en 0: ganar experiencia jugando no esta modelado todavia. */
  experience: number;
  /** Fijo en 30 (questStartingGold de Army Forge): gastarlo en tienda no esta modelado todavia. */
  gold: number;
}

/** El perfil de partida, antes de que la clase le sume nada. */
const BASE: Omit<PerfilQuest, "tough"> = {
  quality: 5,
  defense: 6,
  strength: 6,
  dexterity: 6,
  willpower: 6,
  power: 3,
  level: 1,
  experience: 0,
  gold: QUEST_STARTING_GOLD,
};

/**
 * `toughBase` es el Aguante de la unidad base elegida del catalogo (su regla
 * `Tough(N)`, sin combinar): es lo unico que sí depende de la unidad, todo lo
 * demas depende solo de la clase.
 */
export function perfilInicialQuest(clase: HeroClass | null | undefined, toughBase: number): PerfilQuest {
  const perfil: PerfilQuest = { ...BASE, tough: toughBase };
  for (const eleccion of clase?.abilityChoices ?? []) {
    if (eleccion === "strength") perfil.strength -= 1;
    else if (eleccion === "dexterity") perfil.dexterity -= 1;
    else if (eleccion === "willpower") perfil.willpower -= 1;
  }
  for (const eleccion of clase?.combatStatChoices ?? []) {
    switch (eleccion) {
      case "oneSkillOneEnd":
        perfil.power += 1;
        break;
      case "twoEnd":
        perfil.power += 2;
        break;
      case "oneQua":
        perfil.quality -= 1;
        break;
      case "oneEnd":
        perfil.power += 1;
        break;
      case "twoTough":
        perfil.tough += 2;
        break;
      case "minusQuaTwoSkillsTwoPow":
        perfil.quality += 1;
        perfil.power += 2;
        break;
    }
  }
  return perfil;
}

export function reglasInicialesQuest(clase: HeroClass | null | undefined, rules: string[]): string[] {
  const resultado = [...rules];
  for (const eleccion of clase?.combatStatChoices ?? []) {
    if (eleccion !== "oneCaster") continue;
    const index = resultado.findIndex((rule) => /^caster(?:\((\d+)\))?$/i.test(rule.trim()));
    if (index === -1) resultado.push("Caster(1)");
    else {
      const match = /^caster(?:\((\d+)\))?$/i.exec(resultado[index].trim());
      const rating = Number(match?.[1] ?? 0) + 1;
      resultado[index] = `Caster(${rating})`;
    }
  }
  return [...new Set(resultado)];
}

export function habilidadesInicialesQuest(clase: HeroClass | null | undefined): HeroSkill[] {
  if (!clase) return [];
  const elegidas = new Set(clase.skillChoices ?? []);
  if (elegidas.size === 0) return [];
  return parseHeroSkills(clase.skills).filter((skill) => elegidas.has(skill.name));
}
