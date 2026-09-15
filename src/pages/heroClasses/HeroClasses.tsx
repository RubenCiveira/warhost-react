import { useCallback, useEffect, useState } from "react";
import { useGameSystem } from "../../context/GameSystemContext";
import { useAuth } from "../../context/AuthContext";
import { listHeroClasses, saveHeroClass } from "../../api/content";
import { isQuestSystem } from "../../lib/gameSystems";
import type { HeroClass } from "../../lib/types";
import { errorMessage } from "../../lib/format";
import { EmptyState, ErrorBanner, PageHead, Spinner } from "../../components/ui";
import HeroClassCard from "../../components/HeroClassCard";

/**
 * Las clases de heroe del modo de juego elegido: el set comun a todas
 * (`classKey === "default"`) primero, y luego cada clase con su feat y sus
 * habilidades de tier 0 a 3. Solo tiene sentido en Star Quest y Fantasy Quest,
 * donde un heroe elige una clase en vez de venir de una lista de ejercito.
 */
export default function HeroClasses() {
  const { system } = useGameSystem();
  const { editor } = useAuth();
  const [classes, setClasses] = useState<HeroClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const quest = isQuestSystem(system?.id);

  useEffect(() => {
    if (!system || !quest) return undefined;
    let cancelled = false;
    setLoading(true);
    listHeroClasses(system.id)
      .then((rows) => !cancelled && (setClasses(rows), setError(null)))
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [system, quest]);

  const guardar = useCallback(async (id: string, cambios: Partial<HeroClass>) => {
    try {
      const fila = await saveHeroClass(id, cambios);
      setClasses((previas) => previas.map((c) => (c.$id === fila.$id ? fila : c)));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
      throw err;
    }
  }, []);

  if (!system) return <p className="muted">Elige primero un modo de juego en el inicio.</p>;
  if (!quest) {
    return (
      <EmptyState title="Este modo de juego no usa clases de heroe">
        <p className="muted">
          Las clases solo existen en Star Quest y Fantasy Quest: en el resto, los heroes salen tal cual del libro de
          ejercito.
        </p>
      </EmptyState>
    );
  }

  return (
    <>
      <PageHead title="Clases de heroe" sub={`${classes.length} clases de ${system.name}`} />
      <ErrorBanner error={error} />

      {loading ? (
        <Spinner />
      ) : classes.length === 0 ? (
        <EmptyState title="No hay clases cargadas">
          <p className="muted">
            Se cargan con <code>node scripts/seed-cli.mjs</code>, en warhost-appwrite.
          </p>
        </EmptyState>
      ) : (
        <div className="stack">
          {classes.map((heroClass) => (
            <HeroClassCard
              key={heroClass.$id}
              heroClass={heroClass}
              puedeEditar={editor}
              onGuardar={(cambios) => guardar(heroClass.$id, cambios)}
            />
          ))}
        </div>
      )}
    </>
  );
}
