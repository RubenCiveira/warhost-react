/**
 * Cuanto aprieta la tipografia de una carta Mini Euro (.scard) segun lo largo
 * que sea su texto. Los hechizos no pasan de 209 caracteres y caben en el
 * escalon normal, pero algunas reglas y objetos de equipo superan los 500 y
 * necesitan letra mas pequena para no desbordar la carta.
 */
export function densidadScard(...textos: (string | null | undefined)[]): "" | " denso" {
  const longitud = textos.reduce((suma, texto) => suma + (texto?.length ?? 0), 0);
  return longitud >= 380 ? " denso" : "";
}
