import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "./ui";
import PendingApproval from "../pages/PendingApproval";

/**
 * Puerta unica de la app: sin sesion se va a /login, sin email verificado o sin
 * la label `aceptado` se muestra la pantalla de espera. Los permisos reales los
 * aplica Appwrite; esto solo evita enviar al usuario contra un muro de errores.
 */
export default function RequireAccess({ children }: { children: ReactNode }) {
  const { access, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;
  if (access === "anonymous") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (access !== "accepted") return <PendingApproval />;
  return <>{children}</>;
}
