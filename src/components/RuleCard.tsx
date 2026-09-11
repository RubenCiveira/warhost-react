import type { CatalogRule } from "../api/catalog";
import { conValor } from "../lib/reglas";
import type { Habilidad } from "../lib/reglas";
import { densidadScard } from "../lib/cardDensity";

/**
 * Habilidad o equipo en carta Mini Euro vertical, la misma que el hechizo.
 *
 * Una regla sin descripcion sigue teniendo carta: dice que es del reglamento
 * basico, que es informacion util, en vez de fingir que no existe.
 */
export default function RuleCard({
  habilidad,
  regla,
  lleva,
}: {
  habilidad: Habilidad;
  regla?: CatalogRule | null;
  /** Unidades que lo llevan de serie, en la vista de equipo de la faccion. */
  lleva?: string[];
}) {
  const texto = regla ? conValor(regla.description, habilidad.valor) : null;
  const concedeTexto = habilidad.concede?.length ? `Concede ${habilidad.concede.join(", ")}` : null;

  return (
    <div className="scard-frame">
      <article className={`scard${densidadScard(texto, concedeTexto)}`}>
        <header className="scard-head">
          <h3 className="scard-title">{habilidad.nombre}</h3>
          {habilidad.valor ? (
            <div className="scard-valor">
              <span className="scard-valor-key">Valor</span>
              <span className="scard-valor-num">{habilidad.valor}</span>
            </div>
          ) : null}
        </header>

        <div className="scard-body">
          {texto ? (
            <div>
              <p className="scard-efecto">{texto}</p>
              {concedeTexto ? <p className="scard-concede">{concedeTexto}</p> : null}
            </div>
          ) : concedeTexto ? (
            <div>
              <p className="scard-efecto">{concedeTexto}.</p>
            </div>
          ) : (
            <p className="scard-efecto scard-sin-texto">
              No hay texto para esta regla, ni en los libros de ejercito ni en el reglamento basico.
            </p>
          )}
        </div>

        <footer className="scard-foot">
          <span className="scard-faccion">{habilidad.tipo === "equipo" ? "Equipo" : "Regla especial"}</span>
          {lleva?.length ? (
            <span className="scard-tirada">
              Lo llevan {lleva.slice(0, 3).join(", ")}
              {lleva.length > 3 ? ` y ${lleva.length - 3} mas` : ""}
            </span>
          ) : null}
        </footer>
      </article>
    </div>
  );
}
