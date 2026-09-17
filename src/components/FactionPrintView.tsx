import { useMemo } from "react";
import type { ArmyBook, ArmyUnit, CatalogRule } from "../api/catalog";
import { sectionsForUnit } from "../lib/builder";
import type { UpgradeSection } from "../lib/builder";
import type { ResolvedUnit } from "../lib/armyForgeResolve";
import { baseLoadout } from "../lib/loadout";
import { agruparUnidades } from "../lib/unidades";
import { FichaOpcionesLibro, FichaUnidadLibro } from "./ArmyPrintView";

function unidadResuelta(unit: ArmyUnit): ResolvedUnit {
  return {
    name: unit.name,
    unitKey: unit.unitId,
    bookKey: unit.bookKey,
    size: unit.size,
    quality: unit.quality,
    defense: unit.defense,
    maxWounds: 1,
    cost: unit.cost,
    rules: unit.rules,
    loadout: baseLoadout(unit.weapons, unit.items),
    upgrades: [],
    unresolvedUpgrades: 0,
    sortOrder: unit.sortOrder,
  };
}

export default function FactionPrintView({
  book,
  units,
  packages,
  glosario,
  onCerrar,
}: {
  book: ArmyBook;
  units: ArmyUnit[];
  packages: Map<string, UpgradeSection[]>;
  glosario: Map<string, CatalogRule>;
  onCerrar: () => void;
}) {
  const secciones = useMemo(() => agruparUnidades(units), [units]);

  return (
    <div className="print-vista print-faccion">
      <div className="print-toolbar">
        <button type="button" onClick={onCerrar}>
          Cancelar
        </button>
        <h2 className="print-toolbar-title">Imprimir {book.name}</h2>
        <button type="button" className="primary" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>

      <div className="print-libro print-faccion-libro">
        {secciones.map((grupo) => (
          <section key={grupo.grupo} className="print-faccion-grupo">
            <h3 className="army-group-sep">
              {grupo.etiqueta}
              <span className="army-group-count">{grupo.unidades.length}</span>
            </h3>
            {grupo.unidades.map((unit) => {
              const sections = sectionsForUnit(unit, packages);
              return (
                <div key={unit.$id} className="army-slide print-faccion-unidad">
                  <FichaUnidadLibro unit={unidadResuelta(unit)} glosario={glosario} libro={book} />
                  <FichaOpcionesLibro nombre={unit.name} unitId={unit.unitId} sections={sections} glosario={glosario} />
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
