import { useEffect, useState } from "react";
import type { Area } from "react-easy-crop";
import { fetchMiniatureImage, searchMiniatures, WARHUB_GAME_SYSTEMS } from "../api/miniatures";
import type { MiniatureProduct } from "../api/miniatures";
import type { ArmyUnit, CatalogImageType } from "../api/catalog";
import { removeBackground } from "../lib/backgroundRemoval";
import { errorMessage } from "../lib/format";
import { fetchWikiSuggestions, suggestionsFor } from "../lib/wikiMiniatures";
import { CropModal, cropFile } from "./ImageUploader";

// La pagina de sugerencias es por faccion, no por unidad: se guarda una vez
// aqui y todas las unidades de esa faccion la reutilizan sin volver a pedirla.
const suggestionsCache = new Map<string, Promise<Map<string, string[]>>>();

function wikiSuggestionsFor(factionName: string): Promise<Map<string, string[]>> {
  let cached = suggestionsCache.get(factionName);
  if (!cached) {
    cached = fetchWikiSuggestions(factionName).catch(() => new Map<string, string[]>());
    suggestionsCache.set(factionName, cached);
  }
  return cached;
}

/**
 * Busca una miniatura en el catalogo de WarHub para usarla como foto de la
 * unidad, sin depender de un crawler contra tiendas que bloquean peticiones
 * automatizadas (ver notas del proyecto). El catalogo no es de One Page
 * Rules: son productos de otras marcas que sirven de proxy, igual que ya
 * hace la comunidad a mano.
 */
export default function WarhubPicker({
  unit,
  factionName,
  busy,
  onUpload,
}: {
  unit: ArmyUnit;
  /** Nombre de la faccion, para mirar en la wiki que miniatura de otra marca conviene buscar. */
  factionName?: string | null;
  busy?: boolean;
  onUpload: (files: File[], caption: string, imageType: CatalogImageType, unit: ArmyUnit) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [gameSystem, setGameSystem] = useState("");
  const [query, setQuery] = useState(unit.name);
  const [results, setResults] = useState<MiniatureProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [sugerencias, setSugerencias] = useState<string[]>([]);
  const [selected, setSelected] = useState<MiniatureProduct | null>(null);
  const [original, setOriginal] = useState<File | null>(null);
  const [prepared, setPrepared] = useState<File | null>(null);
  const [sinFondo, setSinFondo] = useState(false);
  const [tolerancia, setTolerancia] = useState(4);
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

  // Sugerencias de la wiki, solo mientras el buscador esta abierto: para
  // muchas unidades no hace falta pedirlas nunca.
  useEffect(() => {
    if (!open || !factionName) {
      setSugerencias([]);
      return;
    }
    let cancelado = false;
    wikiSuggestionsFor(factionName).then((mapa) => {
      if (!cancelado) setSugerencias(suggestionsFor(mapa, unit.name));
    });
    return () => {
      cancelado = true;
    };
  }, [open, factionName, unit.name]);

  async function buscar(texto = query) {
    setSearching(true);
    setError(null);
    try {
      setResults(await searchMiniatures({ gameSystem: gameSystem || undefined, query: texto }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  function buscarSugerencia(nombre: string) {
    setQuery(nombre);
    void buscar(nombre);
  }

  async function elegir(product: MiniatureProduct) {
    setSelected(product);
    setPrepared(null);
    setOriginal(null);
    setSinFondo(false);
    setTolerancia(4);
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

  async function subirRecorte(file: File, area: Area) {
    if (!prepared || !cropFor) return;
    const cropped = await cropFile(file, area);
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

      {sugerencias.length > 0 ? (
        <div className="warhub-picker-sugerencias">
          <span className="small muted">Sugerido por la wiki:</span>
          {sugerencias.map((nombre) => (
            <button key={nombre} type="button" className="ghost tiny" disabled={disabled || searching} onClick={() => buscarSugerencia(nombre)}>
              {nombre}
            </button>
          ))}
        </div>
      ) : null}

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
                min={0}
                max={12}
                step={0.25}
                value={tolerancia}
                disabled={disabled}
                onChange={(event) => setTolerancia(Number(event.target.value))}
              />
              <span className="small muted">{Number.isInteger(tolerancia) ? tolerancia : tolerancia.toFixed(2)}</span>
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
