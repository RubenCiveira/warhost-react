import type { ReactNode } from "react";
import { normalizeLoadout } from "../lib/loadout";
import type { LoadoutEntry } from "../lib/loadout";
import { maxDistinctOptions, optionCost, optionId } from "../lib/builder";
import type { UpgradeOption, UpgradeSection } from "../lib/builder";
import IconoArma from "./IconoArma";
import { parseHabilidad } from "../lib/reglas";
import { desglosarOpcion } from "../lib/opciones";
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
  /**
   * `tarot` es la carta de mesa, 120 x 70 mm, para una unidad ya configurada.
   * `hoja` es la ficha de catalogo: 190 x 134 mm, dos por A4, con las opciones
   * de configuracion dentro en vez de colgando debajo. Una unidad del catalogo
   * sin sus opciones esta a medias, y esas no caben en una carta de mesa.
   */
  formato?: "tarot" | "hoja";
  footer?: ReactNode;
  /**
   * Nombres de regla que tienen descripcion. Los chips que no esten aqui se
   * marcan como del reglamento basico y no invitan a pulsar.
   */
  /** Unidad combinada: se avisa en la carta porque el perfil ya viene doblado. */
  combinada?: boolean;
  /** Anotacion del jugador sobre esta unidad. */
  notas?: string;
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
  // pulsables antes que marcarlas en falso. Un conjunto vacio es justo eso —
  // todavia cargando, o no llego—, no "ninguna tiene descripcion".
  const tieneTexto = !conTexto || conTexto.size === 0 || conTexto.has(habilidad.nombre.toLowerCase());
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

/**
 * Que tan apretadas tienen que ir las opciones en la ficha de catalogo.
 *
 * La ficha mide lo que mide, asi que lo que no cabe desaparece en silencio. La
 * tentacion es contar opciones y poner umbrales a ojo, pero eso falla en las
 * dos direcciones: aprieta fichas que tenian sitio de sobra y recorta las que
 * no. Asi que se estima en milimetros, que es la unidad en la que esta escrita
 * la carta, y se elige el paso mas grande que quepa.
 *
 * Los tamanos de cada paso son los del CSS: si se tocan alli, hay que tocarlos
 * aqui. `pnpm check:cards` avisa si dejan de cuadrar.
 */
const ANCHO_OPCIONES = 182; // mm utiles de la ficha
const COLUMNAS = 3;
/**
 * Alto libre para las opciones, en mm, segun lo que ocupe el cuerpo.
 *
 * Medido en el navegador sobre las fichas del catalogo, no estimado: la
 * cabecera son 12,2 mm clavados y la zona va de 96 mm en una unidad de un arma
 * a 61 mm en la mas cargada. Cada arma de mas se come 6 mm, la tabla de equipo
 * 9 mas 6 por fila, y las reglas otros 6 cada vez que pasan de renglon.
 */
function altoLibre(armas: number, reglas: number, equipo: number): number {
  const MARGEN = 16; // lo que el modelo se queda corto en el peor caso medido
  return (
    96 -
    6 * Math.max(0, armas - 1) -
    6 * Math.max(0, Math.ceil(reglas / 8) - 1) -
    (equipo > 0 ? 9 + 6 * equipo : 0) -
    MARGEN
  );
}

interface PasoOpciones {
  clase: string;
  fuente: number;
  interlineado: number;
  /** Relleno vertical de cada fila de opcion, en mm. */
  relleno: number;
  /** En el ultimo paso los chips pierden el marco y ocupan casi como el texto. */
  planos?: boolean;
}

const PASOS: PasoOpciones[] = [
  { clase: "", fuente: 2.9, interlineado: 1.25, relleno: 1 },
  { clase: " opciones-densas", fuente: 2.6, interlineado: 1.25, relleno: 1 },
  { clase: " opciones-muy-densas", fuente: 2.35, interlineado: 1.25, relleno: 0.3 },
  { clase: " opciones-extremas", fuente: 1.9, interlineado: 1.1, relleno: 0.2, planos: true },
];

/**
 * Ancho medio de un caracter, en ems, ya inflado.
 *
 * El ancho real de la letra ronda 0,52 em, pero el texto se parte por palabras
 * y una linea casi nunca se llena del todo: medido contra lo que pinta el
 * navegador, sale a 0,68. Usar el ancho de la letra a secas se queda corto y
 * recorta fichas.
 */
