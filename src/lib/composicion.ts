/**
 * Limites de composicion de un ejercito ("Force Organisation" opcional del
 * reglamento), segun los puntos que admite y el sistema de juego de la
 * lista. Cada sistema tiene su propia formula, tal cual la da el reglamento:
 *
 *              1 heroe cada   1 unidad cada   1 modelo/Tough cada   1 copia extra cada
 *   GF (std)        500 pts         200 pts   sin limite                  1000 pts
 *   GFF (skirm)      150 pts          30 pts        20 pts                 150 pts
 *   AoF (std)        375 pts         150 pts   sin limite                   750 pts
 *   AoFS (skirm)     125 pts          25 pts        15 pts                 125 pts
 *
 * AoFR (Regiments) no tiene formula propia publicada; se usa la de AoF
 * estandar por ser tambien de escala de batalla, no de escaramuza.
 *
 * Los denominadores dan el numero de heroes/unidades permitidos redondeando
 * hacia arriba (asi el primer heroe/unidad cabe ya con 1 punto), y el de
 * modelos y copias redondeando hacia abajo (solo cuenta el tramo completo).
 * Cuando el sistema no fija limite de modelos (GF y AoF estandar no lo
 * mencionan en el reglamento), esa regla no se comprueba.
 *
 * Nada de esto bloquea: un ejercito puede saltarselas sin problema. Lo que
 * hace esta comprobacion es decirlo, para que se vea en la lista de
 * ejercitos y en su ficha sin tener que abrir el constructor.
 *
 * Los limites se calculan sobre el objetivo de puntos elegido aparte
 * (`Army.pointsLimit`) cuando lo hay, no sobre lo que cuesta la lista
 * todavia: es el objetivo el que fija el escalon de la formula. La lista
 * puede pasarse de ese objetivo sin incumplir, hasta el margen de tolerancia
 * (`Army.pointsMargin`, en tanto por ciento).
 */
import { esHeroe } from "./builder";
import type { GameSystemId } from "./gameSystems";

interface FormulaComposicion {
  heroeCada: number;
  unidadCada: number;
  /** `undefined` cuando el sistema no fija limite de modelos/Tough. */
  modeloCada?: number;
  copiaExtraCada: number;
}

const FORMULAS: Record<GameSystemId, FormulaComposicion> = {
  gf: { heroeCada: 500, unidadCada: 200, copiaExtraCada: 1000 },
  gff: { heroeCada: 150, unidadCada: 30, modeloCada: 20, copiaExtraCada: 150 },
  aof: { heroeCada: 375, unidadCada: 150, copiaExtraCada: 750 },
  aofs: { heroeCada: 125, unidadCada: 25, modeloCada: 15, copiaExtraCada: 125 },
  aofr: { heroeCada: 375, unidadCada: 150, copiaExtraCada: 750 },
};

export interface LimitesComposicion {
  /** 1 heroe por cada X puntos o fraccion, segun el sistema de juego. */
  maxHeroes: number;
  /** 1 unidad por cada X puntos o fraccion, segun el sistema de juego. */
  maxUnidades: number;
  /** Miniaturas contando cada modelo con Tough como tantas como su valor, o `null` si el sistema no limita modelos. */
  maxModelos: number | null;
  /** Copias de la misma unidad: una mas por cada tramo de puntos completo. */
  maxCopiasPorUnidad: number;
}

export function limitesComposicion(puntos: number, gameSystem: GameSystemId): LimitesComposicion {
  if (puntos <= 0) return { maxHeroes: 0, maxUnidades: 0, maxModelos: 0, maxCopiasPorUnidad: 1 };
  const formula = FORMULAS[gameSystem];
  return {
    maxHeroes: Math.ceil(puntos / formula.heroeCada),
    maxUnidades: Math.ceil(puntos / formula.unidadCada),
    maxModelos: formula.modeloCada ? Math.floor(puntos / formula.modeloCada) : null,
    maxCopiasPorUnidad: 1 + Math.floor(puntos / formula.copiaExtraCada),
  };
}

/** Lo minimo que hace falta de cada unidad para comprobar la composicion. */
export interface UnidadComposicion {
  name: string;
  rules: string[];
  maxWounds: number;
}

export interface VerificacionComposicion {
  clave: "puntos" | "heroes" | "unidades" | "modelos" | "copias";
  /** Cierto si el ejercito cumple esta regla en concreto. */
  ok: boolean;
  mensaje: string;
}

