import type { CatalogRule } from "../api/catalog";
import { conValor, parseHabilidad } from "../lib/reglas";
import type { Habilidad } from "../lib/reglas";
import { densidadScard } from "../lib/cardDensity";
import TextoConReferencias from "./TextoConReferencias";

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
  glosario,
  onAbrir,
}: {
  habilidad: Habilidad;
  regla?: CatalogRule | null;
  /** Unidades que lo llevan de serie, en la vista de equipo de la faccion. */
  lleva?: string[];
  /** Con esto, las menciones a otras reglas en el texto se abren como referencia cruzada. */
  glosario?: Map<string, CatalogRule>;
  onAbrir?: (habilidad: Habilidad) => void;
}) {
  const texto = regla ? conValor(regla.description, habilidad.valor) : null;
  const concede = habilidad.concede?.length ? habilidad.concede.map((nombre) => parseHabilidad(nombre, "regla")) : null;
  const listaConcede = concede ? (
    <>
      Concede{" "}
      {concede.map((una, indice) => (
        <span key={una.nombre}>
          {indice > 0 ? ", " : ""}
          {onAbrir ? (
            <button type="button" className="regla-mencion" onClick={() => onAbrir(una)}>
              {una.etiqueta}
            </button>
          ) : (
            una.etiqueta
          )}
        </span>
      ))}
    </>
  ) : null;

  return (
    <div className="scard-frame">
      <article className={`scard${densidadScard(texto, habilidad.concede?.length ? `Concede ${habilidad.concede.join(", ")}` : null)}`}>
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
              <p className="scard-efecto">
                <TextoConReferencias texto={texto} glosario={glosario} onAbrir={onAbrir} propio={habilidad.nombre} />
              </p>
              {listaConcede ? <p className="scard-concede">{listaConcede}</p> : null}
            </div>
          ) : listaConcede ? (
            <div>
              <p className="scard-efecto">{listaConcede}.</p>
            </div>
          ) : (
            <p className="scard-efecto scard-sin-texto">
              No hay texto para esta regla, ni en los libros de faccion ni en el reglamento basico.
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
