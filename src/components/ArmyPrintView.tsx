import { useMemo, useState } from "react";
import type { ArmyBook, CatalogRule } from "../api/catalog";
import type { ResolvedUnit } from "../lib/armyForgeResolve";
import { equipoDeEjercito, reglasUsadasEnEjercito, tieneCaster } from "../lib/faccion";
import type { EquipoDeFaccion } from "../lib/faccion";
import { agruparUnidades, emparejarHeroes } from "../lib/unidades";
import type { FilaEjercito } from "../lib/unidades";
import { conValor, parseHabilidad } from "../lib/reglas";
import type { Habilidad } from "../lib/reglas";
import { optionCost } from "../lib/builder";
import type { UpgradeOption, UpgradeSection } from "../lib/builder";
import { desglosarOpcion } from "../lib/opciones";
import { parseSpells } from "../lib/spells";
import type { Spell } from "../lib/spells";
import type { ArmyNoun } from "../lib/gameSystems";
import { cuadriculaPorHoja, PAGINA_MM, trocear, espejarHoja } from "../lib/print";
import RuleCard from "./RuleCard";
import SpellCard from "./SpellCard";
import UnitCard from "./UnitCard";

/** Los mismos mm que fijan `--ucard-w/h` y `--scard-w/h` en styles.css: hay
 *  que mantenerlos iguales para que la cuadricula calculada aqui coincida con
 *  el tamano real de la carta en papel. La de personaje mide el doble de
 *  alta —dos perfiles, heroe y unidad, en la misma carta—. */
const TAROT_MM = { ancho: 120, alto: 70 };
const TAROT_PERSONAJE_MM = { ancho: 120, alto: 140 };
const SCARD_MM = { ancho: 44, alto: 68 };
const LIBRO_ALTO_UTIL_MM = PAGINA_MM.alto - PAGINA_MM.margen * 2;

type CartaMiniEuro =
  | { tipo: "regla"; key: string; habilidad: Habilidad; regla: CatalogRule }
  | { tipo: "equipo"; key: string; item: EquipoDeFaccion }
  | { tipo: "hechizo"; key: string; spell: Spell; faccion: string | null };

interface TarjetaLibro {
  key: string;
  unit: ResolvedUnit;
  libro: ArmyBook | undefined;
  parte?: "perfil" | "detalles";
}

function perfilDe(v: ResolvedUnit) {
  return {
    name: v.name,
    size: v.size,
    quality: v.quality,
    defense: v.defense,
    cost: v.cost,
    maxWounds: v.maxWounds,
    rules: v.rules,
    loadout: v.loadout,
    strength: v.strength,
    dexterity: v.dexterity,
    willpower: v.willpower,
    power: v.power,
    level: v.level,
    experience: v.experience,
    gold: v.gold,
  };
}

/** Las cartas de habilidades, equipo, hechizos y reglas generales que
 *  aparecen de verdad en las fichas de estas unidades —directas, por su
 *  equipo o arrastradas por texto—, listas para pintar en Mini Euro. */
function cartasDe(glosario: Map<string, CatalogRule>, units: ResolvedUnit[], libros: ArmyBook[]): CartaMiniEuro[] {
  const usadas = reglasUsadasEnEjercito(glosario, units);
  const reglas: CartaMiniEuro[] = usadas
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((regla) => ({ tipo: "regla", key: `regla-${regla.$id}`, habilidad: parseHabilidad(regla.name, "regla"), regla }));
  const equipo: CartaMiniEuro[] = equipoDeEjercito(units).map((item) => ({
    tipo: "equipo",
    key: `equipo-${item.habilidad.nombre}`,
    item,
  }));
  // Una lista importada y todavia no tocada por el constructor no trae
  // `bookKey` en sus unidades. Con una sola faccion conocida no hay
  // ambiguedad: son todas suyas.
  const defaultBookKey = libros.length === 1 ? libros[0].$id : undefined;
  const hechizos: CartaMiniEuro[] = libros.flatMap((libro) => {
    const unidadesLibro = units.filter((unit) => (unit.bookKey ?? defaultBookKey) === libro.$id);
    if (!tieneCaster(unidadesLibro)) return [];
    return parseSpells(libro.spells ?? null).map((spell) => ({
      tipo: "hechizo" as const,
      key: `hechizo-${libro.$id}-${spell.key}`,
      spell,
      faccion: libro.factionName ?? libro.name,
    }));
  });
  return [...reglas, ...equipo, ...hechizos];
}

