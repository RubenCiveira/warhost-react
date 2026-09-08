import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { createAssociation, listAssociations, listMyMemberships } from "../../api/associations";
import type { Association } from "../../lib/types";
import { errorMessage } from "../../lib/format";
import { EmptyState, ErrorBanner, PageHead, Spinner } from "../../components/ui";

export default function AssociationList() {
  const { user } = useAuth();
  const [associations, setAssociations] = useState<Association[]>([]);
  const [myIds, setMyIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([listAssociations(), listMyMemberships(user.$id)])
      .then(([rows, memberships]) => {
        if (cancelled) return;
        setAssociations(rows);
        setMyIds(memberships.map((member) => member.associationId));
        setError(null);
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createAssociation(user.$id, user.name || user.email, { name, city, description });
      setAssociations((prev) => [...prev, created]);
      setMyIds((prev) => [...prev, created.$id]);
      setCreating(false);
      setName("");
      setCity("");
      setDescription("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title="Asociaciones"
        sub="Clubes y grupos de juego. Las partidas se pueden vincular a una asociacion."
        actions={
          <button type="button" className={creating ? "ghost" : "primary"} onClick={() => setCreating((v) => !v)}>
            {creating ? "Cancelar" : "Crear asociacion"}
          </button>
        }
      />
      <ErrorBanner error={error} />

      {creating ? (
        <form className="card" onSubmit={onCreate} style={{ marginBottom: 16 }}>
          <div className="field">
            <label htmlFor="assoc-name">Nombre</label>
            <input id="assoc-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="assoc-city">Ciudad</label>
            <input id="assoc-city" value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="assoc-desc">Descripcion</label>
            <textarea id="assoc-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Creando…" : "Crear"}
          </button>
        </form>
      ) : null}

      {loading ? (
        <Spinner />
      ) : associations.length === 0 ? (
        <EmptyState title="Todavia no hay asociaciones">
          <p>Crea una para agrupar partidas y llevar la clasificacion del club.</p>
        </EmptyState>
      ) : (
        <div className="grid">
          {associations.map((association) => (
            <Link key={association.$id} to={`/asociaciones/${association.$id}`} className="card card-link">
              <div className="spread">
                <strong>{association.name}</strong>
                {myIds.includes(association.$id) ? <span className="tag accent">Miembro</span> : null}
              </div>
              <p className="muted small" style={{ margin: "6px 0 0" }}>
                {association.city ?? "Sin ciudad"}
              </p>
              {association.description ? (
                <p className="small" style={{ margin: "6px 0 0" }}>
                  {association.description}
                </p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
