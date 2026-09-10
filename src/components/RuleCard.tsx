import type { CatalogRule } from "../api/catalog";
import { conValor } from "../lib/reglas";
import type { Habilidad } from "../lib/reglas";

/**
 * Habilidad o equipo en carta de tarot vertical, la misma que el hechizo.
 *
 * Una regla sin descripcion sigue teniendo carta: dice que es del reglamento
 * basico, que es informacion util, en vez de fingir que no existe.
 */
export default function RuleCard({ habilidad, regla }: { habilidad: Habilidad; regla?: CatalogRule | null }) {
  const texto = regla ? conValor(regla.description, habilidad.valor) : null;

  return (
    <div className="scard-frame">
      <article className="scard">
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
            <p className="scard-efecto">{texto}</p>
          ) : (
            <p className="scard-efecto scard-sin-texto">
              Es una regla del reglamento basico: su texto no viene en los libros de ejercito.
            </p>
          )}
        </div>

        <footer className="scard-foot">
          <span className="scard-faccion">{habilidad.tipo === "equipo" ? "Equipo" : "Regla especial"}</span>
          {habilidad.concede?.length ? (
            <span className="scard-tirada">Concede {habilidad.concede.join(", ")}</span>
          ) : null}
        </footer>
      </article>
    </div>
  );
}
