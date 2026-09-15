import { useState } from "react";
import type { HeroClass, HeroSkill, HeroSkillStat } from "../lib/types";
import { parseHeroSkills } from "../lib/types";
import {
  HERO_ABILITY_CHOICES,
  HERO_ABILITY_LABEL,
  HERO_COMBAT_STAT_CHOICES,
  HERO_COMBAT_STAT_LABEL,
} from "../lib/questHero";
import type { HeroAbilityChoice, HeroCombatStatChoice } from "../lib/questHero";

const STAT_LABEL: Record<HeroSkillStat, string> = {
  strength: "Str",
  dexterity: "Dex",
  willpower: "Wil",
};

/** Dos huecos fijos: es lo que trae cada clase real en Army Forge. */
const HUECOS_INICIALES = [0, 1] as const;

const TIER_LABEL: Record<HeroSkill["tier"], string> = {
  0: "Habilidades iniciales",
  1: "Nivel 2",
  2: "Nivel 5",
  3: "Nivel 9",
};

function porTier(skills: HeroSkill[]): [HeroSkill["tier"], HeroSkill[]][] {
  const grupos = new Map<HeroSkill["tier"], HeroSkill[]>();
  for (const skill of skills) {
    const lista = grupos.get(skill.tier) ?? [];
    lista.push(skill);
    grupos.set(skill.tier, lista);
  }
  return ([0, 1, 2, 3] as const)
    .filter((tier) => grupos.has(tier))
    .map((tier) => [tier, grupos.get(tier)!.sort((a, b) => a.sortOrder - b.sortOrder)]);
}

/**
 * Una clase de heroe de Quest (o su set de habilidades comunes, con
 * `classKey === "default"`), transcrita a mano del reglamento. El mismo
 * patron que las cartas de mision: quien lleve la etiqueta `editor` corrige el
 * texto sin salir de la tarjeta.
 */
