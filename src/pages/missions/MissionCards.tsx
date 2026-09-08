import { useEffect, useMemo, useState } from "react";
import { useGameSystem } from "../../context/GameSystemContext";
import { listMissions } from "../../api/content";
import type { Mission } from "../../lib/types";
import { errorMessage } from "../../lib/format";
import { EmptyState, ErrorBanner, PageHead, Spinner } from "../../components/ui";
import MissionCard from "../../components/MissionCard";

export default function MissionCards() {
  const { system } = useGameSystem();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [deck, setDeck] = useState("");
  const [drawn, setDrawn] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!system) return;
    let cancelled = false;
    setLoading(true);
    listMissions(system.setting, system.id)
      .then((rows) => !cancelled && (setMissions(rows), setError(null)))
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [system]);

  const decks = useMemo(
    () => [...new Set(missions.map((mission) => mission.deck).filter((value): value is string => Boolean(value)))],
    [missions],
  );
  const visible = deck ? missions.filter((mission) => mission.deck === deck) : missions;

  if (!system) return <p className="muted">Elige primero un modo de juego en el inicio.</p>;

  return (
    <>
      <PageHead
        title="Cartas de mision"
        sub={`Misiones de ${system.name}`}
        actions={
          visible.length > 0 ? (
            <button
              type="button"
              className="primary"
              onClick={() => setDrawn(visible[Math.floor(Math.random() * visible.length)])}
            >
              Robar carta
            </button>
          ) : null
        }
      />
      <ErrorBanner error={error} />

      {decks.length > 1 ? (
        <div className="row" style={{ marginBottom: 16 }}>
          <button type="button" className={deck ? "ghost" : "primary"} onClick={() => setDeck("")}>
            Todas
          </button>
          {decks.map((name) => (
            <button key={name} type="button" className={deck === name ? "primary" : "ghost"} onClick={() => setDeck(name)}>
              {name}
            </button>
          ))}
        </div>
      ) : null}

      {drawn ? (
        <section style={{ marginBottom: 20 }}>
          <div className="spread">
            <h2>Carta robada</h2>
            <button type="button" className="ghost tiny" onClick={() => setDrawn(null)}>
              Descartar
            </button>
          </div>
          <MissionCard mission={drawn} />
        </section>
      ) : null}

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState title="No hay misiones cargadas">
          <p>
            Las misiones viven en la tabla <code>missions</code> del backend. Cargalas con <code>npm run seed</code>.
          </p>
        </EmptyState>
      ) : (
        <div className="grid">
          {visible.map((mission) => (
            <MissionCard key={mission.$id} mission={mission} />
          ))}
        </div>
      )}
    </>
  );
}
