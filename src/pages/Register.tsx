import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../lib/format";
import { ErrorBanner, Spinner } from "../components/ui";

export default function Register() {
  const { user, loading, register, loginWithGoogle } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner />;
  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(name, email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="card">
        <h1>Crear cuenta</h1>
        <p className="muted">
          Te enviaremos un email de verificacion. Despues un administrador tendra que aceptar tu cuenta.
        </p>
        <ErrorBanner error={error} />
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="name">Nombre</label>
            <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Contrasena</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="primary" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Creando…" : "Crear cuenta"}
          </button>
        </form>
        <button type="button" className="ghost" onClick={loginWithGoogle} style={{ width: "100%", marginTop: 10 }}>
          Continuar con Google
        </button>
        <p className="small muted" style={{ marginTop: 16, marginBottom: 0 }}>
          ¿Ya tienes cuenta? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
