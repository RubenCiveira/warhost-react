import type { ArmyBook, ArmyUnit, CatalogRule } from "../api/catalog";
import { parseHabilidad } from "./reglas";
import type { Habilidad } from "./reglas";
import { baseLoadout } from "./loadout";

/**
 * Lo que una faccion aporta de su cosecha.
 *
 * Un libro publica sus reglas y las comunes que usan sus unidades mezcladas en
 * la misma lista. Separarlas no es cosa nuestra: el propio dato marca con
 * `coreType` las que vienen del reglamento, y deja en nulo las suyas. Sobre 14
 * libros de Grimdark Future, el 56% de las reglas son exclusivas de una faccion.
 */
export function habilidadesDeFaccion(book: ArmyBook | null, glosario: Map<string, CatalogRule>): CatalogRule[] {
  if (!book?.ruleNames?.length) return [];
  return book.ruleNames
    .map((nombre) => glosario.get(nombre.toLowerCase()))
    .filter((regla): regla is CatalogRule => Boolean(regla) && regla!.coreType === null)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export interface EquipoDeFaccion {
  habilidad: Habilidad;
  /** Unidades del libro que lo llevan de serie. */
  unidades: string[];
}

/**
 * El equipo que aparece en el libro, sacado de las unidades.
 *
 * No hay una lista de equipo en el libro: cada unidad lleva el suyo, asi que se
 * juntan y se cuenta en cuantas sale. Es lo que permite ver de un vistazo si un
 * objeto es de una unidad concreta o de toda la faccion.
 */
export function equipoDeFaccion(units: ArmyUnit[]): EquipoDeFaccion[] {
  const porNombre = new Map<string, EquipoDeFaccion>();

  for (const unit of units) {
    for (const item of baseLoadout(null, unit.items)) {
      const clave = item.name.toLowerCase();
      const ya = porNombre.get(clave);
      if (ya) {
        if (!ya.unidades.includes(unit.name)) ya.unidades.push(unit.name);
        continue;
      }
      porNombre.set(clave, {
        habilidad: { ...parseHabilidad(item.name, "equipo"), concede: item.rules },
        unidades: [unit.name],
      });
    }
  }

  return [...porNombre.values()].sort((a, b) => a.habilidad.nombre.localeCompare(b.habilidad.nombre, "es"));
}
