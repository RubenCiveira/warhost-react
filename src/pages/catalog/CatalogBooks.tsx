import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useGameSystem } from "../../context/GameSystemContext";
import { catalogImageUrl, groupImages, listBooks, listFactionImages, pickCover, targetKeyFor } from "../../api/catalog";
import type { ArmyBook, CatalogImage } from "../../api/catalog";
import { armyNounFor } from "../../lib/gameSystems";
import { errorMessage } from "../../lib/format";
import { EmptyState, ErrorBanner, PageHead, Spinner } from "../../components/ui";

/** Rejilla de facciones del modo de juego elegido. */
export default function CatalogBooks() {
  const { system } = useGameSystem();
  const [books, setBooks] = useState<ArmyBook[]>([]);
  const [images, setImages] = useState<CatalogImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!system) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [loadedBooks, loadedImages] = await Promise.all([
        listBooks(system.id),
        listFactionImages(system.id),
      ]);
      setBooks(loadedBooks);
      setImages(loadedImages);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [system]);

  useEffect(() => {
    void load();
  }, [load]);

  const byTarget = useMemo(() => groupImages(images), [images]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return books;
    return books.filter(
      (book) =>
        book.name.toLowerCase().includes(needle) ||
        (book.factionName ?? "").toLowerCase().includes(needle),
    );
  }, [books, search]);

  if (!system) {
    return <EmptyState title="Elige primero una ambientacion y un modo de juego" />;
  }
  if (loading) return <Spinner />;

  return (
    <>
      <PageHead
        title="Catalogo de facciones"
        sub={`${books.length} facciones en ${system.name}. Entra en una para ver sus unidades y anadir imagenes.`}
      />
      <ErrorBanner error={error} />

      <div className="field">
        <input
          type="search"
          placeholder="Buscar faccion…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Ninguna faccion coincide con la busqueda" />
      ) : (
        <div className="grid">
          {visible.map((book) => {
            const uploaded = pickCover(byTarget.get(targetKeyFor(book.$id)));
            const cover = uploaded ? catalogImageUrl(uploaded.fileId) : book.coverImagePath;
            return (
              <article key={book.$id} className="card">
                <Link to={`/facciones/${book.$id}`} className="card-link">
                  {cover ? (
                    <img className="cover" src={cover} alt="" loading="lazy" />
                  ) : (
                    <div className="cover placeholder">Sin imagen</div>
                  )}
                  <h3>{book.name}</h3>
                </Link>
                <div className="row small muted">
                  <span>{book.unitCount} unidades</span>
                  {book.versionString ? <span className="tag">v{book.versionString}</span> : null}
                  {uploaded ? <span className="tag accent">imagen propia</span> : null}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <Link to={`/facciones/${book.$id}/crear`} className="button-link">
                    Crear {armyNounFor(system).singular}
                  </Link>
                  <Link to={`/facciones/${book.$id}`} className="small muted">
                    Ver unidades
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
