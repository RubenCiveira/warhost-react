import { parseItems, parseWeapons, rangeLabel } from "../lib/unitProfile";
import { maxDistinctOptions, maxPicks, optionCost, optionId, sectionsForUnit } from "../lib/builder";
import type { UpgradeSection } from "../lib/builder";

interface UnitLike {
  unitId: string;
  name: string;
  size: number;
  quality: number;
  defense: number;
  cost: number;
  rules: string[];
  weapons: string | null;
  items: string | null;
  upgradePackageUids: string[];
}

/** Describe en una linea a cuantos modelos u opciones deja llegar una seccion. */
function limitLabel(section: UpgradeSection, unitSize: number): string {
  const parts: string[] = [];
  const affects = section.affects;
  if (affects) {
    if (affects.type === "exactly") parts.push(`${affects.value} modelo${affects.value === 1 ? "" : "s"}`);
    else if (affects.type === "up to") parts.push(`hasta ${affects.value} modelos`);
    else if (affects.type === "all") parts.push("todos los modelos");
    else parts.push(`cualquier modelo (max ${maxPicks(section, unitSize)})`);
  }
  const distinct = maxDistinctOptions(section);
  if (distinct !== Number.POSITIVE_INFINITY) parts.push(`${distinct} opcion${distinct === 1 ? "" : "es"}`);
  if (section.variant === "replace" && section.targets?.length) parts.push(`sustituye ${section.targets.join(" y ")}`);
  return parts.join(" · ");
}

/**
 * Ficha de consulta de una unidad: perfil, armamento, equipo y las opciones de
 * configuracion con su coste. Es de solo lectura; para elegirlas esta el
 * constructor.
 */
export default function UnitProfile({
  unit,
  packages,
}: {
  unit: UnitLike;
  packages: Map<string, UpgradeSection[]>;
}) {
  const weapons = parseWeapons(unit.weapons);
  const items = parseItems(unit.items);
  const sections = sectionsForUnit(unit, packages);

  return (
    <div className="profile">
      <p className="small muted mono">
        ×{unit.size} · Calidad {unit.quality}+ · Defensa {unit.defense}+ · {unit.cost} pts
      </p>

      {unit.rules.length > 0 ? (
        <div className="row small" style={{ marginBottom: 10 }}>
          {unit.rules.map((rule) => (
            <span key={rule} className="tag">
              {rule}
            </span>
          ))}
        </div>
      ) : null}

      {weapons.length > 0 ? (
        <div className="table-wrap">
          <table className="profile-table">
            <thead>
              <tr>
                <th>Arma</th>
                <th className="num">Alcance</th>
                <th className="num">Ataques</th>
                <th>Reglas</th>
              </tr>
            </thead>
            <tbody>
              {weapons.map((weapon) => (
                <tr key={weapon.key}>
                  <td>
                    {weapon.count > 1 ? <span className="muted mono">{weapon.count}× </span> : null}
                    {weapon.name}
                  </td>
                  <td className="num mono">{rangeLabel(weapon.range)}</td>
                  <td className="num mono">A{weapon.attacks}</td>
                  <td className="small muted">{weapon.rules.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {items.length > 0 ? (
        <p className="small">
          <span className="muted">Equipo: </span>
          {items
            .map((item) => `${item.count > 1 ? `${item.count}× ` : ""}${item.name}${item.grants.length ? ` (${item.grants.join(", ")})` : ""}`)
            .join(" · ")}
        </p>
      ) : null}

      {sections.length > 0 ? (
        <details className="upgrades-details">
          <summary>
            Opciones de configuracion <span className="muted small">({sections.length})</span>
          </summary>
          {sections.map((section) => (
            <div key={section.id ?? section.uid} className="section">
              <p className="section-head small">
                <strong>{section.label}</strong>
                {limitLabel(section, unit.size) ? (
                  <span className="muted"> · {limitLabel(section, unit.size)}</span>
                ) : null}
              </p>
              <ul className="option-list small">
                {(section.options ?? []).map((option) => (
                  <li key={optionId(option)}>
                    <span>{option.label}</span>
                    <span className="muted mono">
                      {optionCost(option, unit.unitId) === 0
                        ? "gratis"
                        : `+${optionCost(option, unit.unitId)} pts`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      ) : null}
    </div>
  );
}
