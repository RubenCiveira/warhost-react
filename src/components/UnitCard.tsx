import type { ReactNode } from "react";
import { normalizeLoadout } from "../lib/loadout";
import type { LoadoutEntry } from "../lib/loadout";
import { maxDistinctOptions, optionCost, optionId } from "../lib/builder";
import type { UpgradeOption, UpgradeSection } from "../lib/builder";
import IconoArma from "./IconoArma";
import { parseHabilidad } from "../lib/reglas";
import { desglosarOpcion } from "../lib/opciones";
import { reglaDelAura, reglaParaLaUnidad } from "../lib/auras";
import type { Habilidad } from "../lib/reglas";
import type { HeroSkillCardData } from "./HeroSkillCard";

/**
 * Lo que la carta necesita del glosario: quien tiene descripcion, y cual es,
 * para poder resolver las auras. Se pide el mapa entero y no una lista de
 * nombres justo por lo segundo.
 */
export type GlosarioCarta = Map<string, { description?: string | null }>;

export interface QuestHeroSkillSummary extends HeroSkillCardData {
  tier: number;
}

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

/**
 * En la carta emparejada cada columna va a media anchura y la carta mide lo
 * mismo que cualquier otra tarot: el tope baja para que quepa, y lo que sobra
 * se resume en la misma linea de "y N armas mas" que ya usaba la carta entera.
 */
