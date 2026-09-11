import { useState } from "react";
import type { Mission } from "../lib/types";

/**
 * Una carta de mision, con la misma forma que la impresa: el numero del rombo,
 * el nombre, lo que hay que hacer y los puntos que da.
 *
 * Sale de un OCR sobre el PDF oficial, donde las cartas son imagenes y no
 * texto, asi que la carta dice cuando no esta repasada en vez de presentarse
 * como si fuera fiable. Quien lleve la etiqueta `editor` la corrige aqui mismo.
 */
export default function MissionCard({
  mission,
  puedeEditar = false,
  onGuardar,
}: {
  mission: Mission;
  puedeEditar?: boolean;
  onGuardar?: (cambios: Partial<Mission>) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrador, setBorrador] = useState({
    name: mission.name,
    description: mission.description ?? "",
    vp: mission.vp === null ? "" : String(mission.vp),
  });

  async function guardar(verificada: boolean) {
    if (!onGuardar) return;
    setGuardando(true);
    try {
      await onGuardar({
        name: borrador.name.trim() || mission.name,
        description: borrador.description.trim() || null,
        vp: borrador.vp.trim() === "" ? null : Number(borrador.vp),
        verified: verificada,
      });
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <article className={mission.verified ? "mcard" : "mcard sin-repasar"}>
      <header className="mcard-head">
        {mission.code !== null ? <span className="mcard-code mono">{mission.code}</span> : null}
        {editando ? (
          <input
            className="mcard-name-input"
            value={borrador.name}
            aria-label="Nombre de la carta"
            onChange={(event) => setBorrador({ ...borrador, name: event.target.value })}
          />
        ) : (
          <h3 className="mcard-name">{mission.name}</h3>
        )}
        {editando ? (
          <input
            className="mcard-vp-input mono"
            value={borrador.vp}
            inputMode="numeric"
            placeholder="PV"
            aria-label="Puntos de victoria"
            onChange={(event) => setBorrador({ ...borrador, vp: event.target.value })}
          />
        ) : mission.vp !== null ? (
          <span className="mcard-vp mono">{mission.vp}VP</span>
        ) : (
          <span className="mcard-vp falta" title="El OCR no pudo leer los puntos">
            ?VP
          </span>
        )}
      </header>

      {editando ? (
        <textarea
          className="mcard-text-input"
          value={borrador.description}
          aria-label="Texto de la carta"
          rows={3}
          onChange={(event) => setBorrador({ ...borrador, description: event.target.value })}
        />
      ) : (
        <p className="mcard-text">{mission.description || <span className="muted">Sin texto</span>}</p>
      )}

      <footer className="mcard-foot small">
        {mission.verified ? (
          <span className="muted">Repasada</span>
        ) : (
          <span className="mcard-aviso" title="Transcrita automaticamente del PDF; puede tener erratas">
            Sin repasar
          </span>
        )}
        {mission.sourceUrl ? (
          <a href={mission.sourceUrl} target="_blank" rel="noreferrer" className="muted">
            PDF {mission.sourceVersion ?? ""}
          </a>
        ) : null}
        {puedeEditar && onGuardar ? (
          editando ? (
            <span className="row">
              <button type="button" className="tiny" disabled={guardando} onClick={() => setEditando(false)}>
                Cancelar
              </button>
              <button type="button" className="tiny" disabled={guardando} onClick={() => void guardar(false)}>
                Guardar
              </button>
              <button type="button" className="tiny primary" disabled={guardando} onClick={() => void guardar(true)}>
                {guardando ? "Guardando…" : "Guardar y marcar repasada"}
              </button>
            </span>
          ) : (
            <button type="button" className="tiny" onClick={() => setEditando(true)}>
              Corregir
            </button>
          )
        ) : null}
      </footer>
    </article>
  );
}
