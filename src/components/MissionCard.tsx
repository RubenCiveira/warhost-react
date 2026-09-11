import { useState } from "react";
import type { Mission } from "../lib/types";
import { densidadScard } from "../lib/cardDensity";

/**
 * Una mision en carta Mini Euro, la misma piel que un hechizo o una regla:
 * un valor en la cabecera —aqui los puntos de victoria— y el texto debajo.
 *
 * Sale de un OCR sobre el PDF oficial, donde las cartas son imagenes y no
 * texto, asi que la carta dice cuando no esta repasada en vez de presentarse
 * como si fuera fiable. Quien lleve la etiqueta `editor` la corrige sin salir
 * de la carta: el modo edicion crece lo que haga falta, porque ahi ya no
 * importa el tamano de impresion.
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

  const texto = mission.description?.trim() || null;
  const claseArticulo =
    `scard${mission.verified ? "" : " sin-repasar"}${editando ? " editando" : densidadScard(texto)}`;

  return (
    <div className={`scard-frame${editando ? " editando" : ""}`}>
      <article className={claseArticulo}>
        <header className="scard-head">
          {editando ? (
            <input
              className="scard-title-input"
              value={borrador.name}
              aria-label="Nombre de la carta"
              onChange={(event) => setBorrador({ ...borrador, name: event.target.value })}
            />
          ) : (
            <h3 className="scard-title">
              {mission.code !== null ? `${mission.code} · ` : ""}
              {mission.name}
            </h3>
          )}
          {editando ? (
            <input
              className="scard-valor-input mono"
              value={borrador.vp}
              inputMode="numeric"
              placeholder="PV"
              aria-label="Puntos de victoria"
              onChange={(event) => setBorrador({ ...borrador, vp: event.target.value })}
            />
          ) : (
            <div className="scard-valor">
              <span className="scard-valor-key">PV</span>
              <span className="scard-valor-num">{mission.vp ?? "?"}</span>
            </div>
          )}
        </header>

        <div className="scard-body">
          {editando ? (
            <textarea
              className="scard-efecto-input"
              value={borrador.description}
              aria-label="Texto de la carta"
              onChange={(event) => setBorrador({ ...borrador, description: event.target.value })}
            />
          ) : texto ? (
            <p className="scard-efecto">{texto}</p>
          ) : (
            <p className="scard-efecto scard-sin-texto">Sin texto transcrito para esta mision.</p>
          )}
        </div>

        <footer className="scard-foot">
          {editando ? (
            <span className="scard-mision-acciones">
              <button type="button" className="tiny" disabled={guardando} onClick={() => setEditando(false)}>
                Cancelar
              </button>
              <button type="button" className="tiny" disabled={guardando} onClick={() => void guardar(false)}>
                Guardar
              </button>
              <button type="button" className="tiny primary" disabled={guardando} onClick={() => void guardar(true)}>
                {guardando ? "Guardando…" : "Guardar y repasar"}
              </button>
            </span>
          ) : (
            <span className="scard-mision-pie">
              <span className="scard-faccion">{mission.verified ? "Repasada" : "Sin repasar"}</span>
              <span className="scard-mision-links">
                {mission.sourceUrl ? (
                  <a href={mission.sourceUrl} target="_blank" rel="noreferrer" className="scard-mision-link">
                    PDF {mission.sourceVersion ?? ""}
                  </a>
                ) : null}
                {puedeEditar && onGuardar ? (
                  <button type="button" className="scard-mision-link" onClick={() => setEditando(true)}>
                    Corregir
                  </button>
                ) : null}
              </span>
            </span>
          )}
        </footer>
      </article>
    </div>
  );
}
