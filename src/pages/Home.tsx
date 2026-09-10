import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useGameSystem } from "../context/GameSystemContext";
import { GAME_SYSTEMS, SETTINGS, systemsFor } from "../lib/gameSystems";
import type { Setting } from "../lib/gameSystems";
import { listArmies } from "../api/armies";
import { listGames } from "../api/games";
import type { Army, Game } from "../lib/types";
import { errorMessage, formatDate } from "../lib/format";
import { ErrorBanner, PageHead, Spinner } from "../components/ui";

export default function Home() {
  const { user } = useAuth();
  const { system, setSystem } = useGameSystem();

  if (!system) return <SystemPicker onPick={setSystem} />;
  return <Dashboard userId={user!.$id} />;
}

function SystemPicker({ onPick }: { onPick: (id: (typeof GAME_SYSTEMS)[number]["id"]) => void }) {
  const [setting, setSetting] = useState<Setting | null>(null);

  if (!setting) {
    return (
      <>
        <PageHead title="Elige ambientacion" sub="Tus ejercitos, partidas y reglas se filtran por lo que elijas aqui." />
        <div className="grid">
          {Object.values(SETTINGS).map((option) => (
            <button
              key={option.id}
              type="button"
              className="card"
              style={{ textAlign: "left", cursor: "pointer" }}
              onClick={() => setSetting(option.id)}
            >
              <h2>{option.name}</h2>
              <p className="muted small" style={{ marginBottom: 0 }}>
                {option.blurb}
              </p>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        title={`Modo de juego · ${SETTINGS[setting].name}`}
        sub="Cada modo tiene sus propias listas, misiones y detalles de reglas."
        actions={
          <button type="button" className="ghost" onClick={() => setSetting(null)}>
            Cambiar ambientacion
          </button>
        }
      />
      <div className="grid">
        {systemsFor(setting).map((option) => (
          <button
            key={option.id}
            type="button"
            className="card"
            style={{ textAlign: "left", cursor: "pointer" }}
            onClick={() => onPick(option.id)}
          >
            <h3>{option.name}</h3>
            <p className="muted small" style={{ marginBottom: 0 }}>
              {option.scale}
            </p>
          </button>
        ))}
      </div>
    </>
  );
}

function Dashboard({ userId }: { userId: string }) {
  const { system, setSystem } = useGameSystem();
  const [armies, setArmies] = useState<Army[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!system) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([listArmies(userId, system.id), listGames({ gameSystem: system.id, limit: 5 })])
      .then(([nextArmies, nextGames]) => {
        if (cancelled) return;
        setArmies(nextArmies);
        setGames(nextGames);
        setError(null);
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId, system]);

  const active = games.filter((game) => game.status === "active");

  return (
    <>
      <PageHead
        title={system!.name}
        sub={system!.scale}
        actions={
          <button type="button" className="ghost" onClick={() => setSystem(null)}>
            Cambiar modo
          </button>
        }
      />
      <ErrorBanner error={error} />
      {loading ? (
        <Spinner />
      ) : (
        <div className="stack">
          {active.length > 0 ? (
            <section>
              <h2>Partida en curso</h2>
              {active.map((game) => (
                <Link key={game.$id} to={`/partidas/${game.$id}`} className="card card-link">
                  <div className="spread">
                    <strong>{game.name}</strong>
                    <span className="tag accent">Ronda {game.round}</span>
                  </div>
                  <p className="muted small" style={{ margin: "6px 0 0" }}>
                    {game.missionName ?? "Sin mision"}
                  </p>
                </Link>
              ))}
            </section>
          ) : null}

          <section>
            <div className="spread">
              <h2>Tus ejercitos</h2>
              <Link to="/ejercitos">Ver todos</Link>
            </div>
            {armies.length === 0 ? (
              <div className="card muted">
                Todavia no tienes ejercitos en {system!.short}. <Link to="/ejercitos/nuevo">Crea el primero</Link> o
                importalo desde Army Forge.
              </div>
            ) : (
              <div className="grid">
                {armies.slice(0, 6).map((army) => (
                  <Link key={army.$id} to={`/ejercitos/${army.lineageId ?? army.$id}`} className="card card-link">
                    <strong>{army.name}</strong>
                    <p className="muted small" style={{ margin: "4px 0 0" }}>
                      {army.faction ?? "Sin faccion"} · {army.points} pts · {formatDate(army.updatedAt)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="spread">
              <h2>Accesos rapidos</h2>
            </div>
            <div className="grid">
              <Link to="/partidas/nueva" className="card card-link">
                <strong>Nueva partida</strong>
                <p className="muted small" style={{ marginBottom: 0 }}>
                  Marcadores, contadores por unidad y mision a mano.
                </p>
              </Link>
              <Link to="/reglas" className="card card-link">
                <strong>Indice de reglas</strong>
                <p className="muted small" style={{ marginBottom: 0 }}>
                  Buscador de reglas basicas y especiales.
                </p>
              </Link>
              <Link to="/misiones" className="card card-link">
                <strong>Cartas de mision</strong>
                <p className="muted small" style={{ marginBottom: 0 }}>
                  Despliegue, objetivos y puntuacion.
                </p>
              </Link>
              <Link to="/asociaciones" className="card card-link">
                <strong>Asociaciones</strong>
                <p className="muted small" style={{ marginBottom: 0 }}>
                  Clubes, miembros y sus resultados.
                </p>
              </Link>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
