/**
 * Clasifica una unidad en uno de los tres grupos con los que se ordena una
 * lista: heroes primero, luego la tropa, y al final vehiculos y monstruos.
 *
 * El dato no trae el tipo, asi que se lee de las reglas, que si lo dicen: `Hero`
 * marca al heroe, y un modelo unico con `Tough(X)` que no es heroe es un
 * vehiculo o un monstruo —esa regla es la que los mantiene en pie de una sola
 * herida—. Todo lo demas es tropa.
 */
import type { ResolvedUnit } from "./armyForgeResolve";

export type GrupoUnidad = "heroe" | "base" | "vehiculo";

export interface UnidadClasificable {
  rules: string[];
  size: number;
  cost: number;
}

const ETIQUETA_GRUPO: Record<GrupoUnidad, string> = {
  heroe: "Héroes",
  base: "Base",
  vehiculo: "Vehículos y monstruos",
};

const ES_TOUGH = /^tough\(\d+\)$/i;

export function grupoDeUnidad({ rules, size }: UnidadClasificable): GrupoUnidad {
  if (rules.some((regla) => regla.trim().toLowerCase() === "hero")) return "heroe";
  if (size === 1 && rules.some((regla) => ES_TOUGH.test(regla.trim()))) return "vehiculo";
  return "base";
}

export interface GrupoDeUnidades<T> {
  grupo: GrupoUnidad;
  etiqueta: string;
  unidades: T[];
}

const ORDEN_GRUPOS: GrupoUnidad[] = ["heroe", "base", "vehiculo"];

/**
 * Reparte las unidades en sus grupos, en el orden fijo de la lista, y dentro de
 * cada uno de mas a menos puntos. Los grupos sin ninguna unidad no salen.
 */
export function agruparUnidades<T extends UnidadClasificable>(units: T[]): GrupoDeUnidades<T>[] {
  const porGrupo = new Map<GrupoUnidad, T[]>();
  for (const unit of units) {
    const grupo = grupoDeUnidad(unit);
    const lista = porGrupo.get(grupo) ?? [];
    lista.push(unit);
    porGrupo.set(grupo, lista);
  }
  return ORDEN_GRUPOS.flatMap((grupo) => {
    const unidades = porGrupo.get(grupo);
    if (!unidades?.length) return [];
    return [{ grupo, etiqueta: ETIQUETA_GRUPO[grupo], unidades: [...unidades].sort((a, b) => b.cost - a.cost) }];
  });
}

/** Una entrada de la lista: una unidad suelta, o un heroe con su unidad unida. */
export interface FilaEjercito extends UnidadClasificable {
  key: string;
  /** La carta que se pinta. Si hay union, es el heroe. */
  principal: ResolvedUnit;
  /** Indice en la lista guardada, para reconfigurar. */
  indice: number;
  /** La unidad a la que se ha unido el heroe, si la hay. */
  adjunta?: ResolvedUnit;
  indiceAdjunta?: number;
}

/**
 * Empareja cada heroe unido con su unidad: la unidad sale de su seccion y se
 * pinta dentro de la carta del heroe. `attachedTo` viene por indice en la lista
 * guardada, que va en el mismo orden que `units`.
 *
 * Para clasificar y ordenar, la fila expone las reglas del heroe y la suma de
 * miniaturas y puntos de los dos.
 */
export function emparejarHeroes(
  units: ResolvedUnit[],
  attachedTo: Array<number | undefined>,
): FilaEjercito[] {
  const absorbidas = new Set<number>();
  attachedTo.forEach((destino, i) => {
    if (typeof destino === "number" && destino >= 0 && destino < units.length && destino !== i) {
      absorbidas.add(destino);
    }
  });

  return units.flatMap((unit, i) => {
    if (absorbidas.has(i)) return [];
    const key = `${unit.unitKey ?? unit.name}-${unit.sortOrder}`;
    const destino = attachedTo[i];
    const adjunta =
      typeof destino === "number" && destino >= 0 && destino < units.length && destino !== i ? units[destino] : undefined;
    if (!adjunta) {
      return [{ key, rules: unit.rules, size: unit.size, cost: unit.cost, principal: unit, indice: i }];
    }
    return [
      {
        key,
        rules: unit.rules,
        size: unit.size + adjunta.size,
        cost: unit.cost + adjunta.cost,
        principal: unit,
        indice: i,
        adjunta,
        indiceAdjunta: destino,
      },
    ];
  });
}
