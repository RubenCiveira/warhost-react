import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getBook, listUnits, listUpgradePackages } from "../../api/catalog";
import type { ArmyBook, ArmyUnit } from "../../api/catalog";
import { createArmy } from "../../api/armies";
import {
  blockReason,
  buildArmy,
  entryCost,
  entryUpgradeLabels,
  maxDistinctOptions,
  maxPicks,
  optionCost,
  optionId,
  sectionChosenCount,
  sectionsForUnit,
} from "../../lib/builder";
import type { BuilderEntry, UpgradeSection } from "../../lib/builder";
import { parseWeapons, rangeLabel } from "../../lib/unitProfile";
import { errorMessage } from "../../lib/format";
import { ErrorBanner, PageHead, Spinner } from "../../components/ui";

/** Constructor de ejercitos a partir del catalogo propio. */
export default function ArmyBuilder() {
  const { bookKey = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [book, setBook] = useState<ArmyBook | null>(null);
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
        const [loadedBook, loadedUnits, loadedPackages] = await Promise.all([
          getBook(bookKey),
          listUnits(bookKey),
          listUpgradePackages(bookKey),
        ]);
        if (cancelled) return;
        setBook(loadedBook);
        setUnits(loadedUnits);
        setPackages(loadedPackages);
        setName((current) => current || `${loadedBook.name}`);
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

  const army = useMemo(() => buildArmy(entries, packages), [entries, packages]);

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
      // partidas no tengan que saber de donde salio el ejercito.
      const listJson = JSON.stringify({
        listId: "",
        name: name.trim() || book.name,
        faction: book.factionName ?? book.name,
        gameSystem: book.gameSystem,
        points: army.points,
        modelCount: army.modelCount,
        units: army.units,
        unresolvedUpgrades: 0,
        // De donde salio y con que version del libro, para poder avisar cuando
        // el catalogo se actualice y la lista quede desfasada.
        source: { builder: "warhost", bookKey: book.$id, bookVersion: book.versionString },
      });

      const created = await createArmy(user.$id, {
        name: name.trim() || book.name,
        setting: book.setting,
        gameSystem: book.gameSystem,
        faction: book.factionName ?? book.name,
        points: army.points,
        modelCount: army.modelCount,
        listJson,
      });
      navigate(`/ejercitos/${created.$id}`);
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
        <Link to="/facciones">Volver a facciones</Link>
      </>
    );
  }

  const over = pointsLimit > 0 && army.points > pointsLimit;

  return (
    <>
      <PageHead
        title={`Crear ejercito · ${book.name}`}
        sub={`${units.length} unidades disponibles${book.versionString ? ` · libro v${book.versionString}` : ""}`}
        actions={<Link to={`/facciones/${book.$id}`}>Ver faccion</Link>}
      />
      <ErrorBanner error={error} />

      <div className="builder">
        <section>
          <h2>Unidades disponibles</h2>
          <div className="stack">
            {units.map((unit) => (
              <div key={unit.$id} className="card spread">
                <div>
                  <strong>{unit.name}</strong>
                  <div className="small muted mono">
                    ×{unit.size} · C{unit.quality}+ D{unit.defense}+ · {unit.cost} pts
                  </div>
                  {unit.rules.length > 0 ? (
                    <div className="small muted">{unit.rules.slice(0, 5).join(", ")}</div>
                  ) : null}
                  {(() => {
                    const weapons = parseWeapons(unit.weapons);
                    if (weapons.length === 0) return null;
                    return (
                      <div className="small muted">
                        {weapons
                          .map(
                            (weapon) =>
                              `${weapon.count > 1 ? `${weapon.count}× ` : ""}${weapon.name} ` +
                              `(${rangeLabel(weapon.range)}, A${weapon.attacks}` +
                              `${weapon.rules.length ? `, ${weapon.rules.join(", ")}` : ""})`,
                          )
                          .join(" · ")}
                      </div>
                    );
                  })()}
                </div>
                <button type="button" className="tiny" onClick={() => addUnit(unit)}>
                  Anadir
                </button>
              </div>
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
              <strong className="mono">{army.points}</strong>
              {pointsLimit > 0 ? <span className="muted"> / {pointsLimit} pts</span> : null}
              <span className="muted small">
                {" "}
                · {army.modelCount} miniaturas · {entries.length} unidades
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
              {saving ? "Guardando…" : "Guardar ejercito"}
            </button>
          </div>

          <h2 style={{ marginTop: 20 }}>Tu lista</h2>
          {entries.length === 0 ? (
            <p className="muted">Anade unidades desde la izquierda.</p>
          ) : (
            <div className="stack">
              {entries.map((entry) => {
                const sections = sectionsForUnit(entry.unit, packages);
                const labels = entryUpgradeLabels(entry, sections);
                const open = openEntry === entry.key;
                return (
                  <div key={entry.key} className="card">
                    <div className="spread">
                      <div>
                        <strong>{entry.unit.name}</strong>
                        <div className="small muted mono">{entryCost(entry, sections)} pts</div>
                      </div>
                      <div className="row">
                        {sections.length > 0 ? (
                          <button
                            type="button"
                            className="ghost tiny"
                            onClick={() => setOpenEntry(open ? null : entry.key)}
                          >
                            {open ? "Cerrar" : "Mejoras"}
                          </button>
                        ) : null}
                        <button type="button" className="ghost tiny danger" onClick={() => removeEntry(entry.key)}>
                          Quitar
                        </button>
                      </div>
                    </div>
                    {labels.length > 0 ? (
                      <ul className="small muted upgrades">
                        {labels.map((label) => (
                          <li key={label}>{label}</li>
                        ))}
                      </ul>
                    ) : null}

                    {open
                      ? sections.map((section) => {
                          const picked = sectionChosenCount(section, entry.choices);
                          const cap = maxPicks(section, entry.unit.size);
                          const distinct = maxDistinctOptions(section);
                          return (
                            <fieldset key={section.id ?? section.uid} className="section">
                              <legend>
                                {section.label}
                                <span className="muted small">
                                  {" "}
                                  · {picked}/{cap}
                                  {distinct !== Number.POSITIVE_INFINITY ? ` · ${distinct} opcion` : ""}
                                </span>
                              </legend>
                              {(section.options ?? []).map((option) => {
                                const id = optionId(option);
                                const count = entry.choices[id] ?? 0;
                                const blocked = blockReason(section, option, entry);
                                return (
                                  <div key={id} className="spread option">
                                    <span className="small">
                                      {option.label}
                                      <span className="muted mono">
                                        {" "}
                                        +{optionCost(option, entry.unit.unitId)} pts
                                      </span>
                                    </span>
                                    <span className="row">
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
                                  </div>
                                );
                              })}
                            </fieldset>
                          );
                        })
                      : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