const ANCHO_CARACTER = 0.68;

function lineasDeOpcion(option: UpgradeOption, porLinea: number, planos: boolean): number {
  const desglose = desglosarOpcion(option);
  const ancho = desglose.crudo
    ? (option.label?.length ?? 20) + 6
    : desglose.ganancias.reduce(
        (suma, ganancia) => suma + ganancia.nombre.length + (ganancia.perfil?.length ?? 0) + 3,
        0,
      ) +
      [...desglose.reglas, ...desglose.ganancias.flatMap((ganancia) => ganancia.reglas)].reduce(
        (suma, chip) => suma + chip.etiqueta.length + (planos ? 1 : 3),
        0,
      ) +
      6; // el precio, a la derecha de la fila
  return Math.max(1, Math.ceil(ancho / porLinea));
}

/** Lo que ocupa una seccion entera, en mm. No se parte entre columnas. */
function altoDeSeccion(section: UpgradeSection, paso: PasoOpciones, porLinea: number): number {
  const renglon = paso.fuente * paso.interlineado;
  const cabecera = Math.ceil((section.label?.length ?? 20) / porLinea) * renglon + 1;
  return (
    cabecera +
    (section.options ?? []).reduce(
      (alto, option) => alto + lineasDeOpcion(option, porLinea, paso.planos ?? false) * renglon + paso.relleno,
      0,
    ) +
    1.4 // el hueco hasta la siguiente seccion
  );
}

/**
 * Que tan apretadas van las opciones: se elige el paso mas grande que quepa.
 *
 * La tentacion es contar opciones y poner umbrales a ojo, pero eso falla en las
 * dos direcciones —aprieta fichas con sitio de sobra y recorta las que no—, asi
 * que se estima en milimetros, que es la unidad en la que esta escrita la
 * carta. Los tamanos de cada paso son los del CSS: si se tocan alli hay que
 * tocarlos aqui, y `pnpm check:cards` avisa si dejan de cuadrar.
 */
function pasoDeOpciones(
  sections: UpgradeSection[],
  armas: number,
  reglas: number,
  equipo: number,
): string {
  if (sections.length === 0) return "";
  const disponible = altoLibre(armas, reglas, equipo);
  const anchoColumna = (ANCHO_OPCIONES - 4 * (COLUMNAS - 1)) / COLUMNAS;

  for (const paso of PASOS) {
    const porLinea = anchoColumna / (paso.fuente * ANCHO_CARACTER);
    // Las secciones se reparten enteras, asi que manda la columna mas alta.
    const columnas = new Array<number>(COLUMNAS).fill(0);
    for (const alto of sections.map((s) => altoDeSeccion(s, paso, porLinea)).sort((a, b) => b - a)) {
      columnas[columnas.indexOf(Math.min(...columnas))] += alto;
    }
    if (Math.max(...columnas) <= disponible) return paso.clase;
  }
  return PASOS[PASOS.length - 1].clase;
}

/**
 * Una opcion de mejora, con sus reglas como chips.
 *
 * Se elige antes de comprarla, y para eso hay que saber que hace: "Chain-Fist
 * (A1, AP(2), Deadly(3))" no dice nada si no sabes que es Deadly. El perfil
 * —alcance y ataques— se queda en texto porque se lee, no se consulta.
 */
