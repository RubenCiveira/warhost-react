import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { errorMessage } from "../lib/format";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

interface Props {
  label: string;
  busy?: boolean;
  onUpload: (files: File[], caption: string) => Promise<void>;
}

/**
 * Formulario de subida: acepta varios ficheros, con un pie opcional comun.
 * Valida tipo y tamano antes de llamar a Appwrite, que si no responde con un
 * error generico que no ayuda a quien lo esta usando.
 */
export default function ImageUploader({ label, busy, onUpload }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const picked = Array.from(event.target.files ?? []);
    const rejected = picked.filter((file) => !ACCEPTED.includes(file.type) || file.size > MAX_BYTES);
    if (rejected.length > 0) {
      setError(`Solo PNG, JPG o WEBP de hasta 5 MB. Descartados: ${rejected.map((f) => f.name).join(", ")}`);
    }
    setFiles(picked.filter((file) => !rejected.includes(file)));
  }

  async function submit() {
    if (files.length === 0) return;
    setWorking(true);
    setError(null);
    try {
      await onUpload(files, caption);
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
          <input
            type="text"
            placeholder="Pie de foto (opcional)"
            maxLength={200}
            value={caption}
            disabled={disabled}
            onChange={(event) => setCaption(event.target.value)}
          />
          <button type="button" className="primary tiny" disabled={disabled} onClick={() => void submit()}>
            {working ? "Subiendo…" : `Subir ${files.length} imagen${files.length > 1 ? "es" : ""}`}
          </button>
        </>
      ) : null}
      {error ? <p className="small danger-text">{error}</p> : null}
    </div>
  );
}
