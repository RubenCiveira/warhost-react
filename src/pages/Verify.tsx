import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { account } from "../lib/appwrite";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../lib/format";
import { ErrorBanner, Spinner } from "../components/ui";

/** Destino del enlace del email de verificacion: ?userId=...&secret=... */
export default function Verify() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const userId = params.get("userId");
    const secret = params.get("secret");
    if (!userId || !secret) {
      setState("error");
      setError("El enlace de verificacion esta incompleto.");
      return;
    }
    // StrictMode monta dos veces en desarrollo y el secreto es de un solo uso.
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        await account.updateEmailVerification({ userId, secret });
        await refresh();
        setState("done");
      } catch (err) {
        setState("error");
        setError(errorMessage(err));
      }
    })();
  }, [params, refresh]);

  return (
    <div className="center-screen">
      <div className="card">
        <h1>Verificacion de email</h1>
        {state === "working" ? <Spinner /> : null}
        {state === "done" ? (
          <>
            <div className="banner ok">Email verificado. Tu cuenta queda pendiente de aceptacion.</div>
            <Link to="/">Continuar</Link>
          </>
        ) : null}
        {state === "error" ? (
          <>
            <ErrorBanner error={error} />
            <Link to="/">Volver</Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
