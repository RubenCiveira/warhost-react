import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useGameSystem } from "../../context/GameSystemContext";
import { armyNounFor, getGameSystem } from "../../lib/gameSystems";
import {
  catalogImageUrl,
  deleteCatalogImage,
  getBook,
  groupImages,
  listBookImages,
  listUnits,
  listUpgradePackages,
  listRuleGlossary,
  pickImageByType,
  setPrimaryImage,
  targetKeyFor,
  updateUnitLore,
  uploadCatalogImage,
} from "../../api/catalog";
import type { ArmyBook, ArmyUnit, CatalogImage, CatalogImageType, CatalogRule } from "../../api/catalog";
import { errorMessage } from "../../lib/format";
import { EmptyState, ErrorBanner, PageHead, Spinner } from "../../components/ui";
import ImageUploader from "../../components/ImageUploader";
import FactionPrintView from "../../components/FactionPrintView";
import UnitCard from "../../components/UnitCard";
import { sectionsForUnit } from "../../lib/builder";
import { baseLoadout } from "../../lib/loadout";
import SpellCard from "../../components/SpellCard";
import RuleCardModal from "../../components/RuleCardModal";
import type { Habilidad } from "../../lib/reglas";
import { parseHabilidad } from "../../lib/reglas";
import RuleCard from "../../components/RuleCard";
import { equipoDeFaccion, habilidadesDeFaccion, reglasGeneralesDeFaccion } from "../../lib/faccion";
import { agruparUnidades } from "../../lib/unidades";
import Tabs from "../../components/Tabs";
import { parseSpells } from "../../lib/spells";
import type { UpgradeSection } from "../../lib/builder";

function UnitLoreEditor({
  unit,
  busy,
  onSave,
}: {
  unit: ArmyUnit;
  busy: boolean;
  onSave: (unit: ArmyUnit, lore: string) => Promise<void>;
}) {
  const [lore, setLore] = useState(unit.lore ?? "");

  useEffect(() => {
    setLore(unit.lore ?? "");
  }, [unit.lore]);

  return (
    <div className="unit-lore-editor">
      <label htmlFor={`lore-${unit.$id}`}>Descripcion de la unidad</label>
      <textarea
        id={`lore-${unit.$id}`}
        value={lore}
        rows={4}
        maxLength={4000}
        disabled={busy}
        placeholder="Trasfondo breve, notas de ambientacion o descripcion visual."
        onChange={(event) => setLore(event.target.value)}
      />
      <button type="button" className="tiny" disabled={busy || lore === (unit.lore ?? "")} onClick={() => void onSave(unit, lore)}>
        Guardar descripcion
      </button>
    </div>
  );
}

