import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { requestAccess, sendVerificationEmail } from "../api/access";
import { errorMessage, formatDateTime } from "../lib/format";
import { ErrorBanner } from "../components/ui";

/**
 * Pantalla que ve quien todavia no tiene la label `aceptado`. Distingue entre
 * "te falta verificar el email" y "estas en la cola de revision".
 */
export default function PendingApproval() {
  const { user, access, logout, refresh } = useAuth();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resendVerification() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await sendVerificationEmail();
      setNotice("Te hemos reenviado el email de verificacion.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestAccess(message);
      if (!result.ok) setError(result.reason ?? "No se ha podido enviar la solicitud.");
      else if (result.rateLimited)
        setNotice(
          `Ya hay una solicitud en curso. Podras enviar otra a partir de ${formatDateTime(result.nextAllowedAt)}.`,
        );
      else setNotice("Solicitud enviada. Recibiras acceso cuando un administrador la revise.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="card">
        {access === "unverified" ? (
          <>
            <h1>Verifica tu email</h1>
            <p className="muted">
              Hemos enviado un enlace de verificacion a <strong>{user?.email}</strong>. Abrelo para continuar.
            </p>
            <ErrorBanner error={error} />
            {notice ? <div className="banner ok">{notice}</div> : null}
            <div className="row">
              <button type="button" className="primary" disabled={busy} onClick={() => void resendVerification()}>
                Reenviar email
              </button>
              <button type="button" className="ghost" onClick={() => void refresh()}>
                Ya lo he verificado
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>Cuenta pendiente de aceptacion</h1>
            <p className="muted">
              Tu email esta verificado. Un administrador debe aceptar tu cuenta antes de que puedas ver listas y
              partidas. Si quieres, cuentale quien eres.
            </p>
            <ErrorBanner error={error} />
            {notice ? <div className="banner ok">{notice}</div> : null}
            <div className="field">
              <label htmlFor="message">Mensaje para el administrador (opcional)</label>
              <textarea
                id="message"
                maxLength={1000}
                placeholder="Juego en el club de los martes, me presento…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div className="row">
              <button type="button" className="primary" disabled={busy} onClick={() => void ask()}>
                {busy ? "Enviando…" : "Solicitar acceso"}
              </button>
              <button type="button" className="ghost" onClick={() => void refresh()}>
                Comprobar de nuevo
              </button>
            </div>
          </>
        )}
        <p className="small muted" style={{ marginTop: 20, marginBottom: 0 }}>
          <button type="button" className="ghost tiny" onClick={() => void logout()}>
            Cerrar sesion
          </button>
        </p>
      </div>
    </div>
  );
}