/** El limite de puntos objetivo del ejercito, con su margen de tolerancia. */
export interface ObjetivoDePuntos {
  /** Puntos objetivo elegidos aparte; 0 o ausente si no se ha fijado ninguno. */
  puntos: number;
  /** Tolerancia sobre el objetivo, en tanto por ciento. */
  margenPorcentaje: number;
}

/**
 * Como queda el ejercito contra los limites, una entrada por regla, cumpla o
 * no la cumpla. Los limites de composicion (heroes/unidades/modelos/copias)
 * se calculan sobre el `objetivo` de puntos si se ha fijado uno —es el
 * escalon que corresponde jugar, no lo que cuesta la lista todavia—, y si no
 * se ha fijado caen de vuelta en lo que cuesta la lista, como antes.
 *
 * Cuando hay objetivo fijado se anade ademas una regla de "puntos": que la
 * lista no se pase de ese objetivo mas alla de su margen de tolerancia.
 */
export function verificacionesComposicion(
  puntos: number,
  unidades: UnidadComposicion[],
  gameSystem: GameSystemId,
  objetivo?: ObjetivoDePuntos,
): VerificacionComposicion[] {
  const hayObjetivo = Boolean(objetivo && objetivo.puntos > 0);
  const limites = limitesComposicion(hayObjetivo && objetivo ? objetivo.puntos : puntos, gameSystem);

  // Heroes y unidades son cupos separados, no uno dentro del otro —Army
  // Forge los ensena en dos contadores distintos, "Heroes 0/2" y "Units
  // 1/5"—, y eso no cambia porque un heroe se haya unido a una unidad: sigue
  // gastando su propio cupo de heroe, y la unidad a la que se une sigue
  // gastando el suyo de unidad. Contar el heroe tambien como unidad penaliza
  // dos veces lo mismo.
  const heroes = unidades.filter((unidad) => esHeroe(unidad.rules)).length;
  const soloUnidades = unidades.length - heroes;
  const modelos = unidades.reduce((suma, unidad) => suma + unidad.maxWounds, 0);

  const copiasPorNombre = new Map<string, number>();
  for (const unidad of unidades) copiasPorNombre.set(unidad.name, (copiasPorNombre.get(unidad.name) ?? 0) + 1);
  const conDemasiadas = [...copiasPorNombre.entries()].filter(([, copias]) => copias > limites.maxCopiasPorUnidad);
  const masRepetida = [...copiasPorNombre.entries()].sort(([, a], [, b]) => b - a)[0];

  const verificaciones: VerificacionComposicion[] = [];

  if (hayObjetivo && objetivo) {
    const tope = Math.round(objetivo.puntos * (1 + objetivo.margenPorcentaje / 100));
    verificaciones.push({
      clave: "puntos",
      ok: puntos <= tope,
      mensaje:
        `Puntos: ${puntos}/${objetivo.puntos}` +
        (objetivo.margenPorcentaje > 0 ? ` (hasta ${tope} con el ${objetivo.margenPorcentaje}% de margen)` : "") +
        ".",
    });
  }

  verificaciones.push(
    { clave: "heroes", ok: heroes <= limites.maxHeroes, mensaje: `Heroes: ${heroes}/${limites.maxHeroes}.` },
    { clave: "unidades", ok: soloUnidades <= limites.maxUnidades, mensaje: `Unidades: ${soloUnidades}/${limites.maxUnidades}.` },
  );

  // El sistema puede no fijar limite de modelos/Tough (GF y AoF estandar no
  // lo hacen): entonces esta regla no aplica y no se ensena.
  if (limites.maxModelos !== null) {
    verificaciones.push({
      clave: "modelos",
      ok: modelos <= limites.maxModelos,
      mensaje: `Modelos/Tough: ${modelos}/${limites.maxModelos}.`,
    });
  }

  verificaciones.push({
    clave: "copias",
    ok: conDemasiadas.length === 0,
    mensaje:
      conDemasiadas.length > 0
        ? `Mas de ${limites.maxCopiasPorUnidad} copia${limites.maxCopiasPorUnidad === 1 ? "" : "s"} de: ` +
          conDemasiadas.map(([nombre, copias]) => `${nombre} (${copias})`).join(", ")
        : `Copias por unidad: como mucho ${limites.maxCopiasPorUnidad}${masRepetida ? ` (la que mas se repite, ${masRepetida[0]}, lleva ${masRepetida[1]})` : ""}.`,
  });

  return verificaciones;
}
