import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useGameSystem } from "../../context/GameSystemContext";
import { listArmies } from "../../api/armies";
import { listAssociations, listMyMemberships } from "../../api/associations";
import { listMissions } from "../../api/content";
import { addPlayer, addUnits, createGame } from "../../api/games";
import { summarizeUnits } from "../../api/armyForge";
import type { ArmyForgeList } from "../../api/armyForge";
import type { Army, Association, Mission } from "../../lib/types";
import { errorMessage } from "../../lib/format";
import { ErrorBanner, PageHead, Spinner } from "../../components/ui";

interface PlayerDraft {
  displayName: string;
  armyId: string;
  isMe: boolean;
}

export default function GameNew() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { system } = useGameSystem();

  const [armies, setArmies] = useState<Army[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  const [myAssociationIds, setMyAssociationIds] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [missionId, setMissionId] = useState("");
  const [associationId, setAssociationId] = useState("");
  const [pointsLimit, setPointsLimit] = useState(1000);
  const [players, setPlayers] = useState<PlayerDraft[]>([
    { displayName: "", armyId: "", isMe: true },
    { displayName: "", armyId: "", isMe: false },
  ]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !system) return;
    let cancelled = false;
    Promise.all([
      listArmies(user.$id, system.id),
      listMissions(system.setting, system.id),
      listAssociations(),
      listMyMemberships(user.$id),
    ])
      .then(([nextArmies, nextMissions, nextAssociations, memberships]) => {
        if (cancelled) return;
        setArmies(nextArmies);
        setMissions(nextMissions);
        setAssociations(nextAssociations);
        setMyAssociationIds(memberships.map((member) => member.associationId));
        setPlayers((prev) =>
          prev.map((player) => (player.isMe ? { ...player, displayName: user.name || user.email } : player)),
        );
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [user, system]);

  function updatePlayer(index: number, patch: Partial<PlayerDraft>) {
    setPlayers((prev) => prev.map((player, i) => (i === index ? { ...player, ...patch } : player)));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user || !system) return;
    const roster = players.filter((player) => player.displayName.trim());
    if (roster.length < 2) {
      setError("Hacen falta al menos dos jugadores.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const mission = missions.find((candidate) => candidate.$id === missionId) ?? null;
      const game = await createGame(user.$id, {
        name: name.trim() || `${roster.map((player) => player.displayName).join(" vs ")}`,
        setting: system.setting,
        gameSystem: system.id,
        associationId: associationId || null,
        missionId: mission?.$id ?? null,
        missionName: mission?.name ?? null,
        pointsLimit,
      });

      for (const draft of roster) {
        const army = armies.find((candidate) => candidate.$id === draft.armyId) ?? null;
        const player = await addPlayer(game.$id, {
          displayName: draft.displayName.trim(),
          userId: draft.isMe ? user.$id : null,
          armyId: army?.$id ?? null,
          armyName: army?.name ?? null,
          faction: army?.faction ?? null,
          points: army?.points ?? 0,
        });

        // Si el ejercito viene de Army Forge, se copian sus unidades para tener
        // contadores de heridas y activacion desde el minuto uno.
        if (army?.listJson) {
          try {
            const units = summarizeUnits(JSON.parse(army.listJson) as ArmyForgeList);
            if (units.length > 0) await addUnits(game.$id, player.$id, units);
          } catch {
            // Una lista ilegible no debe impedir crear la partida.
          }
        }
      }

      navigate(`/partidas/${game.$id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!system) return <p className="muted">Elige primero un modo de juego en el inicio.</p>;
  if (loading) return <Spinner />;

  const visibleAssociations = associations.filter(
    (association) => association.visibility === "public" || myAssociationIds.includes(association.$id),
  );

  return (
    <>
      <PageHead title="Nueva partida" sub={`${system.name} · los marcadores se comparten con el resto de jugadores`} />
      <ErrorBanner error={error} />

      <form onSubmit={onSubmit} className="stack">
        <section className="card">
          <div className="field">
            <label htmlFor="name">Nombre de la partida</label>
            <input
              id="name"
              placeholder="Se genera con los nombres de los jugadores si lo dejas vacio"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="row">
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="mission">Mision</label>
              <select id="mission" value={missionId} onChange={(e) => setMissionId(e.target.value)}>
                <option value="">Sin mision</option>
                {missions.map((mission) => (
                  <option key={mission.$id} value={mission.$id}>
                    {mission.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label htmlFor="association">Asociacion</label>
              <select id="association" value={associationId} onChange={(e) => setAssociationId(e.target.value)}>
                <option value="">Partida libre</option>
                {visibleAssociations.map((association) => (
                  <option key={association.$id} value={association.$id}>
                    {association.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ width: 130 }}>
              <label htmlFor="points">Puntos</label>
              <input
                id="points"
                type="number"
                min={0}
                step={50}
                value={pointsLimit}
                onChange={(e) => setPointsLimit(Number(e.target.value))}
              />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="spread">
            <h2>Jugadores</h2>
            <button
              type="button"
              className="ghost tiny"
              onClick={() => setPlayers((prev) => [...prev, { displayName: "", armyId: "", isMe: false }])}
            >
              Anadir jugador
            </button>
          </div>
          <div className="stack">
            {players.map((player, index) => (
              <div key={index} className="row">
                <input
                  placeholder={`Jugador ${index + 1}`}
                  value={player.displayName}
                  onChange={(e) => updatePlayer(index, { displayName: e.target.value })}
                  style={{ flex: 1, minWidth: 160 }}
                />
                <select
                  value={player.armyId}
                  onChange={(e) => updatePlayer(index, { armyId: e.target.value })}
                  style={{ flex: 1, minWidth: 180 }}
                  disabled={!player.isMe}
                  title={player.isMe ? undefined : "Solo puedes asignar tus propios ejercitos"}
                >
                  <option value="">Sin ejercito guardado</option>
                  {armies.map((army) => (
                    <option key={army.$id} value={army.$id}>
                      {army.name} ({army.points} pts)
                    </option>
                  ))}
                </select>
                {players.length > 2 ? (
                  <button
                    type="button"
                    className="ghost tiny danger"
                    onClick={() => setPlayers((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Quitar
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Las unidades del ejercito que elijas se copian a la partida como marcadores editables.
          </p>
        </section>

        <div className="row">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Creando…" : "Crear partida"}
          </button>
        </div>
      </form>
    </>
  );
}
