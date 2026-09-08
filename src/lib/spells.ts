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