function CartaMiniEuroVista({ carta, glosario }: { carta: CartaMiniEuro; glosario: Map<string, CatalogRule> }) {
  if (carta.tipo === "regla") return <RuleCard habilidad={carta.habilidad} regla={carta.regla} glosario={glosario} />;
  if (carta.tipo === "equipo") return <RuleCard habilidad={carta.item.habilidad} lleva={carta.item.unidades} glosario={glosario} />;
  return <SpellCard spell={carta.spell} faction={carta.faccion} glosario={glosario} />;
}

/** El nombre tal como se escribe (con su valor) y el texto de su
 *  descripcion, ya con el valor metido donde el glosario pone una X. Sin
 *  descripcion no hay fila vacia: se deja en null y quien pinta decide. */
function textoDeRegla(etiqueta: string, glosario: Map<string, CatalogRule>): { nombre: string; texto: string | null } {
  const habilidad = parseHabilidad(etiqueta, "regla");
  const regla = glosario.get(habilidad.nombre.toLowerCase());
  return { nombre: habilidad.etiqueta, texto: regla?.description ? conValor(regla.description, habilidad.valor) : null };
}

/** Una regla por parrafo, nombre en negrita seguido del texto: es lo que va
 *  en la columna ancha de armas y equipo, que puede llevar varias reglas. */
function ReglasTexto({ etiquetas, glosario }: { etiquetas: string[]; glosario: Map<string, CatalogRule> }) {
  if (etiquetas.length === 0) return <span className="muted">—</span>;
  return (
    <>
      {etiquetas.map((etiqueta) => {
        const { nombre, texto } = textoDeRegla(etiqueta, glosario);
        return (
          <p key={etiqueta} className="libro-regla">
            <strong>{nombre}</strong>
            {texto ? `: ${texto}` : ""}
          </p>
        );
      })}
    </>
  );
}

function lineasDeTexto(texto: string | null | undefined, caracteresPorLinea: number): number {
  if (!texto) return 1;
  return Math.max(1, Math.ceil(texto.length / caracteresPorLinea));
}

function lineasDeReglas(etiquetas: string[], glosario: Map<string, CatalogRule>): number {
  if (etiquetas.length === 0) return 1;
  return etiquetas.reduce((total, etiqueta) => total + lineasDeTexto(textoDeRegla(etiqueta, glosario).texto, 92), 0);
}

function altoLibroEstimadoMm(unit: ResolvedUnit, glosario: Map<string, CatalogRule>, hechizos: Spell[]): number {
  const armas = unit.loadout.filter((entrada) => entrada.kind === "weapon");
  const equipo = unit.loadout.filter((entrada) => entrada.kind === "gear");
  const filasArmas = armas.reduce((total, arma) => total + lineasDeReglas(arma.rules, glosario), 0);
  const filasReglas = unit.rules.reduce((total, etiqueta) => total + lineasDeTexto(textoDeRegla(etiqueta, glosario).texto, 100), 0);
  const filasEquipo = equipo.reduce((total, item) => total + lineasDeReglas(item.rules, glosario), 0);
  const filasHechizos = hechizos.reduce((total, spell) => total + lineasDeTexto(spell.effect, 100), 0);
  return 22 + armas.length * 8 + filasArmas * 4.1 + unit.rules.length * 7 + filasReglas * 4.1 + equipo.length * 7 + filasEquipo * 4.1 + hechizos.length * 7 + filasHechizos * 4.1 + (unit.notes ? lineasDeTexto(unit.notes, 110) * 4.1 + 8 : 0);
}