const ARMAS_VISIBLES_COLUMNA = 4;

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
function densidad(
  weapons: LoadoutEntry[],
  rules: string[],
  gear: LoadoutEntry[],
  conAccion: boolean,
): "" | " denso" | " muy-denso" {
  const renglones =
    weapons.reduce((suma, arma) => suma + Math.ceil((arma.rules.join(", ").length || 1) / 28), 0) +
    weapons.length +
    Math.ceil(rules.length / 2) +
    gear.reduce((suma, item) => suma + Math.ceil((item.name.length + item.rules.join(", ").length) / 26), 0) +
    // El boton de la esquina ocupa lo suyo: sin contarlo, la carta mas cargada
    // del catalogo se pasa siete pixeles.
    (conAccion ? 2 : 0);

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
  /**
   * Atributos de heroe de quest (Fuerza, Destreza, Poder, Voluntad, mas
   * Nivel, Experiencia y Oro de campana): no existen en el resto de sistemas, asi que
   * solo se pintan cuando llegan puestos.
   */
  strength?: number;
  dexterity?: number;
  power?: number;
  willpower?: number;
  /** Fijo en 1 por ahora: subir de nivel jugando no esta modelado todavia. */
  level?: number;
  /** Fijo en 0 por ahora: ganar experiencia jugando no esta modelado todavia. */
  experience?: number;
  /** Fijo en 30 (`questStartingGold`) por ahora: gastarlo en tienda no esta modelado todavia. */
  gold?: number;
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
  formato?: "tarot" | "hoja" | "personaje";
  footer?: ReactNode;
  /**
   * Nombres de regla que tienen descripcion. Los chips que no esten aqui se
   * marcan como del reglamento basico y no invitan a pulsar.
   */
  /**
   * Accion propia de la carta, en su esquina inferior derecha: para la unidad
   * ya configurada de un ejercito, volver a configurarla. Va dentro del marco y
   * no en el pie porque es sobre esta unidad, no sobre la lista.
   */
  accion?: ReactNode;
  /**
   * La unidad a la que se ha unido este heroe: `unit` es el heroe y se pinta en
   * la primera columna, `adjunta` la unidad en la segunda, y la carta propia de
   * la unidad desaparece de la lista. Solo en la carta de mesa de un ejercito.
   */
  adjunta?: UnitCardData & { combinada?: boolean; upgrades?: string[] };
  /** El "Configurar" de la columna de la unidad unida. */
  accionAdjunta?: ReactNode;
  /** Unidad combinada: se avisa en la carta porque el perfil ya viene doblado. */
  combinada?: boolean;
  /** Anotacion del jugador sobre esta unidad. */
  notas?: string;
  /** Trasfondo breve de catalogo, escrito por editores. */
  lore?: string | null;
  /** Retrato de catalogo para la cabecera de la ficha. */
  avatarUrl?: string | null;
  /**
   * Segunda linea del titulo: en quest, la clase del heroe y el tipo de
   * unidad del catalogo del que sale ("Berserker · Grunt Veteran"). El resto
   * de sistemas no la usan.
   */
  subtitulo?: string;
  /**
   * Heroe de un sistema quest: ni miniaturas ni puntos ni heridas aparte, y en
   * su lugar los cinco atributos (los que lleguen puestos en `unit`).
   */
  quest?: boolean;
  glosario?: GlosarioCarta;
  /** Abrir la carta de una habilidad o de un equipo. */
  onHabilidad?: (habilidad: Habilidad) => void;
  /** Feat y habilidades de clase disponibles para un heroe de Quest segun su nivel. */
  questClassSkills?: QuestHeroSkillSummary[];
  /** Abrir la carta de una habilidad de clase de Quest. */
  onQuestClassSkill?: (skill: HeroSkillCardData) => void;
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
  glosario,
  onAbrir,
}: {
  habilidad: Habilidad;
  cuantos?: number;
  glosario?: GlosarioCarta;
  onAbrir?: (habilidad: Habilidad) => void;
}) {
  // Sin glosario cargado no se sabe cuales tienen texto: se dejan todas
  // pulsables antes que marcarlas en falso. Un conjunto vacio es justo eso —
  // todavia cargando, o no llego—, no "ninguna tiene descripcion".
  const cargado = Boolean(glosario && glosario.size > 0);
  const tieneTexto = !cargado || glosario!.has(habilidad.nombre.toLowerCase());
  const clases = ["ucard-chip", habilidad.tipo === "equipo" ? "equipo" : "", tieneTexto ? "" : "sin-texto"]
    .filter(Boolean)
    .join(" ");

  // Un aura no dice que hace: dice que regla concede, y esa es la que se
  // consulta en mitad de una partida. Se ofrece pegada, como un segundo tramo
  // del mismo chip, para que se lea que una lleva a la otra.
  const aura = cargado
    ? reglaDelAura(
        habilidad.nombre,
        glosario!.get(habilidad.nombre.toLowerCase())?.description,
        (nombre) => glosario!.has(nombre.toLowerCase()),
      )
    : null;

  const boton = (
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

  if (!aura) return boton;
  return (
    <span className="ucard-chip-doble">
      {boton}
      <button
        type="button"
        className="ucard-chip ucard-chip-concede"
        disabled={!onAbrir}
        title={`Concede ${aura.concede.etiqueta}${aura.alcance ? ` ${aura.alcance}` : ""}: ver la regla`}
        onClick={() => onAbrir?.(aura.concede)}
      >
        {aura.concede.nombre}
        {aura.concede.valor ? <span className="valor">({aura.concede.valor})</span> : null}
      </button>
    </span>
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
  const MARGEN = 18; // lo que el modelo se queda corto en el peor caso medido
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

/**
 * Lo que ocupa un chip, contando que un aura lleva pegada la regla que concede
 * y por tanto ocupa casi el doble. Sin esto la ficha se pasa de largo: son seis
 * de las 740 del catalogo, y ninguna avisa al recortarse.
 */
function anchoDeChip(chip: Habilidad, planos: boolean, glosario?: GlosarioCarta): number {
  const marco = planos ? 1 : 3;
  const aura = glosario
    ? reglaDelAura(chip.nombre, glosario.get(chip.nombre.toLowerCase())?.description, (n) =>
        glosario.has(n.toLowerCase()),
      )
    : null;
  return chip.etiqueta.length + marco + (aura ? aura.concede.etiqueta.length + marco + 2 : 0);
}

function lineasDeOpcion(
  option: UpgradeOption,
  porLinea: number,
  planos: boolean,
  glosario?: GlosarioCarta,
): number {
  const desglose = desglosarOpcion(option);
  const ancho = desglose.crudo
    ? (option.label?.length ?? 20) + 6
    : desglose.ganancias.reduce(
        (suma, ganancia) => suma + ganancia.nombre.length + (ganancia.perfil?.length ?? 0) + 3,
        0,
      ) +
      [...desglose.reglas, ...desglose.ganancias.flatMap((ganancia) => ganancia.reglas)].reduce(
        (suma, chip) => suma + anchoDeChip(chip, planos, glosario),
        0,
      ) +
      6; // el precio, a la derecha de la fila
  return Math.max(1, Math.ceil(ancho / porLinea));
}

/** Lo que ocupa una seccion entera, en mm. No se parte entre columnas. */
function altoDeSeccion(
  section: UpgradeSection,
  paso: PasoOpciones,
  porLinea: number,
  glosario?: GlosarioCarta,
): number {
  const renglon = paso.fuente * paso.interlineado;
  const cabecera = Math.ceil((section.label?.length ?? 20) / porLinea) * renglon + 1;
  return (
    cabecera +
    (section.options ?? []).reduce(
      (alto, option) =>
        alto + lineasDeOpcion(option, porLinea, paso.planos ?? false, glosario) * renglon + paso.relleno,
      0,
    ) +
    1.4 // el hueco hasta la siguiente seccion
  );
}

/**
 * El alto que ocuparan unas secciones repartidas en columnas.
 *
 * Emula lo que hace el navegador, que no es repartirlas lo mejor posible:
 * calcula una altura objetivo —el total entre el numero de columnas—, las mete
 * **en orden**, y corta cuando la columna queda mas cerca del objetivo sin la
 * siguiente seccion que con ella. La ultima se queda con lo que sobre aunque se
 * pase. Comprobado contra dos fichas medidas en el navegador: 37/52/77 mm en
 * una y 63/82/34 en otra, donde un reparto optimo habria dado 56 y 59.
 *
 * Buscar el optimo, que es lo que sale solo al escribirlo, subestima el alto y
 * deja fichas recortadas.
 */
function altoDeColumnas(altos: number[]): number {
  if (altos.length === 0) return 0;
  const objetivo = altos.reduce((suma, alto) => suma + alto, 0) / COLUMNAS;
  const columnas: number[] = [0];
  for (const alto of altos) {
    const actual = columnas.length - 1;
    const quedandose = Math.abs(columnas[actual] + alto - objetivo);
    const cortando = Math.abs(columnas[actual] - objetivo);
    // Se corta cuando la columna queda mas cerca del objetivo sin la seccion
    // que con ella. Es lo que hace el navegador: se pasa del objetivo si por
    // poco, y corta si por mucho.
    if (columnas[actual] > 0 && quedandose > cortando && columnas.length < COLUMNAS) {
      columnas.push(alto);
    } else {
      columnas[actual] += alto;
    }
  }
  return Math.max(...columnas);
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
  glosario?: GlosarioCarta,
): string {
  if (sections.length === 0) return "";
  const disponible = altoLibre(armas, reglas, equipo);
  const anchoColumna = (ANCHO_OPCIONES - 4 * (COLUMNAS - 1)) / COLUMNAS;

  for (const paso of PASOS) {
    const porLinea = anchoColumna / (paso.fuente * ANCHO_CARACTER);
    const altos = sections.map((s) => altoDeSeccion(s, paso, porLinea, glosario));
    if (altoDeColumnas(altos) <= disponible) return paso.clase;
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
  glosario,
  onAbrir,
}: {
  option: UpgradeOption;
  glosario?: GlosarioCarta;
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
            <Chip key={regla.etiqueta} habilidad={regla} glosario={glosario} onAbrir={onAbrir} />
          ))}
        </span>
      ))}
      {desglose.reglas.map((regla) => (
        <Chip key={regla.etiqueta} habilidad={regla} glosario={glosario} onAbrir={onAbrir} />
      ))}
    </span>
  );
}

