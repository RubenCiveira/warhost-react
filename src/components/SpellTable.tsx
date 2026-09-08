import { useMemo, useState } from "react";
import { byThreshold, parseSpells } from "../lib/spells";

/**
 * Hechizos de una faccion, cada uno como una carta, agrupados por umbral: en
 * mesa la pregunta es "que puedo lanzar con lo que me queda", asi que el valor
 * manda sobre el nombre.
 *
 * Comparte la estetica de UnitCard, pero no su estructura: un hechizo no tiene
 * tabla de armas ni opciones, solo un valor y un efecto.
 */
export default function SpellTable({ spells }: { spells: string | null }) {
  const [search, setSearch] = useState("");
  const all = useMemo(() => parseSpells(spells), [spells]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (spell) => spell.name.toLowerCase().includes(needle) || spell.effect.toLowerCase().includes(needle),
    );
  }, [all, search]);

  if (all.length === 0) return null;

  const groups = byThreshold(visible);

  return (
    <section style={{ marginTop: 28 }}>
      <div className="spread" style={{ marginBottom: 4 }}>
        <h2>Hechizos ({all.length})</h2>
        <input
          type="search"
          className="inline-search"
          placeholder="Buscar hechizo…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <p className="small muted">
        Tira 1D6 al lanzar: hay que igualar o superar el valor del hechizo. Los efectos ya estan ajustados a este modo
        de juego.
      </p>

      {groups.length === 0 ? (
        <p className="muted">Ningun hechizo coincide con la busqueda.</p>
      ) : (
        groups.map(([threshold, list]) => (
          <div key={threshold} className="spell-group">
            <h3 className="spell-threshold">
              Valor {threshold}+ <span className="muted small">({list.length})</span>
            </h3>
            <div className="ucard-grid spell-grid">
              {list.map((spell) => (
                <article key={spell.key} className="ucard ucard-spell">
                  <header className="ucard-head">
                    <h4 className="ucard-title">{spell.name}</h4>
                    <div className="ucard-stats">
                      <div className="ucard-stat">
                        <span className="ucard-stat-key">Valor</span>
                        <span className="ucard-stat-value">{spell.threshold}+</span>
                      </div>
                    </div>
                  </header>
                  <div className="ucard-body">
                    <p className="ucard-effect">{spell.effect}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
