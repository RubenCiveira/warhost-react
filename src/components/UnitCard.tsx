import type { ReactNode } from "react";
import { normalizeLoadout } from "../lib/loadout";
import type { LoadoutEntry } from "../lib/loadout";
import { maxDistinctOptions, maxPicks, optionCost, optionId } from "../lib/builder";
import type { UpgradeOption, UpgradeSection } from "../lib/builder";

/**
 * Ficha de unidad con aire de carta de juego: apaisada, clara sobre el fondo
 * oscuro, con banda de titulo, atributos en cajas y el armamento en tabla.
 *
 * Sirve para dos cosas que se parecen mucho pero no son iguales:
 *   - `catalogo`: la unidad como la ofrece el libro, con sus opciones y precios.
 *   - `ejercito`: una unidad ya configurada, con el equipo que le quedo.
 */

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
  /** Secciones de mejora de la unidad. */
  sections?: UpgradeSection[];
  unitId?: string;
  /** Solo en `ejercito`: las opciones que se compraron. */
  upgrades?: string[];
  /**
   * Sustituye el precio de cada opcion por un control propio. Es lo que
   * convierte la carta de consulta en la del constructor, sin duplicarla.
   */
  optionAction?: (section: UpgradeSection, option: UpgradeOption) => ReactNode;
  /** Abre el bloque de opciones de entrada. */
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

  const stats: Array<[string, string]> = [
    ["MIN", String(unit.size)],
    ["CAL", `${unit.quality}+`],
    ["DEF", `${unit.defense}+`],
  ];
  if (unit.maxWounds !== undefined) stats.push(["HER", String(unit.maxWounds)]);
  if (unit.cost !== undefined) stats.push(["PTS", String(unit.cost)]);

  return (
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
              {weapons.map((weapon, index) => (
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

        {gear.length > 0 ? (
          <p className="ucard-line">
            <span className="ucard-label">Equipo</span>
            {gear
              .map((item) => `${item.count > 1 ? `${item.count}× ` : ""}${item.name}${item.rules.length ? ` (${item.rules.join(", ")})` : ""}`)
              .join(" · ")}
          </p>
        ) : null}

        {unit.rules.length > 0 ? (
          <p className="ucard-line">
            <span className="ucard-label">Reglas</span>
            <span className="ucard-tags">
              {unit.rules.map((rule) => (
                <span key={rule} className="ucard-tag">
                  {rule}
                </span>
              ))}
            </span>
          </p>
        ) : null}

        {variant === "ejercito" && upgrades.length > 0 ? (
          <p className="ucard-line">
            <span className="ucard-label">Mejoras</span>
            {upgrades.join(" · ")}
          </p>
        ) : null}

        {sections.length > 0 && (variant === "catalogo" || optionAction) ? (
          <details className="ucard-options" open={optionsOpen}>
            <summary>
              {optionsLabel ?? "Como configurarla"}{" "}
              <span className="ucard-count">({sections.length} secciones)</span>
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
      </div>

      {footer ? <footer className="ucard-foot">{footer}</footer> : null}
    </article>
  );
}
