import { useMemo, useState } from "react";
import type { ArmyBook, CatalogRule } from "../api/catalog";
import type { ResolvedUnit } from "../lib/armyForgeResolve";
import { equipoDeEjercito, reglasUsadasEnEjercito, tieneCaster } from "../lib/faccion";
import type { EquipoDeFaccion } from "../lib/faccion";
import { agruparUnidades, emparejarHeroes } from "../lib/unidades";
import type { FilaEjercito } from "../lib/unidades";
import { parseHabilidad } from "../lib/reglas";
import type { Habilidad } from "../lib/reglas";
import { parseSpells } from "../lib/spells";
import type { Spell } from "../lib/spells";
import type { ArmyNoun } from "../lib/gameSystems";
import { cuadriculaPorHoja, trocear, espejarHoja } from "../lib/print";
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

type CartaMiniEuro =
  | { tipo: "regla"; key: string; habilidad: Habilidad; regla: CatalogRule }
  | { tipo: "equipo"; key: string; item: EquipoDeFaccion }
  | { tipo: "hechizo"; key: string; spell: Spell; faccion: string | null };

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

/**
 * Modo libro: una hoja aparte por unidad, con su ficha completa y detras
 * todas las cartas de lo que lleva —directo, de su equipo, o arrastrado por
 * texto—. Las mismas cartas de habilidad pueden salir repetidas en mas de
 * una unidad: el objetivo es poder consultar cada unidad suelta, no ahorrar
 * papel.
 */
function VistaLibro({
  units,
  glosario,
  librosConocidos,
  quest,
  noun,
}: {
  units: ResolvedUnit[];
  glosario: Map<string, CatalogRule>;
  librosConocidos: ArmyBook[];
  quest: boolean;
  noun: ArmyNoun;
}) {
  if (units.length === 0) return <p className="muted">{noun.demonstrativeCap} {noun.singular} no tiene unidades que imprimir.</p>;
  return (
    <div className="print-libro">
      {agruparUnidades(units).map((seccion) =>
        seccion.unidades.map((unit) => {
          const cartas = cartasDe(glosario, [unit], librosConocidos);
          return (
            <section key={`${unit.unitKey ?? unit.name}-${unit.sortOrder}`} className="print-unidad">
              <div className="army-slide">
                {/* Sin `upgrades`: ese resumen vive fuera de la carta y, al
                    variar de largo entre unidades, descuadraba la alineacion
                    de las cartas en papel; lo elegido ya se ve en su tabla
                    de armas y equipo. */}
                <UnitCard variant="ejercito" formato="hoja" quest={quest} glosario={glosario} unit={perfilDe(unit)} combinada={unit.combined} notas={unit.notes} />
              </div>
              {cartas.length > 0 ? (
                <div className="army-strip">
                  {cartas.map((carta) => (
                    <div key={carta.key} className="army-slide">
                      <CartaMiniEuroVista carta={carta} glosario={glosario} />
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          );
        }),
      )}
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
                Una ficha completa por unidad, seguida de todas sus cartas de habilidades, equipo, hechizos y reglas
                generales —incluidas las que llegan por su equipo o por aura—. Facil de consultar unidad por unidad,
                aunque una misma carta se repita en varias.
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
        <VistaLibro units={units} glosario={glosario} librosConocidos={librosConocidos} quest={quest} noun={noun} />
      ) : (
        <VistaTarjetas filas={filas} cartas={cartas} glosario={glosario} quest={quest} />
      )}
    </div>
  );
}
