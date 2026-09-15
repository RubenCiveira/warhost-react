import { densidadScard } from "../lib/cardDensity";
import TextoConReferencias from "./TextoConReferencias";
import type { CatalogRule } from "../api/catalog";
import type { Habilidad } from "../lib/reglas";

export interface HeroSkillCardData {
  name: string;
  description: string;
  className: string;
  levelLabel: string;
  statLabel: string;
}

export default function HeroSkillCard({
  skill,
  glosario,
  onAbrir,
}: {
  skill: HeroSkillCardData;
  glosario?: Map<string, CatalogRule>;
  onAbrir?: (habilidad: Habilidad) => void;
}) {
  return (
    <div className="scard-frame">
      <article className={`scard${densidadScard(skill.description)}`}>
        <header className="scard-head">
          <h3 className="scard-title">{skill.name}</h3>
          <div className="scard-valor">
            <span className="scard-valor-key">Req.</span>
            <span className="scard-valor-num">{skill.statLabel}</span>
          </div>
        </header>

        <div className="scard-body">
          <p className="scard-efecto">
            <TextoConReferencias texto={skill.description} glosario={glosario} onAbrir={onAbrir} propio={skill.name} />
          </p>
        </div>

        <footer className="scard-foot">
          <span className="scard-faccion">{skill.className}</span>
          <span className="scard-tirada">{skill.levelLabel}</span>
        </footer>
      </article>
    </div>
  );
}
