import { useCallback, useEffect, useMemo, useState } from "react";
import { getBook, listRuleGlossary, listUnits, listUpgradePackages } from "../api/catalog";
import type { ArmyBook, ArmyUnit, CatalogRule } from "../api/catalog";
import { listHeroClasses } from "../api/content";
import {
  blockReason,
  entryCost,
  entryLoadoutFinal,
  sePuedeCombinar,
  puedeAdjuntarse,
  necesitaClaseDeHeroe,
  entryRules,
  entryUpgradeLabels,
  optionCost,
  optionId,
  sectionsForUnit,
  toughOf,
} from "../lib/builder";
import type { BuilderEntry, UpgradeSection } from "../lib/builder";
import { baseLoadout } from "../lib/loadout";
import { perfilInicialQuest } from "../lib/questHero";
import { armyNounFor, getGameSystem, isQuestSystem } from "../lib/gameSystems";
import { errorMessage } from "../lib/format";
import type { HeroClass } from "../lib/types";
import { ErrorBanner, Spinner } from "./ui";
import UnitCard from "./UnitCard";
import RuleCardModal from "./RuleCardModal";
import type { Habilidad } from "../lib/reglas";

type Paso = "elegir" | "configurar" | "revisar";

/** Una unidad que ya esta en el ejercito, para volver a configurarla. */
export interface UnidadEnEdicion {
  unitId: string;
  choices: Record<string, number>;
  combined?: boolean;
  notes?: string;
  /** Indice, en la lista guardada, de la unidad a la que se unio el heroe. */
  attachedTo?: number;
  /** `$id` de `hero_classes` elegida. Solo en Star Quest / Fantasy Quest. */
  heroClassId?: string;
  /** Nombre propio del heroe, puesto por el jugador. */
  customName?: string;
}

/** Una unidad del ejercito a la que un heroe puede unirse. */
export interface UnidadDelEjercito {
  indice: number;
  nombre: string;
}

interface Props {
  bookKey: string;
  onCancel: () => void;
  /** Devuelve tambien el catalogo cargado: hace falta para rehacer la lista. */
  onConfirm: (
    entry: BuilderEntry,
    book: ArmyBook,
    packages: Map<string, UpgradeSection[]>,
    units: ArmyUnit[],
    unirA: number | null,
  ) => void;
  /**
   * Con esto el asistente no elige unidad: abre directamente la que ya esta
   * puesta, con su configuracion, para cambiarla.
   */
  editando?: UnidadEnEdicion | null;
  /**
   * Unidades del ejercito a las que un heroe de `Tough(6)` o menos puede
   * unirse. Vienen ya sin heroes y sin la propia unidad que se edita.
   */
  unidadesDelEjercito?: UnidadDelEjercito[];
  busy?: boolean;
}

/**
 * Asistente de tres pasos para meter una unidad en un ejercito: elegirla del
 * catalogo, configurarla y revisar como queda antes de confirmar.
 *
 * Trabaja sobre una copia: hasta que no se confirma no sale nada de aqui, asi
 * que abandonar a medias no deja rastro en el ejercito.
 */
