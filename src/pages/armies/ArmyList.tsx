import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useGameSystem } from "../../context/GameSystemContext";
import { imageUrl, listArmies } from "../../api/armies";
import { parseStoredList } from "../../api/armyForge";
import { armyNounFor } from "../../lib/gameSystems";
import type { Army } from "../../lib/types";
import { errorMessage, formatDate } from "../../lib/format";
import { EmptyState, ErrorBanner, PageHead, Spinner } from "../../components/ui";
import AvisoComposicion from "../../components/AvisoComposicion";

export default function ArmyList() {
  const { user } = useAuth();
  const { system } = useGameSystem();
  const [armies, setArmies] = useState<Army[]>([]);
  const [allSystems, setAllSystems] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    listArmies(user.$id, allSystems ? undefined : system?.id)
      .then((rows) => !cancelled && (setArmies(rows), setError(null)))
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, system, allSystems]);

  const noun = allSystems ? armyNounFor(null) : armyNounFor(system);

  return (
    <>
      <PageHead
        title={noun.pluralCap}
        sub={allSystems ? `Todas tus ${noun.plural}` : `Tus ${noun.plural} de ${system?.name ?? "este modo"}`}
        actions={
          <>
            <button type="button" className="ghost" onClick={() => setAllSystems((value) => !value)}>
              {allSystems ? "Solo este modo" : "Ver todos"}
            </button>
            <Link to="/facciones">
              <button type="button">Construir desde faccion</button>
            </Link>
            <Link to="/ejercitos/nuevo">
              <button type="button" className="primary">
                Importar o crear
              </button>
            </Link>
          </>
        }
      />
      <ErrorBanner error={error} />
      {loading ? (
        <Spinner />
      ) : armies.length === 0 ? (
        <EmptyState title={`Aun no hay ${noun.plural}`}>
          <p>
            Construye {noun.indefArticle} {noun.singular} desde una faccion del catalogo, o pega el enlace de una
            lista de Army Forge para importarla con todas sus unidades.
          </p>
          <Link to="/ejercitos/nuevo">
            <button type="button" className="primary">
              Crear {noun.singular}
            </button>
          </Link>
        </EmptyState>
      ) : (
        <div className="grid">
          {armies.map((army) => (
            <Link key={army.$id} to={`/ejercitos/${army.lineageId ?? army.$id}`} className="card card-link">
              {army.coverId ? (
                <img
                  src={imageUrl(army.coverId)}
                  alt=""
                  style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 8, marginBottom: 10 }}
                />
              ) : null}
              <div className="spread">
                <strong>{army.name}</strong>
                <span className="row" style={{ gap: 6 }}>
                  <AvisoComposicion
                    puntos={army.points}
                    unidades={parseStoredList(army.listJson)}
                    gameSystem={army.gameSystem}
                    pointsLimit={army.pointsLimit}
                    pointsMargin={army.pointsMargin}
                  />
                  <span className="tag">{army.gameSystem.toUpperCase()}</span>
                </span>
              </div>
              <p className="muted small" style={{ margin: "6px 0 0" }}>
                {army.faction ?? "Sin faccion"} · {army.points} pts · {army.modelCount} miniaturas
              </p>
              <p className="muted small" style={{ margin: 0 }}>
                Actualizado {formatDate(army.updatedAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
