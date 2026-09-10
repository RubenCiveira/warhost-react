import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getBook, listUnits, listUpgradePackages } from "../../api/catalog";
import type { ArmyBook, ArmyUnit } from "../../api/catalog";
import { createArmy, getArmy, updateArmy } from "../../api/armies";
import type { Army } from "../../lib/types";
import {
  blockReason,
  buildArmy,
  entriesFromForgeList,
  entryCost,
  entryLoadout,
  entryRules,
  entryUpgradeLabels,
  optionCost,
  optionId,
  rehydrateEntries,
  sectionsForUnit,
  serializeEntries,
} from "../../lib/builder";
import type { BuilderEntry, UpgradeSection } from "../../lib/builder";
import { baseLoadout } from "../../lib/loadout";
import { errorMessage } from "../../lib/format";
import { ErrorBanner, PageHead, Spinner } from "../../components/ui";
import UnitCard from "../../components/UnitCard";

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
  const [entries, setEntries] = useState<BuilderEntry[]>([]);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pointsLimit, setPointsLimit] = useState(2000);
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
          loadedArmy = await getArmy(armyId);
          stored = parseStored(loadedArmy.listJson);
          key = stored?.source?.bookKey ?? "";
          if (!key) {
            throw new Error(
              "Este ejercito no dice de que faccion del catalogo viene, asi que no se pueden anadir unidades. " +
                "Se puede reimportar o crear uno nuevo desde la faccion.",
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
        setName((current) => current || loadedArmy?.name || loadedBook.name);
        if (loadedArmy?.points) setPointsLimit((current) => Math.max(current, loadedArmy.points));

        if (stored) {
          // Las elecciones guardadas son la via buena; si el ejercito se
          // importo, se reconstruyen del JSON original de Army Forge.
          const rehydrated = stored.entries
            ? rehydrateEntries(stored.entries, loadedUnits)
            : entriesFromForgeList(stored.raw, loadedUnits);
          setEntries(rehydrated);

          const esperadas = stored.units?.length ?? 0;
          if (esperadas > rehydrated.length) {
            setWarning(
              `Se han recuperado ${rehydrated.length} de ${esperadas} unidades. El resto no existe en la version ` +
                `actual del libro de ejercito, asi que no se pueden seguir editando.`,
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

  const built = useMemo(() => buildArmy(entries, packages), [entries, packages]);

  const addUnit = useCallback((unit: ArmyUnit) => {
    const key = `${unit.unitId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setEntries((prev) => [...prev, { key, unit, choices: {} }]);
    setOpenEntry(key);
  }, []);

  const removeEntry = useCallback((key: string) => {
    setEntries((prev) => prev.filter((entry) => entry.key !== key));
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
      const listJson = JSON.stringify({
        listId: army?.listId ?? "",
        name: name.trim() || book.name,
        faction: book.factionName ?? book.name,
        gameSystem: book.gameSystem,
        points: built.points,
        modelCount: built.modelCount,
        units: built.units,
        entries: serializeEntries(entries),
        unresolvedUpgrades: 0,
        source: { builder: "warhost", bookKey: book.$id, bookVersion: book.versionString },
      });

      const data = {
        name: name.trim() || book.name,
        setting: book.setting,
        gameSystem: book.gameSystem,
        faction: book.factionName ?? book.name,
        points: built.points,
        modelCount: built.modelCount,
        listJson,
      };

      const saved = army ? await updateArmy(army.$id, data) : await createArmy(user.$id, data);
      navigate(`/ejercitos/${saved.$id}`);
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
          {editing ? <Link to={`/ejercitos/${armyId}`}>Volver al ejercito</Link> : null}
          <Link to="/facciones">Ir a facciones</Link>
        </div>
      </>
    );
  }

  const over = pointsLimit > 0 && built.points > pointsLimit;

  return (
    <>
      <PageHead
        title={editing ? `Editar unidades · ${army?.name ?? book.name}` : `Crear ejercito · ${book.name}`}
        sub={`${book.name} · ${units.length} unidades disponibles${book.versionString ? ` · libro v${book.versionString}` : ""}`}
        actions={
          <>
            {editing && army ? <Link to={`/ejercitos/${army.$id}`}>Volver al ejercito</Link> : null}
            <Link to={`/facciones/${book.$id}`}>Ver faccion</Link>
          </>
        }
      />
      <ErrorBanner error={error} />
      {warning ? <div className="banner">{warning}</div> : null}

      <div className="builder">
        <section>
          <h2>Unidades disponibles</h2>
          <div className="ucard-grid one-per-row">
            {units.map((unit) => (
              <UnitCard
                key={unit.$id}
                variant="catalogo"
                unitId={unit.unitId}
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
                    Anadir al ejercito
                  </button>
                }
              />
            ))}
          </div>
        </section>

        <section>
          <div className="card sticky">
            <div className="field">
              <label htmlFor="army-name">Nombre del ejercito</label>
              <input id="army-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="army-limit">Limite de puntos</label>
              <input
                id="army-limit"
                type="number"
                min={0}
                step={50}
                value={pointsLimit}
                onChange={(event) => setPointsLimit(Number(event.target.value))}
              />
            </div>
            <p className={over ? "total over" : "total"}>
              <strong className="mono">{built.points}</strong>
              {pointsLimit > 0 ? <span className="muted"> / {pointsLimit} pts</span> : null}
              <span className="muted small">
                {" "}
                · {built.modelCount} miniaturas · {entries.length} unidades
              </span>
            </p>
            {over ? <p className="small danger-text">Te has pasado del limite.</p> : null}
            <button
              type="button"
              className="primary"
              style={{ width: "100%" }}
              disabled={saving || entries.length === 0}
              onClick={() => void save()}
            >
              {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear ejercito"}
            </button>
          </div>

          <h2 style={{ marginTop: 20 }}>Tu lista</h2>
          {entries.length === 0 ? (
            <p className="muted">Anade unidades desde la izquierda.</p>
          ) : (
            <div className="ucard-grid one-per-row">
              {entries.map((entry) => {
                const sections = sectionsForUnit(entry.unit, packages);
                const open = openEntry === entry.key;
                return (
                  <UnitCard
                    key={entry.key}
                    variant="ejercito"
                    unitId={entry.unit.unitId}
                    sections={sections}
                    upgrades={entryUpgradeLabels(entry, sections)}
                    optionsOpen={open}
                    optionsLabel="Mejoras de esta unidad"
                    unit={{
                      name: entry.unit.name,
                      size: entry.unit.size,
                      quality: entry.unit.quality,
                      defense: entry.unit.defense,
                      cost: entryCost(entry, sections),
                      rules: entryRules(entry, sections),
                      loadout: entryLoadout(entry, sections),
                    }}
                    optionAction={(section, option) => {
                      const id = optionId(option);
                      const count = entry.choices[id] ?? 0;
                      const blocked = blockReason(section, option, entry);
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
                        {sections.length > 0 ? (
                          <button
                            type="button"
                            className="tiny"
                            onClick={() => setOpenEntry(open ? null : entry.key)}
                          >
                            {open ? "Cerrar mejoras" : "Mejoras"}
                          </button>
                        ) : null}
                        <button type="button" className="tiny danger" onClick={() => removeEntry(entry.key)}>
                          Quitar
                        </button>
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
