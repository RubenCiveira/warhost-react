import type { CatalogRule } from "../api/catalog";
import type { Spell } from "../lib/spells";
import type { Habilidad } from "../lib/reglas";
import { densidadScard } from "../lib/cardDensity";
import TextoConReferencias from "./TextoConReferencias";

/**
 * Hechizo como carta Mini Euro vertical, 44 x 68 mm.
 *
 * Es la misma piel que la ficha de unidad pero de pie, porque lo que lleva es
 * distinto: no hay perfil ni tabla, solo un valor y un efecto. En vertical el
 * texto cae en una columna comoda y el valor manda desde la cabecera, que es
 * como se busca un hechizo en mesa.
 */
export default function SpellCard({
  spell,
  faction,
  glosario,
  onAbrir,
}: {
  spell: Spell;
  faction?: string | null;
  /** Con esto, las menciones a otras reglas en el efecto se abren como referencia cruzada. */
  glosario?: Map<string, CatalogRule>;
  onAbrir?: (habilidad: Habilidad) => void;
}) {
  return (
    <div className="scard-frame">
      <article className={`scard${densidadScard(spell.effect)}`}>
        <header className="scard-head">
          <h3 className="scard-title">{spell.name}</h3>
          <div className="scard-valor">
            <span className="scard-valor-key">Valor</span>
            <span className="scard-valor-num">{spell.threshold}+</span>
          </div>
        </header>

        <div className="scard-body">
          <p className="scard-efecto">
            <TextoConReferencias texto={spell.effect} glosario={glosario} onAbrir={onAbrir} />
          </p>
        </div>

        <footer className="scard-foot">
          {faction ? <span className="scard-faccion">{faction}</span> : null}
          <span className="scard-tirada">Tira 1D6: iguala o supera {spell.threshold}</span>
        </footer>
      </article>
    </div>
  );
}
