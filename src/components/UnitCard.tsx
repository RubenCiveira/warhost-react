import type { ReactNode } from "react";
import { normalizeLoadout } from "../lib/loadout";
import type { LoadoutEntry } from "../lib/loadout";
import { maxDistinctOptions, optionCost, optionId } from "../lib/builder";
import type { UpgradeOption, UpgradeSection } from "../lib/builder";
import IconoArma from "./IconoArma";
import { parseHabilidad } from "../lib/reglas";
import type { Habilidad } from "../lib/reglas";

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

/**
 * Tope de armas en la carta. Es el maximo que tiene el catalogo, asi que en la
 * practica no se esconde ninguna: quien aprieta el texto cuando hace falta es
 * `densidad`, no el recorte. El tope se queda como red por si un ejercito
 * importado trae una unidad con mas de las que existen en los libros.
 */
const ARMAS_VISIBLES = 6;

/*
 * Las reglas y el equipo van en lista, una por linea, y no en etiquetas: es la
 * forma que admite anadirles su descripcion debajo sin rehacer la carta, que es
 * lo que acabara llenando el cuerpo.
 */

/**
 * Cuanto texto lleva la carta, para poder apretar la tipografia cuando toca.
 * Una caja de tamano fijo no puede con todo, y lo que decide si desborda no es
 * el numero de armas sino los renglones que ocupan: un arma con cuatro reglas
 * envuelve y cuenta por dos.
 */
function densidad(weapons: LoadoutEntry[], rules: string[], gear: LoadoutEntry[]): "" | " denso" | " muy-denso" {
  const renglones =
    weapons.reduce((suma, arma) => suma + Math.ceil((arma.rules.join(", ").length || 1) / 28), 0) +
    weapons.length +
    Math.ceil(rules.length / 2) +
    gear.reduce((suma, item) => suma + Math.ceil((item.name.length + item.rules.join(", ").length) / 26), 0);

  if (renglones >= 11) return " muy-denso";
  if (renglones >= 8) return " denso";
  return "";
}

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
  /**
   * Nombres de regla que tienen descripcion. Los chips que no esten aqui se
   * marcan como del reglamento basico y no invitan a pulsar.
   */
  conTexto?: Set<string>;
  /** Abrir la carta de una habilidad o de un equipo. */
  onHabilidad?: (habilidad: Habilidad) => void;
}

/**
 * Anotacion sobre los limites de una seccion.
 *
 * No repite a cuantos modelos alcanza: la etiqueta de Army Forge ya lo dice
 * —"Replace all Adrenaline Fueleds", "Replace one Heavy Rifle"— y al anadirlo
 * detras salia "Replace all Adrenaline Fueleds todos". Solo se anota lo que la
 * etiqueta no cuenta: cuantas opciones distintas caben.
 */
function limitLabel(section: UpgradeSection): string {
  const distinct = maxDistinctOptions(section);
  if (distinct === Number.POSITIVE_INFINITY) return "";
  return `elige ${distinct === 1 ? "una" : distinct}`;
}

/** Una habilidad o un equipo, pulsable para abrir su carta. */
function Chip({
  habilidad,
  cuantos = 1,
  conTexto,
  onAbrir,
}: {
  habilidad: Habilidad;
  cuantos?: number;
  conTexto?: Set<string>;
  onAbrir?: (habilidad: Habilidad) => void;
}) {
  // Sin glosario cargado no se sabe cuales tienen texto: se dejan todas
  // pulsables antes que marcarlas en falso.
  const tieneTexto = !conTexto || conTexto.has(habilidad.nombre.toLowerCase());
  const clases = ["ucard-chip", habilidad.tipo === "equipo" ? "equipo" : "", tieneTexto ? "" : "sin-texto"]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={clases}
      disabled={!onAbrir}
      title={tieneTexto ? `Ver ${habilidad.nombre}` : `${habilidad.nombre}: regla del reglamento basico`}
      onClick={() => onAbrir?.(habilidad)}
    >
      {cuantos > 1 ? <span className="ucard-count">{cuantos}×</span> : null}
      {habilidad.nombre}
      {habilidad.valor ? <span className="valor">({habilidad.valor})</span> : null}
    </button>
  );
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
  conTexto,
  onHabilidad,
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
        <article className={`ucard ucard-${variant}${densidad(weapons, unit.rules, gear)}`}>
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
              <div className="ucard-armas">
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
                        <span className="ucard-arma">
                          <IconoArma tipo={weapon.range === null ? "cac" : "distancia"} />
                          <span className="ucard-arma-nombre">
                            {weapon.count > 1 ? <span className="ucard-count">{weapon.count}×</span> : null}
                            {weapon.name}
                          </span>
                        </span>
                      </td>
                      <td className="num">{weapon.range === null ? "CaC" : `${weapon.range}"`}</td>
                      <td className="num">{weapon.attacks === null ? "—" : `A${weapon.attacks}`}</td>
                      <td className="ucard-wrules">{weapon.rules.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ocultas > 0 ? (
                <p className="ucard-mas">
                  y {ocultas} arma{ocultas === 1 ? "" : "s"} mas, en el detalle de la unidad
                </p>
              ) : null}
              </div>
            ) : null}

            <div className={gear.length > 0 ? "ucard-cols" : "ucard-cols sin-equipo"}>
              <section className="ucard-col">
                <h4 className="ucard-col-title">Reglas</h4>
                {unit.rules.length > 0 ? (
                  <div className="ucard-chips">
                    {unit.rules.map((rule) => (
                      <Chip
                        key={rule}
                        habilidad={parseHabilidad(rule, "regla")}
                        conTexto={conTexto}
                        onAbrir={onHabilidad}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="ucard-vacio">Ninguna</p>
                )}
              </section>

              {gear.length > 0 ? (
                <section className="ucard-col">
                  <h4 className="ucard-col-title">Equipo</h4>
                  <div className="ucard-chips">
                    {gear.map((item, index) => (
                      <Chip
                        key={`${item.label}-${index}`}
                        habilidad={{ ...parseHabilidad(item.name, "equipo"), concede: item.rules }}
                        cuantos={item.count}
                        conTexto={conTexto}
                        onAbrir={onHabilidad}
                      />
                    ))}
                  </div>
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
                {limitLabel(section) ? <span className="ucard-limit"> · {limitLabel(section)}</span> : null}
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
