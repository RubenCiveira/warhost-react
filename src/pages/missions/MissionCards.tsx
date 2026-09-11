import { useCallback, useEffect, useMemo, useState } from "react";
import { useGameSystem } from "../../context/GameSystemContext";
import { useAuth } from "../../context/AuthContext";
import { listMissions, saveMission } from "../../api/content";
import type { Mission } from "../../lib/types";
import { errorMessage } from "../../lib/format";
import { EmptyState, ErrorBanner, PageHead, Spinner } from "../../components/ui";
import MissionCard from "../../components/MissionCard";

/**
 * El mazo de cartas de mision del modo de juego elegido.
 *
 * Las cartas se transcriben del PDF oficial con OCR, porque ahi son imagenes y
 * no texto, asi que entran sin repasar y con erratas. La pagina lo dice, deja
 * filtrar por las que faltan por repasar, y quien lleve la etiqueta `editor`
 * las corrige sin salir de aqui.
 */
export default function MissionCards() {
  const { system } = useGameSystem();
  const { editor } = useAuth();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [drawn, setDrawn] = useState<Mission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!system) return undefined;
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

  const guardar = useCallback(async (id: string, cambios: Partial<Mission>) => {
    try {
      const fila = await saveMission(id, cambios);
      setMissions((previas) => previas.map((m) => (m.$id === fila.$id ? fila : m)));
      setDrawn((robada) => (robada && robada.$id === fila.$id ? fila : robada));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  }, []);

  const sinRepasar = useMemo(() => missions.filter((m) => !m.verified).length, [missions]);
  const visible = soloPendientes ? missions.filter((m) => !m.verified) : missions;

  if (!system) return <p className="muted">Elige primero un modo de juego en el inicio.</p>;

  return (
    <>
      <PageHead
        title="Cartas de mision"
        sub={`${missions.length} cartas de ${system.name}`}
        actions={
          missions.length > 0 ? (
            <button
              type="button"
              className="primary"
              onClick={() => setDrawn(missions[Math.floor(Math.random() * missions.length)])}
            >
              Robar carta
            </button>
          ) : null
        }
      />
      <ErrorBanner error={error} />

      {sinRepasar > 0 ? (
        <div className="banner">
          {sinRepasar} de {missions.length} cartas estan <strong>sin repasar</strong>: se transcriben del PDF oficial
          con OCR, porque alli son imagenes y no texto, y salen con erratas.{" "}
          {editor ? "Puedes corregirlas desde cada carta." : "Un usuario con permiso de edicion puede corregirlas."}
          <button
            type="button"
            className="ghost tiny"
            style={{ marginLeft: 8 }}
            onClick={() => setSoloPendientes((valor) => !valor)}
          >
            {soloPendientes ? "Ver todas" : "Ver solo las que faltan"}
          </button>
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
          <MissionCard
            mission={drawn}
            puedeEditar={editor}
            onGuardar={(cambios) => guardar(drawn.$id, cambios)}
          />
        </section>
      ) : null}

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <EmptyState title={soloPendientes ? "No queda ninguna sin repasar" : "No hay misiones cargadas"}>
          <p className="muted">
            {soloPendientes
              ? "Todas las cartas de este modo estan repasadas."
              : "Se cargan con ./scripts/import-missions.sh, en warhost-appwrite."}
          </p>
        </EmptyState>
      ) : (
        <div className="mcard-grid">
          {visible.map((mission) => (
            <MissionCard
              key={mission.$id}
              mission={mission}
              puedeEditar={editor}
              onGuardar={(cambios) => guardar(mission.$id, cambios)}
            />
          ))}
        </div>
      )}
    </>
  );
}