export default function HeroClassCard({
  heroClass,
  puedeEditar = false,
  onGuardar,
}: {
  heroClass: HeroClass;
  puedeEditar?: boolean;
  onGuardar?: (cambios: Partial<HeroClass>) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrador, setBorrador] = useState(() => ({
    name: heroClass.name,
    description: heroClass.description ?? "",
    classFeatName: heroClass.classFeatName ?? "",
    classFeatText: heroClass.classFeatText ?? "",
    skills: parseHeroSkills(heroClass.skills),
    abilityChoices: heroClass.abilityChoices ?? [],
    combatStatChoices: heroClass.combatStatChoices ?? [],
    skillChoices: heroClass.skillChoices ?? [],
  }));

  function actualizarSkill(index: number, cambios: Partial<HeroSkill>) {
    setBorrador((previo) => ({
      ...previo,
      skills: previo.skills.map((skill, i) => (i === index ? { ...skill, ...cambios } : skill)),
    }));
  }

  /**
   * Cambia el hueco `index` de una de las listas de elecciones iniciales.
   * Los huecos vacios ("— ninguna —") se guardan como cadena vacia y se
   * descartan al guardar, no se recolocan los demas huecos.
   */
  function actualizarEleccion(lista: "abilityChoices" | "combatStatChoices" | "skillChoices", index: number, valor: string) {
    setBorrador((previo) => {
      const siguiente = [...previo[lista]];
      while (siguiente.length <= index) siguiente.push("");
      siguiente[index] = valor;
      return { ...previo, [lista]: siguiente };
    });
  }

  async function guardar() {
    if (!onGuardar) return;
    setGuardando(true);
    try {
      await onGuardar({
        name: borrador.name.trim() || heroClass.name,
        description: borrador.description.trim() || null,
        classFeatName: borrador.classFeatName.trim() || null,
        classFeatText: borrador.classFeatText.trim() || null,
        skills: JSON.stringify(borrador.skills),
        abilityChoices: borrador.abilityChoices.filter(Boolean),
        combatStatChoices: borrador.combatStatChoices.filter(Boolean),
        skillChoices: borrador.skillChoices.filter(Boolean),
      });
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  }

  const skills = editando ? borrador.skills : parseHeroSkills(heroClass.skills);
  const esDefault = heroClass.classKey === "default";

  return (
    <article className="card">
      <header className="spread">
        {editando ? (
          <input
            value={borrador.name}
            aria-label="Nombre de la clase"
            onChange={(event) => setBorrador({ ...borrador, name: event.target.value })}
          />
        ) : (
          <h3 style={{ margin: 0 }}>{heroClass.name}</h3>
        )}
        {puedeEditar && onGuardar && !editando ? (
          <button type="button" className="ghost tiny" onClick={() => setEditando(true)}>
            Corregir
          </button>
        ) : null}
      </header>

      {editando ? (
        <textarea
          value={borrador.description}
          aria-label="Descripcion de la clase"
          style={{ width: "100%", marginTop: 8 }}
          onChange={(event) => setBorrador({ ...borrador, description: event.target.value })}
        />
      ) : heroClass.description ? (
        <p className="muted small" style={{ fontStyle: "italic", marginTop: 8 }}>
          {heroClass.description}
        </p>
      ) : null}

      {!esDefault && (heroClass.classFeatName || editando) ? (
        <div className="card" style={{ background: "var(--surface-2)", marginTop: 12 }}>
          {editando ? (
            <div className="stack" style={{ gap: 6 }}>
              <input
                value={borrador.classFeatName}
                aria-label="Nombre del feat de clase"
                placeholder="Feat de clase"
                onChange={(event) => setBorrador({ ...borrador, classFeatName: event.target.value })}
              />
              <textarea
                value={borrador.classFeatText}
                aria-label="Texto del feat de clase"
                onChange={(event) => setBorrador({ ...borrador, classFeatText: event.target.value })}
              />
            </div>
          ) : (
            <p style={{ margin: 0 }}>
              <strong>{heroClass.classFeatName}: </strong>
              {heroClass.classFeatText}
            </p>
          )}
        </div>
      ) : null}

      {!esDefault && (editando || heroClass.abilityChoices?.length || heroClass.combatStatChoices?.length) ? (
        <div className="card" style={{ background: "var(--surface-2)", marginTop: 12 }}>
          <h4 className="muted small" style={{ margin: "0 0 6px" }}>
            Al crear el heroe (gratis, sin subir de nivel)
          </h4>
          {editando ? (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 6 }}>
                {HUECOS_INICIALES.map((hueco) => (
                  <select
                    key={hueco}
                    value={borrador.abilityChoices[hueco] ?? ""}
                    aria-label={`Mejora de atributo ${hueco + 1}`}
                    onChange={(event) => actualizarEleccion("abilityChoices", hueco, event.target.value)}
                  >
                    <option value="">— ningun atributo —</option>
                    {HERO_ABILITY_CHOICES.map((opcion) => (
                      <option key={opcion} value={opcion}>
                        {HERO_ABILITY_LABEL[opcion as HeroAbilityChoice]}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
              <div className="row" style={{ gap: 6 }}>
                {HUECOS_INICIALES.map((hueco) => (
                  <select
                    key={hueco}
                    value={borrador.combatStatChoices[hueco] ?? ""}
                    aria-label={`Mejora de combate ${hueco + 1}`}
                    onChange={(event) => actualizarEleccion("combatStatChoices", hueco, event.target.value)}
                  >
                    <option value="">— ninguna mejora de combate —</option>
                    {HERO_COMBAT_STAT_CHOICES.map((opcion) => (
                      <option key={opcion} value={opcion}>
                        {HERO_COMBAT_STAT_LABEL[opcion as HeroCombatStatChoice]}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
              <div className="row" style={{ gap: 6 }}>
                {HUECOS_INICIALES.map((hueco) => (
                  <select
                    key={hueco}
                    value={borrador.skillChoices[hueco] ?? ""}
                    aria-label={`Habilidad inicial ${hueco + 1}`}
                    onChange={(event) => actualizarEleccion("skillChoices", hueco, event.target.value)}
                  >
                    <option value="">— ninguna habilidad inicial —</option>
                    {borrador.skills.map((skill) => (
                      <option key={skill.name} value={skill.name}>
                        {skill.name}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            </div>
          ) : (
            <p className="small" style={{ margin: 0 }}>
              {[
                ...(heroClass.abilityChoices ?? []).map((c) => HERO_ABILITY_LABEL[c as HeroAbilityChoice] ?? c),
                ...(heroClass.combatStatChoices ?? []).map((c) => HERO_COMBAT_STAT_LABEL[c as HeroCombatStatChoice] ?? c),
                ...(heroClass.skillChoices ?? []),
              ].join(" · ") || "Sin elecciones iniciales todavia."}
            </p>
          )}
        </div>
      ) : null}

      <div className="stack" style={{ marginTop: 12, gap: 10 }}>
        {porTier(skills).map(([tier, tierSkills]) => (
          <section key={tier}>
            <h4 className="muted small" style={{ margin: "0 0 6px" }}>
              {TIER_LABEL[tier]}
            </h4>
            <div className="stack" style={{ gap: 6 }}>
              {tierSkills.map((skill) => {
                const index = skills.indexOf(skill);
                return editando ? (
                  <div key={index} className="row" style={{ alignItems: "flex-start" }}>
                    <span className="tag" style={{ marginTop: 6 }}>
                      {STAT_LABEL[skill.stat]}
                    </span>
                    <div className="stack" style={{ flex: 1, gap: 4 }}>
                      <input
                        value={skill.name}
                        aria-label="Nombre de la habilidad"
                        onChange={(event) => actualizarSkill(index, { name: event.target.value })}
                      />
                      <textarea
                        value={skill.description}
                        aria-label="Texto de la habilidad"
                        onChange={(event) => actualizarSkill(index, { description: event.target.value })}
                      />
                    </div>
                  </div>
                ) : (
                  <p key={index} className="small" style={{ margin: 0 }}>
                    <span className="tag" style={{ marginRight: 6 }}>
                      {STAT_LABEL[skill.stat]}
                    </span>
                    <strong>{skill.name}</strong>: {skill.description}
                  </p>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {editando ? (
        <footer className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
          <button type="button" className="tiny" disabled={guardando} onClick={() => setEditando(false)}>
            Cancelar
          </button>
          <button type="button" className="tiny primary" disabled={guardando} onClick={() => void guardar()}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </footer>
      ) : null}
    </article>
  );
}
