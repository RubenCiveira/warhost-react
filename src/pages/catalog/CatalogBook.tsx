import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  catalogImageUrl,
  deleteCatalogImage,
  getBook,
  groupImages,
  listBookImages,
  listUnits,
  setPrimaryImage,
  targetKeyFor,
  uploadCatalogImage,
} from "../../api/catalog";
import type { ArmyBook, ArmyUnit, CatalogImage } from "../../api/catalog";
import { errorMessage } from "../../lib/format";
import { EmptyState, ErrorBanner, PageHead, Spinner } from "../../components/ui";
import ImageUploader from "../../components/ImageUploader";

/** Ficha de una faccion: sus imagenes y las de cada tipo de unidad. */
export default function CatalogBook() {
  const { bookKey = "" } = useParams();
  const { user } = useAuth();
  const [book, setBook] = useState<ArmyBook | null>(null);
  const [units, setUnits] = useState<ArmyUnit[]>([]);
  const [images, setImages] = useState<CatalogImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedBook, loadedUnits, loadedImages] = await Promise.all([
        getBook(bookKey),
        listUnits(bookKey),
        listBookImages(bookKey),
      ]);
      setBook(loadedBook);
      setUnits(loadedUnits);
      setImages(loadedImages);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [bookKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const byTarget = useMemo(() => groupImages(images), [images]);

  const upload = useCallback(
    async (files: File[], caption: string, unit?: ArmyUnit) => {
      if (!book || !user) return;
      setBusy(true);
      try {
        // En serie a proposito: son ficheros grandes y subirlos todos a la vez
        // satura la conexion sin ganar nada.
        for (const file of files) {
          await uploadCatalogImage(file, { scope: unit ? "unit" : "faction", book, unit }, user, caption);
        }
        setImages(await listBookImages(bookKey));
      } finally {
        setBusy(false);
      }
    },
    [book, bookKey, user],
  );

  async function remove(image: CatalogImage) {
    setBusy(true);
    setError(null);
    try {
      await deleteCatalogImage(image);
      setImages((prev) => prev.filter((candidate) => candidate.$id !== image.$id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function makePrimary(image: CatalogImage) {
    setBusy(true);
    setError(null);
    try {
      await setPrimaryImage(image, byTarget.get(image.targetKey) ?? []);
      setImages(await listBookImages(bookKey));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function gallery(targetKey: string, fallback?: string | null) {
    const list = byTarget.get(targetKey) ?? [];
    if (list.length === 0) {
      return fallback ? <img className="thumb" src={fallback} alt="" loading="lazy" /> : null;
    }
    return (
      <div className="gallery">
        {list.map((image) => (
          <figure key={image.$id} className={image.isPrimary ? "shot primary" : "shot"}>
            <img src={catalogImageUrl(image.fileId)} alt={image.caption ?? ""} loading="lazy" />
            <figcaption className="small muted">
              {image.caption ? <span>{image.caption}</span> : null}
              <span className="by">{image.uploadedByName}</span>
              {image.uploadedBy === user?.$id ? (
                <span className="row">
                  {!image.isPrimary ? (
                    <button type="button" className="ghost tiny" disabled={busy} onClick={() => void makePrimary(image)}>
                      Principal
                    </button>
                  ) : null}
                  <button type="button" className="ghost tiny danger" disabled={busy} onClick={() => void remove(image)}>
                    Borrar
                  </button>
                </span>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
    );
  }

  if (loading) return <Spinner />;
  if (!book) {
    return (
      <>
        <ErrorBanner error={error ?? "No se ha encontrado esta faccion."} />
        <Link to="/catalogo">Volver al catalogo</Link>
      </>
    );
  }

  return (
    <>
      <PageHead
        title={book.name}
        sub={`${book.unitCount} unidades${book.versionString ? ` · version ${book.versionString}` : ""}`}
        actions={<Link to="/catalogo">Volver</Link>}
      />
      <ErrorBanner error={error} />

      <section className="card">
        <h2>Imagenes de la faccion</h2>
        {book.hint ? <p className="muted small">{book.hint}</p> : null}
        {gallery(targetKeyFor(book.$id), book.coverImagePath)}
        <ImageUploader label="Anadir imagenes de la faccion" busy={busy} onUpload={(files, caption) => upload(files, caption)} />
      </section>

      <h2 style={{ marginTop: 28 }}>Tipos de unidad ({units.length})</h2>
      {units.length === 0 ? (
        <EmptyState title="Esta faccion todavia no tiene unidades sincronizadas" />
      ) : (
        <div className="stack">
          {units.map((unit) => (
            <section key={unit.$id} className="card">
              <div className="spread">
                <div>
                  <h3>{unit.name}</h3>
                  <p className="small muted mono">
                    ×{unit.size} · C{unit.quality}+ D{unit.defense}+ · {unit.cost} pts
                  </p>
                </div>
              </div>
              {unit.rules.length > 0 ? (
                <div className="row small" style={{ marginBottom: 8 }}>
                  {unit.rules.slice(0, 8).map((rule) => (
                    <span key={rule} className="tag">
                      {rule}
                    </span>
                  ))}
                </div>
              ) : null}
              {gallery(targetKeyFor(book.$id, unit.unitId))}
              <ImageUploader
                label={`Anadir imagenes de ${unit.name}`}
                busy={busy}
                onUpload={(files, caption) => upload(files, caption, unit)}
              />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
