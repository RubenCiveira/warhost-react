import { useMemo, useState } from "react";
import { byThreshold, parseSpells } from "../lib/spells";

/**
 * Tabla de hechizos de una faccion, agrupada por umbral. Lleva buscador porque
 * en mesa se busca por nombre o por lo que hace, no leyendo la lista entera.
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
    <section className="card">
      <div className="spread">
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
            <dl className="spell-list">
              {list.map((spell) => (
                <div key={spell.key} className="spell">
                  <dt>{spell.name}</dt>
                  <dd className="small">{spell.effect}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))
      )}
    </section>
  );
}
