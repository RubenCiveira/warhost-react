import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { errorMessage } from "../lib/format";
import type { CatalogImageType } from "../api/catalog";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

const ASPECT: Record<CatalogImageType, number> = {
  avatar: 13 / 10,
  miniature: 58 / 50,
  gallery: 4 / 3,
};

/** Proporcion inicial al activar "foto de varias miniaturas": un poco mas ancha que alta. */
const GRUPO_RATIO_INICIAL = 16 / 9;
const GRUPO_RATIO_MIN = 1;
const GRUPO_RATIO_MAX = 3;

interface Props {
  label: string;
  busy?: boolean;
  imageType?: CatalogImageType;
  onUpload: (files: File[], caption: string, imageType: CatalogImageType) => Promise<void>;
}

function extensionFor(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

function croppedName(file: File, type: string): string {
  return `${file.name.replace(/\.[^.]+$/, "")}-recorte.${extensionFor(type)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/** Se exporta para reutilizarla fuera del picker de ficheros (p.ej. WarhubPicker). */
export async function cropFile(file: File, area: Area): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(area.width);
    canvas.height = Math.round(area.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar el recorte de la imagen.");
    context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.92));
    if (!blob) throw new Error("No se pudo generar la imagen recortada.");
    return new File([blob], croppedName(file, blob.type || file.type), { type: blob.type || file.type, lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Se exporta para reutilizarla fuera del picker de ficheros (p.ej. WarhubPicker). */
export function CropModal({
  file,
  imageType,
  onCancel,
  onSkip,
  onApply,
}: {
  file: File;
  imageType: CatalogImageType;
  onCancel: () => void;
  onSkip: () => void;
  onApply: (area: Area) => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grupo, setGrupo] = useState(false);
  const [ratioGrupo, setRatioGrupo] = useState(GRUPO_RATIO_INICIAL);

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setError(null);
    setGrupo(false);
    setRatioGrupo(GRUPO_RATIO_INICIAL);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  const aspect = grupo ? ratioGrupo : ASPECT[imageType];
  const onCropComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  async function apply() {
    if (!area) return;
    setWorking(true);
    setError(null);
    try {
      await onApply(area);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Recortar ${file.name}`} onClick={onCancel}>
      <div className="modal wide crop-modal" onClick={(event) => event.stopPropagation()}>
        <header className="spread">
          <div>
            <h2 style={{ margin: 0 }}>Recortar imagen</h2>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              Ajusta el encuadre antes de subirla como {imageType === "avatar" ? "avatar" : imageType === "miniature" ? "miniatura" : "galeria"}.
            </p>
          </div>
          <button type="button" className="ghost tiny" disabled={working} onClick={onCancel}>
            Cerrar
          </button>
        </header>
        <div className="crop-stage">
          {url ? (
            <Cropper
              image={url}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          ) : null}
        </div>
        <label className="crop-control">
          <span>Zoom</span>
          <input type="range" min={1} max={4} step={0.01} value={zoom} disabled={working} onChange={(event) => setZoom(Number(event.target.value))} />
        </label>
        <label className="row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={grupo} disabled={working} onChange={(event) => setGrupo(event.target.checked)} style={{ width: "auto" }} />
          <span>Foto de varias miniaturas (recorte mas ancho)</span>
        </label>
        {grupo ? (
          <label className="crop-control">
            <span>Proporcion</span>
            <input
              type="range"
              min={GRUPO_RATIO_MIN}
              max={GRUPO_RATIO_MAX}
              step={0.05}
              value={ratioGrupo}
              disabled={working}
              onChange={(event) => setRatioGrupo(Number(event.target.value))}
            />
          </label>
        ) : null}
        {error ? <p className="small danger-text">{error}</p> : null}
        <footer className="modal-actions">
          <button type="button" className="ghost" disabled={working} onClick={onSkip}>
            Usar sin recortar
          </button>
          <button type="button" className="primary" disabled={working || !area} onClick={() => void apply()}>
            {working ? "Preparando…" : "Aplicar recorte"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/**
 * Formulario de subida: acepta varios ficheros, con un pie opcional comun.
 * Valida tipo y tamano antes de llamar a Appwrite, que si no responde con un
 * error generico que no ayuda a quien lo esta usando.
 */
export default function ImageUploader({ label, busy, imageType, onUpload }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [type, setType] = useState<CatalogImageType>(imageType ?? "gallery");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [cropIndex, setCropIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = Array.from(event.target.files ?? []);
    const rejected = picked.filter((file) => !ACCEPTED.includes(file.type));
    if (rejected.length > 0) {
      setError(`Solo PNG, JPG o WEBP. Descartados: ${rejected.map((f) => f.name).join(", ")}`);
    }
    const accepted = picked.filter((file) => !rejected.includes(file));
    const oversized = accepted.filter((file) => file.size > MAX_BYTES);
    if (oversized.length > 0) {
      setError(`Las imagenes de mas de 5 MB deben recortarse antes de subir: ${oversized.map((f) => f.name).join(", ")}`);
    }
    setFiles(accepted);
    setCropIndex(accepted.length > 0 ? 0 : null);
  }

  function nextCrop(index: number) {
    setCropIndex(index + 1 < files.length ? index + 1 : null);
  }

  async function applyCrop(index: number, area: Area) {
    const original = files[index];
    if (!original) return;
    const cropped = await cropFile(original, area);
    if (cropped.size > MAX_BYTES) throw new Error("El recorte supera los 5 MB. Reduce el zoom o usa otra imagen.");
    setFiles((prev) => prev.map((file, fileIndex) => (fileIndex === index ? cropped : file)));
    nextCrop(index);
  }

  async function submit() {
    if (files.length === 0) return;
    const oversized = files.filter((file) => file.size > MAX_BYTES);
    if (oversized.length > 0) {
      setError(`Todavia superan los 5 MB: ${oversized.map((file) => file.name).join(", ")}. Recortalas antes de subir.`);
      setCropIndex(files.indexOf(oversized[0]));
      return;
    }
    setWorking(true);
    setError(null);
    try {
      await onUpload(files, caption, type);
      setFiles([]);
      setCaption("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setWorking(false);
    }
  }

  const disabled = busy || working;

  return (
    <div className="uploader">
      <label htmlFor={`file-${label}`}>{label}</label>
      <input
        id={`file-${label}`}
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        disabled={disabled}
        onChange={onPick}
      />
      {files.length > 0 ? (
        <>
          {imageType ? null : (
            <select value={type} disabled={disabled} onChange={(event) => setType(event.target.value as CatalogImageType)}>
              <option value="gallery">Galeria</option>
              <option value="avatar">Avatar</option>
              <option value="miniature">Miniatura</option>
            </select>
          )}
          <input
            type="text"
            placeholder="Pie de foto (opcional)"
            maxLength={200}
            value={caption}
            disabled={disabled}
            onChange={(event) => setCaption(event.target.value)}
          />
          <span className="uploader-files small muted">
            {files.map((file, index) => (
              <button key={`${file.name}-${index}`} type="button" className="ghost tiny" disabled={disabled} onClick={() => setCropIndex(index)}>
                Recortar {file.name}
              </button>
            ))}
          </span>
          <button type="button" className="primary tiny" disabled={disabled} onClick={() => void submit()}>
            {working ? "Subiendo…" : `Subir ${files.length} imagen${files.length > 1 ? "es" : ""}`}
          </button>
        </>
      ) : null}
      {error ? <p className="small danger-text">{error}</p> : null}
      {cropIndex !== null && files[cropIndex] ? (
        <CropModal
          file={files[cropIndex]}
          imageType={type}
          onCancel={() => setCropIndex(null)}
          onSkip={() => nextCrop(cropIndex)}
          onApply={(area) => applyCrop(cropIndex, area)}
        />
      ) : null}
    </div>
  );
}
