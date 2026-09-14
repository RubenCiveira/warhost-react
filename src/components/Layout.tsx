import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useGameSystem } from "../context/GameSystemContext";
import { SETTINGS, systemsFor } from "../lib/gameSystems";
import type { GameSystemId } from "../lib/gameSystems";

const LINKS = [
  { to: "/", label: "Inicio", end: true },
  { to: "/ejercitos", label: "Ejercitos" },
  { to: "/partidas", label: "Partidas" },
  { to: "/asociaciones", label: "Asociaciones" },
  { to: "/facciones", label: "Facciones" },
  { to: "/reglas", label: "Reglas" },
  { to: "/misiones", label: "Misiones" },
];

// Secciones cuyo contenido (ejercitos, partidas...) pertenece a un modo concreto:
// si se cambia de modo estando en un detalle, volvemos al indice que lo contenia.
const MODE_SCOPED_SECTIONS = ["/ejercitos", "/partidas", "/asociaciones", "/facciones"];

function indexToLeave(pathname: string): string | null {
  for (const section of MODE_SCOPED_SECTIONS) {
    if (pathname === section) return null;
    if (pathname.startsWith(`${section}/`)) return section;
  }
  return null;
}

// Cierra un menu desplegable al pulsar fuera o al pulsar Escape. Lo usan
// ModeMenu, UserMenu y el cajon de navegacion movil.
function useDismiss(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return undefined;
    const cerrar = () => close();
    const conEscape = (event: KeyboardEvent) => event.key === "Escape" && close();
    document.addEventListener("click", cerrar);
    document.addEventListener("keydown", conEscape);
    return () => {
      document.removeEventListener("click", cerrar);
      document.removeEventListener("keydown", conEscape);
    };
  }, [open, close]);
}

function ModeMenu() {
  const { system, setSystem } = useGameSystem();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useDismiss(open, () => setOpen(false));

  if (!system) return null;

  const selectSystem = (id: GameSystemId) => {
    setOpen(false);
    if (id === system.id) return;
    setSystem(id);
    const target = indexToLeave(location.pathname);
    if (target) navigate(target);
  };

  return (
    <div className="menu-wrap">
      <button
        type="button"
        className="ghost tiny menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Cambiar modo de juego"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((abierto) => !abierto);
        }}
      >
        {system.short} ▾
      </button>
      {open ? (
        <div className="menu" role="menu">
          {Object.values(SETTINGS).map((setting) => (
            <div key={setting.id}>
              <span className="menu-label">{setting.name}</span>
              {systemsFor(setting.id).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitem"
                  className={option.id === system.id ? "active" : undefined}
                  onClick={() => selectSystem(option.id)}
                >
                  {option.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  useDismiss(open, () => setOpen(false));

  return (
    <div className="menu-wrap">
      <button
        type="button"
        className="ghost tiny menu-button user-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((abierto) => !abierto);
        }}
      >
        {user?.name || user?.email} ▾
      </button>
      {open ? (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" className="danger" onClick={() => void logout()}>
            Salir
          </button>
        </div>
      ) : null}
    </div>
  );
}

// Cajon lateral con las secciones: sustituye a la barra de pestanas en
// pantallas estrechas, donde no caben todas sin desbordar.
function MobileNav() {
  const [open, setOpen] = useState(false);

  useDismiss(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return undefined;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="hamburger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Abrir menu de secciones"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((abierto) => !abierto);
        }}
      >
        <span /><span /><span />
      </button>
      {open ? (
        <div className="nav-drawer-backdrop">
          <nav className="nav-drawer" aria-label="Secciones">
            {LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} onClick={() => setOpen(false)}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      ) : null}
    </>
  );
}

export default function Layout() {
  const { system } = useGameSystem();

  // La ambientacion elegida tine toda la interfaz.
  useEffect(() => {
    document.documentElement.dataset.setting = system?.setting ?? "grimdark";
  }, [system]);

  return (
    <div className="app">
      <header className="topbar">
        <MobileNav />
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
          <ModeMenu />
          <UserMenu />
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
