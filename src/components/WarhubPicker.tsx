import { useEffect, useState } from "react";
import type { Area } from "react-easy-crop";
import { fetchMiniatureImage, searchMiniatures, WARHUB_GAME_SYSTEMS } from "../api/miniatures";
import type { MiniatureProduct } from "../api/miniatures";
import type { ArmyUnit, CatalogImageType } from "../api/catalog";
import { removeBackground } from "../lib/backgroundRemoval";
import { errorMessage } from "../lib/format";
import { CropModal, cropFile } from "./ImageUploader";

/**
 * Busca una miniatura en el catalogo de WarHub para usarla como foto de la
 * unidad, sin depender de un crawler contra tiendas que bloquean peticiones
 * automatizadas (ver notas del proyecto). El catalogo no es de One Page
 * Rules: son productos de otras marcas que sirven de proxy, igual que ya
 * hace la comunidad a mano.
 */
export default function WarhubPicker({
  unit,
  busy,
  onUpload,
}: {
  unit: ArmyUnit;
  busy?: boolean;
  onUpload: (files: File[], caption: string, imageType: CatalogImageType, unit: ArmyUnit) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [gameSystem, setGameSystem] = useState("");
  const [query, setQuery] = useState(unit.name);
  const [results, setResults] = useState<MiniatureProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MiniatureProduct | null>(null);
  const [original, setOriginal] = useState<File | null>(null);
  const [prepared, setPrepared] = useState<File | null>(null);
  const [sinFondo, setSinFondo] = useState(false);
  const [tolerancia, setTolerancia] = useState(32);
  const [cropFor, setCropFor] = useState<CatalogImageType | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    if (!prepared) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(prepared);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);

  const disabled = busy || working;

  async function buscar() {
    setSearching(true);
    setError(null);
    try {
      setResults(await searchMiniatures({ gameSystem: gameSystem || undefined, query }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  async function elegir(product: MiniatureProduct) {
    setSelected(product);
    setPrepared(null);
    setOriginal(null);
    setSinFondo(false);
    setTolerancia(32);
    setWorking(true);
    setError(null);
    try {
      const file = await fetchMiniatureImage(product.imageUrl);
      setOriginal(file);
      setPrepared(file);
    } catch (err) {
      setError(errorMessage(err));
      setSelected(null);
    } finally {
      setWorking(false);
    }
  }

  async function quitarFondo(nivel: number) {
    if (!original) return;
    setWorking(true);
    setError(null);
    try {
      setPrepared(await removeBackground(original, nivel));
      setSinFondo(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  // Recalcula al mover el slider, sin disparar una pasada por cada tick.
  useEffect(() => {
    if (!sinFondo || !original) return;
    const timeout = setTimeout(() => void quitarFondo(tolerancia), 200);
    return () => clearTimeout(timeout);
  }, [tolerancia]);

  function volverAlOriginal() {
    setPrepared(original);
    setSinFondo(false);
  }

  async function subirRecorte(area: Area) {
    if (!prepared || !cropFor) return;
    const cropped = await cropFile(prepared, area);
    await onUpload([cropped], `WarHub: ${selected?.name ?? ""}`, cropFor, unit);
    setCropFor(null);
    setSelected(null);
    setPrepared(null);
    setOriginal(null);
  }

  if (!open) {
    return (
      <button type="button" className="ghost tiny" disabled={disabled} onClick={() => setOpen(true)}>
        Buscar en WarHub
      </button>
    );
  }

  return (
    <div className="warhub-picker">
      <div className="warhub-picker-filtros">
        <select value={gameSystem} disabled={disabled || searching} onChange={(event) => setGameSystem(event.target.value)}>
          <option value="">Todos los sistemas</option>
          {WARHUB_GAME_SYSTEMS.map((system) => (
            <option key={system} value={system}>
              {system}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Buscar por nombre"
          value={query}
          disabled={disabled || searching}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void buscar()}
        />
        <button type="button" className="tiny" disabled={disabled || searching} onClick={() => void buscar()}>
          {searching ? "Buscando…" : "Buscar"}
        </button>
        <button type="button" className="ghost tiny" disabled={disabled} onClick={() => setOpen(false)}>
          Cerrar
        </button>
      </div>

      {error ? <p className="small danger-text">{error}</p> : null}

      {results.length > 0 ? (
        <div className="warhub-picker-grid">
          {results.map((product) => (
            <button
              key={product.$id}
              type="button"
              className="warhub-picker-item"
              disabled={disabled}
              onClick={() => void elegir(product)}
            >
              <img src={product.imageUrl} alt="" loading="lazy" />
              <span className="small muted">
                {product.name} · {product.manufacturer}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {selected ? (
        <div className="warhub-picker-elegido">
          <p className="small muted">{selected.name}</p>
          {previewUrl ? <img className="thumb" src={previewUrl} alt="" /> : null}
          <div className="row">
            {sinFondo ? (
              <button type="button" className="ghost tiny" disabled={disabled} onClick={volverAlOriginal}>
                Deshacer fondo transparente
              </button>
            ) : (
              <button type="button" className="ghost tiny" disabled={disabled} onClick={() => void quitarFondo(tolerancia)}>
                {working ? "Procesando…" : "Fondo transparente (aprox.)"}
              </button>
            )}
            <button type="button" className="tiny" disabled={disabled || !prepared} onClick={() => setCropFor("miniature")}>
              Recortar y subir como miniatura
            </button>
            <button type="button" className="tiny" disabled={disabled || !prepared} onClick={() => setCropFor("avatar")}>
              Recortar y subir como avatar
            </button>
          </div>
          {sinFondo ? (
            <label className="crop-control">
              <span>Rango de color</span>
              <input
                type="range"
                min={8}
                max={100}
                step={2}
                value={tolerancia}
                disabled={disabled}
                onChange={(event) => setTolerancia(Number(event.target.value))}
              />
              <span className="small muted">{tolerancia}</span>
            </label>
          ) : null}
        </div>
      ) : null}

      {cropFor && prepared ? (
        <CropModal
          file={prepared}
          imageType={cropFor}
          onCancel={() => setCropFor(null)}
          onSkip={() => setCropFor(null)}
          onApply={subirRecorte}
        />
      ) : null}
    </div>
  );
}
