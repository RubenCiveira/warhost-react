/**
 * Una regla o un objeto de equipo tal como se muestran en la carta.
 *
 * El nombre que lleva una unidad viene con su valor —"Tough(6)", "Impact(3)"—
 * mientras que el glosario lo guarda pelado. Separarlos es lo que permite
 * buscar la descripcion y seguir enseñando el valor.
 */
export interface Habilidad {
  /** Como se escribe en la carta: "Tough(6)". */
  etiqueta: string;
  /** Como se busca en el glosario: "Tough". */
  nombre: string;
  /** El valor entre parentesis, si lo lleva. */
  valor: string | null;
  tipo: "regla" | "equipo";
  /** Reglas que concede un objeto de equipo. */
  concede?: string[];
}

const CON_VALOR = /^(.+?)\((.+)\)$/;

export function parseHabilidad(etiqueta: string, tipo: "regla" | "equipo" = "regla"): Habilidad {
  const limpia = etiqueta.trim();
  const match = CON_VALOR.exec(limpia);
  if (!match) return { etiqueta: limpia, nombre: limpia, valor: null, tipo };
  return { etiqueta: limpia, nombre: match[1].trim(), valor: match[2].trim(), tipo };
}

/**
 * Mete el valor de la unidad en la descripcion del glosario.
 *
 * Las descripciones estan escritas con una X donde va el valor —"debe recibir X
 * heridas"—, asi que sin sustituirla la carta de una unidad con Tough(6) diria
 * X en vez de 6, que es justo el dato que se consulta.
 */
export function conValor(descripcion: string, valor: string | null): string {
  if (!valor) return descripcion;
  return descripcion.replace(/\bX\b/g, valor);
}
