import { useEffect, useMemo, useState } from "react";
import { filterRules, listRules } from "../api/content";
import type { GameSystemId, Setting } from "../lib/gameSystems";
import type { Rule } from "../lib/types";
import { errorMessage } from "../lib/format";
import { ErrorBanner, Spinner } from "./ui";

/** Buscador de reglas reutilizable: pagina de consulta y panel dentro de la partida. */
export default function RulesPanel({
  setting,
  gameSystem,
  compact = false,
}: {
  setting: Setting;
  gameSystem?: GameSystemId;
  compact?: boolean;
}) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listRules(setting)
      .then((rows) => !cancelled && (setRules(rows), setError(null)))
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [setting]);

  const matches = useMemo(() => filterRules(rules, search, gameSystem), [rules, search, gameSystem]);

  const byCategory = useMemo(() => {
    const groups = new Map<string, Rule[]>();
    for (const rule of matches) {
      const list = groups.get(rule.category) ?? [];
      list.push(rule);
      groups.set(rule.category, list);
    }
    return [...groups.entries()];
  }, [matches]);

  return (
    <div className="stack">
      <input
        type="search"
        placeholder="Buscar regla, palabra clave o categoria…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ErrorBanner error={error} />
      {loading ? (
        <Spinner />
      ) : matches.length === 0 ? (
        <p className="muted small">
          Sin resultados. Las reglas se cargan en la tabla <code>rules</code> del backend.
        </p>
      ) : (
        byCategory.map(([category, items]) => (
          <section key={category}>
            <h3 className="muted small">{category}</h3>
            <div className="stack" style={{ gap: 6 }}>
              {items.map((rule) => {
                const open = openId === rule.$id;
                return (
                  <article key={rule.$id} className="card" style={{ padding: compact ? 10 : 14 }}>
                    <button
                      type="button"
                      className="ghost"
                      style={{ width: "100%", textAlign: "left", border: "none", padding: 0 }}
                      onClick={() => setOpenId(open ? null : rule.$id)}
                      aria-expanded={open}
                    >
                      <span className="spread">
                        <strong>{rule.title}</strong>
                        <span className="muted small">{open ? "−" : "+"}</span>
                      </span>
                    </button>
                    {open ? (
                      <>
                        <p className="rule-body small" style={{ marginTop: 8, marginBottom: 0 }}>
                          {rule.body}
                        </p>
                        {rule.sourceUrl ? (
                          <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
                            <a href={rule.sourceUrl} target="_blank" rel="noreferrer">
                              Fuente
                            </a>
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
