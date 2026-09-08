import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useGameSystem } from "../../context/GameSystemContext";
import { listGames, listPlayers } from "../../api/games";
import { listAssociations } from "../../api/associations";
import type { Association, Game, GamePlayer } from "../../lib/types";
import { errorMessage, formatDate } from "../../lib/format";
import { EmptyState, ErrorBanner, PageHead, Spinner } from "../../components/ui";

const STATUS_LABEL: Record<Game["status"], string> = {
  setup: "Preparando",
  active: "En curso",
  finished: "Terminada",
};

export default function GameList() {
  const { system } = useGameSystem();
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<Record<string, GamePlayer[]>>({});
  const [associations, setAssociations] = useState<Association[]>([]);
  const [associationId, setAssociationId] = useState("");
  const [status, setStatus] = useState<Game["status"] | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAssociations().then(setAssociations).catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listGames({
      gameSystem: system?.id,
      associationId: associationId || undefined,
      status: status || undefined,
    })
      .then(async (rows) => {
        if (cancelled) return;
        setGames(rows);
        setError(null);
        // Los participantes son la parte util del listado: quien jugo y con que resultado.
        const entries = await Promise.all(
          rows.map(async (game) => [game.$id, await listPlayers(game.$id)] as const),
        );
        if (!cancelled) setPlayers(Object.fromEntries(entries));
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [system, associationId, status]);

  return (
    <>
      <PageHead
        title="Partidas"
        sub={`Historico y partidas en curso de ${system?.name ?? "todos los modos"}`}
        actions={
          <Link to="/partidas/nueva">
            <button type="button" className="primary">
              Nueva partida
            </button>
          </Link>
        }
      />

      <div className="row" style={{ marginBottom: 16 }}>
        <select value={associationId} onChange={(e) => setAssociationId(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="">Todas las asociaciones</option>
          {associations.map((association) => (
            <option key={association.$id} value={association.$id}>
              {association.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Game["status"] | "")}
          style={{ maxWidth: 200 }}
        >
          <option value="">Cualquier estado</option>
          <option value="setup">Preparando</option>
          <option value="active">En curso</option>
          <option value="finished">Terminadas</option>
        </select>
      </div>

      <ErrorBanner error={error} />
      {loading ? (
        <Spinner />
      ) : games.length === 0 ? (
        <EmptyState title="No hay partidas registradas">
          <Link to="/partidas/nueva">
            <button type="button" className="primary">
              Crear la primera
            </button>
          </Link>
        </EmptyState>
      ) : (
        <div className="stack">
          {games.map((game) => {
            const roster = players[game.$id] ?? [];
            return (
              <Link key={game.$id} to={`/partidas/${game.$id}`} className="card card-link">
                <div className="spread">
                  <strong>{game.name}</strong>
                  <span className={`tag ${game.status === "active" ? "accent" : ""}`}>
                    {STATUS_LABEL[game.status]}
                  </span>
                </div>
                <p className="muted small" style={{ margin: "6px 0 0" }}>
                  {game.missionName ?? "Sin mision"} · {game.gameSystem.toUpperCase()}
                  {game.pointsLimit ? ` · ${game.pointsLimit} pts` : ""} ·{" "}
                  {formatDate(game.endedAt ?? game.startedAt ?? game.$createdAt)}
                </p>
                {roster.length > 0 ? (
                  <p className="small" style={{ margin: "6px 0 0" }}>
                    {roster.map((player, index) => (
                      <span key={player.$id}>
                        {index > 0 ? " vs " : ""}
                        <strong>{player.displayName}</strong>
                        <span className="muted">
                          {player.armyName ? ` (${player.armyName})` : ""} {player.score}
                        </span>
                        {player.result === "win" ? " 🏆" : ""}
                      </span>
                    ))}
                  </p>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