/** Una fila de la tabla de armas. Se reutiliza en la carta con heroe unido, que
 *  la pinta dos veces, una por cada perfil. */
function FilaArma({
  weapon,
  glosario,
  onAbrir,
}: {
  weapon: LoadoutEntry;
  glosario?: GlosarioCarta;
  onAbrir?: (habilidad: Habilidad) => void;
}) {
  return (
    <tr>
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
              <Chip key={rule} habilidad={parseHabilidad(rule, "regla")} glosario={glosario} onAbrir={onAbrir} />
            ))}
          </div>
        ) : (
          <span className="ucard-vacio">—</span>
        )}
      </td>
    </tr>
  );
}

/** El racimo de chips de reglas de un perfil. */
function ClusterReglas({
  rules,
  glosario,
  onAbrir,
}: {
  rules: string[];
  glosario?: GlosarioCarta;
  onAbrir?: (habilidad: Habilidad) => void;
}) {
  if (rules.length === 0) return <p className="ucard-vacio">Ninguna</p>;
  return (
    <div className="ucard-chips">
      {rules.map((rule) => (
        <Chip key={rule} habilidad={parseHabilidad(rule, "regla")} glosario={glosario} onAbrir={onAbrir} />
      ))}
    </div>
  );
}

/**
 * El doble chip de lo que el heroe le presta a la unidad: su regla —"Bane in
 * Melee Aura", la lleve el mismo o se la de un objeto como "Preacher"— y lo
 * que concede, pegado detras. Es el mismo par que ya se ve en la carta del
 * heroe; aqui se repite porque es la unidad la que se beneficia.
 */
