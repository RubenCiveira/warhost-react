/**
 * Las reglas de aura conceden otra regla, y esa es la que hay que consultar.
 *
 * "Bane in Melee Aura" no dice que hace: dice que la unidad gana Bane, y Bane
 * es lo que quieres leer en mitad de una partida. La regla concedida se saca de
 * la **descripcion** —"This model and its unit get Bane in melee."— y no del
 * nombre, porque la descripcion es la que declara lo que concede: cuando el
 * aura incrusta su efecto en vez de conceder una regla —"+1 to hit rolls"— no
 * hay nada que enlazar, y eso tambien lo dice la descripcion.
 */
import { parseHabilidad } from "./reglas";
import type { Habilidad } from "./reglas";

/** El texto tras "get", hasta el final de la frase. */
const CONCEDE = /\bget\s+(.+?)\s*\.?\s*$/i;

/**
 * Coletillas que acotan cuando se aplica, no que se concede: "Bane in melee"
 * sigue siendo Bane.
 */
const ALCANCE = [/\s+in\s+melee$/i, /\s+when\s+shooting$/i, /\s+when\s+charging$/i];

export interface Aura {
  /** La regla que concede, tal como se busca en el glosario. */
  concede: Habilidad;
  /** El matiz que la acota, si lo lleva: "en melee". */
  alcance: string | null;
}

/**
 * Que regla concede un aura, si es que concede alguna y la conocemos.
 *
 * `existe` decide si la candidata es una regla de verdad: sin eso, un aura que
 * incrusta su efecto acabaria ofreciendo una carta de "+1 to hit rolls".
 */
export function reglaDelAura(
  nombre: string,
  descripcion: string | null | undefined,
  existe: (nombre: string) => boolean,
): Aura | null {
  if (!/\baura$/i.test(nombre.trim())) return null;
  const match = CONCEDE.exec((descripcion ?? "").trim());
  if (!match) return null;

  let base = match[1].trim();
  let alcance: string | null = null;
  for (const coletilla of ALCANCE) {
    const encontrada = coletilla.exec(base);
    if (!encontrada) continue;
    alcance = encontrada[0].trim();
    base = base.slice(0, encontrada.index).trim();
    break;
  }

  const habilidad = parseHabilidad(base, "regla");
  if (!habilidad.nombre || !existe(habilidad.nombre)) return null;
  // Un aura que se concediera a si misma solo daria vueltas.
  if (habilidad.nombre.toLowerCase() === nombre.trim().toLowerCase()) return null;
  return { concede: habilidad, alcance };
}
