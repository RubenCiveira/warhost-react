/**
 * Clasifica una unidad en uno de los tres grupos con los que se ordena una
 * lista: heroes primero, luego la tropa, y al final vehiculos y monstruos.
 *
 * El dato no trae el tipo, asi que se lee de las reglas, que si lo dicen: `Hero`
 * marca al heroe, y un modelo unico con `Tough(X)` que no es heroe es un
 * vehiculo o un monstruo —esa regla es la que los mantiene en pie de una sola
 * herida—. Todo lo demas es tropa.
 */

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
