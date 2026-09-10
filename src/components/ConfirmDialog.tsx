import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmacion para acciones que no se pueden deshacer.
 *
 * El foco arranca en cancelar y no en confirmar: quien llega aqui por un
 * resbalon suele darle a la tecla intro por inercia, y el camino de menor
 * resistencia no deberia ser el destructivo.
 */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancelar",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const cancelar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelar.current?.focus();
    const conEscape = (event: KeyboardEvent) => event.key === "Escape" && onCancel();
    document.addEventListener("keydown", conEscape);
    return () => document.removeEventListener("keydown", conEscape);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <div className="muted">{children}</div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button type="button" ref={cancelar} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
