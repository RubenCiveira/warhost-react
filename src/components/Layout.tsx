import { NavLink, Outlet } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useGameSystem } from "../context/GameSystemContext";

const LINKS = [
  { to: "/", label: "Inicio", end: true },
  { to: "/ejercitos", label: "Ejercitos" },
  { to: "/partidas", label: "Partidas" },
  { to: "/asociaciones", label: "Asociaciones" },
  { to: "/facciones", label: "Facciones" },
  { to: "/reglas", label: "Reglas" },
  { to: "/misiones", label: "Misiones" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { system } = useGameSystem();

  // La ambientacion elegida tine toda la interfaz.
  useEffect(() => {
    document.documentElement.dataset.setting = system?.setting ?? "grimdark";
  }, [system]);

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">
          War<span>host</span>
        </NavLink>
        <nav>
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="row small">
          {system ? <span className="tag accent">{system.short}</span> : null}
          <span className="muted">{user?.name || user?.email}</span>
          <button type="button" className="ghost tiny" onClick={() => void logout()}>
            Salir
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
