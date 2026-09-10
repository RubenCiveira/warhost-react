import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useGameSystem } from "../../context/GameSystemContext";
import { getGameSystem } from "../../lib/gameSystems";
import type { GameSystemId } from "../../lib/gameSystems";
import {
  createArmy,
  deleteArmy,
  deleteImage,
  discardDraft,
  imageUrl,
  publishDraft,
  resolveArmy,
  saveDraft,
  startDraft,
  uploadImage,
} from "../../api/armies";
import {
  extractListId,
  importList,
  listUrl,
  parseStoredList,
} from "../../api/armyForge";
import type { Army } from "../../lib/types";
import { errorMessage, formatDateTime } from "../../lib/format";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";
import UnitCard from "../../components/UnitCard";
import ConfirmDialog from "../../components/ConfirmDialog";
import AddUnitWizard from "../../components/AddUnitWizard";
import { rehydrateEntries } from "../../lib/builder";
import type { BuilderEntry, UpgradeSection } from "../../lib/builder";
import { getBook, listRuleGlossary } from "../../api/catalog";
import type { ArmyBook, ArmyUnit, CatalogRule } from "../../api/catalog";
import SpellCard from "../../components/SpellCard";
import RuleCardModal from "../../components/RuleCardModal";
import type { Habilidad } from "../../lib/reglas";
import { parseHabilidad } from "../../lib/reglas";
import RuleCard from "../../components/RuleCard";
import { equipoDeFaccion, habilidadesDeFaccion } from "../../lib/faccion";
import { listUnits as listCatalogUnits } from "../../api/catalog";
import Tabs from "../../components/Tabs";
import { parseSpells } from "../../lib/spells";
import { composeArmyPayload } from "../../lib/armyPayload";

interface FormState {
  name: string;
  gameSystem: GameSystemId;
  faction: string;
  points: number;
  modelCount: number;
  listId: string;
  notes: string;
  shared: boolean;
}

