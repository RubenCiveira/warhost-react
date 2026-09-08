import type { Mission } from "../lib/types";

const FIELDS: Array<[keyof Mission, string]> = [
  ["objectives", "Objetivos"],
  ["deployment", "Despliegue"],
  ["scoring", "Puntuacion"],
  ["specialRules", "Reglas especiales"],
];

export default function MissionCard({ mission }: { mission: Mission }) {
  return (
    <article className="card">
      <div className="spread">
        <h3 style={{ marginBottom: 0 }}>{mission.name}</h3>
        {mission.deck ? <span className="tag">{mission.deck}</span> : null}
      </div>
      {FIELDS.map(([key, label]) => {
        const value = mission[key];
        if (typeof value !== "string" || !value) return null;
        return (
          <p key={String(key)} className="small" style={{ marginTop: 10, marginBottom: 0 }}>
            <span className="muted">{label}: </span>
            {value}
          </p>
        );
      })}
      {mission.sourceUrl ? (
        <p className="small" style={{ marginTop: 10, marginBottom: 0 }}>
          <a href={mission.sourceUrl} target="_blank" rel="noreferrer">
            Fuente
          </a>
        </p>
      ) : null}
    </article>
  );
}
