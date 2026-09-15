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

/** Escapa un nombre para meterlo literal dentro de un regex. */
function escapado(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Trocea un texto libre —la descripcion de una regla, un hechizo o un
 * objeto— separando las menciones a otras reglas del glosario, para poder
 * pintarlas como referencias pulsables en vez de texto suelto.
 *
 * Igual que `mencionada()` en `faccion.ts`, exige mayusculas exactas y palabra
 * completa: las reglas del reglamento se nombran en capital ("gets AP(+4)"),
 * y sin eso una palabra corriente como "hit" se colaria como si "Hit" fuera
 * una regla real. `propio` excluye el nombre de la propia regla, para que su
 * carta no se enlace a si misma cuando se repite en su descripcion.
 */
export function resaltarMenciones(
  texto: string,
  glosario: Map<string, { name: string }>,
  propio?: string,
): (string | Habilidad)[] {
  const candidatas = [...glosario.values()]
    .filter((regla) => regla.name.toLowerCase() !== propio?.toLowerCase())
    .sort((a, b) => b.name.length - a.name.length);
  if (candidatas.length === 0) return [texto];

  const patron = new RegExp(`\\b(${candidatas.map((regla) => escapado(regla.name)).join("|")})(\\(\\+?-?\\d+\\))?\\b`, "g");
  const partes: (string | Habilidad)[] = [];
  let ultimo = 0;
  for (const match of texto.matchAll(patron)) {
    if (match.index === undefined) continue;
    if (match.index > ultimo) partes.push(texto.slice(ultimo, match.index));
    partes.push(parseHabilidad(match[0], "regla"));
    ultimo = match.index + match[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}
