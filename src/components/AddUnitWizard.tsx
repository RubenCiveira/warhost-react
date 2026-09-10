import { useCallback, useEffect, useMemo, useState } from "react";
import { getBook, listRuleGlossary, listUnits, listUpgradePackages } from "../api/catalog";
import type { ArmyBook, ArmyUnit, CatalogRule } from "../api/catalog";
import {
  blockReason,
  entryCost,
  entryLoadout,
  entryRules,
  entryUpgradeLabels,
  optionCost,
  optionId,
  sectionsForUnit,
} from "../lib/builder";
import type { BuilderEntry, UpgradeSection } from "../lib/builder";
import { baseLoadout } from "../lib/loadout";
import { errorMessage } from "../lib/format";
import { ErrorBanner, Spinner } from "./ui";
import UnitCard from "./UnitCard";
import RuleCardModal from "./RuleCardModal";
import type { Habilidad } from "../lib/reglas";

type Paso = "elegir" | "configurar" | "revisar";

interface Props {
  bookKey: string;
  onCancel: () => void;
  /** Devuelve tambien el catalogo cargado: hace falta para rehacer la lista. */
  onConfirm: (
    entry: BuilderEntry,
    book: ArmyBook,
    packages: Map<string, UpgradeSection[]>,
    units: ArmyUnit[],
  ) => void;
  busy?: boolean;
}

/**
 * Asistente de tres pasos para meter una unidad en un ejercito: elegirla del
 * catalogo, configurarla y revisar como queda antes de confirmar.
 *
 * Trabaja sobre una copia: hasta que no se confirma no sale nada de aqui, asi
 * que abandonar a medias no deja rastro en el ejercito.
 */
export default function AddUnitWizard({ bookKey, onCancel, onConfirm, busy = false }: Props) {
  const [book, setBook] = useState<ArmyBook | null>(null);
  const [units, setUnits] = useState<ArmyUnit[]>([]);
  const [packages, setPackages] = useState<Map<string, UpgradeSection[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [paso, setPaso] = useState<Paso>("elegir");
  const [entry, setEntry] = useState<BuilderEntry | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [glosario, setGlosario] = useState<Map<string, CatalogRule>>(new Map());
  const [habilidad, setHabilidad] = useState<Habilidad | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [b, u, p] = await Promise.all([getBook(bookKey), listUnits(bookKey), listUpgradePackages(bookKey)]);
        if (cancelled) return;
        setBook(b);
        setUnits(u);
        setPackages(p);
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
  }, [bookKey]);

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

  const tarjeta = (actual: BuilderEntry) => ({
    name: actual.unit.name,
    size: actual.unit.size,
    quality: actual.unit.quality,
    defense: actual.unit.defense,
    cost: entryCost(actual, sections),
    rules: entryRules(actual, sections),
    loadout: entryLoadout(actual, sections),
  });

  const pasos: Array<[Paso, string]> = [
    ["elegir", "Elegir unidad"],
    ["configurar", "Configurar"],
    ["revisar", "Revisar"],
  ];

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Anadir unidad"
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
                      conTexto={new Set(glosario.keys())}
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
              Personaliza <strong>{entry.unit.name}</strong>. Los limites de cada seccion son los del libro de
              ejercito.
            </p>
            <div className="wizard-single">
              <UnitCard
                variant="ejercito"
                unitId={entry.unit.unitId}
                conTexto={new Set(glosario.keys())}
                onHabilidad={setHabilidad}
                sections={sections}
                upgrades={entryUpgradeLabels(entry, sections)}
                optionsOpen
                optionsLabel="Opciones de la unidad"
                unit={tarjeta(entry)}
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
              <button type="button" onClick={() => setPaso("elegir")}>
                Volver
              </button>
              <button type="button" className="primary" onClick={() => setPaso("revisar")}>
                Revisar
              </button>
            </footer>
          </>
        ) : null}

        {!loading && entry && paso === "revisar" ? (
          <>
            <p className="muted small">Asi queda la unidad. Al confirmar se anade al borrador del ejercito.</p>
            <div className="wizard-single">
              <UnitCard
                variant="ejercito"
                unit={tarjeta(entry)}
                upgrades={entryUpgradeLabels(entry, sections)}
                conTexto={new Set(glosario.keys())}
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
                disabled={busy || !book}
                onClick={() => book && onConfirm(entry, book, packages, units)}
              >
                {busy ? "Anadiendo…" : "Confirmar"}
              </button>
            </footer>
          </>
        ) : null}
      </div>

      {habilidad ? (
        <div className="sobre-modal">
          <RuleCardModal habilidad={habilidad} glosario={glosario} onCerrar={() => setHabilidad(null)} />
        </div>
      ) : null}
    </div>
  );
}
