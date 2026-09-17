/**
 * Reparto en hojas para el modo "tarjetas con dorso": cada hoja de anverso va
 * seguida de su hoja de reverso, con el mismo numero de cartas y en el mismo
 * sitio, para que al voltear el papel por el borde largo —como se pasa la
 * hoja de un libro— cada carta caiga encima de su dorso.
 */

/** A4 vertical, con el mismo margen que ya fija `@page` para toda la
 *  impresion: cuadricula() tiene que partir del mismo hueco util o las
 *  cuentas no cuadran con lo que sale de verdad en papel. */
export const PAGINA_MM = { ancho: 210, alto: 297, margen: 10 } as const;
/** Separacion entre cartas en la hoja, en mm: cuenta como una carta mas de
 *  ancho/alto a la hora de ver cuantas caben. */
const HUECO_MM = 4;

/**
 * Cuantas columnas y filas de una carta de `anchoMm x altoMm` caben de
 * verdad en una hoja A4 a tamano real, sin recortar ninguna. Siempre deja al
 * menos una columna y una fila, aunque la carta no quepa entera: mejor una
 * carta que se sale del margen que una pantalla en blanco.
 *
 * `apaisada` prueba la hoja girada (297x210 en vez de 210x297): una carta
 * tipo tarot, mas ancha que alta, aprovecha mejor una hoja tambien apaisada
 * —cuatro por hoja en vez de tres—, asi que quien llama elige la orientacion
 * que mas cartas deje en pie, no siempre la de la pagina por defecto.
 */
export function cuadriculaPorHoja(anchoMm: number, altoMm: number, apaisada = false): { columnas: number; filas: number } {
  const pagina = apaisada ? { ancho: PAGINA_MM.alto, alto: PAGINA_MM.ancho } : PAGINA_MM;
  const util = { ancho: pagina.ancho - PAGINA_MM.margen * 2, alto: pagina.alto - PAGINA_MM.margen * 2 };
  const columnas = Math.max(1, Math.floor((util.ancho + HUECO_MM) / (anchoMm + HUECO_MM)));
  const filas = Math.max(1, Math.floor((util.alto + HUECO_MM) / (altoMm + HUECO_MM)));
  return { columnas, filas };
}

/** Trocea en grupos de `tamano`, el ultimo mas corto si no encaja entero. */
export function trocear<T>(items: T[], tamano: number): T[][] {
  const hojas: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) hojas.push(items.slice(i, i + tamano));
  return hojas;
}

/**
 * El mismo grupo de una hoja, pero con las columnas invertidas fila a fila:
 * es lo que hay que pintar en el reverso para que, al voltear por el borde
 * largo, cada casilla quede detras de la misma casilla del anverso.
 */
export function espejarHoja<T>(hoja: T[], columnas: number): Array<T | null> {
  const filas = trocear(hoja, columnas);
  return filas.flatMap((fila) => {
    // La ultima fila puede ir incompleta: se rellena con huecos en vez de
    // arrastrar la carta que sigue a la casilla que no existe.
    const completa: Array<T | null> = [...fila];
    while (completa.length < columnas) completa.push(null);
    return completa.reverse();
  });
}