export default function AddUnitWizard({
  bookKey,
  onCancel,
  onConfirm,
  editando = null,
  unidadesDelEjercito = [],
  busy = false,
}: Props) {
  const [book, setBook] = useState<ArmyBook | null>(null);
  const [units, setUnits] = useState<ArmyUnit[]>([]);
  const [packages, setPackages] = useState<Map<string, UpgradeSection[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [paso, setPaso] = useState<Paso>(editando ? "configurar" : "elegir");
  const [entry, setEntry] = useState<BuilderEntry | null>(null);
  /** Indice de la unidad a la que se une el heroe, o null si va suelto. */
  const [unirA, setUnirA] = useState<number | null>(editando?.attachedTo ?? null);
  const [busqueda, setBusqueda] = useState("");
  const [glosario, setGlosario] = useState<Map<string, CatalogRule>>(new Map());
  const [habilidad, setHabilidad] = useState<Habilidad | null>(null);
  const [heroClasses, setHeroClasses] = useState<HeroClass[]>([]);
  const noun = armyNounFor(getGameSystem(book?.gameSystem));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [b, u, p] = await Promise.all([getBook(bookKey), listUnits(bookKey), listUpgradePackages(bookKey)]);
        if (cancelled) return;
        setBook(b);
        setUnits(u);
        setPackages(p);
        // Al editar, la unidad ya esta elegida: se rehace su entrada con lo
        // que tenia puesto. Si su unidad ya no esta en el libro no hay nada
        // que configurar, y se dice en vez de abrir el asistente en blanco.
        if (editando) {
          const suya = u.find((unit) => unit.unitId === editando.unitId);
          if (!suya) {
            setError(`Esta unidad ya no existe en la version actual del libro de ${armyNounFor(getGameSystem(b.gameSystem)).singular}.`);
          } else {
            setEntry({
              key: `${suya.unitId}-editar`,
              unit: suya,
              choices: { ...editando.choices },
              combined: editando.combined,
              notes: editando.notes,
              heroClassId: editando.heroClassId,
              customName: editando.customName,
            });
            setUnirA(editando.attachedTo ?? null);
          }
        }
        // Sin bloquear el asistente: sin glosario los chips siguen ahi, solo que
        // no saben cuales tienen descripcion.
        listRuleGlossary(b.gameSystem)
          .then((g) => !cancelled && setGlosario(g))
          .catch(() => undefined);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookKey, editando]);

  /** Solo hace falta el catalogo de clases en Quest, y es el mismo para toda la sesion del asistente. */
  useEffect(() => {
    if (!book || !isQuestSystem(book.gameSystem)) return undefined;
    let cancelled = false;
    listHeroClasses(book.gameSystem)
      .then((rows) => !cancelled && setHeroClasses(rows.filter((c) => c.classKey !== "default")))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [book]);

  useEffect(() => {
    const conEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Con una carta de habilidad abierta encima, Escape la cierra a ella: si
      // no, se cerraria el asistente entero y se perderia lo elegido.
      if (habilidad) return;
      onCancel();
    };
    document.addEventListener("keydown", conEscape);
    return () => document.removeEventListener("keydown", conEscape);
  }, [onCancel, habilidad]);

  const visibles = useMemo(() => {
    const aguja = busqueda.trim().toLowerCase();
    if (!aguja) return units;
    return units.filter(
      (unit) => unit.name.toLowerCase().includes(aguja) || unit.rules.some((r) => r.toLowerCase().includes(aguja)),
    );
  }, [units, busqueda]);

  const elegir = useCallback((unit: ArmyUnit) => {
    setEntry({ key: `${unit.unitId}-${Date.now()}`, unit, choices: {} });
    setPaso("configurar");
  }, []);

  const cambiar = useCallback((id: string, delta: number) => {
    setEntry((previo) => {
      if (!previo) return previo;
      const siguiente = Math.max(0, (previo.choices[id] ?? 0) + delta);
      const choices = { ...previo.choices };
      if (siguiente === 0) delete choices[id];
      else choices[id] = siguiente;
      return { ...previo, choices };
    });
  }, []);

  const sections = entry ? sectionsForUnit(entry.unit, packages) : [];

  // La carta ensena la unidad tal como sale a la mesa: si va combinada, con el
  // tamano, el coste y el equipo ya doblados. En quest, Calidad/Defensa/
  // Aguante no salen del catalogo: salen del perfil inicial de heroe (ver
  // questHero.ts), que solo depende de la clase elegida.
  const tarjeta = (actual: BuilderEntry) => {
    const rules = entryRules(actual, sections);
    const esHeroeDeQuest = book && necesitaClaseDeHeroe(actual, sections, book.gameSystem);
    const clase = heroClasses.find((candidata) => candidata.$id === actual.heroClassId);
    const perfilQuest = esHeroeDeQuest ? perfilInicialQuest(clase, toughOf(rules)) : null;
    return {
      name: actual.customName || actual.unit.name,
      size: actual.unit.size * (actual.combined ? 2 : 1),
      quality: perfilQuest?.quality ?? actual.unit.quality,
      defense: perfilQuest?.defense ?? actual.unit.defense,
      cost: entryCost(actual, sections),
      rules,
      loadout: entryLoadoutFinal(actual, sections),
      ...(perfilQuest ? { maxWounds: perfilQuest.tough } : {}),
      ...(perfilQuest
        ? {
            strength: perfilQuest.strength,
            dexterity: perfilQuest.dexterity,
            willpower: perfilQuest.willpower,
            power: perfilQuest.power,
          }
        : {}),
    };
  };

  const requiereClase = Boolean(entry && book && necesitaClaseDeHeroe(entry, sections, book.gameSystem));
  const faltaClase = requiereClase && !entry?.heroClassId;
  const quest = Boolean(book && isQuestSystem(book.gameSystem));

  /** "Clase · tipo de unidad" para el subtitulo de la ficha, solo en quest. */
  const subtituloDe = (actual: BuilderEntry) => {
    if (!quest) return undefined;
    const clase = heroClasses.find((candidata) => candidata.$id === actual.heroClassId)?.name;
    return [clase, actual.unit.name].filter(Boolean).join(" · ");
  };

  /**
   * Nombre propio y clase del heroe: van antes de la ficha, no en su pie,
   * porque son lo primero que hace falta decidir y la ficha se recalcula con
   * cada cambio —el nombre en el titulo, la clase en todos los atributos—.
   */
  const controlesDeHeroeQuest = (actual: BuilderEntry) =>
    book && necesitaClaseDeHeroe(actual, sections, book.gameSystem) ? (
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          type="text"
          placeholder="Nombre del heroe"
          value={actual.customName ?? ""}
          onChange={(event) =>
            setEntry((previo) => (previo ? { ...previo, customName: event.target.value } : previo))
          }
        />
        <label className="check tiny">
          Clase
          <select
            value={actual.heroClassId ?? ""}
            onChange={(event) =>
              setEntry((previo) => (previo ? { ...previo, heroClassId: event.target.value || undefined } : previo))
            }
          >
            <option value="">— elige clase —</option>
            {heroClasses.map((clase) => (
              <option key={clase.$id} value={clase.$id}>
                {clase.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    ) : null;

  const controlesDeUnidad = (actual: BuilderEntry) => (
    <>
      {sePuedeCombinar(actual.unit) ? (
        <label className="check tiny">
          <input
            type="checkbox"
            checked={Boolean(actual.combined)}
            onChange={(event) => setEntry((previo) => (previo ? { ...previo, combined: event.target.checked } : previo))}
          />
          Combinar
        </label>
      ) : null}
      {book && puedeAdjuntarse(actual, sections, book.gameSystem) && unidadesDelEjercito.length > 0 ? (
        <label className="check tiny">
          Unir a
          <select value={unirA ?? ""} onChange={(event) => setUnirA(event.target.value === "" ? null : Number(event.target.value))}>
            <option value="">— suelto —</option>
            {unidadesDelEjercito.map((u) => (
              <option key={u.indice} value={u.indice}>
                {u.nombre}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <input
        className="tiny nota"
        type="text"
        placeholder="Notas de la unidad"
        value={actual.notes ?? ""}
        onChange={(event) => setEntry((previo) => (previo ? { ...previo, notes: event.target.value } : previo))}
      />
    </>
  );

  const pasos: Array<[Paso, string]> = editando
    ? [
        ["configurar", "Configurar"],
        ["revisar", "Revisar"],
      ]
    : [
        ["elegir", "Elegir unidad"],
        ["configurar", "Configurar"],
        ["revisar", "Revisar"],
      ];

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={editando ? "Configurar unidad" : "Anadir unidad"}
      onClick={() => !habilidad && onCancel()}
    >
      <div className="modal wide wizard" onClick={(event) => event.stopPropagation()}>
        <header className="spread">
          <ol className="wizard-steps">
            {pasos.map(([id, etiqueta], indice) => (
              <li key={id} className={paso === id ? "activo" : undefined}>
                <span className="wizard-num">{indice + 1}</span>
                {etiqueta}
              </li>
            ))}
          </ol>
          <button type="button" className="ghost tiny" onClick={onCancel}>
            Cerrar
          </button>
        </header>

        <ErrorBanner error={error} />
        {loading ? <Spinner /> : null}

        {!loading && book && paso === "elegir" ? (
          <>
            <div className="spread">
              <p className="muted small" style={{ margin: 0 }}>
                Unidades de {book.name}. Desplaza para verlas todas.
              </p>
              <input
                type="search"
                className="inline-search"
                placeholder="Buscar unidad…"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
              />
            </div>
            {visibles.length === 0 ? (
              <p className="muted">Ninguna unidad coincide.</p>
            ) : (
              <div className="army-strip">
                {visibles.map((unit) => (
                  <div key={unit.$id} className="army-slide">
                    <UnitCard
                      variant="catalogo"
                      formato="hoja"
                      unitId={unit.unitId}
                      quest={quest}
                      glosario={glosario}
                      onHabilidad={setHabilidad}
                      sections={sectionsForUnit(unit, packages)}
                      unit={{
                        name: unit.name,
                        size: unit.size,
                        quality: unit.quality,
                        defense: unit.defense,
                        cost: unit.cost,
                        rules: unit.rules,
                        loadout: baseLoadout(unit.weapons, unit.items),
                      }}
                      footer={
                        <button type="button" className="primary tiny" onClick={() => elegir(unit)}>
                          Anadir esta
                        </button>
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}

        {!loading && entry && paso === "configurar" ? (
          <>
            <p className="muted small">
              Personaliza <strong>{entry.unit.name}</strong>. Los limites de cada seccion son los del libro de{" "}
              {noun.singular}.
            </p>
            {controlesDeHeroeQuest(entry)}
            <div className="wizard-single">
              <UnitCard
                variant="ejercito"
                unitId={entry.unit.unitId}
                quest={quest}
                subtitulo={subtituloDe(entry)}
                glosario={glosario}
                onHabilidad={setHabilidad}
                sections={sections}
                upgrades={entryUpgradeLabels(entry, sections)}
                optionsOpen
                optionsLabel="Opciones de la unidad"
                unit={tarjeta(entry)}
                combinada={entry.combined}
                notas={entry.notes}
                footer={controlesDeUnidad(entry)}
                optionAction={(section, option) => {
                  const id = optionId(option);
                  const cuantas = entry.choices[id] ?? 0;
                  const bloqueo = blockReason(section, option, entry, sections);
                  return (
                    <span className="row ucard-option-controls">
                      <span className="ucard-price">+{optionCost(option, entry.unit.unitId)}</span>
                      <button
                        type="button"
                        className="icon tiny"
                        disabled={cuantas === 0}
                        onClick={() => cambiar(id, -1)}
                        aria-label={`Quitar ${option.label}`}
                      >
                        −
                      </button>
                      <span className="mono">{cuantas}</span>
                      <button
                        type="button"
                        className="icon tiny"
                        disabled={Boolean(bloqueo)}
                        title={bloqueo ?? undefined}
                        onClick={() => cambiar(id, 1)}
                        aria-label={`Anadir ${option.label}`}
                      >
                        +
                      </button>
                    </span>
                  );
                }}
              />
            </div>
            <footer className="wizard-foot">
              <button type="button" onClick={() => (editando ? onCancel() : setPaso("elegir"))}>
                {editando ? "Cancelar" : "Volver"}
              </button>
              <button type="button" className="primary" onClick={() => setPaso("revisar")}>
                Revisar
              </button>
            </footer>
          </>
        ) : null}

        {!loading && entry && paso === "revisar" ? (
          <>
            <p className="muted small">
              {editando
                ? `Asi queda la unidad. Al confirmar se guarda en el borrador ${noun.ofThe} ${noun.singular}.`
                : `Asi queda la unidad. Al confirmar se anade al borrador ${noun.ofThe} ${noun.singular}.`}
            </p>
            <div className="wizard-single">
              <UnitCard
                variant="ejercito"
                quest={quest}
                subtitulo={subtituloDe(entry)}
                unit={tarjeta(entry)}
                combinada={entry.combined}
                notas={entry.notes}
                upgrades={entryUpgradeLabels(entry, sections)}
                glosario={glosario}
                onHabilidad={setHabilidad}
              />
            </div>
            <footer className="wizard-foot">
              <button type="button" onClick={() => setPaso("configurar")}>
                Volver a configurar
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy || !book || faltaClase}
                title={faltaClase ? "Elige una clase para este heroe antes de confirmar." : undefined}
                onClick={() =>
                  book && onConfirm(entry, book, packages, units, puedeAdjuntarse(entry, sections, book.gameSystem) ? unirA : null)
                }
              >
                {busy ? "Guardando…" : "Confirmar"}
              </button>
            </footer>
          </>
        ) : null}
      </div>

      {habilidad ? (
        <div className="sobre-modal">
          <RuleCardModal habilidad={habilidad} glosario={glosario} onCerrar={() => setHabilidad(null)} onAbrir={setHabilidad} />
        </div>
      ) : null}
    </div>
  );
}