/** Ficha de una faccion: sus imagenes y las de cada tipo de unidad. */
export default function CatalogBook() {
  const { bookKey = "" } = useParams();
  const { user, editor } = useAuth();
  const { system } = useGameSystem();
  const [book, setBook] = useState<ArmyBook | null>(null);
  const [units, setUnits] = useState<ArmyUnit[]>([]);
  const [images, setImages] = useState<CatalogImage[]>([]);
  const [packages, setPackages] = useState<Map<string, UpgradeSection[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [pestana, setPestana] = useState<"unidades" | "hechizos" | "habilidades" | "equipo" | "generales">("unidades");
  const [verGenerales, setVerGenerales] = useState(false);
  const [imprimir, setImprimir] = useState(false);
  const [glosario, setGlosario] = useState<Map<string, CatalogRule>>(new Map());
  const [habilidad, setHabilidad] = useState<Habilidad | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedBook, loadedUnits, loadedImages, loadedPackages] = await Promise.all([
        getBook(bookKey),
        listUnits(bookKey),
        listBookImages(bookKey),
        listUpgradePackages(bookKey),
      ]);
      setBook(loadedBook);
      // El glosario no bloquea la ficha: sin el, los chips siguen ahi y solo se
      // quedan sin descripcion.
      listRuleGlossary(loadedBook.gameSystem)
        .then((g) => setGlosario(g))
        .catch(() => undefined);
      setUnits(loadedUnits);
      setImages(loadedImages);
      setPackages(loadedPackages);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [bookKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const byTarget = useMemo(() => groupImages(images), [images]);
  // Cada faccion existe una vez por modo de juego, y su contenido difiere.
  const bookSystem = getGameSystem(book?.gameSystem);
  const hechizos = useMemo(() => parseSpells(book?.spells ?? null), [book]);
  const habilidades = useMemo(() => habilidadesDeFaccion(book, glosario, units), [book, glosario, units]);
  const equipo = useMemo(() => equipoDeFaccion(units), [units]);
  const generales = useMemo(
    () => reglasGeneralesDeFaccion(glosario, units, habilidades),
    [glosario, units, habilidades],
  );

  const upload = useCallback(
    async (files: File[], caption: string, imageType: CatalogImageType, unit?: ArmyUnit) => {
      if (!book || !user) return;
      setBusy(true);
      try {
        // En serie a proposito: son ficheros grandes y subirlos todos a la vez
        // satura la conexion sin ganar nada.
        for (const file of files) {
          await uploadCatalogImage(file, { scope: unit ? "unit" : "faction", book, unit, imageType }, user, caption);
        }
        setImages(await listBookImages(bookKey));
      } finally {
        setBusy(false);
      }
    },
    [book, bookKey, user],
  );

  async function saveLore(unit: ArmyUnit, lore: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateUnitLore(unit, lore);
      setUnits((prev) => prev.map((candidate) => (candidate.$id === updated.$id ? updated : candidate)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(image: CatalogImage) {
    setBusy(true);
    setError(null);
    try {
      await deleteCatalogImage(image);
      setImages((prev) => prev.filter((candidate) => candidate.$id !== image.$id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function makePrimary(image: CatalogImage) {
    setBusy(true);
    setError(null);
    try {
      await setPrimaryImage(image, byTarget.get(image.targetKey) ?? []);
      setImages(await listBookImages(bookKey));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function gallery(targetKey: string, fallback?: string | null) {
    const list = (byTarget.get(targetKey) ?? []).filter((image) => (image.imageType ?? "gallery") === "gallery");
    if (list.length === 0) {
      return fallback ? <img className="thumb" src={fallback} alt="" loading="lazy" /> : null;
    }
    return (
      <div className="gallery">
        {list.map((image) => (
          <figure key={image.$id} className={image.isPrimary ? "shot primary" : "shot"}>
            <img src={catalogImageUrl(image.fileId)} alt={image.caption ?? ""} loading="lazy" />
            <figcaption className="small muted">
              {image.caption ? <span>{image.caption}</span> : null}
              <span className="by">{image.uploadedByName}</span>
              {editor ? (
                <span className="row">
                  {!image.isPrimary ? (
                    <button type="button" className="ghost tiny" disabled={busy} onClick={() => void makePrimary(image)}>
                      Principal
                    </button>
                  ) : null}
                  <button type="button" className="ghost tiny danger" disabled={busy} onClick={() => void remove(image)}>
                    Borrar
                  </button>
                </span>
              ) : null}
            </figcaption>
          </figure>
        ))}
      </div>
    );
  }

  if (loading) return <Spinner />;
  if (!book) {
    return (
      <>
        <ErrorBanner error={error ?? "No se ha encontrado esta faccion."} />
        <Link to="/facciones">Volver a facciones</Link>
      </>
    );
  }

  if (imprimir) {
    return (
      <FactionPrintView
        book={book}
        units={units}
        images={images}
        packages={packages}
        glosario={glosario}
        onCerrar={() => setImprimir(false)}
      />
    );
  }

  return (
    <>
      <PageHead
        title={book.name}
        sub={
          `${bookSystem?.name ?? book.gameSystem} · ${units.length} unidades` +
          (book.versionString ? ` · version ${book.versionString}` : "")
        }
        actions={
          <>
            <button type="button" onClick={() => setImprimir(true)}>
              Imprimir faccion
            </button>
            <Link to={`/facciones/${book.$id}/crear`} className="button-link">
              Crear {armyNounFor(bookSystem).singular}
            </Link>
            <Link to="/facciones">Volver</Link>
          </>
        }
      />
      <ErrorBanner error={error} />
      {system && system.id !== book.gameSystem ? (
        <div className="banner">
          Estas viendo la version de <strong>{bookSystem?.name ?? book.gameSystem}</strong> de esta faccion, pero tienes
          seleccionado {system.name}. Las unidades, los costes y los hechizos cambian entre modos.{" "}
          <Link to="/facciones">Ver las facciones de {system.name}</Link>.
        </div>
      ) : null}
      {habilidad ? (
        <RuleCardModal habilidad={habilidad} glosario={glosario} onCerrar={() => setHabilidad(null)} onAbrir={setHabilidad} />
      ) : null}

      {editor ? null : (
        <p className="muted small">
          Las imagenes y textos del catalogo los mantienen los editores. Si quieres aportar algo, pideselo a uno.
        </p>
      )}

      {book.hint ? <p className="muted small">{book.hint}</p> : null}
      {gallery(targetKeyFor(book.$id), book.coverImagePath)}
      {book.lore ? <p className="faction-lore">{book.lore}</p> : null}
      {editor ? (
        <ImageUploader
          label={`Anadir imagen de ${book.name}`}
          busy={busy}
          imageType="gallery"
          onUpload={(files, caption, imageType) => upload(files, caption, imageType)}
        />
      ) : null}

      <Tabs
        value={pestana}
        onChange={setPestana}
        items={[
          { id: "unidades", label: "Unidades", count: units.length },
          { id: "habilidades", label: "Habilidades", count: habilidades.length },
          { id: "equipo", label: "Equipo", count: equipo.length },
          { id: "hechizos", label: "Hechizos", count: hechizos.length },
          ...(verGenerales
            ? [{ id: "generales" as const, label: "Reglas generales", count: generales.length }]
            : []),
        ]}
      />
      <label className="row" style={{ cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={verGenerales}
          onChange={(e) => {
            setVerGenerales(e.target.checked);
            if (!e.target.checked && pestana === "generales") setPestana("unidades");
          }}
          style={{ width: "auto" }}
        />
        <span>Ver reglas generales</span>
      </label>

      {pestana === "habilidades" ? (
        habilidades.length === 0 ? (
          <EmptyState title="Esta faccion no publica reglas propias">
            <p className="muted">Sus unidades usan solo reglas del reglamento basico.</p>
          </EmptyState>
        ) : (
          <>
            <p className="small muted">
              Reglas que publica {book.name}. Las del reglamento basico —Fast, Hero, Impact— no salen aqui porque no
              son suyas.
            </p>
            <div className="army-strip">
              {habilidades.map((regla) => (
                <div key={regla.$id} className="army-slide">
                  <RuleCard
                    habilidad={parseHabilidad(regla.name, "regla")}
                    regla={regla}
                    glosario={glosario}
                    onAbrir={setHabilidad}
                  />
                </div>
              ))}
            </div>
          </>
        )
      ) : pestana === "equipo" ? (
        equipo.length === 0 ? (
          <EmptyState title="Ninguna unidad de esta faccion lleva equipo" />
        ) : (
          <>
            <p className="small muted">
              Equipo que llevan de serie las unidades de {book.name}.
            </p>
            <div className="army-strip">
              {equipo.map((pieza) => (
                <div key={pieza.habilidad.nombre} className="army-slide">
                  <RuleCard
                    habilidad={pieza.habilidad}
                    regla={glosario.get(pieza.habilidad.nombre.toLowerCase())}
                    lleva={pieza.unidades}
                    glosario={glosario}
                    onAbrir={setHabilidad}
                  />
                </div>
              ))}
            </div>
          </>
        )
      ) : pestana === "hechizos" ? (
        hechizos.length === 0 ? (
          <EmptyState title="Esta faccion no tiene hechizos" />
        ) : (
          <>
            <p className="small muted">
              Tira 1D6 al lanzar: hay que igualar o superar el valor. Los efectos ya estan ajustados a este modo de
              juego.
            </p>
            <div className="army-strip">
              {hechizos.map((hechizo) => (
                <div key={hechizo.key} className="army-slide">
                  <SpellCard
                    spell={hechizo}
                    faction={book.factionName ?? book.name}
                    glosario={glosario}
                    onAbrir={setHabilidad}
                  />
                </div>
              ))}
            </div>
          </>
        )
      ) : pestana === "generales" ? (
        generales.length === 0 ? (
          <EmptyState title="No hay reglas del reglamento basico que mostrar">
            <p className="muted">
              O sus unidades solo usan reglas propias, o el glosario todavia no ha cargado.
            </p>
          </EmptyState>
        ) : (
          <>
            <p className="small muted">
              Reglas del reglamento basico que usan las unidades de {book.name} y sus armas.
            </p>
            <div className="army-strip">
              {generales.map((regla) => (
                <div key={regla.$id} className="army-slide">
                  <RuleCard
                    habilidad={parseHabilidad(regla.name, "regla")}
                    regla={regla}
                    glosario={glosario}
                    onAbrir={setHabilidad}
                  />
                </div>
              ))}
            </div>
          </>
        )
      ) : units.length === 0 ? (
        <EmptyState title="Esta faccion todavia no tiene unidades sincronizadas" />
      ) : (
        <div className="army-column">
          {agruparUnidades(units).map((seccion) => (
            <section key={seccion.grupo} className="army-group">
              <h3 className="army-group-sep">
                {seccion.etiqueta}
                <span className="army-group-count">{seccion.unidades.length}</span>
              </h3>
              {seccion.unidades.map((unit) => {
                const avatar = pickImageByType(byTarget.get(targetKeyFor(book.$id, unit.unitId)), "avatar");
                return (
                  <div key={unit.$id} className="army-slide">
                    <UnitCard
                      variant="catalogo"
                      formato="hoja"
                      glosario={glosario}
                      onHabilidad={setHabilidad}
                      avatarUrl={avatar ? catalogImageUrl(avatar.fileId) : null}
                      lore={unit.lore}
                      unitId={unit.unitId}
                      sections={sectionsForUnit(unit, packages)}
                      unit={{
                        name: unit.name,
                        size: unit.size,
                        quality: unit.quality,
                        defense: unit.defense,
                        cost: unit.cost,
                        rules: unit.rules,
                        loadout: baseLoadout(unit.weapons, unit.items),
                      }}
                      footer={
                        <>
                          {editor ? <UnitLoreEditor unit={unit} busy={busy} onSave={saveLore} /> : unit.lore ? <p>{unit.lore}</p> : null}
                          {gallery(targetKeyFor(book.$id, unit.unitId))}
                          {editor ? (
                            <ImageUploader
                              label={`Anadir imagenes de ${unit.name}`}
                              busy={busy}
                              onUpload={(files, caption, imageType) => upload(files, caption, imageType, unit)}
                            />
                          ) : null}
                        </>
                      }
                    />
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
