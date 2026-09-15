import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getBook, listRuleGlossary, listUnits, listUpgradePackages } from "../../api/catalog";
import type { ArmyBook, ArmyUnit, CatalogRule } from "../../api/catalog";
import { createArmy, getArmy, getDraftFor, saveDraft, startDraft } from "../../api/armies";
import type { Army } from "../../lib/types";
import {
  blockReason,
  buildArmy,
  entriesFromForgeList,
  entryCost,
  entryLoadoutFinal,
  esHeroe,
  sePuedeCombinar,
  puedeAdjuntarse,
  entryRules,
  entryUpgradeLabels,
  optionCost,
  optionId,
  rehydrateEntries,
  sectionsForUnit,
} from "../../lib/builder";
import type { BuilderEntry, UpgradeSection } from "../../lib/builder";
import { baseLoadout } from "../../lib/loadout";
import { limitesComposicion } from "../../lib/composicion";
import { composeArmyPayload } from "../../lib/armyPayload";
import { errorMessage } from "../../lib/format";
import { armyNounFor, getGameSystem } from "../../lib/gameSystems";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";
import UnitCard from "../../components/UnitCard";
import RuleCardModal from "../../components/RuleCardModal";
import type { Habilidad } from "../../lib/reglas";

/** Constructor de ejercitos a partir del catalogo propio. */
/** Lo que guarda la columna `listJson` de un ejercito. */
interface StoredList {
  units?: unknown[];
  entries?: unknown[];
  raw?: unknown;
  source?: { bookKey?: string; bookVersion?: string | null };
}

function parseStored(listJson: string | null): StoredList | null {
  if (!listJson) return null;
  try {
    return JSON.parse(listJson) as StoredList;
  } catch {
    return null;
  }
}

