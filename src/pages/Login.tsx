import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../lib/format";
import { ErrorBanner, Spinner } from "../components/ui";

export default function Login() {
  const { user, loading, login, loginWithGoogle } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    params.get("error") === "oauth" ? "No se ha podido completar el acceso con Google." : null,
  );
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner />;
  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="card">
        <h1>Entrar</h1>
        <p className="muted">Tus ejercitos y partidas de One Page Rules.</p>
        <ErrorBanner error={error} />
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Contrasena</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="primary" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
        <button type="button" className="ghost" onClick={loginWithGoogle} style={{ width: "100%", marginTop: 10 }}>
          Continuar con Google
        </button>
        <p className="small muted" style={{ marginTop: 16, marginBottom: 0 }}>
          ¿No tienes cuenta? <Link to="/register">Registrate</Link>
        </p>
      </div>
    </div>
  );
}
