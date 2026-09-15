import { useEffect } from "react";
import RuleCard from "./RuleCard";
import type { CatalogRule } from "../api/catalog";
import type { Habilidad } from "../lib/reglas";

/** La carta de una habilidad, abierta desde su chip. */
export default function RuleCardModal({
  habilidad,
  glosario,
  onCerrar,
  onAbrir,
}: {
  habilidad: Habilidad;
  glosario: Map<string, CatalogRule>;
  onCerrar: () => void;
  /**
   * Con esto, pulsar una referencia cruzada dentro de la carta cambia a esa
   * regla sin cerrar el modal, en vez de solo poder consultar la de encima.
   */
  onAbrir?: (habilidad: Habilidad) => void;
}) {
  useEffect(() => {
    const conEscape = (event: KeyboardEvent) => event.key === "Escape" && onCerrar();
    document.addEventListener("keydown", conEscape);
    return () => document.removeEventListener("keydown", conEscape);
  }, [onCerrar]);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={habilidad.nombre}
      onClick={onCerrar}
    >
      <div className="regla-modal" onClick={(event) => event.stopPropagation()}>
        <RuleCard
          habilidad={habilidad}
          regla={glosario.get(habilidad.nombre.toLowerCase())}
          glosario={glosario}
          onAbrir={onAbrir}
        />
        <button type="button" className="ghost tiny" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
