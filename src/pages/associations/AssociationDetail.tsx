import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  addMember,
  deleteAssociation,
  getAssociation,
  listMembers,
  removeMember,
} from "../../api/associations";
import { listGames, listPlayers } from "../../api/games";
import type { Association, AssociationMember, Game, GamePlayer } from "../../lib/types";
import { errorMessage, formatDate } from "../../lib/format";
import { ErrorBanner, PageHead, Spinner } from "../../components/ui";

interface Standing {
  key: string;
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
}

export default function AssociationDetail() {
  const { associationId } = useParams();
  const { user } = useAuth();

  const [association, setAssociation] = useState<Association | null>(null);
  const [members, setMembers] = useState<AssociationMember[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [rosters, setRosters] = useState<Record<string, GamePlayer[]>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!associationId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getAssociation(associationId), listMembers(associationId), listGames({ associationId })])
      .then(async ([nextAssociation, nextMembers, nextGames]) => {
        if (cancelled) return;
        setAssociation(nextAssociation);
        setMembers(nextMembers);
        setGames(nextGames);
        setError(null);
        const entries = await Promise.all(
          nextGames.map(async (game) => [game.$id, await listPlayers(game.$id)] as const),
        );
        if (!cancelled) setRosters(Object.fromEntries(entries));
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [associationId]);

  const myMembership = members.find((member) => member.userId === user?.$id) ?? null;
  const isOwner = association?.ownerId === user?.$id;

  /** Clasificacion: 3 puntos por victoria, 1 por empate. */
  const standings = useMemo<Standing[]>(() => {
    const table = new Map<string, Standing>();
    for (const game of games) {
      if (game.status !== "finished") continue;
      for (const player of rosters[game.$id] ?? []) {
        const key = player.userId ?? `guest:${player.displayName.toLowerCase()}`;
        const entry = table.get(key) ?? {
          key,
          name: player.displayName,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
        };
        entry.played += 1;
        if (player.result === "win") {
          entry.wins += 1;
          entry.points += 3;
        } else if (player.result === "draw") {
          entry.draws += 1;
          entry.points += 1;
        } else if (player.result === "loss") {
          entry.losses += 1;
        }
        table.set(key, entry);
      }
    }
    return [...table.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
  }, [games, rosters]);

  async function join() {
    if (!association || !user) return;
    setBusy(true);
    try {
      const member = await addMember(association.$id, user.$id, user.name || user.email, "member", user.$id);
      setMembers((prev) => [...prev, member]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!myMembership) return;
    setBusy(true);
    try {
      await removeMember(myMembership.$id);
      setMembers((prev) => prev.filter((member) => member.$id !== myMembership.$id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!association || !window.confirm(`¿Borrar la asociacion "${association.name}"?`)) return;
    setBusy(true);
    try {
      await deleteAssociation(association.$id);
      window.location.assign("/asociaciones");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  if (!association) return <ErrorBanner error={error ?? "Asociacion no encontrada."} />;

  return (
    <>
      <PageHead
        title={association.name}
        sub={[association.city, `${members.length} miembros`, `${games.length} partidas`]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {myMembership ? (
              myMembership.role === "owner" ? null : (
                <button type="button" className="ghost" onClick={() => void leave()} disabled={busy}>
                  Salir
                </button>
              )
            ) : (
              <button type="button" className="primary" onClick={() => void join()} disabled={busy}>
                Unirme
              </button>
            )}
            {isOwner ? (
              <button type="button" className="ghost danger tiny" onClick={() => void remove()} disabled={busy}>
                Borrar
              </button>
            ) : null}
          </>
        }
      />
      <ErrorBanner error={error} />

      {association.description ? <p>{association.description}</p> : null}

      <section style={{ marginTop: 20 }}>
        <h2>Clasificacion</h2>
        {standings.length === 0 ? (
          <p className="muted small">Todavia no hay partidas terminadas en esta asociacion.</p>
        ) : (
          <div className="card">
            {standings.map((row, index) => (
              <div key={row.key} className="spread small" style={{ padding: "6px 0" }}>
                <span>
                  <span className="muted mono">{index + 1}. </span>
                  <strong>{row.name}</strong>
                </span>
                <span className="muted mono">
                  {row.played} PJ · {row.wins}V {row.draws}E {row.losses}D · <strong>{row.points} pts</strong>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Miembros</h2>
        <div className="card">
          {members.map((member) => (
            <div key={member.$id} className="spread small" style={{ padding: "6px 0" }}>
              <span>{member.displayName ?? member.userId}</span>
              <span className="row">
                <span className="tag">{member.role}</span>
                {isOwner && member.role !== "owner" ? (
                  <button
                    type="button"
                    className="ghost tiny danger"
                    onClick={() =>
                      void removeMember(member.$id)
                        .then(() => setMembers((prev) => prev.filter((m) => m.$id !== member.$id)))
                        .catch((err: unknown) => setError(errorMessage(err)))
                    }
                  >
                    Expulsar
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2>Partidas</h2>
        {games.length === 0 ? (
          <p className="muted small">Sin partidas registradas.</p>
        ) : (
          <div className="stack">
            {games.map((game) => (
              <Link key={game.$id} to={`/partidas/${game.$id}`} className="card card-link">
                <div className="spread">
                  <strong>{game.name}</strong>
                  <span className="muted small">{formatDate(game.endedAt ?? game.$createdAt)}</span>
                </div>
                <p className="small muted" style={{ margin: "4px 0 0" }}>
                  {(rosters[game.$id] ?? [])
                    .map((player) => `${player.displayName} ${player.score}`)
                    .join(" — ") || "Sin jugadores"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