function LibroCabecera({ unit, parte }: { unit: ResolvedUnit; parte?: string }) {
  return (
    <header className="ucard-head libro-cab">
      <h3 className="ucard-title libro-nombre">
        {unit.name}
        {unit.size > 1 ? ` (${unit.size})` : ""}
        {unit.combined ? <span className="ucard-combinada">Combinada</span> : null}
        {parte ? <span className="libro-parte">{parte}</span> : null}
      </h3>
      <div className="ucard-stats libro-stats">
        <div className="ucard-stat">
          <span className="ucard-stat-key">Cal</span>
          <span className="ucard-stat-value">{unit.quality}+</span>
        </div>
        <div className="ucard-stat">
          <span className="ucard-stat-key">Def</span>
          <span className="ucard-stat-value">{unit.defense}+</span>
        </div>
        {unit.maxWounds !== undefined ? (
          <div className="ucard-stat">
            <span className="ucard-stat-key">Her</span>
            <span className="ucard-stat-value">{unit.maxWounds}</span>
          </div>
        ) : null}
        <div className="ucard-stat">
          <span className="ucard-stat-key">Pts</span>
          <span className="ucard-stat-value">{unit.cost}</span>
        </div>
      </div>
    </header>
  );
}

function TablaArmasLibro({ armas, glosario }: { armas: ResolvedUnit["loadout"]; glosario: Map<string, CatalogRule> }) {
  if (armas.length === 0) return null;
  return (
    <section className="ucard-bloque libro-bloque">
      <h4 className="ucard-bloque-title">Armas</h4>
      <table className="ucard-table libro-tabla">
        <thead>
          <tr>
            <th className="libro-col-nombre">Arma</th>
            <th>Alc.</th>
            <th>Atq.</th>
            <th className="libro-col-reglas">Reglas</th>
          </tr>
        </thead>
        <tbody>
          {armas.map((arma, indice) => (
            <tr key={`${arma.name}-${indice}`}>
              <td className="libro-col-nombre">
                {arma.count > 1 ? `${arma.count}× ` : ""}
                {arma.name}
              </td>
              <td className="num">{arma.range ? `${arma.range}\"` : "CaC"}</td>
              <td className="num">A{arma.attacks}</td>
              <td className="libro-col-reglas">
                <ReglasTexto etiquetas={arma.rules} glosario={glosario} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TablaReglasLibro({ reglas, glosario }: { reglas: string[]; glosario: Map<string, CatalogRule> }) {
  if (reglas.length === 0) return null;
  return (
    <section className="ucard-bloque libro-bloque">
      <h4 className="ucard-bloque-title">Reglas</h4>
      <table className="ucard-table libro-tabla">
        <thead>
          <tr>
            <th className="libro-col-nombre">Regla</th>
            <th className="libro-col-reglas">Texto</th>
          </tr>
        </thead>
        <tbody>
          {reglas.map((etiqueta) => {
            const { nombre, texto } = textoDeRegla(etiqueta, glosario);
            return (
              <tr key={etiqueta}>
                <td className="libro-col-nombre">{nombre}</td>
                <td className="libro-col-reglas">{texto ?? <span className="ucard-vacio">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function TablaEquipoLibro({ equipo, glosario }: { equipo: ResolvedUnit["loadout"]; glosario: Map<string, CatalogRule> }) {
  if (equipo.length === 0) return null;
  return (
    <section className="ucard-bloque libro-bloque">
      <h4 className="ucard-bloque-title">Equipo</h4>
      <table className="ucard-table libro-tabla">
        <thead>
          <tr>
            <th className="libro-col-nombre">Equipo</th>
            <th className="libro-col-reglas">Concede</th>
          </tr>
        </thead>
        <tbody>
          {equipo.map((item, indice) => (
            <tr key={`${item.name}-${indice}`}>
              <td className="libro-col-nombre">{item.name}</td>
              <td className="libro-col-reglas">
                <ReglasTexto etiquetas={item.rules} glosario={glosario} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TablaHechizosLibro({ hechizos }: { hechizos: Spell[] }) {
  if (hechizos.length === 0) return null;
  return (
    <section className="ucard-bloque libro-bloque">
      <h4 className="ucard-bloque-title">Hechizos</h4>
      <table className="ucard-table libro-tabla">
        <thead>
          <tr>
            <th className="libro-col-nombre">Hechizo</th>
            <th>Valor</th>
            <th className="libro-col-reglas">Efecto</th>
          </tr>
        </thead>
        <tbody>
          {hechizos.map((spell) => (
            <tr key={spell.key}>
              <td className="libro-col-nombre">{spell.name}</td>
              <td className="num">{spell.threshold}+</td>
              <td className="libro-col-reglas">{spell.effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function textoGanancia(option: UpgradeOption): string | null {
  const desglose = desglosarOpcion(option);
  if (desglose.crudo) return option.label ?? null;
  const ganancias = desglose.ganancias.map((ganancia) => {
    const cantidad = ganancia.cuantas > 1 ? `${ganancia.cuantas}x ` : "";
    return `${cantidad}${ganancia.nombre}${ganancia.perfil ? ` (${ganancia.perfil})` : ""}`;
  });
  return ganancias.length > 0 ? ganancias.join("; ") : null;
}

function reglasDeOpcion(option: UpgradeOption): string[] {
  const desglose = desglosarOpcion(option);
  return [...desglose.reglas, ...desglose.ganancias.flatMap((ganancia) => ganancia.reglas)].map((regla) => regla.etiqueta);
}

function TablaOpcionesLibro({
  section,
  unitId,
  glosario,
}: {
  section: UpgradeSection;
  unitId: string;
  glosario: Map<string, CatalogRule>;
}) {
  return (
    <section className="ucard-bloque libro-bloque libro-opciones">
      <table className="ucard-table libro-tabla">
        <thead>
          <tr>
            <th className="libro-col-nombre">Opcion</th>
            <th>Coste</th>
            <th>Concede</th>
            <th className="libro-col-reglas">Reglas</th>
          </tr>
        </thead>
        <tbody>
          {(section.options ?? []).map((option) => (
            <tr key={option.id ?? option.uid ?? option.label}>
              <td className="libro-col-nombre">{option.label ?? "Opcion"}</td>
              <td className="num">{optionCost(option, unitId) === 0 ? "gratis" : `+${optionCost(option, unitId)}`}</td>
              <td>{textoGanancia(option) ?? <span className="ucard-vacio">—</span>}</td>
              <td className="libro-col-reglas">
                <ReglasTexto etiquetas={reglasDeOpcion(option)} glosario={glosario} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function tipoConfiguracion(section: UpgradeSection): string {
  const limite = section.select?.value ? ` ${section.select.value}` : "";
  return `${section.variant ?? "configuracion"}${limite}`;
}

export function FichaOpcionesLibro({
  nombre,
  unitId,
  sections,
  glosario,
}: {
  nombre: string;
  unitId: string;
  sections: UpgradeSection[];
  glosario: Map<string, CatalogRule>;
}) {
  if (sections.length === 0) return null;
  return (
    <>
      {sections.map((section) => (
        <article key={section.id ?? section.uid} className="ucard ucard-ejercito libro-ficha libro-ficha-opciones">
          <header className="ucard-head libro-cab">
            <h3 className="ucard-title libro-nombre">
              {nombre}
              <span className="libro-opciones-separador">/</span>
              {section.label ?? "Opciones"}
            </h3>
            <p className="libro-opciones-meta">
              <span>Tipo: {tipoConfiguracion(section)}</span>
              <span>Unidad: {nombre}</span>
            </p>
          </header>
          <div className="ucard-body libro-cuerpo">
            <TablaOpcionesLibro section={section} unitId={unitId} glosario={glosario} />
          </div>
        </article>
      ))}
    </>
  );
}

export function FichaUnidadLibro({
  unit,
  glosario,
  libro,
  parte,
}: {
  unit: ResolvedUnit;
  glosario: Map<string, CatalogRule>;
  libro: ArmyBook | undefined;
  parte?: "perfil" | "detalles";
}) {
  const armas = unit.loadout.filter((entrada) => entrada.kind === "weapon");
  const equipo = unit.loadout.filter((entrada) => entrada.kind === "gear");
  const esCaster = tieneCaster([unit]);
  const hechizos = esCaster && libro ? parseSpells(libro.spells ?? null) : [];
  const dividida = parte !== undefined;

  return (
    <article className="ucard ucard-ejercito libro-ficha">
      <LibroCabecera unit={unit} parte={dividida ? (parte === "perfil" ? "1/2" : "2/2") : undefined} />
      {dividida ? <p className="libro-aviso">Ficha dividida para no recortar esta unidad al imprimir.</p> : null}
      <div className="ucard-body libro-cuerpo">
        {parte !== "detalles" ? (
          <TablaArmasLibro armas={armas} glosario={glosario} />
        ) : null}
        {parte !== "perfil" ? (
          <>
            <TablaReglasLibro reglas={unit.rules} glosario={glosario} />
            <TablaEquipoLibro equipo={equipo} glosario={glosario} />
            <TablaHechizosLibro hechizos={hechizos} />
            {unit.notes ? (
              <p className="ucard-notas libro-notas">
                <span className="ucard-label">Notas</span>
                {unit.notes}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}

function tarjetasDeUnidadLibro(unit: ResolvedUnit, glosario: Map<string, CatalogRule>, libro: ArmyBook | undefined): TarjetaLibro[] {
  const hechizos = tieneCaster([unit]) && libro ? parseSpells(libro.spells ?? null) : [];
  const hayDetalles = unit.rules.length > 0 || unit.loadout.some((entrada) => entrada.kind === "gear") || hechizos.length > 0 || Boolean(unit.notes);
  const partir = hayDetalles && altoLibroEstimadoMm(unit, glosario, hechizos) > LIBRO_ALTO_UTIL_MM;
  const keyBase = `${unit.unitKey ?? unit.name}-${unit.sortOrder}`;
  if (!partir) return [{ key: keyBase, unit, libro }];
  return [
    { key: `${keyBase}-perfil`, unit, libro, parte: "perfil" },
    { key: `${keyBase}-detalles`, unit, libro, parte: "detalles" },
  ];
}

function TarjetaUnidadLibro({ tarjeta, glosario }: { tarjeta: TarjetaLibro; glosario: Map<string, CatalogRule> }) {
  return <FichaUnidadLibro unit={tarjeta.unit} glosario={glosario} libro={tarjeta.libro} parte={tarjeta.parte} />;
}

/**
 * Modo libro: tarjetas grandes de unidad con el texto completo de cada regla.
 * Fluyen una detras de otra para llenar cada pagina; si una se estima mas
 * alta que una pagina, se divide en dos tarjetas marcadas.
 */
function VistaLibro({
  units,
  glosario,
  librosConocidos,
  noun,
}: {
  units: ResolvedUnit[];
  glosario: Map<string, CatalogRule>;
  librosConocidos: ArmyBook[];
  noun: ArmyNoun;
}) {
  // Una lista importada y todavia no tocada por el constructor no trae
  // `bookKey` en sus unidades. Con una sola faccion conocida no hay
  // ambiguedad: son todas suyas.
  const defaultBookKey = librosConocidos.length === 1 ? librosConocidos[0].$id : undefined;
  const tarjetas = useMemo(
    () =>
      agruparUnidades(units).flatMap((seccion) =>
        seccion.unidades.flatMap((unit) => tarjetasDeUnidadLibro(unit, glosario, librosConocidos.find((libro) => (unit.bookKey ?? defaultBookKey) === libro.$id))),
      ),
    [defaultBookKey, glosario, librosConocidos, units],
  );

  if (units.length === 0) return <p className="muted">{noun.demonstrativeCap} {noun.singular} no tiene unidades que imprimir.</p>;

  return (
    <div className="print-libro">
      {tarjetas.map((tarjeta) => (
        <TarjetaUnidadLibro key={tarjeta.key} tarjeta={tarjeta} glosario={glosario} />
      ))}
    </div>
  );
}

/**
 * Modo tarjetas con dorso: cada mazo —tarot para las unidades, Mini Euro para
 * el resto— se reparte en hojas completas, y cada hoja de anverso lleva justo
 * detras su hoja de reverso con las columnas invertidas. Imprimiendo primero
 * las hojas impares y despues, con el mismo papel volteado por el borde
 * largo, las pares, cada carta cae encima de su dorso listo para recortar.
 * Aqui no se repite ninguna carta: cada una sale una sola vez para toda
 * {noun.singular}, a diferencia del modo libro.
 */
function VistaTarjetas({
  filas,
  cartas,
  glosario,
  quest,
}: {
  filas: FilaEjercito[];
  cartas: CartaMiniEuro[];
  glosario: Map<string, CatalogRule>;
  quest: boolean;
}) {
  const tarotMm = quest ? TAROT_PERSONAJE_MM : TAROT_MM;
  // Una carta tipo tarot es mas ancha que alta: una hoja tambien apaisada
  // aprovecha mejor el papel (cuatro por hoja en vez de tres).
  const { columnas: tarotCols, filas: tarotFilas } = cuadriculaPorHoja(tarotMm.ancho, tarotMm.alto, true);
  const { columnas: scardCols, filas: scardFilas } = cuadriculaPorHoja(SCARD_MM.ancho, SCARD_MM.alto);
  const hojasTarot = trocear(filas, tarotCols * tarotFilas);
  const hojasScard = trocear(cartas, scardCols * scardFilas);
  const estiloTarot = { gridTemplateColumns: `repeat(${tarotCols}, calc(var(--ucard-w) * var(--ucard-esc)))` };
  const estiloScard = { gridTemplateColumns: `repeat(${scardCols}, calc(var(--scard-w) * var(--scard-esc)))` };

  return (
    <div className="print-tarjetas">
      {filas.length > 0 ? (
        <section className="print-mazo print-mazo-apaisado">
          <h3 className="print-mazo-title">Unidades</h3>
          {hojasTarot.map((hoja, indice) => (
            <div key={`tarot-${indice}`}>
              <div className="print-hoja" style={estiloTarot}>
                {hoja.map((fila) => (
                  <UnitCard
                    key={fila.key}
                    variant="ejercito"
                    quest={quest}
                    formato={quest ? "personaje" : "tarot"}
                    glosario={glosario}
                    unit={perfilDe(fila.principal)}
                    combinada={fila.principal.combined}
                    notas={fila.principal.notes}
                    adjunta={fila.adjunta ? { ...perfilDe(fila.adjunta), combinada: fila.adjunta.combined } : undefined}
                  />
                ))}
              </div>
              <div className="print-hoja print-reverso" style={estiloTarot}>
                {espejarHoja(hoja, tarotCols).map((fila, celda) =>
                  fila ? (
                    <div key={fila.key} className="print-dorso print-dorso-tarot" />
                  ) : (
                    <div key={`vacio-${celda}`} className="print-dorso print-dorso-vacio" />
                  ),
                )}
              </div>
            </div>
          ))}
        </section>
      ) : null}
      {cartas.length > 0 ? (
        <section className="print-mazo">
          <h3 className="print-mazo-title">Habilidades, equipo, hechizos y reglas generales</h3>
          {hojasScard.map((hoja, indice) => (
            <div key={`scard-${indice}`}>
              <div className="print-hoja" style={estiloScard}>
                {hoja.map((carta) => (
                  <CartaMiniEuroVista key={carta.key} carta={carta} glosario={glosario} />
                ))}
              </div>
              <div className="print-hoja print-reverso" style={estiloScard}>
                {espejarHoja(hoja, scardCols).map((carta, celda) =>
                  carta ? (
                    <div key={carta.key} className="print-dorso print-dorso-scard" />
                  ) : (
                    <div key={`vacio-${celda}`} className="print-dorso print-dorso-vacio" />
                  ),
                )}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}

/**
 * Asistente de impresion: primero se elige el modo, y solo entonces se
 * compone la hoja —construir los dos mazos por adelantado para una lista
 * grande es trabajo de sobra si al final no se usan.
 */
export default function ArmyPrintView({
  nombre,
  noun,
  quest,
  units,
  entradasAttachedTo,
  glosario,
  librosConocidos,
  onCerrar,
}: {
  nombre: string;
  noun: ArmyNoun;
  quest: boolean;
  units: ResolvedUnit[];
  /** `attachedTo` de cada entrada guardada, en el mismo orden que `units`: hace falta para emparejar heroe y unidad en el modo de tarjetas. */
  entradasAttachedTo: Array<number | undefined>;
  glosario: Map<string, CatalogRule>;
  librosConocidos: ArmyBook[];
  onCerrar: () => void;
}) {
  const [modo, setModo] = useState<"elegir" | "libro" | "tarjetas">("elegir");
  const filas = useMemo(() => emparejarHeroes(units, entradasAttachedTo), [units, entradasAttachedTo]);
  const cartas = useMemo(() => cartasDe(glosario, units, librosConocidos), [glosario, units, librosConocidos]);

  return (
    <div className="print-vista">
      <div className="print-toolbar">
        <button type="button" onClick={() => (modo === "elegir" ? onCerrar() : setModo("elegir"))}>
          {modo === "elegir" ? "Cancelar" : "← Volver a elegir"}
        </button>
        <h2 className="print-toolbar-title">Imprimir {nombre || noun.singular}</h2>
        {modo !== "elegir" ? (
          <button type="button" className="primary" onClick={() => window.print()}>
            Imprimir
          </button>
        ) : null}
      </div>

      {modo === "elegir" ? (
        <div className="print-asistente">
          <p className="muted">Elige como quieres imprimir las cartas de {noun.demonstrative} {noun.singular}.</p>
          <div className="print-opciones">
            <button type="button" className="print-opcion" onClick={() => setModo("libro")}>
              <strong>Modo libro</strong>
              <span>
                Tarjetas grandes de unidad con armas, equipo, hechizos y el texto de sus reglas especiales. La impresion
                llena cada pagina con las tarjetas que quepan y divide las unidades demasiado largas.
              </span>
            </button>
            <button type="button" className="print-opcion" onClick={() => setModo("tarjetas")}>
              <strong>Modo tarjetas con dorso</strong>
              <span>
                Cada carta sale una sola vez, pensado para plastificar y recortar: hojas de anverso seguidas de su
                hoja de reverso. Imprime primero las hojas impares, voltea el papel por el borde largo y vuelve a
                imprimir las pares.
              </span>
            </button>
          </div>
        </div>
      ) : modo === "libro" ? (
        <VistaLibro units={units} glosario={glosario} librosConocidos={librosConocidos} noun={noun} />
      ) : (
        <VistaTarjetas filas={filas} cartas={cartas} glosario={glosario} quest={quest} />
      )}
    </div>
  );
}
