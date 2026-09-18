/**
 * Hechizos de un libro de ejercito, tal como los guarda `army_books.spells`.
 *
 * El texto ya viene adaptado al modo de juego, porque cada fila del catalogo se
 * descarga con su `gameSystem`: el mismo hechizo alcanza a mas unidades en
 * Firefight que en Grimdark Future. Por eso no hay que tocar nada aqui.
 */

export interface Spell {
  key: string;
  name: string;
  /** Valor a igualar o superar con 1D6 al lanzarlo. */
  threshold: number;
  effect: string;
}

interface ForgeSpell {
  id?: string;
  name?: string;
  threshold?: number;
  effect?: string;
  effectSkirmish?: string;
}

export function parseSpells(json: string | null | undefined): Spell[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return (parsed as ForgeSpell[])
    .filter((spell) => spell.name && spell.effect)
    .map((spell, index) => ({
      key: spell.id ?? `${spell.name}-${index}`,
      name: spell.name as string,
      threshold: spell.threshold ?? 0,
      effect: spell.effect as string,
    }))
    .sort((a, b) => a.threshold - b.threshold || a.name.localeCompare(b.name, "es"));
}

/** Agrupa por umbral, que es como se consultan en mesa. */
export function byThreshold(spells: Spell[]): Array<[number, Spell[]]> {
  const map = new Map<number, Spell[]>();
  for (const spell of spells) {
    const list = map.get(spell.threshold);
    if (list) list.push(spell);
    else map.set(spell.threshold, [spell]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
}

/** Reglas mencionadas por los efectos de una lista de hechizos. */
export function reglasMencionadasEnHechizos<T extends { name: string }>(
  glosario: Map<string, T>,
  spells: Spell[],
): T[] {
  const encontradas = new Map<string, T>();
  const candidatas = [...glosario.values()].sort((a, b) => b.name.length - a.name.length);
  for (const spell of spells) {
    for (const regla of candidatas) {
      const escapado = regla.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patron = new RegExp(`\\b${escapado}(?:\\(\\+?-?\\d+\\))?\\b`);
      if (patron.test(spell.effect)) encontradas.set(regla.name.toLowerCase(), regla);
    }
  }
  return [...encontradas.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}