function ChipAporte({
  nombre,
  concede,
  alcance,
  onAbrir,
}: {
  nombre: string;
  concede: Habilidad;
  alcance: string | null;
  onAbrir?: (habilidad: Habilidad) => void;
}) {
  return (
    <span className="ucard-chip-doble">
      <button
        type="button"
        className="ucard-chip"
        disabled={!onAbrir}
        title={`Ver ${nombre}`}
        onClick={() => onAbrir?.(parseHabilidad(nombre, "regla"))}
      >
        {nombre}
      </button>
      <button
        type="button"
        className="ucard-chip ucard-chip-concede"
        disabled={!onAbrir}
        title={`Concede ${concede.etiqueta}${alcance ? ` ${alcance}` : ""}: ver la regla`}
        onClick={() => onAbrir?.(concede)}
      >
        {concede.nombre}
        {concede.valor ? <span className="valor">({concede.valor})</span> : null}
      </button>
    </span>
  );
}

/** La tabla de armas completa: cabecera, filas, y el aviso de las que no caben. */
function TablaArmas({
  weapons,
  max = ARMAS_VISIBLES,
  glosario,
  onAbrir,
}: {
  weapons: LoadoutEntry[];
  /** Tope de filas visibles: mas bajo en la carta emparejada, que va a media anchura. */
  max?: number;
  glosario?: GlosarioCarta;
  onAbrir?: (habilidad: Habilidad) => void;
}) {
  if (weapons.length === 0) return null;
  const visibles = weapons.slice(0, max);
  const ocultas = weapons.length - visibles.length;
  return (
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
            <FilaArma key={`${weapon.label}-${index}`} weapon={weapon} glosario={glosario} onAbrir={onAbrir} />
          ))}
        </tbody>
      </table>
      {ocultas > 0 ? (
        <p className="ucard-mas">
          y {ocultas} arma{ocultas === 1 ? "" : "s"} mas, en el detalle de la unidad
        </p>
      ) : null}
    </div>
  );
}

/** El equipo en tabla: cada pieza y a su derecha lo que concede. */
function TablaEquipo({
  gear,
  glosario,
  onAbrir,
}: {
  gear: LoadoutEntry[];
  glosario?: GlosarioCarta;
  onAbrir?: (habilidad: Habilidad) => void;
}) {
  if (gear.length === 0) return null;
  return (
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
                      <Chip key={rule} habilidad={parseHabilidad(rule, "regla")} glosario={glosario} onAbrir={onAbrir} />
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
  );
}

/**
 * Una columna de la carta emparejada: el perfil completo de un lado —heroe o
 * unidad—, con su nombre, sus datos, su armamento, sus reglas y su equipo, y el
 * boton de configurar al fondo. Es la misma informacion que llevaria su propia
 * carta, solo que a media anchura.
 */
