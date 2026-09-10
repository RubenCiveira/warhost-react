import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useGameSystem } from "../../context/GameSystemContext";
import { getGameSystem } from "../../lib/gameSystems";
import {
  catalogImageUrl,
  deleteCatalogImage,
  getBook,
  groupImages,
  listBookImages,
  listUnits,
  listUpgradePackages,
  listRuleGlossary,
  setPrimaryImage,
  targetKeyFor,
  uploadCatalogImage,
} from "../../api/catalog";
import type { ArmyBook, ArmyUnit, CatalogImage, CatalogRule } from "../../api/catalog";
import { errorMessage } from "../../lib/format";
import { EmptyState, ErrorBanner, PageHead, Spinner } from "../../components/ui";
import ImageUploader from "../../components/ImageUploader";
import UnitCard from "../../components/UnitCard";
import { sectionsForUnit } from "../../lib/builder";
import { baseLoadout } from "../../lib/loadout";
import SpellCard from "../../components/SpellCard";
import RuleCardModal from "../../components/RuleCardModal";
import type { Habilidad } from "../../lib/reglas";
import { parseHabilidad } from "../../lib/reglas";
import RuleCard from "../../components/RuleCard";
import { equipoDeFaccion, habilidadesDeFaccion } from "../../lib/faccion";
import Tabs from "../../components/Tabs";
import { parseSpells } from "../../lib/spells";
import type { UpgradeSection } from "../../lib/builder";

/** Ficha de una faccion: sus imagenes y las de cada tipo de unidad. */
export default function CatalogBook() {
  const { bookKey = "" } = useParams();
  const { user, admin } = useAuth();
  const { system } = useGameSystem();
  const [book, setBook] = useState<ArmyBook | null>(null);
  const [units, setUnits] = useState<ArmyUnit[]>([]);
  const [images, setImages] = useState<CatalogImage[]>([]);
  const [packages, setPackages] = useState<Map<string, UpgradeSection[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [pestana, setPestana] = useState<"unidades" | "hechizos" | "habilidades" | "equipo">("unidades");
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

  const upload = useCallback(
    async (files: File[], caption: string, unit?: ArmyUnit) => {
      if (!book || !user) return;
      setBusy(true);
      try {
        // En serie a proposito: son ficheros grandes y subirlos todos a la vez
        // satura la conexion sin ganar nada.
        for (const file of files) {
          await uploadCatalogImage(file, { scope: unit ? "unit" : "faction", book, unit }, user, caption);
        }
        setImages(await listBookImages(bookKey));
      } finally {
        setBusy(false);
      }
    },
    [book, bookKey, user],
  );

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
    const list = byTarget.get(targetKey) ?? [];
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
              {admin ? (
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
            <Link to={`/facciones/${book.$id}/crear`} className="button-link">
              Crear ejercito
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
        <RuleCardModal habilidad={habilidad} glosario={glosario} onCerrar={() => setHabilidad(null)} />
      ) : null}

      {admin ? null : (
        <p className="muted small">
          Las imagenes del catalogo las mantienen los administradores. Si quieres aportar alguna, pidesela a uno.
        </p>
      )}

      {book.hint ? <p className="muted small">{book.hint}</p> : null}

      <Tabs
        value={pestana}
        onChange={setPestana}
        items={[
          { id: "unidades", label: "Unidades", count: units.length },
          { id: "habilidades", label: "Habilidades", count: habilidades.length },
          { id: "equipo", label: "Equipo", count: equipo.length },
          { id: "hechizos", label: "Hechizos", count: hechizos.length },
        ]}
      />

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
                  <RuleCard habilidad={parseHabilidad(regla.name, "regla")} regla={regla} />
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
                  <SpellCard spell={hechizo} faction={book.factionName ?? book.name} />
                </div>
              ))}
            </div>
          </>
        )
      ) : units.length === 0 ? (
        <EmptyState title="Esta faccion todavia no tiene unidades sincronizadas" />
      ) : (
        <div className="army-strip">
          {units.map((unit) => (
            <div key={unit.$id} className="army-slide">
            <UnitCard
              variant="catalogo"
              formato="hoja"
              conTexto={new Set(glosario.keys())}
              onHabilidad={setHabilidad}
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
                  {gallery(targetKeyFor(book.$id, unit.unitId))}
                  {admin ? (
                    <ImageUploader
                      label={`Anadir imagenes de ${unit.name}`}
                      busy={busy}
                      onUpload={(files, caption) => upload(files, caption, unit)}
                    />
                  ) : null}
                </>
              }
            />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
