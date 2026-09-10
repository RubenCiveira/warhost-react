import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useGameSystem } from "../../context/GameSystemContext";
import { GAME_SYSTEMS, getGameSystem } from "../../lib/gameSystems";
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
import { errorMessage } from "../../lib/format";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";
import UnitCard from "../../components/UnitCard";

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

  useEffect(() => {
    if (!armyId) return;
    let cancelled = false;
    resolveArmy(armyId)
      .then(({ active: row, draft: pendiente }) => {
        if (cancelled) return;
        setArmy(row);
        // Si hay borrador, es lo que se enseña: es la version en la que estas
        // trabajando. El activo sigue intacto por debajo.
        setDraft(pendiente);

        const visible = pendiente ?? row;
        setForm({
          name: visible.name,
          gameSystem: visible.gameSystem,
          faction: visible.faction ?? "",
          points: visible.points,
          modelCount: visible.modelCount,
          listId: visible.listId ?? "",
          notes: visible.notes ?? "",
          shared: visible.shared,
        });
        setListJson(visible.listJson);
        setImages(visible.imageIds ?? []);
        setCoverId(visible.coverId);
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [armyId]);

  const units = useMemo(() => parseStoredList(listJson), [listJson]);

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
      const destino = draft ?? (await startDraft(army, user.$id));
      const guardado = await saveDraft(destino.$id, payload);
      setDraft(guardado);
      setNotice("Cambios guardados en el borrador. Pulsa Guardar para aplicarlos.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** Acepta el borrador: pasa a ser el ejercito y el anterior queda archivado. */
  async function onPublish() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const publicado = await publishDraft(draft);
      setArmy(publicado);
      setDraft(null);
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
      setForm({
        name: army.name,
        gameSystem: army.gameSystem,
        faction: army.faction ?? "",
        points: army.points,
        modelCount: army.modelCount,
        listId: army.listId ?? "",
        notes: army.notes ?? "",
        shared: army.shared,
      });
      setListJson(army.listJson);
      setImages(army.imageIds ?? []);
      setCoverId(army.coverId);
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
          {draft ? (
            <button type="button" className="ghost tiny" onClick={() => void onDiscard()} disabled={busy}>
              Descartar
            </button>
          ) : null}
          <button
            type="button"
            className="primary"
            onClick={() => void onPublish()}
            disabled={busy || !draft}
            title={draft ? undefined : "No hay cambios pendientes que guardar"}
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
          {army ? (
            <button type="button" className="ghost danger tiny" onClick={() => void onDelete()} disabled={busy}>
              Borrar
            </button>
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

      {draft ? (
        <div className="banner">
          Estas viendo un <strong>borrador</strong> con cambios sin aplicar. El ejercito sigue como estaba hasta que
          pulses Guardar.
        </div>
      ) : null}

      {units.length > 0 ? (
        <div className="army-strip">
          {units.map((unit) => (
            <div key={`${unit.unitKey ?? unit.name}-${unit.sortOrder}`} className="army-slide">
              <UnitCard
                variant="ejercito"
                upgrades={unit.upgrades ?? []}
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

      {armyId && bookKey ? (
        <Link
          to={`/ejercitos/${armyId}/unidades`}
          className="fab"
          title="Anadir o cambiar unidades"
          aria-label="Anadir o cambiar unidades"
        >
          +
        </Link>
      ) : null}

      {/* La vista es de consulta: los datos y las imagenes se pliegan para que
          las cartas lleven el peso, y se abren cuando hay algo que cambiar. */}
      <details className="army-details" open={!army}>
        <summary>Datos, importacion e imagenes</summary>
        <form id="army-form" onSubmit={onSubmit} className="stack">
        <section className="card">
          <h2>Importar desde Army Forge</h2>
          <p className="muted small">
            Comparte la lista en Army Forge y pega aqui el enlace. Las unidades se guardan para poder usarlas como
            marcadores durante la partida.
          </p>
          <div className="row">
            <input
              placeholder="https://army-forge.onepagerules.com/share?id=…"
              value={form.listId}
              onChange={(e) => setForm({ ...form, listId: e.target.value })}
              style={{ flex: 1, minWidth: 240 }}
            />
            <button type="button" onClick={() => void importFromArmyForge()} disabled={busy}>
              {busy ? "Importando…" : "Importar"}
            </button>
          </div>
          {units.length > 0 ? (
            <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
              Lista guardada con {units.length} unidades.{" "}
              {form.listId ? (
                <a href={listUrl(form.listId)} target="_blank" rel="noreferrer">
                  Abrir en Army Forge
                </a>
              ) : null}
            </p>
          ) : null}
        </section>

        <section className="card">
          <h2>Datos</h2>
          <div className="field">
            <label htmlFor="name">Nombre</label>
            <input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="system">Modo de juego</label>
            <select
              id="system"
              value={form.gameSystem}
              onChange={(e) => setForm({ ...form, gameSystem: e.target.value as GameSystemId })}
            >
              {GAME_SYSTEMS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="faction">Faccion</label>
            <input id="faction" value={form.faction} onChange={(e) => setForm({ ...form, faction: e.target.value })} />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="points">Puntos</label>
              <input
                id="points"
                type="number"
                min={0}
                value={form.points}
                onChange={(e) => setForm({ ...form, points: Number(e.target.value) })}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="models">Miniaturas</label>
              <input
                id="models"
                type="number"
                min={0}
                value={form.modelCount}
                onChange={(e) => setForm({ ...form, modelCount: Number(e.target.value) })}
              />
            </div>
          </div>
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
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
      </details>
    </>
  );
}
