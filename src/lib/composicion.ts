/**
 * Limites de composicion de un ejercito, segun los puntos que admite.
 *
 * Army Forge los deriva de los puntos de la partida y no del catalogo: para
 * 1000 puntos ensena "Heroes 0/2", "Units 1/5", "Models/Tough 10/50" y "Max 2
 * unit copies". La unica cifra confirmada palabra por palabra en la wiki de la
 * comunidad es la de unidades —"1 unidad por cada 200 puntos"—; las otras tres
 * se han deducido cruzando esos cuatro numeros contra formulas lineales
 * sencillas, y las cuatro encajan a la vez en 1000 puntos. Si para otro total
 * de puntos alguna no coincide con lo que ensena Army Forge, son estas
 * constantes las que hay que ajustar.
 *
 * La version anterior tambien limitaba una unidad sola al 30% de los puntos;
 * esa restriccion ya no aparece en Army Forge y aqui no se aplica.
 *
 * Nada de esto bloquea: un ejercito puede saltarselas sin problema. Lo que
 * hace esta comprobacion es decirlo, para que se vea en la lista de
 * ejercitos y en su ficha sin tener que abrir el constructor.
 */
import { esHeroe } from "./builder";

export interface LimitesComposicion {
  /** 1 heroe por cada 500 puntos o fraccion. */
  maxHeroes: number;
  /** 1 unidad por cada 200 puntos o fraccion —la unica cifra confirmada tal cual. */
  maxUnidades: number;
  /** Miniaturas contando cada modelo con Tough como tantas como su valor: 1 cada 20 puntos. */
  maxModelos: number;
  /** Copias de la misma unidad: una mas por cada 1000 puntos completos. */
  maxCopiasPorUnidad: number;
}

export function limitesComposicion(puntos: number): LimitesComposicion {
  if (puntos <= 0) return { maxHeroes: 0, maxUnidades: 0, maxModelos: 0, maxCopiasPorUnidad: 1 };
  return {
    maxHeroes: Math.ceil(puntos / 500),
    maxUnidades: Math.ceil(puntos / 200),
    maxModelos: Math.floor(puntos / 20),
    maxCopiasPorUnidad: 1 + Math.floor(puntos / 1000),
  };
}

/** Lo minimo que hace falta de cada unidad para comprobar la composicion. */
export interface UnidadComposicion {
  name: string;
  rules: string[];
  maxWounds: number;
}

export interface VerificacionComposicion {
  clave: "heroes" | "unidades" | "modelos" | "copias";
  /** Cierto si el ejercito cumple esta regla en concreto. */
  ok: boolean;
  mensaje: string;
}

/**
 * Como queda el ejercito contra los cuatro limites, una entrada por regla,
 * cumpla o no la cumpla. Se mide contra los puntos que cuesta el propio
 * ejercito, no contra un limite aparte: el constructor deja fijar uno al
 * montarlo, pero no se guarda en el ejercito ya hecho, asi que fuera del
 * constructor lo unico que hay para comparar es lo que cuesta la lista.
 */
export function verificacionesComposicion(puntos: number, unidades: UnidadComposicion[]): VerificacionComposicion[] {
  const limites = limitesComposicion(puntos);

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

  return [
    { clave: "heroes", ok: heroes <= limites.maxHeroes, mensaje: `Heroes: ${heroes}/${limites.maxHeroes}.` },
    { clave: "unidades", ok: soloUnidades <= limites.maxUnidades, mensaje: `Unidades: ${soloUnidades}/${limites.maxUnidades}.` },
    { clave: "modelos", ok: modelos <= limites.maxModelos, mensaje: `Modelos/Tough: ${modelos}/${limites.maxModelos}.` },
    {
      clave: "copias",
      ok: conDemasiadas.length === 0,
      mensaje:
        conDemasiadas.length > 0
          ? `Mas de ${limites.maxCopiasPorUnidad} copia${limites.maxCopiasPorUnidad === 1 ? "" : "s"} de: ` +
            conDemasiadas.map(([nombre, copias]) => `${nombre} (${copias})`).join(", ")
          : `Copias por unidad: como mucho ${limites.maxCopiasPorUnidad}${masRepetida ? ` (la que mas se repite, ${masRepetida[0]}, lleva ${masRepetida[1]})` : ""}.`,
    },
  ];
}
