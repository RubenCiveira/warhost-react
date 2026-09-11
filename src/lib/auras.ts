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
 * La frase que dice, dentro de una sola oracion, que el efecto no es solo para
 * el modelo: alcanza tambien a la unidad a la que se una. Sin esto un "This
 * model gets Fear(2)" —un buff personal, no un aura— se colaria como si se
 * pudiera prestar. Cubre "its unit" y "their unit" porque el catalogo nombra al
 * heroe en primera o en tercera persona segun el libro.
 */
const MENCIONA_UNIDAD = /\b(?:its|their)\s+unit\b/i;
/** Lo que da esa oracion: el verbo puede ser "get", "gain" o "have", y a veces
 *  lleva alguna palabra suelta antes ("also get Bane"). */
const CONCEDE_A_UNIDAD = /\b(?:get|gets|gain|gains|has|have)\s+(.+?)\s*[.!?]?\s*$/i;

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

/** Lo comun a las dos formas de "concede": separar el matiz y resolver la regla. */
function resolver(match: RegExpExecArray | null, existe: (nombre: string) => boolean): Aura | null {
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
  return { concede: habilidad, alcance };
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
  const resultado = resolver(CONCEDE.exec((descripcion ?? "").trim()), existe);
  // Un aura que se concediera a si misma solo daria vueltas.
  if (resultado && resultado.concede.nombre.toLowerCase() === nombre.trim().toLowerCase()) return null;
  return resultado;
}

/**
 * Que regla le presta un heroe a la unidad a la que se une, si alguna de las
 * oraciones de su descripcion lo dice de forma expresa. A diferencia de
 * `reglaDelAura`, no exige que la regla se llame "... Aura": "Preacher" concede
 * lo mismo que "Bane in Melee Aura" —"This model and its unit get Bane in
 * melee."— sin llevar la palabra en el nombre, y quedaria fuera si solo se
 * mirara el nombre.
 *
 * Se mira oracion por oracion, no la descripcion entera, porque una habilidad
 * con nombre propio suele traer mas texto alrededor —que hace el modelo,
 * cuando se activa— y ese texto de mas no tiene por que ser lo ultimo que
 * dice. Solo cuenta la oracion que menciona "unit": una que solo diga "This
 * model gets Fear(2)" es un buff personal que no le llega a nadie mas.
 */
export function reglaParaLaUnidad(
  descripcion: string | null | undefined,
  existe: (nombre: string) => boolean,
): Aura | null {
  const oraciones = (descripcion ?? "").split(/(?<=[.!?])\s+/);
  for (const oracion of oraciones) {
    if (!MENCIONA_UNIDAD.test(oracion)) continue;
    const resultado = resolver(CONCEDE_A_UNIDAD.exec(oracion.trim()), existe);
    if (resultado) return resultado;
  }
  return null;
}