export default function ArmyEditor() {
  const { armyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { system } = useGameSystem();

  const [army, setArmy] = useState<Army | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    gameSystem: system?.id ?? "gf",
    faction: "",
    points: 0,
    modelCount: 0,
    listId: "",
    notes: "",
    shared: false,
  });
  const [listJson, setListJson] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(armyId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Borrador en curso de este ejercito, si lo hay. */
  const [draft, setDraft] = useState<Army | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  /** Accion destructiva a la espera de confirmacion. */
  const [confirmando, setConfirmando] = useState<"descartar" | "borrar" | null>(null);
  const [anadiendo, setAnadiendo] = useState(false);
  const [pestana, setPestana] = useState<"unidades" | "hechizos" | "habilidades" | "equipo">("unidades");
  /** Unidades del libro de origen, solo para saber que equipo publica la faccion. */
  const [unidadesLibro, setUnidadesLibro] = useState<ArmyUnit[]>([]);
  /** El libro de origen, solo para sus hechizos: el ejercito no los guarda. */
  const [libro, setLibro] = useState<ArmyBook | null>(null);
  const [glosario, setGlosario] = useState<Map<string, CatalogRule>>(new Map());
  const [habilidad, setHabilidad] = useState<Habilidad | null>(null);
  /**
   * Abrir borrador en curso. Escribiendo deprisa se dispararian varias aperturas
   * a la vez y la segunda chocaria con el indice unico, asi que todas esperan a
   * la misma promesa.
   */
  const abriendoBorrador = useRef<Promise<Army> | null>(null);
  /** Se esta trabajando sobre el borrador, o mirando la version publicada. */
  const [viendoBorrador, setViendoBorrador] = useState(false);
  /**
   * De donde sale la pregunta sobre el borrador. Al entrar hay que decidir si o
   * si: cerrar sin elegir dejaria la edicion bloqueada sin que se sepa por que.
   * Reabierta desde la barra ya se sabe, y basta con poder cerrarla.
   */
  const [decidirBorrador, setDecidirBorrador] = useState<"entrada" | "peticion" | null>(null);

  useEffect(() => {
    if (!armyId) return;
    let cancelled = false;
    resolveArmy(armyId)
      .then(({ active: row, draft: pendiente }) => {
        if (cancelled) return;
        setArmy(row);
        setDraft(pendiente);
        // Se entra siempre viendo la version publicada; si hay un borrador a
        // medias se pregunta que hacer con el antes de tocar nada.
        mostrar(row);
        setDecidirBorrador(pendiente ? "entrada" : null);
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [armyId]);

  /** Vuelca una version del ejercito en el formulario y en el carrusel. */
  const mostrar = useCallback((version: Army) => {
    setForm({
      name: version.name,
      gameSystem: version.gameSystem,
      faction: version.faction ?? "",
      points: version.points,
      modelCount: version.modelCount,
      listId: version.listId ?? "",
      notes: version.notes ?? "",
      shared: version.shared,
    });
    setListJson(version.listJson);
    setImages(version.imageIds ?? []);
    setCoverId(version.coverId);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const cerrar = () => setMenuOpen(false);
    const conEscape = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    // En captura: si no, el propio clic que abre el menu lo cerraria acto seguido.
    document.addEventListener("click", cerrar);
    document.addEventListener("keydown", conEscape);
    return () => {
      document.removeEventListener("click", cerrar);
      document.removeEventListener("keydown", conEscape);
    };
  }, [menuOpen]);

  // La pregunta de entrada no se puede esquivar; la reabierta a peticion si.
  useEffect(() => {
    if (decidirBorrador !== "peticion") return undefined;
    const conEscape = (event: KeyboardEvent) => event.key === "Escape" && setDecidirBorrador(null);
    document.addEventListener("keydown", conEscape);
    return () => document.removeEventListener("keydown", conEscape);
  }, [decidirBorrador]);

  useEffect(() => {
    if (!importOpen) return undefined;
    const conEscape = (event: KeyboardEvent) => event.key === "Escape" && setImportOpen(false);
    document.addEventListener("keydown", conEscape);
    return () => document.removeEventListener("keydown", conEscape);
  }, [importOpen]);

  /** Devuelve el borrador sobre el que escribir, creandolo la primera vez. */
  const conBorrador = useCallback(async (): Promise<Army | null> => {
    if (!army || !user) return null;
    if (draft) return draft;
    if (!abriendoBorrador.current) {
      abriendoBorrador.current = startDraft(army, user.$id).finally(() => {
        abriendoBorrador.current = null;
      });
    }
    const abierto = await abriendoBorrador.current;
    setDraft(abierto);
    return abierto;
  }, [army, draft, user]);

  /**
   * El nombre se edita en la barra y se guarda solo, con un respiro para no
   * escribir a cada tecla. Si no habia borrador, escribirlo es lo que lo abre.
   */
  useEffect(() => {
    if (!army || (draft && !viendoBorrador)) return undefined;
    const guardado = (viendoBorrador && draft ? draft : army).name;
    const nuevo = form.name.trim();
    if (!nuevo || nuevo === guardado) return undefined;

    const temporizador = window.setTimeout(() => {
      void (async () => {
        try {
          const destino = await conBorrador();
          if (!destino) return;
          setDraft(await saveDraft(destino.$id, { name: nuevo }));
          setViendoBorrador(true);
        } catch (err) {
          setError(errorMessage(err));
        }
      })();
    }, 700);

    return () => window.clearTimeout(temporizador);
  }, [form.name, army, draft, viendoBorrador, conBorrador]);

  /**
   * Hay borrador pero se esta mirando la version publicada. Nada de lo que se
   * haga aqui deberia poder tocar el ejercito: la unica accion es decidir que
   * hacer con el borrador.
   */
  const ignorandoBorrador = Boolean(draft) && !viendoBorrador;

  const units = useMemo(() => parseStoredList(listJson), [listJson]);
  const hechizos = useMemo(() => parseSpells(libro?.spells ?? null), [libro]);
  const habilidades = useMemo(
    () => habilidadesDeFaccion(libro, glosario, unidadesLibro),
    [libro, glosario, unidadesLibro],
  );
  const equipo = useMemo(() => equipoDeFaccion(unidadesLibro), [unidadesLibro]);

  /**
   * Solo se pueden anadir o cambiar unidades si el ejercito recuerda de que
   * faccion del catalogo salio. Los creados con el constructor lo guardan; los
   * importados de Army Forge, no.
   */
  const bookKey = useMemo(() => {
    if (!listJson) return null;
    try {
      const parsed = JSON.parse(listJson) as { source?: { bookKey?: string } };
      return parsed.source?.bookKey ?? null;
    } catch {
      return null;
    }
  }, [listJson]);

  useEffect(() => {
    if (!bookKey) {
      setLibro(null);
      return undefined;
    }
    let cancelado = false;
    // Un fallo aqui solo deja la pestana de hechizos vacia: no es motivo para
    // teñir de rojo la vista del ejercito.
    getBook(bookKey)
      .then((row) => {
        if (cancelado) return;
        setLibro(row);
        return Promise.all([
          listRuleGlossary(row.gameSystem).then((g) => !cancelado && setGlosario(g)),
          listCatalogUnits(bookKey).then((u) => !cancelado && setUnidadesLibro(u)),
        ]);
      })
      .catch(() => !cancelado && setLibro(null));
    return () => {
      cancelado = true;
    };
  }, [bookKey]);


  async function importFromArmyForge() {
    const id = extractListId(form.listId);
    if (!id) {
      setError("Pega el enlace de la lista compartida de Army Forge o su identificador.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const list = await importList(id);
      setListJson(JSON.stringify(list));
      setForm((prev) => ({
        ...prev,
        listId: id,
        name: prev.name || list.name,
        faction: prev.faction || list.faction || "",
        points: list.points || prev.points,
        modelCount: list.modelCount || prev.modelCount,
      }));
      setImportOpen(false);
      setNotice(
        list.unresolvedUpgrades > 0
          ? `Importadas ${list.units.length} unidades. ${list.unresolvedUpgrades} mejoras ya no existen en el libro de ejercito actual, asi que el coste por unidad es aproximado; el total del ejercito es el que guardo Army Forge.`
          : `Importadas ${list.units.length} unidades desde Army Forge.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length || !user) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = await Promise.all(Array.from(files).map((file) => uploadImage(user.$id, file)));
      const next = [...images, ...uploaded];
      setImages(next);
      if (!coverId) setCoverId(uploaded[0]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveImage(fileId: string) {
    setImages((prev) => prev.filter((id) => id !== fileId));
    if (coverId === fileId) setCoverId(null);
    await deleteImage(fileId).catch(() => undefined);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const gameSystem = getGameSystem(form.gameSystem);
    if (!gameSystem) return;

    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        setting: gameSystem.setting,
        gameSystem: gameSystem.id,
        faction: form.faction,
        points: form.points,
        modelCount: form.modelCount,
        listId: form.listId || null,
        sourceUrl: form.listId ? listUrl(form.listId) : null,
        listJson,
        notes: form.notes,
        shared: form.shared,
        coverId,
        imageIds: images,
      };
      if (!army) {
        const created = await createArmy(user.$id, payload);
        navigate(`/ejercitos/${created.$id}`, { replace: true });
        return;
      }
      // Editar no toca el ejercito activo: los cambios van a su borrador, y de
      // ahi no salen hasta que se aceptan.
      const destino = await conBorrador();
      if (!destino) return;
      const guardado = await saveDraft(destino.$id, payload);
      setDraft(guardado);
      setNotice("Cambios guardados en el borrador. Pulsa Guardar para aplicarlos.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function continuarBorrador() {
    if (draft) mostrar(draft);
    setViendoBorrador(true);
    setDecidirBorrador(null);
  }

  function ignorarBorrador() {
    if (army) mostrar(army);
    setViendoBorrador(false);
    setDecidirBorrador(null);
  }

  /** Acepta el borrador: pasa a ser el ejercito y el anterior queda archivado. */
  /**
   * Mete la unidad que sale del asistente en el borrador. Hay que recomponer la
   * lista entera —no basta con anadir una tarjeta— porque los puntos y las
   * miniaturas salen de la suma de todas.
   */
  async function onAddUnit(
    nueva: BuilderEntry,
    book: ArmyBook,
    packages: Map<string, UpgradeSection[]>,
    catalogo: ArmyUnit[],
  ) {
    if (!army) return;
    setBusy(true);
    setError(null);
    try {
      const guardadas = (() => {
        try {
          return (JSON.parse(listJson ?? "{}") as { entries?: unknown }).entries;
        } catch {
          return undefined;
        }
      })();
      // Las unidades disponibles salen del propio asistente, que ya las cargo.
      const previas = rehydrateEntries(guardadas, catalogo);
      const payload = composeArmyPayload([...previas, nueva], packages, book, form.name, form.listId);

      const destino = await conBorrador();
      if (!destino) return;
      const guardado = await saveDraft(destino.$id, payload);
      setDraft(guardado);
      setViendoBorrador(true);
      mostrar(guardado);
      setAnadiendo(false);
      setNotice(`${nueva.unit.name} anadida al borrador.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const publicado = await publishDraft(draft);
      setArmy(publicado);
      setDraft(null);
      setViendoBorrador(false);
      setNotice("Cambios aplicados. La version anterior queda archivada.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    if (!draft || !army) return;
    setBusy(true);
    setError(null);
    try {
      await discardDraft(draft);
      setDraft(null);
      setViendoBorrador(false);
      setDecidirBorrador(null);
      mostrar(army);
      setNotice("Borrador descartado.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!army || !window.confirm(`¿Borrar "${army.name}" y sus imagenes?`)) return;
    setBusy(true);
    try {
      await deleteArmy(army);
      navigate("/ejercitos", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <>
      <header className="army-bar">
        <div className="army-bar-main">
          <input
            className="army-bar-name"
            value={form.name}
            aria-label="Nombre del ejercito"
            placeholder="Nombre del ejercito"
            disabled={ignorandoBorrador}
            title={ignorandoBorrador ? "Decide antes que hacer con el borrador pendiente" : undefined}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <p className="army-bar-sub small muted">
            {form.faction || "Sin faccion"}
            {getGameSystem(form.gameSystem) ? ` · ${getGameSystem(form.gameSystem)?.name}` : ""}
          </p>
        </div>

        <div className="army-bar-stats">
          <div className="army-stat">
            <span className="army-stat-key">Puntos</span>
            <span className="army-stat-value mono">{form.points}</span>
          </div>
          <div className="army-stat">
            <span className="army-stat-key">Miniaturas</span>
            <span className="army-stat-value mono">{form.modelCount}</span>
          </div>
          <div className="army-stat">
            <span className="army-stat-key">Unidades</span>
            <span className="army-stat-value mono">{units.length}</span>
          </div>
        </div>

        <div className="army-bar-actions">
          {draft && !viendoBorrador ? (
            <button type="button" className="primary" onClick={() => setDecidirBorrador("peticion")}>
              Borrador
            </button>
          ) : null}
          {ignorandoBorrador ? null : (
            <button
              type="button"
              className="primary"
              onClick={() => void onPublish()}
              disabled={busy || !draft}
              title={draft ? undefined : "No hay cambios pendientes que guardar"}
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
          )}
          {army && !ignorandoBorrador ? (
            <div className="menu-wrap">
              <button
                type="button"
                className="ghost menu-button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Mas opciones"
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen((abierto) => !abierto);
                }}
              >
                ⋯
              </button>
              {menuOpen ? (
                <div className="menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setImportOpen(true);
                      setMenuOpen(false);
                    }}
                  >
                    Importar desde Army Forge
                  </button>
                  {draft && viendoBorrador ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="danger"
                      disabled={busy}
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmando("descartar");
                      }}
                    >
                      Descartar el borrador
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmando("borrar");
                    }}
                  >
                    Borrar ejercito
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <ErrorBanner error={error} />
      {notice ? <div className="banner ok">{notice}</div> : null}
      {armyId && !bookKey ? (
        <p className="small muted">
          Este ejercito se importo de Army Forge y no guarda de que faccion del catalogo viene, asi que no se pueden
          anadir unidades desde aqui. Editalo en Army Forge y vuelve a importarlo, o crea uno nuevo desde su faccion.
        </p>
      ) : null}

      {draft && viendoBorrador ? (
        <div className="banner">
          Estas editando un <strong>borrador</strong>. El ejercito sigue como estaba hasta que pulses Guardar.
        </div>
      ) : null}


      <Tabs
        value={pestana}
        onChange={setPestana}
        items={[
          { id: "unidades", label: "Unidades", count: units.length },
          { id: "habilidades", label: "Habilidades", count: habilidades.length },
          { id: "equipo", label: "Equipo", count: equipo.length },
          { id: "hechizos", label: "Hechizos", count: hechizos.length },
        ]}
      />

      {pestana === "habilidades" ? (
        habilidades.length === 0 ? (
          <EmptyState title="Esta faccion no publica reglas propias" />
        ) : (
          <div className="army-strip">
            {habilidades.map((regla) => (
              <div key={regla.$id} className="army-slide">
                <RuleCard habilidad={parseHabilidad(regla.name, "regla")} regla={regla} />
              </div>
            ))}
          </div>
        )
      ) : pestana === "equipo" ? (
        equipo.length === 0 ? (
          <EmptyState title="Ninguna unidad de esta faccion lleva equipo" />
        ) : (
          <div className="army-strip">
            {equipo.map((pieza) => (
              <div key={pieza.habilidad.nombre} className="army-slide">
                <RuleCard
                  habilidad={pieza.habilidad}
                  regla={glosario.get(pieza.habilidad.nombre.toLowerCase())}
                  lleva={pieza.unidades}
                />
              </div>
            ))}
          </div>
        )
      ) : pestana === "hechizos" ? (
        hechizos.length === 0 ? (
          <EmptyState title="Esta faccion no tiene hechizos">
            <p className="muted">
              {bookKey
                ? "Su libro de ejercito no trae ninguno."
                : "Este ejercito no guarda de que faccion viene, asi que no se pueden mostrar."}
            </p>
          </EmptyState>
        ) : (
          <div className="army-strip">
            {hechizos.map((hechizo) => (
              <div key={hechizo.key} className="army-slide">
                <SpellCard spell={hechizo} faction={form.faction || libro?.name} />
              </div>
            ))}
          </div>
        )
      ) : units.length > 0 ? (
        <div className="army-strip">
          {units.map((unit) => (
            <div key={`${unit.unitKey ?? unit.name}-${unit.sortOrder}`} className="army-slide">
              <UnitCard
                variant="ejercito"
                upgrades={unit.upgrades ?? []}
                conTexto={new Set(glosario.keys())}
                onHabilidad={setHabilidad}
                unit={{
                  name: unit.name,
                  size: unit.size,
                  quality: unit.quality,
                  defense: unit.defense,
                  cost: unit.cost,
                  maxWounds: unit.maxWounds,
                  rules: unit.rules,
                  loadout: unit.loadout,
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="Este ejercito no tiene unidades todavia">
          <p className="muted">
            {bookKey
              ? "Anadelas desde su faccion, o importa una lista de Army Forge."
              : "Importa una lista de Army Forge, o crealo desde una faccion del catalogo."}
          </p>
        </EmptyState>
      )}

      {decidirBorrador && draft ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Borrador pendiente"
          onClick={decidirBorrador === "peticion" ? () => setDecidirBorrador(null) : undefined}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Borrador sin aplicar</h2>
            <p className="muted">
              Hay un borrador sin aplicar de este ejercito
              {draft.updatedAt ? `, de ${formatDateTime(draft.updatedAt)}` : ""}. Estas viendo la version publicada, y
              no se puede editar sin decidir antes que hacer con el.
            </p>
            <div className="stack">
              <button type="button" className="primary" onClick={continuarBorrador}>
                {decidirBorrador === "entrada" ? "Continuar editando el borrador" : "Editar el borrador"}
              </button>
              {decidirBorrador === "entrada" ? (
                <button type="button" onClick={ignorarBorrador}>
                  Ignorar el borrador y ver el ejercito
                </button>
              ) : null}
              <button type="button" className="danger" disabled={busy} onClick={() => setConfirmando("descartar")}>
                Descartar el borrador
              </button>
            </div>
            {decidirBorrador === "entrada" ? (
              <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
                Ignorarlo no lo borra: podras volver a el desde el boton Borrador.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {confirmando === "descartar" && draft ? (
        <ConfirmDialog
          title="Descartar el borrador"
          confirmLabel="Descartar"
          danger
          busy={busy}
          onCancel={() => setConfirmando(null)}
          onConfirm={() => {
            setConfirmando(null);
            void onDiscard();
          }}
        >
          <p>
            Se perderan los cambios sin aplicar de <strong>{draft.name}</strong>. El ejercito publicado se queda como
            esta.
          </p>
        </ConfirmDialog>
      ) : null}

      {confirmando === "borrar" && army ? (
        <ConfirmDialog
          title="Borrar el ejercito"
          confirmLabel="Borrar"
          danger
          busy={busy}
          onCancel={() => setConfirmando(null)}
          onConfirm={() => {
            setConfirmando(null);
            void onDelete();
          }}
        >
          <p>
            Se borra <strong>{army.name}</strong> entero: la version publicada, su borrador si lo hay y todas las
            versiones archivadas. No se puede deshacer.
          </p>
        </ConfirmDialog>
      ) : null}

      {importOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Importar desde Army Forge"
          onClick={() => setImportOpen(false)}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="spread">
              <h2 style={{ margin: 0 }}>Importar desde Army Forge</h2>
              <button type="button" className="ghost tiny" onClick={() => setImportOpen(false)}>
                Cerrar
              </button>
            </div>
            <p className="muted small">
              Comparte la lista en Army Forge y pega aqui el enlace. Las unidades se guardan para poder usarlas como
              marcadores durante la partida.
            </p>
            <div className="row">
              <input
                placeholder="https://army-forge.onepagerules.com/share?id=…"
                value={form.listId}
                onChange={(e) => setForm({ ...form, listId: e.target.value })}
                style={{ flex: 1, minWidth: 220 }}
              />
              <button type="button" className="primary" onClick={() => void importFromArmyForge()} disabled={busy}>
                {busy ? "Importando…" : "Importar"}
              </button>
            </div>
            {units.length > 0 ? (
              <p className="small muted" style={{ marginBottom: 0 }}>
                Lista guardada con {units.length} unidades.{" "}
                {form.listId ? (
                  <a href={listUrl(form.listId)} target="_blank" rel="noreferrer">
                    Abrir en Army Forge
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {armyId && bookKey && !ignorandoBorrador ? (
        <button
          type="button"
          className="fab"
          title="Anadir una unidad"
          aria-label="Anadir una unidad"
          onClick={() => setAnadiendo(true)}
        >
          +
        </button>
      ) : null}

      {habilidad ? (
        <RuleCardModal habilidad={habilidad} glosario={glosario} onCerrar={() => setHabilidad(null)} />
      ) : null}

      {anadiendo && bookKey ? (
        <AddUnitWizard
          bookKey={bookKey}
          busy={busy}
          onCancel={() => setAnadiendo(false)}
          onConfirm={(entry, book, packages, catalogo) => void onAddUnit(entry, book, packages, catalogo)}
        />
      ) : null}

      {/* La vista es de consulta: los datos y las imagenes se pliegan para que
          las cartas lleven el peso, y se abren cuando hay algo que cambiar. */}
      <details className="army-details" open={!army}>
        <summary>Datos e imagenes</summary>
        <form id="army-form" onSubmit={onSubmit} className="stack">
        <section className="card">
          {/* Nombre, modo, faccion, puntos y miniaturas no viven aqui: o estan en
              la barra, o los calcula el constructor a partir de las unidades y
              editarlos a mano solo serviria para descuadrarlos. */}
          <h2>Datos</h2>
          <div className="field">
            <label htmlFor="notes">Notas</label>
            <textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <label className="row" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.shared}
              onChange={(e) => setForm({ ...form, shared: e.target.checked })}
              style={{ width: "auto" }}
            />
            <span>Compartir con el resto de usuarios aceptados</span>
          </label>
          {army && form.shared !== army.shared ? (
            <p className="small muted">
              El cambio de visibilidad se aplica a los ejercitos nuevos. Para uno ya creado, ajusta los permisos de la
              fila desde la consola de Appwrite.
            </p>
          ) : null}
        </section>

        <section className="card">
          <h2>Imagenes</h2>
          <input type="file" accept="image/*" multiple onChange={(e) => void onUpload(e.target.files)} disabled={busy} />
          {images.length > 0 ? (
            <div className="grid" style={{ marginTop: 12, gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
              {images.map((fileId) => (
                <div key={fileId} className="card" style={{ padding: 8 }}>
                  <img
                    src={imageUrl(fileId)}
                    alt=""
                    style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6 }}
                  />
                  <div className="row small" style={{ marginTop: 6 }}>
                    <button type="button" className="tiny ghost" onClick={() => setCoverId(fileId)}>
                      {coverId === fileId ? "Portada ✓" : "Portada"}
                    </button>
                    <button type="button" className="tiny ghost danger" onClick={() => void onRemoveImage(fileId)}>
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <div className="row">
          <button
            type="submit"
            className="primary"
            disabled={busy || ignorandoBorrador}
            title={ignorandoBorrador ? "Decide antes que hacer con el borrador pendiente" : undefined}
          >
            {busy ? "Guardando…" : "Guardar en el borrador"}
          </button>
        </div>
      </form>
      </details>
    </>
  );
}