function ColumnaPerfil({
  nombre,
  perfil,
  accion,
  aportesHeroe = [],
  liderazgo,
  glosario,
  onAbrir,
}: {
  nombre: string;
  perfil: UnitCardData;
  accion?: ReactNode;
  /** Lo que el heroe unido le presta a esta unidad: sus auras, via regla o via equipo. */
  aportesHeroe?: Array<{ nombre: string; concede: Habilidad; alcance: string | null }>;
  /** "3+": la unidad puede usar la Calidad del heroe unido para el liderazgo. */
  liderazgo?: string;
  glosario?: GlosarioCarta;
  onAbrir?: (habilidad: Habilidad) => void;
}) {
  const loadout = normalizeLoadout(perfil.loadout);
  const weapons = loadout.filter((entry) => entry.kind === "weapon");
  const gear = loadout.filter((entry) => entry.kind === "gear");

  return (
    <div className="ucard-columna">
      {/* Nombre y datos en un solo renglon: el nombre se recorta con puntos
          suspensivos antes que robarle una linea entera a Cal/Def/Her. */}
      <div className="ucard-columna-cab">
        <span className="ucard-columna-nombre">{nombre}</span>
        <span className="ucard-columna-mini">
          <span>Cal {perfil.quality}+</span>
          <span>Def {perfil.defense}+</span>
          {perfil.maxWounds !== undefined ? <span>Her {perfil.maxWounds}</span> : null}
        </span>
      </div>
      <TablaArmas weapons={weapons} max={ARMAS_VISIBLES_COLUMNA} glosario={glosario} onAbrir={onAbrir} />
      <section className="ucard-bloque">
        <h4 className="ucard-bloque-title">Reglas</h4>
        <ClusterReglas rules={perfil.rules} glosario={glosario} onAbrir={onAbrir} />
      </section>
      <TablaEquipo gear={gear} glosario={glosario} onAbrir={onAbrir} />
      {/* Lo que trae el mando, aparte de lo suyo: el liderazgo que presta y las
          auras que alcanzan a toda la unidad, se lleve la regla el heroe mismo
          o se la de un objeto como "Preacher". */}
      {liderazgo || aportesHeroe.length > 0 ? (
        <section className="ucard-bloque ucard-mando">
          <h4 className="ucard-bloque-title">El mando aporta</h4>
          <div className="ucard-chips">
            {liderazgo ? (
              <span className="ucard-chip ucard-chip-liderazgo">
                Liderazgo <b>{liderazgo}</b>
              </span>
            ) : null}
            {aportesHeroe.map((aporte) => (
              <ChipAporte
                key={aporte.nombre}
                nombre={aporte.nombre}
                concede={aporte.concede}
                alcance={aporte.alcance}
                onAbrir={onAbrir}
              />
            ))}
          </div>
        </section>
      ) : null}
      {accion ? <div className="ucard-accion">{accion}</div> : null}
    </div>
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
  accion,
  adjunta,
  accionAdjunta,
  combinada = false,
  notas,
  lore,
  avatarUrl,
  subtitulo,
  quest = false,
  glosario,
  onHabilidad,
  questClassSkills = [],
  onQuestClassSkill,
}: Props) {
  const hoja = formato === "hoja";
  const personaje = formato === "personaje";
  // La union heroe + unidad solo tiene sentido en la carta de mesa de un
  // ejercito: la ficha de catalogo no sabe de listas.
  const emparejada = Boolean(adjunta) && variant === "ejercito" && !hoja;

  const loadout = normalizeLoadout(unit.loadout);
  const weapons = loadout.filter((entry) => entry.kind === "weapon");
  const gear = loadout.filter((entry) => entry.kind === "gear");
  const adjLoadout = emparejada && adjunta ? normalizeLoadout(adjunta.loadout) : [];
  const adjWeapons = adjLoadout.filter((entry) => entry.kind === "weapon");
  const adjGear = adjLoadout.filter((entry) => entry.kind === "gear");

  /**
   * Lo que el heroe le presta a la unidad entera: cualquier regla cuya
   * descripcion lo diga de forma expresa —"This model and its unit get X"—, la
   * lleve el mismo escrita o se la de un objeto de su equipo. "Preacher" es
   * justo eso: un objeto que concede "Bane in Melee Aura", y esa regla vive en
   * `rules` del objeto, no en las del heroe — mirar solo `unit.rules` se lo
   * dejaria fuera. Sin glosario no hay forma de saber que concede cada una, asi
   * que se deja la lista vacia antes que adivinar.
   */
  const aportesDelHeroe: Array<{ nombre: string; concede: Habilidad; alcance: string | null }> =
    emparejada && adjunta && glosario
      ? [...new Set([...unit.rules, ...loadout.flatMap((entrada) => entrada.rules)])]
          .map((etiqueta) => {
            const nombre = parseHabilidad(etiqueta, "regla").nombre;
            const aporte = reglaParaLaUnidad(glosario.get(nombre.toLowerCase())?.description, (n) => glosario.has(n.toLowerCase()));
            return aporte ? { nombre, concede: aporte.concede, alcance: aporte.alcance } : null;
          })
          .filter((aporte): aporte is { nombre: string; concede: Habilidad; alcance: string | null } => aporte !== null)
          // Si la unidad ya lo lleva de por si, no hace falta repetirlo.
          .filter(
            (aporte) =>
              !adjunta.rules.some((regla) => parseHabilidad(regla, "regla").nombre.toLowerCase() === aporte.concede.nombre.toLowerCase()),
          )
      : [];

  /**
   * La banda de arriba es siempre la misma pieza, tenga la carta uno o dos
   * perfiles: Calidad y Defensa no se pueden sumar entre un heroe y su unidad,
   * asi que en la emparejada solo quedan las dos que si son un numero de la
   * pareja entera —cuantas miniaturas hay, cuanto cuesta—. El resto vive dentro
   * de cada columna.
   */
  // En quest el heroe no tiene miniaturas ni puntos de lista: la banda del
  // titulo lleva su perfil de personaje completo.
  const stats: Array<[string, string]> = quest
    ? [
        ["Cal", `${unit.quality}+`],
        ["Def", `${unit.defense}+`],
        ...(unit.maxWounds !== undefined ? ([["Agu", String(unit.maxWounds)]] as Array<[string, string]>) : []),
        ...(unit.power !== undefined ? ([["Pow", String(unit.power)]] as Array<[string, string]>) : []),
        ...(unit.strength !== undefined ? ([["Str", `${unit.strength}+`]] as Array<[string, string]>) : []),
        ...(unit.dexterity !== undefined ? ([["Dex", `${unit.dexterity}+`]] as Array<[string, string]>) : []),
        ...(unit.willpower !== undefined ? ([["Will", `${unit.willpower}+`]] as Array<[string, string]>) : []),
      ]
    : emparejada && adjunta
      ? [
          ["Min", String(unit.size + adjunta.size)],
          ...(unit.cost !== undefined || adjunta.cost !== undefined
            ? ([["Pts", String((unit.cost ?? 0) + (adjunta.cost ?? 0))]] as Array<[string, string]>)
            : []),
        ]
      : [
          ["Min", String(unit.size)],
          ["Cal", `${unit.quality}+`],
          ["Def", `${unit.defense}+`],
          ...(unit.maxWounds !== undefined ? ([["Her", String(unit.maxWounds)]] as Array<[string, string]>) : []),
          ...(unit.cost !== undefined ? ([["Pts", String(unit.cost)]] as Array<[string, string]>) : []),
        ];

  const campanaQuest: Array<[string, string]> = quest
    ? [
        ...(unit.level !== undefined ? ([["Nivel", String(unit.level)]] as Array<[string, string]>) : []),
        ...(unit.experience !== undefined ? ([["Experiencia", String(unit.experience)]] as Array<[string, string]>) : []),
        ...(unit.gold !== undefined ? ([["Monedas", String(unit.gold)]] as Array<[string, string]>) : []),
      ]
    : [];

  // Las auras ocupan dos chips en el bloque de reglas, asi que cuentan doble
  // para saber cuantos renglones se lleva ese bloque.
  const anchoDeReglas = unit.rules.reduce((suma, regla) => {
    const nombre = parseHabilidad(regla, "regla").nombre.toLowerCase();
    const aura = glosario
      ? reglaDelAura(nombre, glosario.get(nombre)?.description, (n) => glosario.has(n.toLowerCase()))
      : null;
    // Dos y medio, no dos: "Bane in Melee Aura → Bane" es mas ancho que dos
    // chips corrientes, y el bloque de reglas se mide en renglones.
    return suma + (aura ? 2.5 : 1);
  }, 0);
  const densidadOpciones = hoja
    ? pasoDeOpciones(sections, weapons.length, anchoDeReglas, gear.length, glosario)
    : "";
  // En la ficha grande las opciones van dentro; en la de mesa no caben y
  // cuelgan del marco.
  const listaDeSecciones = (
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
                <OpcionTexto option={option} glosario={glosario} onAbrir={onHabilidad} />
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
  );

  // En la ficha de faccion las opciones estan siempre a la vista: es lo que se
  // viene a leer, y en papel un desplegable no se puede abrir. Alli el titulo
  // es un rotulo. Fuera de la ficha si se pliega, porque la carta de mesa
  // ensena la unidad ya configurada y las opciones son consulta.
  const opciones =
    sections.length === 0 || (variant !== "catalogo" && !optionAction) ? null : hoja ? (
      <div className="ucard-options">
        <p className="ucard-options-title">Opciones</p>
        {listaDeSecciones}
      </div>
    ) : (
      <details className="ucard-options" open={optionsOpen}>
        <summary>
          {optionsLabel ?? "Como configurarla"} <span className="ucard-count">({sections.length} secciones)</span>
        </summary>
        {listaDeSecciones}
      </details>
    );

  // La carta emparejada respeta el mismo tamano de tarot que el resto: nada de
  // marco mas alto, el contenido se aprieta para caber en el de siempre.
  const bloqueCampana =
    campanaQuest.length > 0 ? (
      <section className="ucard-quest-atributos">
        <h4 className="ucard-bloque-title">Campaña</h4>
        <dl className="ucard-campana-list">
          {campanaQuest.map(([label, value]) => (
            <div key={label} className="ucard-campana-fila">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    ) : null;

  const bloqueHabilidadesQuest =
    questClassSkills.length > 0 ? (
      <section className="ucard-bloque ucard-quest-skills">
        <h4 className="ucard-bloque-title">Habilidades de clase</h4>
        <div className="ucard-chips">
          {questClassSkills.map((skill) => (
            <button
              key={`${skill.className}-${skill.levelLabel}-${skill.name}`}
              type="button"
              className="ucard-chip equipo"
              disabled={!onQuestClassSkill}
              title={`Ver ${skill.name}`}
              onClick={() => onQuestClassSkill?.(skill)}
            >
              {skill.name}
            </button>
          ))}
        </div>
      </section>
    ) : null;

  const wrapClase = hoja ? "ucard-wrap hoja" : personaje ? "ucard-wrap personaje" : "ucard-wrap";
  const marcoClase = hoja ? "ucard-frame hoja" : personaje ? "ucard-frame personaje" : "ucard-frame";

  return (
    <div className={wrapClase}>
      <div className={marcoClase}>
        <article
          className={`ucard ucard-${variant}${
            hoja
              ? ` hoja${densidadOpciones}`
              : personaje
                ? " personaje"
                : emparejada && adjunta
                ? ` emparejada${densidad(
                    [...weapons, ...adjWeapons],
                    [...unit.rules, ...adjunta.rules],
                    [...gear, ...adjGear],
                    true,
                  )}`
                : densidad(weapons, unit.rules, gear, Boolean(accion))
          }`}
        >
          <header className="ucard-head">
            {avatarUrl ? <img className="ucard-avatar" src={avatarUrl} alt="" loading="lazy" /> : null}
            {subtitulo ? (
              // El heroe de quest lleva su nombre propio y, debajo, su clase y
              // el tipo de unidad del que sale: nunca va emparejado ni
              // combinado, asi que no hace falta el resto de adornos.
              <h3 className="ucard-title con-subtitulo">
                <span className="ucard-title-nombre">{unit.name}</span>
                <span className="ucard-subtitulo">{subtitulo}</span>
              </h3>
            ) : (
              <h3 className="ucard-title">
                {unit.name}
                {emparejada && adjunta ? <span className="ucard-mas-heroe">+ {adjunta.name}</span> : null}
                {/* El perfil de una combinada ya viene doblado, asi que hay que
                    decirlo o parecera que la unidad es de otro tamaño. */}
                {combinada || (emparejada && adjunta?.combinada) ? (
                  <span className="ucard-combinada">Combinada</span>
                ) : null}
              </h3>
            )}
            <div className={`ucard-stats${quest ? " quest" : ""}`}>
              {stats.map(([label, value]) => (
                <div key={label} className="ucard-stat">
                  <span className="ucard-stat-key">{label}</span>
                  <span className="ucard-stat-value">{value}</span>
                </div>
              ))}
            </div>
          </header>

          {emparejada && adjunta ? (
            <div className="ucard-body ucard-body-par">
              <ColumnaPerfil nombre={unit.name} perfil={unit} accion={accion} glosario={glosario} onAbrir={onHabilidad} />
              <ColumnaPerfil
                nombre={adjunta.name}
                perfil={adjunta}
                accion={accionAdjunta}
                aportesHeroe={aportesDelHeroe}
                liderazgo={`${unit.quality}+`}
                glosario={glosario}
                onAbrir={onHabilidad}
              />
            </div>
          ) : (
            <div className="ucard-body">
              {personaje ? null : <TablaArmas weapons={weapons} glosario={glosario} onAbrir={onHabilidad} />}

              {quest && personaje ? (
                <div className="ucard-personaje">
                  <div className="ucard-personaje-armas">
                    <TablaArmas weapons={weapons} glosario={glosario} onAbrir={onHabilidad} />
                  </div>
                  <div className="ucard-personaje-arriba">
                    <div className="ucard-personaje-campana">{bloqueCampana}</div>
                    <div className="ucard-personaje-habilidades">
                      <section className="ucard-bloque">
                        <h4 className="ucard-bloque-title">Reglas</h4>
                        <ClusterReglas rules={unit.rules} glosario={glosario} onAbrir={onHabilidad} />
                      </section>
                      {bloqueHabilidadesQuest}
                    </div>
                  </div>
                  <div className="ucard-personaje-equipo">
                    <h4 className="ucard-bloque-title">Equipo adicional</h4>
                    {gear.length > 0 ? (
                      <TablaEquipo gear={gear} glosario={glosario} onAbrir={onHabilidad} />
                    ) : (
                      <p className="ucard-vacio">Sin equipo adicional.</p>
                    )}
                  </div>
                </div>
              ) : quest ? (
                // En quest la columna lateral queda para seguimiento de
                // campana; el perfil de atributos ya vive en la barra superior.
                <div className="ucard-quest-cols">
                  {bloqueCampana}
                  <div className="ucard-quest-habilidades">
                    <section className="ucard-bloque">
                      <h4 className="ucard-bloque-title">Reglas</h4>
                      <ClusterReglas rules={unit.rules} glosario={glosario} onAbrir={onHabilidad} />
                    </section>
                    {bloqueHabilidadesQuest}
                    <TablaEquipo gear={gear} glosario={glosario} onAbrir={onHabilidad} />
                  </div>
                </div>
              ) : (
                <>
                  {/* Reglas innatas: a todo el ancho, que es como se recorren. Las
                      que da el equipo van con su objeto, en la tabla de abajo. */}
                  <section className="ucard-bloque">
                    <h4 className="ucard-bloque-title">Reglas</h4>
                    <ClusterReglas rules={unit.rules} glosario={glosario} onAbrir={onHabilidad} />
                  </section>

                  {/* El equipo, en tabla: cada pieza y a su derecha lo que concede.
                      Ninguna del catalogo deja de conceder algo, asi que el nombre
                      por si solo no informaria. */}
                  <TablaEquipo gear={gear} glosario={glosario} onAbrir={onHabilidad} />
                </>
              )}

              {notas ? (
                <p className="ucard-notas">
                  <span className="ucard-label">Notas</span>
                  {notas}
                </p>
              ) : null}

              {lore ? <p className="ucard-lore">{lore}</p> : null}

              {hoja ? <div className="ucard-bloque ucard-opciones-dentro">{opciones}</div> : null}

              {accion ? <div className="ucard-accion">{accion}</div> : null}
            </div>
          )}
        </article>
      </div>

      {variant === "ejercito" && (upgrades.length > 0 || (emparejada && (adjunta?.upgrades?.length ?? 0) > 0)) ? (
        <p className="ucard-upgrades">
          <span className="ucard-label">Mejoras</span>
          {[
            ...upgrades,
            ...(emparejada && adjunta?.upgrades ? adjunta.upgrades : []),
          ].join(" · ")}
        </p>
      ) : null}

      {hoja ? null : opciones}

      {footer ? <footer className="ucard-foot">{footer}</footer> : null}
    </div>
  );
}
