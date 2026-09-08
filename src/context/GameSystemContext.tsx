import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { GAME_SYSTEMS, isGameSystemId } from "../lib/gameSystems";
import type { GameSystem, GameSystemId } from "../lib/gameSystems";

const STORAGE_KEY = "gf:gameSystem";

interface GameSystemValue {
  system: GameSystem | null;
  setSystem: (id: GameSystemId | null) => void;
}

const GameSystemContext = createContext<GameSystemValue | null>(null);

function readStored(): GameSystem | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!isGameSystemId(stored)) return null;
    return GAME_SYSTEMS.find((system) => system.id === stored) ?? null;
  } catch {
    return null;
  }
}

export function GameSystemProvider({ children }: { children: ReactNode }) {
  const [system, setSystemState] = useState<GameSystem | null>(readStored);

  const setSystem = useCallback((id: GameSystemId | null) => {
    const next = id ? GAME_SYSTEMS.find((candidate) => candidate.id === id) ?? null : null;
    setSystemState(next);
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, next.id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Modo privado o almacenamiento bloqueado: la eleccion vive solo en memoria.
    }
  }, []);

  const value = useMemo<GameSystemValue>(() => ({ system, setSystem }), [system, setSystem]);
  return <GameSystemContext.Provider value={value}>{children}</GameSystemContext.Provider>;
}

export function useGameSystem(): GameSystemValue {
  const value = useContext(GameSystemContext);
  if (!value) throw new Error("useGameSystem debe usarse dentro de GameSystemProvider");
  return value;
}
