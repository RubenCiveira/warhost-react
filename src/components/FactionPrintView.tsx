import { useMemo, useState } from "react";
import { catalogImageUrl, groupImages, pickCover, pickImageByType, targetKeyFor } from "../api/catalog";
import type { ArmyBook, ArmyUnit, CatalogImage, CatalogRule } from "../api/catalog";
import { sectionsForUnit } from "../lib/builder";
import type { UpgradeSection } from "../lib/builder";
import type { ResolvedUnit } from "../lib/armyForgeResolve";
import { baseLoadout } from "../lib/loadout";
import { agruparUnidades } from "../lib/unidades";
import { puedeTenerCaster } from "../lib/faccion";
import { parseSpells, reglasMencionadasEnHechizos } from "../lib/spells";
import { FichaOpcionesLibro, FichaUnidadLibro } from "./ArmyPrintView";
import LoreText from "./LoreText";
import SpellCard from "./SpellCard";
import RuleCard from "./RuleCard";
import { parseHabilidad } from "../lib/reglas";

function unidadResuelta(unit: ArmyUnit): ResolvedUnit {
  return {
    name: unit.name,
    unitKey: unit.unitId,
    bookKey: unit.bookKey,
    size: unit.size,
    quality: unit.quality,
    defense: unit.defense,
    maxWounds: 1,
    cost: unit.cost,
    rules: unit.rules,
    loadout: baseLoadout(unit.weapons, unit.items),
    upgrades: [],
    unresolvedUpgrades: 0,
    sortOrder: unit.sortOrder,
  };
}

export default function FactionPrintView({
  book,
  units,
  images,
  packages,
  glosario,
  onCerrar,
}: {
  book: ArmyBook;
  units: ArmyUnit[];
  images: CatalogImage[];
  packages: Map<string, UpgradeSection[]>;
  glosario: Map<string, CatalogRule>;
  onCerrar: () => void;
}) {
  const unidadesOrdenadas = useMemo(() => agruparUnidades(units).flatMap((grupo) => grupo.unidades), [units]);
  const byTarget = useMemo(() => groupImages(images), [images]);
  const factionCover = pickCover(byTarget.get(targetKeyFor(book.$id))?.filter((image) => (image.imageType ?? "gallery") === "gallery"));
  const coverUrl = factionCover ? catalogImageUrl(factionCover.fileId) : book.coverImagePath;
  const hechizos = useMemo(() => parseSpells(book.spells ?? null), [book.spells]);
  const imprimeHechizos = useMemo(
    () => hechizos.length > 0 && units.some((unit) => puedeTenerCaster(unit, sectionsForUnit(unit, packages))),
    [hechizos.length, packages, units],
  );
  const reglasDeHechizos = useMemo(
    () => (imprimeHechizos ? reglasMencionadasEnHechizos(glosario, hechizos) : []),
    [glosario, hechizos, imprimeHechizos],
  );
  const [portada, setPortada] = useState(true);
  const [incluirLore, setIncluirLore] = useState(true);

  return (
    <div className="print-vista print-faccion">
      <div className="print-toolbar">
        <button type="button" onClick={onCerrar}>
          Cancelar
        </button>
        <h2 className="print-toolbar-title">Imprimir {book.name}</h2>
        <button type="button" className="primary" onClick={() => window.print()}>
          Imprimir
        </button>
      </div>
      <div className="print-lore-opciones">
        <label className="row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={portada} onChange={(e) => setPortada(e.target.checked)} style={{ width: "auto" }} />
          <span>Portada con nombre e imagen</span>
        </label>
        {book.lore ? (
          <label className="row" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={incluirLore} onChange={(e) => setIncluirLore(e.target.checked)} style={{ width: "auto" }} />
            <span>Incluir el trasfondo de la faccion</span>
          </label>
        ) : null}
      </div>

      <div className="print-libro print-faccion-libro">
        <header className={portada ? "print-faccion-titulo print-faccion-portada" : "print-faccion-titulo"}>
          <h1>{book.name}</h1>
          {portada && coverUrl ? <img className="print-faccion-cover" src={coverUrl} alt="" /> : null}
        </header>
        {incluirLore && book.lore ? (
          <div className="print-faccion-lore-pagina">
            <LoreText text={book.lore} className="print-faccion-lore" />
          </div>
        ) : null}
        {unidadesOrdenadas.map((unit) => {
          const sections = sectionsForUnit(unit, packages);
          const miniatura = pickImageByType(byTarget.get(targetKeyFor(book.$id, unit.unitId)), "miniature");
          const puedeLanzarHechizos = () => puedeTenerCaster(unit, sections);
          return (
            <div key={unit.$id} className="army-slide print-faccion-unidad">
              <FichaUnidadLibro
                unit={unidadResuelta(unit)}
                glosario={glosario}
                libro={book}
                lore={unit.lore}
                miniaturaUrl={miniatura ? catalogImageUrl(miniatura.fileId) : null}
                puedeLanzarHechizos={puedeLanzarHechizos}
              />
              <FichaOpcionesLibro nombre={unit.name} unitId={unit.unitId} sections={sections} glosario={glosario} />
            </div>
          );
        })}
        {imprimeHechizos ? (
          <section className="print-faccion-extra">
            <h2>Hechizos</h2>
            <div className="print-card-grid">
              {hechizos.map((spell) => (
                <SpellCard key={spell.key} spell={spell} faction={book.factionName ?? book.name} glosario={glosario} />
              ))}
              {reglasDeHechizos.map((regla) => (
                <RuleCard key={regla.$id} habilidad={parseHabilidad(regla.name, "regla")} regla={regla} glosario={glosario} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
