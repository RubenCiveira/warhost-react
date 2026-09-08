import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  deleteGame,
  finishGame,
  getGame,
  listPlayers,
  listUnits,
  nextRound,
  startGame,
  subscribeToGame,
  updateGame,
  updatePlayer,
  updateUnit,
} from "../../api/games";
import { listMissions } from "../../api/content";
import type { Game, GamePlayer, GameResult, GameUnit, Mission } from "../../lib/types";
import { parseTokens } from "../../lib/types";
import { errorMessage } from "../../lib/format";
import { Counter, ErrorBanner, PageHead, Spinner } from "../../components/ui";
import RulesPanel from "../../components/RulesPanel";
import MissionCard from "../../components/MissionCard";

type Tab = "marcador" | "unidades" | "mision" | "reglas";

const TABS: Array<[Tab, string]> = [
  ["marcador", "Marcador"],
  ["unidades", "Unidades"],
  ["mision", "Mision"],
  ["reglas", "Reglas"],
];

export default function GameLive() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [units, setUnits] = useState<GameUnit[]>([]);
  const [mission, setMission] = useState<Mission | null>(null);
  const [tab, setTab] = useState<Tab>("marcador");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!gameId) return;
    const [nextGame, nextPlayers, nextUnits] = await Promise.all([
      getGame(gameId),
      listPlayers(gameId),
      listUnits(gameId),
    ]);
    setGame(nextGame);
    setPlayers(nextPlayers);
    setUnits(nextUnits);
    return nextGame;
  }, [gameId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .then(async (nextGame) => {
        if (cancelled || !nextGame?.missionId) return;
        const missions = await listMissions(nextGame.setting, nextGame.gameSystem);
        if (!cancelled) setMission(missions.find((m) => m.$id === nextGame.missionId) ?? null);
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Todos los que tengan la partida abierta ven los mismos marcadores.
  useEffect(() => {
    if (!gameId) return;
    return subscribeToGame(gameId, () => {
      void load().catch(() => undefined);
    });
  }, [gameId, load]);

  const unitsByPlayer = useMemo(() => {
    const groups = new Map<string, GameUnit[]>();
    for (const unit of units) {
      const list = groups.get(unit.playerId) ?? [];
      list.push(unit);
      groups.set(unit.playerId, list);
    }
    return groups;
  }, [units]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onFinish() {
    if (!game) return;
    const best = Math.max(...players.map((player) => player.score));
    const winners = players.filter((player) => player.score === best);
    const results: Record<string, GameResult> = Object.fromEntries(
      players.map((player) => [
        player.$id,
        winners.length > 1 && winners.includes(player) ? "draw" : player.score === best ? "win" : "loss",
      ]),
    );
    await run(() => finishGame(game.$id, results));
  }

  async function onDelete() {
    if (!game || !window.confirm(`¿Borrar la partida "${game.name}"?`)) return;
    setError(null);
    try {
      await deleteGame(game.$id);
      navigate("/partidas", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (loading) return <Spinner />;
  if (!game) return <ErrorBanner error={error ?? "Partida no encontrada."} />;

  const isOwner = game.createdBy === user?.$id;

  return (
    <>
      <PageHead
        title={game.name}
        sub={`${game.gameSystem.toUpperCase()} · ${game.missionName ?? "sin mision"}${
          game.pointsLimit ? ` · ${game.pointsLimit} pts` : ""
        }`}
        actions={
          <>
            {game.status === "setup" ? (
              <button type="button" className="primary" onClick={() => void run(() => startGame(game.$id))}>
                Empezar partida
              </button>
            ) : null}
            {game.status === "active" ? (
              <>
                <span className="tag accent">Ronda {game.round}</span>
                <button type="button" onClick={() => void run(() => nextRound(game))}>
                  Siguiente ronda
                </button>
                <button type="button" className="ghost" onClick={() => void onFinish()}>
                  Terminar
                </button>
              </>
            ) : null}
            {game.status === "finished" ? <span className="tag ok">Terminada</span> : null}
            {isOwner ? (
              <button type="button" className="ghost danger tiny" onClick={() => void onDelete()}>
                Borrar
              </button>
            ) : null}
          </>
        }
      />
      <ErrorBanner error={error} />

      <div className="row" style={{ marginBottom: 16 }}>
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "primary" : "ghost"} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "marcador" ? (
        <div className="scoreboard">
          {players.map((player) => (
            <PlayerCard
              key={player.$id}
              player={player}
              readOnly={game.status === "finished"}
              onChange={(patch) => void run(() => updatePlayer(player.$id, patch))}
            />
          ))}
        </div>
      ) : null}

      {tab === "unidades" ? (
        <div className="stack">
          {players.map((player) => {
            const roster = unitsByPlayer.get(player.$id) ?? [];
            return (
              <section key={player.$id}>
                <h2>
                  {player.displayName}{" "}
                  <span className="muted small">{player.armyName ? `· ${player.armyName}` : ""}</span>
                </h2>
                {roster.length === 0 ? (
                  <p className="muted small">
                    Este jugador no tiene unidades cargadas. Se copian al crear la partida desde un ejercito importado
                    de Army Forge.
                  </p>
                ) : (
                  <div className="grid">
                    {roster.map((unit) => (
                      <UnitCard
                        key={unit.$id}
                        unit={unit}
                        onChange={(patch) => void run(() => updateUnit(unit.$id, patch))}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {tab === "mision" ? (
        mission ? (
          <MissionCard mission={mission} />
        ) : (
          <p className="muted">Esta partida no tiene mision asignada.</p>
        )
      ) : null}

      {tab === "reglas" ? <RulesPanel setting={game.setting} gameSystem={game.gameSystem} compact /> : null}

      {game.status !== "finished" ? (
        <section className="card" style={{ marginTop: 20 }}>
          <label htmlFor="notes">Notas de la partida</label>
          <textarea
            id="notes"
            defaultValue={game.notes ?? ""}
            onBlur={(e) => void run(() => updateGame(game.$id, { notes: e.target.value }))}
          />
        </section>
      ) : game.notes ? (
        <section className="card" style={{ marginTop: 20 }}>
          <h3>Notas</h3>
          <p className="rule-body small" style={{ marginBottom: 0 }}>
            {game.notes}
          </p>
        </section>
      ) : null}
    </>
  );
}

function PlayerCard({
  player,
  readOnly,
  onChange,
}: {
  player: GamePlayer;
  readOnly: boolean;
  onChange: (patch: Partial<GamePlayer>) => void;
}) {
  return (
    <article className="card">
      <div className="spread">
        <strong>{player.displayName}</strong>
        {player.result ? (
          <span className={`tag ${player.result === "win" ? "ok" : player.result === "loss" ? "danger" : ""}`}>
            {player.result === "win" ? "Victoria" : player.result === "loss" ? "Derrota" : "Empate"}
          </span>
        ) : null}
      </div>
      <p className="muted small" style={{ margin: "4px 0 12px" }}>
        {player.armyName ?? "Sin ejercito"}
        {player.faction ? ` · ${player.faction}` : ""}
        {player.points ? ` · ${player.points} pts` : ""}
      </p>
      {readOnly ? (
        <p className="mono">
          {player.score} puntos · {player.victoryPoints} VP · {player.commandPoints} CP
        </p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <Counter label="Puntos" value={player.score} onChange={(score) => onChange({ score })} />
          <Counter
            label="VP"
            value={player.victoryPoints}
            onChange={(victoryPoints) => onChange({ victoryPoints })}
          />
          <Counter
            label="CP"
            value={player.commandPoints}
            onChange={(commandPoints) => onChange({ commandPoints })}
          />
        </div>
      )}
    </article>
  );
}

function UnitCard({ unit, onChange }: { unit: GameUnit; onChange: (patch: Partial<GameUnit>) => void }) {
  const tokens = parseTokens(unit.tokens);
  const alive = Math.max(0, unit.maxWounds - unit.wounds);
  const ratio = unit.maxWounds > 0 ? alive / unit.maxWounds : 0;
  const barClass = ratio > 0.5 ? "" : ratio > 0 ? "hurt" : "critical";

  function setToken(key: string, value: number) {
    const next = { ...tokens, [key]: value };
    if (value <= 0) delete next[key];
    onChange({ tokens: JSON.stringify(next) });
  }

  return (
    <article className={`unit ${unit.activated ? "activated" : ""} ${unit.destroyed ? "destroyed" : ""}`}>
      <div className="spread">
        <strong>{unit.name}</strong>
        <span className="muted small mono">
          ×{unit.size} · C{unit.quality}+ D{unit.defense}+
        </span>
      </div>

      <div className="bar">
        <i className={barClass} style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="row small">
        <Counter
          label="Heridas"
          value={unit.wounds}
          min={0}
          max={unit.maxWounds}
          onChange={(wounds) => onChange({ wounds, destroyed: wounds >= unit.maxWounds })}
        />
        <span className="muted mono">
          {alive}/{unit.maxWounds}
        </span>
      </div>

      <div className="row small" style={{ marginTop: 8 }}>
        <button
          type="button"
          className={`tiny ${unit.activated ? "primary" : "ghost"}`}
          onClick={() => onChange({ activated: !unit.activated })}
        >
          Activada
        </button>
        <button
          type="button"
          className={`tiny ${unit.shaken ? "primary" : "ghost"}`}
          onClick={() => onChange({ shaken: !unit.shaken })}
        >
          Aturdida
        </button>
        <button
          type="button"
          className={`tiny ${unit.fatigued ? "primary" : "ghost"}`}
          onClick={() => onChange({ fatigued: !unit.fatigued })}
        >
          Fatigada
        </button>
        <button
          type="button"
          className={`tiny ${unit.destroyed ? "danger" : "ghost"}`}
          onClick={() => onChange({ destroyed: !unit.destroyed })}
        >
          Destruida
        </button>
      </div>

      <div className="row small" style={{ marginTop: 8 }}>
        <Counter label="Marcadores" value={tokens.objetivo ?? 0} min={0} onChange={(value) => setToken("objetivo", value)} />
      </div>

      {unit.rules.length > 0 ? (
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          {unit.rules.join(", ")}
        </p>
      ) : null}
    </article>
  );
}
