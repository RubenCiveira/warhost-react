import { useGameSystem } from "../../context/GameSystemContext";
import RulesPanel from "../../components/RulesPanel";
import { PageHead } from "../../components/ui";

export default function RulesIndex() {
  const { system } = useGameSystem();
  if (!system) return <p className="muted">Elige primero un modo de juego en el inicio.</p>;

  return (
    <>
      <PageHead title="Indice de reglas" sub={`Reglas basicas y especiales de ${system.name}`} />
      <RulesPanel setting={system.setting} gameSystem={system.id} />
    </>
  );
}