function OpcionTexto({
  option,
  conTexto,
  onAbrir,
}: {
  option: UpgradeOption;
  conTexto?: Set<string>;
  onAbrir?: (habilidad: Habilidad) => void;
}) {
  const desglose = desglosarOpcion(option);
  if (desglose.crudo) return <span className="ucard-option-cuerpo">{option.label}</span>;

  return (
    <span className="ucard-option-cuerpo">
      {desglose.ganancias.map((ganancia, indice) => (
        <span key={`${ganancia.nombre}-${indice}`} className="ucard-option-gain">
          {ganancia.cuantas > 1 ? <span className="ucard-count">{ganancia.cuantas}×</span> : null}
          {ganancia.nombre}
          {ganancia.perfil ? <span className="ucard-option-perfil">{ganancia.perfil}</span> : null}
          {ganancia.reglas.map((regla) => (
            <Chip key={regla.etiqueta} habilidad={regla} conTexto={conTexto} onAbrir={onAbrir} />
          ))}
        </span>
      ))}
      {desglose.reglas.map((regla) => (
        <Chip key={regla.etiqueta} habilidad={regla} conTexto={conTexto} onAbrir={onAbrir} />
      ))}
    </span>
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
  formato = "tarot",
  footer,
  combinada = false,
  notas,
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

  const hoja = formato === "hoja";
  const densidadOpciones = hoja ? pasoDeOpciones(sections, weapons.length, unit.rules.length, gear.length) : "";
  // En la ficha grande las opciones van dentro; en la de mesa no caben y
  // cuelgan del marco.
  const opciones =
    sections.length > 0 && (variant === "catalogo" || optionAction) ? (
      <details className="ucard-options" open={hoja || optionsOpen}>
        <summary>
          {optionsLabel ?? "Como configurarla"} <span className="ucard-count">({sections.length} secciones)</span>
        </summary>
        <div className="ucard-secciones">
          {sections.map((section) => (
            <div key={section.id ?? section.uid} className="ucard-section">
              <p className="ucard-section-head">
                {section.label}
                {limitLabel(section) ? <span className="ucard-limit"> · {limitLabel(section)}</span> : null}
              </p>
              <ul className="ucard-option-list">
                {(section.options ?? []).map((option) => (
                  <li key={optionId(option)}>
                    <OpcionTexto option={option} conTexto={conTexto} onAbrir={onHabilidad} />
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
        </div>
      </details>
    ) : null;

  return (
    <div className={hoja ? "ucard-wrap hoja" : "ucard-wrap"}>
      <div className={hoja ? "ucard-frame hoja" : "ucard-frame"}>
        <article
          className={`ucard ucard-${variant}${hoja ? ` hoja${densidadOpciones}` : densidad(weapons, unit.rules, gear)}`}
        >
          <header className="ucard-head">
            <h3 className="ucard-title">
              {unit.name}
              {/* El perfil de una combinada ya viene doblado, asi que hay que
                  decirlo o parecera que la unidad es de otro tamaño. */}
              {combinada ? <span className="ucard-combinada">Combinada</span> : null}
            </h3>
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
                      <td className="ucard-wrules">
                        {weapon.rules.length > 0 ? (
                          <div className="ucard-chips ucard-chips-arma">
                            {weapon.rules.map((rule) => (
                              <Chip
                                key={rule}
                                habilidad={parseHabilidad(rule, "regla")}
                                conTexto={conTexto}
                                onAbrir={onHabilidad}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="ucard-vacio">—</span>
                        )}
                      </td>
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

            {/* Reglas innatas: a todo el ancho, que es como se recorren. Las que
                da el equipo van con su objeto, en la tabla de abajo. */}
            <section className="ucard-bloque">
              <h4 className="ucard-bloque-title">Reglas</h4>
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

            {/* El equipo, en tabla: cada pieza y a su derecha lo que concede.
                Ninguna del catalogo deja de conceder algo, asi que el nombre
                por si solo no informaria. */}
            {gear.length > 0 ? (
              <section className="ucard-bloque">
                <table className="ucard-table ucard-equipo-tabla">
                  <thead>
                    <tr>
                      <th>Equipo</th>
                      <th>Concede</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gear.map((item, index) => (
                      <tr key={`${item.label}-${index}`}>
                        <td>
                          {item.count > 1 ? <span className="ucard-count">{item.count}×</span> : null}
                          {item.name}
                        </td>
                        <td>
                          <div className="ucard-chips">
                            {item.rules.length > 0 ? (
                              item.rules.map((rule) => (
                                <Chip
                                  key={rule}
                                  habilidad={parseHabilidad(rule, "regla")}
                                  conTexto={conTexto}
                                  onAbrir={onHabilidad}
                                />
                              ))
                            ) : (
                              <span className="ucard-vacio">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}

            {notas ? (
              <p className="ucard-notas">
                <span className="ucard-label">Notas</span>
                {notas}
              </p>
            ) : null}

            {hoja ? <div className="ucard-bloque ucard-opciones-dentro">{opciones}</div> : null}
          </div>
        </article>
      </div>

      {variant === "ejercito" && upgrades.length > 0 ? (
        <p className="ucard-upgrades">
          <span className="ucard-label">Mejoras</span>
          {upgrades.join(" · ")}
        </p>
      ) : null}

      {hoja ? null : opciones}

      {footer ? <footer className="ucard-foot">{footer}</footer> : null}
    </div>
  );
}
