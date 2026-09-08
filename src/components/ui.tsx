import type { ReactNode } from "react";

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Cargando" />;
}

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="banner error" role="alert">
      {error}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}

export function Counter({
  label,
  value,
  onChange,
  min = -99,
  max = 99,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="score">
      <span className="small muted">{label}</span>
      <button type="button" className="icon" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Restar ${label}`}>
        −
      </button>
      <span className="value mono">{value}</span>
      <button type="button" className="icon" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Sumar ${label}`}>
        +
      </button>
    </div>
  );
}
