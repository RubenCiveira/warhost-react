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
  listUpgradePackages,
  setPrimaryImage,
  targetKeyFor,
  uploadCatalogImage,
} from "../../api/catalog";
import type { ArmyBook, ArmyUnit, CatalogImage } from "../../api/catalog";
import { errorMessage } from "../../lib/format";
import { EmptyState, ErrorBanner, PageHead, Spinner } from "../../components/ui";
import ImageUploader from "../../components/ImageUploader";
import UnitProfile from "../../components/UnitProfile";
import type { UpgradeSection } from "../../lib/builder";

/** Ficha de una faccion: sus imagenes y las de cada tipo de unidad. */
export default function CatalogBook() {
  const { bookKey = "" } = useParams();
  const { user, admin } = useAuth();
  const [book, setBook] = useState<ArmyBook | null>(null);
  const [units, setUnits] = useState<ArmyUnit[]>([]);
  const [images, setImages] = useState<CatalogImage[]>([]);
  const [packages, setPackages] = useState<Map<string, UpgradeSection[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedBook, loadedUnits, loadedImages, loadedPackages] = await Promise.all([
        getBook(bookKey),
        listUnits(bookKey),
        listBookImages(bookKey),
        listUpgradePackages(bookKey),
      ]);
      setBook(loadedBook);
      setUnits(loadedUnits);
      setImages(loadedImages);
      setPackages(loadedPackages);
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
              {admin ? (
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
        <Link to="/facciones">Volver a facciones</Link>
      </>
    );
  }

  return (
    <>
      <PageHead
        title={book.name}
        sub={`${book.unitCount} unidades${book.versionString ? ` · version ${book.versionString}` : ""}`}
        actions={
          <>
            <Link to={`/facciones/${book.$id}/crear`} className="button-link">
              Crear ejercito
            </Link>
            <Link to="/facciones">Volver</Link>
          </>
        }
      />
      <ErrorBanner error={error} />
      {admin ? null : (
        <p className="muted small">
          Las imagenes del catalogo las mantienen los administradores. Si quieres aportar alguna, pidesela a uno.
        </p>
      )}

      <section className="card">
        <h2>Imagenes de la faccion</h2>
        {book.hint ? <p className="muted small">{book.hint}</p> : null}
        {gallery(targetKeyFor(book.$id), book.coverImagePath)}
        {admin ? (
          <ImageUploader
            label="Anadir imagenes de la faccion"
            busy={busy}
            onUpload={(files, caption) => upload(files, caption)}
          />
        ) : null}
      </section>

      <h2 style={{ marginTop: 28 }}>Tipos de unidad ({units.length})</h2>
      {units.length === 0 ? (
        <EmptyState title="Esta faccion todavia no tiene unidades sincronizadas" />
      ) : (
        <div className="stack">
          {units.map((unit) => (
            <section key={unit.$id} className="card">
              <h3>{unit.name}</h3>
              <UnitProfile unit={unit} packages={packages} />
              {gallery(targetKeyFor(book.$id, unit.unitId))}
              {admin ? (
                <ImageUploader
                  label={`Anadir imagenes de ${unit.name}`}
                  busy={busy}
                  onUpload={(files, caption) => upload(files, caption, unit)}
                />
              ) : null}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
