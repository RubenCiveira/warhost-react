import type { CatalogRule } from "../api/catalog";
import { resaltarMenciones } from "../lib/reglas";
import type { Habilidad } from "../lib/reglas";

/**
 * El texto libre de una carta (regla, hechizo o equipo), con las menciones a
 * otras reglas —"gets AP(+4)", "counts as having Bane"— marcadas como
 * referencia pulsable: la misma referencia cruzada que ya se ofrece con los
 * chips de una unidad, pero dentro de la prosa en vez de en una lista aparte.
 *
 * Sin glosario o sin `onAbrir` el texto sale tal cual: sin saber que reglas
 * existen no hay nada que enlazar, y sin gestor de apertura no hay a donde
 * llevar el click.
 */
export default function TextoConReferencias({
  texto,
  glosario,
  onAbrir,
  propio,
}: {
  texto: string | null | undefined;
  glosario?: Map<string, CatalogRule>;
  onAbrir?: (habilidad: Habilidad) => void;
  propio?: string;
}) {
  if (!texto) return null;
  if (!glosario || glosario.size === 0 || !onAbrir) return <>{texto}</>;

  return (
    <>
      {resaltarMenciones(texto, glosario, propio).map((parte, indice) =>
        typeof parte === "string" ? (
          <span key={indice}>{parte}</span>
        ) : (
          <button
            key={indice}
            type="button"
            className="regla-mencion"
            title={`Ver ${parte.nombre}`}
            onClick={() => onAbrir(parte)}
          >
            {parte.etiqueta}
          </button>
        ),
      )}
    </>
  );
}