export default function ArmyBuilder() {
  const { bookKey: bookKeyParam = "", armyId = "" } = useParams();
  const editing = Boolean(armyId);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [army, setArmy] = useState<Army | null>(null);
  const [book, setBook] = useState<ArmyBook | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [units, setUnits] = useState<ArmyUnit[]>([]);
  const [packages, setPackages] = useState<Map<string, UpgradeSection[]>>(new Map());
  const [glosario, setGlosario] = useState<Map<string, CatalogRule>>(new Map());
  const [habilidad, setHabilidad] = useState<Habilidad | null>(null);
  const [entries, setEntries] = useState<BuilderEntry[]>([]);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [unitSearch, setUnitSearch] = useState("");
  const [name, setName] = useState("");
  /** Objetivo de puntos, opcional: 0 significa que no se ha fijado ninguno. */
  const [pointsLimit, setPointsLimit] = useState(0);
  /** Tolerancia sobre `pointsLimit`, en tanto por ciento. */
  const [pointsMargin, setPointsMargin] = useState(5);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        // Al editar, la faccion de origen sale del propio ejercito; al crear,
        // viene en la ruta.
        let loadedArmy: Army | null = null;
        let key = bookKeyParam;
        let stored: StoredList | null = null;

        if (editing) {
          const activo = await getArmy(armyId);
          // Si ya hay borrador, se sigue editando ese: crear otro lo impide el
          // indice unico, y ademas se perderia lo que llevabas.
          loadedArmy = (activo.lineageId ? await getDraftFor(activo.lineageId) : null) ?? activo;
          stored = parseStored(loadedArmy.listJson);
          key = stored?.source?.bookKey ?? "";
          if (!key) {
            const noun = armyNounFor(getGameSystem(loadedArmy.gameSystem));
            throw new Error(
              `${noun.demonstrativeCap} ${noun.singular} no dice de que faccion del catalogo viene, asi que no ` +
                `se pueden anadir unidades. Se puede reimportar o crear ${noun.indefArticle} ${noun.newForm} ` +
                "desde la faccion.",
            );
          }
        }

        const [loadedBook, loadedUnits, loadedPackages] = await Promise.all([
          getBook(key),
          listUnits(key),
          listUpgradePackages(key),
        ]);
        if (cancelled) return;

        setArmy(loadedArmy);
        setBook(loadedBook);
        setUnits(loadedUnits);
        setPackages(loadedPackages);
        // El glosario no bloquea la pagina: sin el los chips siguen ahi y solo
        // se quedan sin descripcion.
        listRuleGlossary(loadedBook.gameSystem)
          .then((g) => { if (!cancelled) setGlosario(g); })
          .catch(() => undefined);
        setName((current) => current || loadedArmy?.name || loadedBook.name);
        // El objetivo es opcional: se recupera el que traiga el ejercito, y si
        // no tenia ninguno fijado se deja sin fijar, no se inventa uno.
        if (loadedArmy?.pointsLimit) setPointsLimit(loadedArmy.pointsLimit);
        if (loadedArmy?.pointsMargin !== undefined) setPointsMargin(loadedArmy.pointsMargin);

        if (stored) {
          // Las elecciones guardadas son la via buena; si el ejercito se
          // importo, se reconstruyen del JSON original de Army Forge.
          const rehydrated = stored.entries
            ? rehydrateEntries(stored.entries, loadedUnits, loadedBook.$id)
            : entriesFromForgeList(stored.raw, loadedUnits, new Map([[loadedBook.uid, loadedBook.$id]]));
          setEntries(rehydrated);

          const esperadas = stored.units?.length ?? 0;
          if (esperadas > rehydrated.length) {
            const noun = armyNounFor(getGameSystem(loadedBook.gameSystem));
            setWarning(
              `Se han recuperado ${rehydrated.length} de ${esperadas} unidades. El resto no existe en la version ` +
                `actual del libro de ${noun.singular}, asi que no se pueden seguir editando.`,
            );
          }
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [armyId, bookKeyParam, editing]);

  // El selector es modal: se cierra con Escape, y mientras esta abierto la
  // pagina de debajo no se desplaza.
  useEffect(() => {
    if (!picking) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPicking(false);
    };
    document.addEventListener("keydown", onKey);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previo;
    };
  }, [picking]);

  const built = useMemo(() => buildArmy(entries, packages), [entries, packages]);
  const bookSystem = getGameSystem(book?.gameSystem);
  const noun = armyNounFor(bookSystem);

  // Un heroe solo se une a una unidad de verdad, no a otro heroe. El conjunto
  // se calcula una vez y no por cada tarjeta.
  const heroKeys = useMemo(
    () =>
      new Set(
        entries
          .filter((entry) => esHeroe(entryRules(entry, sectionsForUnit(entry.unit, packages))))
          .map((entry) => entry.key),
      ),
    [entries, packages],
  );
  const unidadesParaUnir = useCallback(
    (heroKey: string) => entries.filter((entry) => entry.key !== heroKey && !heroKeys.has(entry.key)),
    [entries, heroKeys],
  );

  // Limites de composicion, los mismos cuatro que ensena Army Forge para los
  // puntos del ejercito: heroes, unidades, modelos contando el Tough, y copias
  // de la misma unidad. Se calculan sobre el objetivo si se ha fijado uno; si
  // no, caen de vuelta en lo que cuesta la lista hasta ahora, igual que en la
  // ficha del ejercito ya guardado.
  const limites = useMemo(
    () => limitesComposicion(pointsLimit > 0 ? pointsLimit : built.points, book?.gameSystem ?? "gf"),
    [pointsLimit, built.points, book?.gameSystem],
  );
  const modelosActuales = built.units.reduce((suma, unidad) => suma + unidad.maxWounds, 0);
  const copiasPorUnidad = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const entry of entries) mapa.set(entry.unit.unitId, (mapa.get(entry.unit.unitId) ?? 0) + 1);
    return mapa;
  }, [entries]);
  const nombresConDemasiadasCopias = useMemo(() => {
    const maxCopias = limites.maxCopiasPorUnidad;
    if (maxCopias === null) return [];
    return [...copiasPorUnidad.entries()]
      .filter(([, copias]) => copias > maxCopias)
      .map(([unitId]) => entries.find((entry) => entry.unit.unitId === unitId)?.unit.name)
      .filter((nombre): nombre is string => Boolean(nombre));
  }, [copiasPorUnidad, limites, entries]);

  const visibleUnits = useMemo(() => {
    const needle = unitSearch.trim().toLowerCase();
    if (!needle) return units;
    return units.filter(
      (unit) => unit.name.toLowerCase().includes(needle) || unit.rules.some((r) => r.toLowerCase().includes(needle)),
    );
  }, [units, unitSearch]);

  const addUnit = useCallback((unit: ArmyUnit) => {
    const key = `${unit.unitId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setEntries((prev) => [...prev, { key, unit, choices: {} }]);
    setOpenEntry(key);
    setPicking(false);
  }, []);

  /** Repetir una unidad con sus mismas mejoras es lo mas comun al montar lista. */
  const duplicateEntry = useCallback((entry: BuilderEntry) => {
    const key = `${entry.unit.unitId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setEntries((prev) => [
      ...prev,
      { key, unit: entry.unit, choices: { ...entry.choices }, combined: entry.combined, notes: entry.notes },
    ]);
  }, []);

  const removeEntry = useCallback((key: string) => {
    setEntries((prev) =>
      prev
        .filter((entry) => entry.key !== key)
        // Un heroe que estaba unido a la unidad que se quita se queda suelto.
        .map((entry) => (entry.attachedTo === key ? { ...entry, attachedTo: undefined } : entry)),
    );
  }, []);

  const setEntryField = useCallback((key: string, patch: Partial<BuilderEntry>) => {
    setEntries((prev) => prev.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));
  }, []);

  const changeChoice = useCallback((key: string, id: string, delta: number) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.key !== key) return entry;
        const next = Math.max(0, (entry.choices[id] ?? 0) + delta);
        const choices = { ...entry.choices };
        if (next === 0) delete choices[id];
        else choices[id] = next;
        return { ...entry, choices };
      }),
    );
  }, []);

  async function save() {
    if (!user || !book) return;
    if (entries.length === 0) {
      setError("Anade al menos una unidad antes de guardar.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Se guarda con la misma forma que produce la importacion, para que las
      // partidas no tengan que saber de donde salio el ejercito, y ademas las
      // elecciones, que son lo unico que permite volver a editarlo.
      const data = {
        ...composeArmyPayload(entries, packages, [book], name, army?.listId ?? ""),
        pointsLimit,
        pointsMargin,
      };

      if (!army) {
        const creado = await createArmy(user.$id, data);
        navigate(`/ejercitos/${creado.$id}`);
        return;
      }
      // Los cambios de unidades tampoco tocan el activo: van a su borrador.
      const destino = army.status === "draft" ? army : await startDraft(army, user.$id);
      await saveDraft(destino.$id, data);
      navigate(`/ejercitos/${army.lineageId ?? armyId}`);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;
  if (!book) {
    return (
      <>
        <ErrorBanner error={error ?? "No se ha encontrado esta faccion."} />
        <div className="row">
          {editing ? <Link to={`/ejercitos/${armyId}`}>Volver {noun.toThe} {noun.singular}</Link> : null}
          <Link to="/facciones">Ir a facciones</Link>
        </div>
      </>
    );
  }

  const tope = Math.round(pointsLimit * (1 + pointsMargin / 100));
  const over = pointsLimit > 0 && built.points > tope;

  return (
    <>
      <header className="army-bar">
        <div className="army-bar-main">
          <input
            className="army-bar-name"
            value={name}
            aria-label={`Nombre ${noun.ofThe} ${noun.singular}`}
            placeholder={`Nombre ${noun.ofThe} ${noun.singular}`}
            onChange={(event) => setName(event.target.value)}
          />
          <p className="army-bar-sub small muted">
            {book.name}
            {bookSystem ? ` · ${bookSystem.name}` : ""}
            {book.versionString ? ` · libro v${book.versionString}` : ""}
          </p>
        </div>

        <div className="army-bar-stats">
          <div className={over ? "army-stat over" : "army-stat"}>
            <span className="army-stat-key">Puntos</span>
            <span className="army-stat-value mono">{built.points}</span>
          </div>
          <label className="army-stat army-stat-input">
            <span className="army-stat-key">Limite</span>
            <input
              type="number"
              min={0}
              step={50}
              value={pointsLimit || ""}
              placeholder="sin limite"
              title="Puntos objetivo, opcional: si se fija, los limites de composicion se calculan sobre este numero en vez de sobre lo que cuesta la lista"
              onChange={(event) => setPointsLimit(Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
          {pointsLimit > 0 ? (
            <label className="army-stat army-stat-input">
              <span className="army-stat-key">Margen %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={pointsMargin}
                title="Cuanto puede pasarse la lista del limite sin que cuente como excedida"
                onChange={(event) => setPointsMargin(Math.min(100, Math.max(0, Number(event.target.value))))}
              />
            </label>
          ) : null}
          <div className="army-stat">
            <span className="army-stat-key">Miniaturas</span>
            <span className="army-stat-value mono">{built.modelCount}</span>
          </div>
          {limites.maxUnidades !== null ? (
            <div className={entries.length - heroKeys.size > limites.maxUnidades ? "army-stat over" : "army-stat"}>
              <span className="army-stat-key">Unidades</span>
              <span className="army-stat-value mono">
                {entries.length - heroKeys.size}/{limites.maxUnidades}
              </span>
            </div>
          ) : null}
          {limites.maxHeroes !== null ? (
            <div className={heroKeys.size > limites.maxHeroes ? "army-stat over" : "army-stat"}>
              <span className="army-stat-key">Heroes</span>
              <span className="army-stat-value mono">
                {heroKeys.size}/{limites.maxHeroes}
              </span>
            </div>
          ) : null}
          {limites.maxModelos !== null ? (
            <div className={modelosActuales > limites.maxModelos ? "army-stat over" : "army-stat"}>
              <span className="army-stat-key">Modelos/Tough</span>
              <span className="army-stat-value mono">
                {modelosActuales}/{limites.maxModelos}
              </span>
            </div>
          ) : null}
        </div>

        <div className="army-bar-actions">
          <button type="button" onClick={() => setPicking(true)}>
            Anadir unidad
          </button>
          <button
            type="button"
            className="primary"
            disabled={saving || entries.length === 0}
            onClick={() => void save()}
          >
            {saving ? "Guardando…" : editing ? "Guardar en borrador" : "Crear"}
          </button>
          {editing && army ? (
            <Link to={`/ejercitos/${army.lineageId ?? army.$id}`} className="small">
              Salir
            </Link>
          ) : (
            <Link to={`/facciones/${book.$id}`} className="small">
              Salir
            </Link>
          )}
        </div>
      </header>

      <ErrorBanner error={error} />
      {habilidad ? (
        <RuleCardModal habilidad={habilidad} glosario={glosario} onCerrar={() => setHabilidad(null)} onAbrir={setHabilidad} />
      ) : null}
      {warning ? <div className="banner">{warning}</div> : null}
      {over ? (
        <div className="banner error">
          Te has pasado del limite de puntos{pointsMargin > 0 ? ` (${tope} con el ${pointsMargin}% de margen)` : ""}.
        </div>
      ) : null}
      {nombresConDemasiadasCopias.length > 0 ? (
        <div className="banner error">
          Como mucho {limites.maxCopiasPorUnidad} copia{limites.maxCopiasPorUnidad === 1 ? "" : "s"} de la misma unidad
          con este limite de puntos: te has pasado con {nombresConDemasiadasCopias.join(", ")}.
        </div>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState title={`${noun.demonstrativeCap} ${noun.singular} no tiene unidades todavia`}>
          <button type="button" className="primary" onClick={() => setPicking(true)}>
            Anadir la primera
          </button>
        </EmptyState>
      ) : (
        <div className="army-strip">
          {entries.map((entry) => {
            const sections = sectionsForUnit(entry.unit, packages);
            const open = openEntry === entry.key;
            return (
              <div key={entry.key} className="army-slide">
                <UnitCard
                  variant="ejercito"
                  unitId={entry.unit.unitId}
                  glosario={glosario}
                  onHabilidad={setHabilidad}
                  sections={sections}
                  upgrades={entryUpgradeLabels(entry, sections)}
                  optionsOpen={open}
                  optionsLabel="Mejoras de esta unidad"
                  unit={{
                    name: entry.unit.name,
                    size: entry.unit.size * (entry.combined ? 2 : 1),
                    quality: entry.unit.quality,
                    defense: entry.unit.defense,
                    cost: entryCost(entry, sections),
                    rules: entryRules(entry, sections),
                    loadout: entryLoadoutFinal(entry, sections),
                  }}
                  combinada={entry.combined}
                  notas={entry.notes}
                  optionAction={(section, option) => {
                    const id = optionId(option);
                    const count = entry.choices[id] ?? 0;
                    const blocked = blockReason(section, option, entry, sections);
                    return (
                      <span className="row ucard-option-controls">
                        <span className="ucard-price">+{optionCost(option, entry.unit.unitId)}</span>
                        <button
                          type="button"
                          className="icon tiny"
                          disabled={count === 0}
                          onClick={() => changeChoice(entry.key, id, -1)}
                          aria-label={`Quitar ${option.label}`}
                        >
                          −
                        </button>
                        <span className="mono">{count}</span>
                        <button
                          type="button"
                          className="icon tiny"
                          disabled={Boolean(blocked)}
                          title={blocked ?? undefined}
                          onClick={() => changeChoice(entry.key, id, 1)}
                          aria-label={`Anadir ${option.label}`}
                        >
                          +
                        </button>
                      </span>
                    );
                  }}
                  footer={
                    <>
                      {sePuedeCombinar(entry.unit) ? (
                        <label className="check tiny">
                          <input
                            type="checkbox"
                            checked={Boolean(entry.combined)}
                            onChange={(event) => setEntryField(entry.key, { combined: event.target.checked })}
                          />
                          Combinar
                        </label>
                      ) : null}
                      {puedeAdjuntarse(entry, sections, book?.gameSystem ?? "gf") && unidadesParaUnir(entry.key).length > 0 ? (
                        <label className="check tiny">
                          Unir a
                          <select
                            value={entry.attachedTo ?? ""}
                            onChange={(event) =>
                              setEntryField(entry.key, { attachedTo: event.target.value || undefined })
                            }
                          >
                            <option value="">— suelto —</option>
                            {unidadesParaUnir(entry.key).map((otra) => (
                              <option key={otra.key} value={otra.key}>
                                {otra.unit.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <input
                        className="tiny nota"
                        type="text"
                        placeholder="Notas"
                        value={entry.notes ?? ""}
                        onChange={(event) => setEntryField(entry.key, { notes: event.target.value })}
                      />
                      {sections.length > 0 ? (
                        <button type="button" className="tiny" onClick={() => setOpenEntry(open ? null : entry.key)}>
                          {open ? "Cerrar mejoras" : "Mejoras"}
                        </button>
                      ) : null}
                      <button type="button" className="tiny" onClick={() => duplicateEntry(entry)}>
                        Duplicar
                      </button>
                      <button type="button" className="tiny danger" onClick={() => removeEntry(entry.key)}>
                        Quitar
                      </button>
                    </>
                  }
                />
              </div>
            );
          })}

          <div className="army-slide army-slide-add">
            <button type="button" className="army-add" onClick={() => setPicking(true)}>
              <span className="army-add-plus">+</span>
              Anadir unidad
            </button>
          </div>
        </div>
      )}

      {picking ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Anadir unidad"
          onClick={() => setPicking(false)}
        >
          {/* Pulsar dentro del panel no debe cerrarlo. */}
          <div className="modal wide" onClick={(event) => event.stopPropagation()}>
            <header className="spread">
              <h2 style={{ margin: 0 }}>Unidades de {book.name}</h2>
              <button type="button" className="ghost tiny" onClick={() => setPicking(false)}>
                Cerrar
              </button>
            </header>
            <input
              type="search"
              placeholder="Buscar unidad…"
              value={unitSearch}
              onChange={(event) => setUnitSearch(event.target.value)}
            />
            <div className="ucard-grid picker-grid">
              {visibleUnits.map((unit) => (
                <UnitCard
                  key={unit.$id}
                  variant="catalogo"
                  unitId={unit.unitId}
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
                    <button type="button" className="primary tiny" onClick={() => addUnit(unit)}>
                      Anadir {noun.toThe} {noun.singular}
                    </button>
                  }
                />
              ))}
              {visibleUnits.length === 0 ? <p className="muted">Ninguna unidad coincide.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
