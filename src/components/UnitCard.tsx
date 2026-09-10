import type { ReactNode } from "react";
import { normalizeLoadout } from "../lib/loadout";
import type { LoadoutEntry } from "../lib/loadout";
import { maxDistinctOptions, maxPicks, optionCost, optionId } from "../lib/builder";
import type { UpgradeOption, UpgradeSection } from "../lib/builder";

/**
 * Ficha de unidad como carta de juego: apaisada y de tamano fijo, con la
 * proporcion 121x70 de kt-cartas. Dentro, el armamento a todo el ancho y debajo
 * dos columnas, reglas y equipo.
 *
 * El tamano es fijo de verdad, no "hasta donde llegue el contenido": la carta
 * mide siempre lo mismo y en pantallas estrechas se encoge entera, como un
 * naipe. Cabe lo que cabe en una carta, que segun el catalogo cubre el 99% de
 * las unidades; lo que sobra se resume en una linea en vez de estirar la caja.
 *
 * Lo que no es perfil de la unidad —las mejoras compradas, las opciones de
 * configuracion, los botones— vive fuera del marco, debajo. La carta es el
 * objeto de consulta; lo demas es anotacion sobre ella.
 */

/** Armas que caben en el cuerpo de la carta sin apretar la tipografia. */
const ARMAS_VISIBLES = 4;

export interface UnitCardData {
  name: string;
  size: number;
  quality: number;
  defense: number;
  cost?: number;
  maxWounds?: number;
  rules: string[];
  loadout: LoadoutEntry[] | unknown;
}

interface Props {
  unit: UnitCardData;
  variant: "catalogo" | "ejercito";
  sections?: UpgradeSection[];
  unitId?: string;
  upgrades?: string[];
  optionAction?: (section: UpgradeSection, option: UpgradeOption) => ReactNode;
  optionsOpen?: boolean;
  optionsLabel?: string;
  footer?: ReactNode;
}

function limitLabel(section: UpgradeSection, unitSize: number): string {
  const parts: string[] = [];
  const affects = section.affects;
  if (affects) {
    if (affects.type === "exactly") parts.push(`${affects.value} modelo${affects.value === 1 ? "" : "s"}`);
    else if (affects.type === "up to") parts.push(`hasta ${affects.value}`);
    else if (affects.type === "all") parts.push("todos");
    else parts.push(`max ${maxPicks(section, unitSize)}`);
  }
  const distinct = maxDistinctOptions(section);
  if (distinct !== Number.POSITIVE_INFINITY) parts.push(`elige ${distinct}`);
  return parts.join(" · ");
}

export default function UnitCard({
  unit,
  variant,
  sections = [],
  unitId = "",
  upgrades = [],
  optionAction,
  optionsOpen = false,
  optionsLabel,
  footer,
}: Props) {
  const loadout = normalizeLoadout(unit.loadout);
  const weapons = loadout.filter((entry) => entry.kind === "weapon");
  const gear = loadout.filter((entry) => entry.kind === "gear");
  const visibles = weapons.slice(0, ARMAS_VISIBLES);
  const ocultas = weapons.length - visibles.length;

  const stats: Array<[string, string]> = [
    ["Min", String(unit.size)],
    ["Cal", `${unit.quality}+`],
    ["Def", `${unit.defense}+`],
  ];
  if (unit.maxWounds !== undefined) stats.push(["Her", String(unit.maxWounds)]);
  if (unit.cost !== undefined) stats.push(["Pts", String(unit.cost)]);

  return (
    <div className="ucard-wrap">
      <div className="ucard-frame">
        <article className={`ucard ucard-${variant}`}>
          <header className="ucard-head">
            <h3 className="ucard-title">{unit.name}</h3>
            <div className="ucard-stats">
              {stats.map(([label, value]) => (
                <div key={label} className="ucard-stat">
                  <span className="ucard-stat-key">{label}</span>
                  <span className="ucard-stat-value">{value}</span>
                </div>
              ))}
            </div>
          </header>

          <div className="ucard-body">
            {weapons.length > 0 ? (
              <table className="ucard-table">
                <thead>
                  <tr>
                    <th>Arma</th>
                    <th className="num">Alc.</th>
                    <th className="num">Atq.</th>
                    <th>Reglas de arma</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((weapon, index) => (
                    <tr key={`${weapon.label}-${index}`}>
                      <td>
                        {weapon.count > 1 ? <span className="ucard-count">{weapon.count}×</span> : null}
                        {weapon.name}
                      </td>
                      <td className="num">{weapon.range === null ? "CaC" : `${weapon.range}"`}</td>
                      <td className="num">{weapon.attacks === null ? "—" : `A${weapon.attacks}`}</td>
                      <td className="ucard-wrules">{weapon.rules.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {ocultas > 0 ? (
              <p className="ucard-mas">
                y {ocultas} arma{ocultas === 1 ? "" : "s"} mas, en el detalle de la unidad
              </p>
            ) : null}

            <div className={gear.length > 0 ? "ucard-cols" : "ucard-cols sin-equipo"}>
              <section className="ucard-col">
                <h4 className="ucard-col-title">Reglas</h4>
                {unit.rules.length > 0 ? (
                  <div className="ucard-tags">
                    {unit.rules.map((rule) => (
                      <span key={rule} className="ucard-tag">
                        {rule}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="ucard-vacio">Ninguna</p>
                )}
              </section>

              {gear.length > 0 ? (
                <section className="ucard-col">
                  <h4 className="ucard-col-title">Equipo</h4>
                  <ul className="ucard-gear">
                    {gear.map((item, index) => (
                      <li key={`${item.label}-${index}`}>
                        {item.count > 1 ? <span className="ucard-count">{item.count}×</span> : null}
                        {item.name}
                        {item.rules.length > 0 ? <span className="ucard-wrules"> ({item.rules.join(", ")})</span> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
        </article>
      </div>

      {variant === "ejercito" && upgrades.length > 0 ? (
        <p className="ucard-upgrades">
          <span className="ucard-label">Mejoras</span>
          {upgrades.join(" · ")}
        </p>
      ) : null}

      {sections.length > 0 && (variant === "catalogo" || optionAction) ? (
        <details className="ucard-options" open={optionsOpen}>
          <summary>
            {optionsLabel ?? "Como configurarla"} <span className="ucard-count">({sections.length} secciones)</span>
          </summary>
          {sections.map((section) => (
            <div key={section.id ?? section.uid} className="ucard-section">
              <p className="ucard-section-head">
                {section.label}
                {limitLabel(section, unit.size) ? (
                  <span className="ucard-limit"> {limitLabel(section, unit.size)}</span>
                ) : null}
              </p>
              <ul className="ucard-option-list">
                {(section.options ?? []).map((option) => (
                  <li key={optionId(option)}>
                    <span>{option.label}</span>
                    {optionAction ? (
                      optionAction(section, option)
                    ) : (
                      <span className="ucard-price">
                        {optionCost(option, unitId) === 0 ? "gratis" : `+${optionCost(option, unitId)}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      ) : null}

      {footer ? <footer className="ucard-foot">{footer}</footer> : null}
    </div>
  );
}
