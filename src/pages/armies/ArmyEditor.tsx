import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useGameSystem } from "../../context/GameSystemContext";
import { armyNounFor, getGameSystem, isQuestSystem, resumenFaccion } from "../../lib/gameSystems";
import type { GameSystemId } from "../../lib/gameSystems";
import {
  createArmy,
  deleteArmy,
  deleteImage,
  discardDraft,
  imageUrl,
  publishDraft,
  resolveArmy,
  saveDraft,
  startDraft,
  uploadImage,
} from "../../api/armies";
import {
  extractListId,
  importList,
  listUrl,
  parseStoredList,
} from "../../api/armyForge";
import { requiredBookUids } from "../../lib/armyForgeResolve";
import type { ArmyForgeList, ResolvedUnit } from "../../lib/armyForgeResolve";
import type { Army, HeroClass, HeroSkill, QuestShopPackage } from "../../lib/types";
import { parseHeroSkills } from "../../lib/types";
import { errorMessage, formatDateTime } from "../../lib/format";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";
import UnitCard from "../../components/UnitCard";
import HeroSkillCard from "../../components/HeroSkillCard";
import type { HeroSkillCardData } from "../../components/HeroSkillCard";
import ConfirmDialog from "../../components/ConfirmDialog";
import AddUnitWizard from "../../components/AddUnitWizard";
import { buildArmy, entriesFromForgeList, esHeroe, rehydrateEntries, serializeEntries } from "../../lib/builder";
import type { StoredEntry } from "../../lib/builder";
import type { BuilderEntry, UpgradeSection } from "../../lib/builder";
import { catalogImageUrl, getBook, getBookByUid, groupImages, listBookImages, listBooks, listRuleGlossary, pickImageByType, targetKeyFor } from "../../api/catalog";
import type { ArmyBook, ArmyUnit, CatalogImage, CatalogRule } from "../../api/catalog";
import SpellCard from "../../components/SpellCard";
import RuleCardModal from "../../components/RuleCardModal";
import type { Habilidad } from "../../lib/reglas";
import { parseHabilidad } from "../../lib/reglas";
import RuleCard from "../../components/RuleCard";
import ArmyPrintView from "../../components/ArmyPrintView";
import AvisoComposicion from "../../components/AvisoComposicion";
import {
  equipoDeEjercito,
  equipoDeFaccion,
  habilidadesDeFaccion,
  reglasGeneralesDeFaccion,
  reglasUsadasEnEjercito,
  tieneCaster,
} from "../../lib/faccion";
import { agruparUnidades, emparejarHeroes } from "../../lib/unidades";
import { listUnits as listCatalogUnits, listUpgradePackages } from "../../api/catalog";
import { habilidadesInicialesQuest } from "../../lib/questHero";
import Tabs from "../../components/Tabs";
import { parseSpells } from "../../lib/spells";
import { composeArmyPayload, sourceBooks } from "../../lib/armyPayload";
import { listHeroClasses, listQuestShopPackages } from "../../api/content";
import { questShopSectionsForEntry } from "../../lib/questShop";

interface FormState {
  name: string;
  gameSystem: GameSystemId;
  faction: string;
  alliedFactions: string[];
  points: number;
  /** Objetivo de puntos elegido aparte del coste real; 0 si no se ha fijado. */
  pointsLimit: number;
  /** Margen de tolerancia sobre `pointsLimit`, en tanto por ciento. */
  pointsMargin: number;
  modelCount: number;
  listId: string;
  notes: string;
  shared: boolean;
}

const HERO_SKILL_STAT_LABEL: Record<HeroSkill["stat"], string> = {
  strength: "Str",
  dexterity: "Dex",
  willpower: "Wil",
};

const HERO_SKILL_LEVEL_LABEL: Record<HeroSkill["tier"], string> = {
  0: "Inicial",
  1: "Nivel 2",
  2: "Nivel 5",
  3: "Nivel 9",
};

const HERO_SKILL_CHIP_LEVEL_LABEL: Record<HeroSkill["tier"], string> = {
  0: "Ini",
  1: "N2",
  2: "N5",
  3: "N9",
};

export default function ArmyEditor() {
  const { armyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { system } = useGameSystem();

  const [army, setArmy] = useState<Army | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    gameSystem: system?.id ?? "gf",
    faction: "",
    alliedFactions: [],
    points: 0,
    pointsLimit: 0,
    pointsMargin: 5,
    modelCount: 0,
    listId: "",
    notes: "",
    shared: false,
  });
  const [listJson, setListJson] = useState<string | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(armyId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Borrador en curso de este ejercito, si lo hay. */
  const [draft, setDraft] = useState<Army | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  /** Accion destructiva a la espera de confirmacion. */
  const [confirmando, setConfirmando] = useState<"descartar" | "borrar" | null>(null);
  const [anadiendo, setAnadiendo] = useState(false);
  /** Indice en `entries` de la unidad que se esta reconfigurando. */
  const [editandoIndice, setEditandoIndice] = useState<number | null>(null);
  const [pestana, setPestana] = useState<"unidades" | "hechizos" | "habilidades" | "habilidadesClase" | "equipo" | "generales">("generales");
  /** Si esta a false, las pestanas de habilidades/equipo/hechizos/generales
   *  se recortan a lo que aparece de verdad en las fichas de esta lista. */
  const [mostrarTodas, setMostrarTodas] = useState(false);
  /**
   * Las facciones conocidas de este ejercito (puede haber varias) y las
   * unidades de su catalogo, solo para saber que hechizos/habilidades/equipo
   * publica cada una: el ejercito en si no las guarda.
   */
  const [librosPorClave, setLibrosPorClave] = useState<Map<string, ArmyBook>>(new Map());
  const [unidadesPorLibro, setUnidadesPorLibro] = useState<Map<string, ArmyUnit[]>>(new Map());
  const [imagenesCatalogo, setImagenesCatalogo] = useState<CatalogImage[]>([]);
  const [paquetesPorClave, setPaquetesPorClave] = useState<Map<string, UpgradeSection[]>>(new Map());
  const [glosario, setGlosario] = useState<Map<string, CatalogRule>>(new Map());
  /** Solo para quest: clase de cada heroe, para el subtitulo de su ficha. */
  const [heroClasses, setHeroClasses] = useState<HeroClass[]>([]);
  const [questShopPackages, setQuestShopPackages] = useState<QuestShopPackage[]>([]);
  /** `bookKey` elegido en el buscador: con esa faccion se anade la siguiente unidad. */
  const [facSeleccionada, setFacSeleccionada] = useState("");
  const [textoFaccion, setTextoFaccion] = useState("");
  /** El desplegable de facciones, junto al boton de anadir: abierto o no, y el filtro mientras esta abierto. */
  const [facAbierta, setFacAbierta] = useState(false);
  const [filtroFaccion, setFiltroFaccion] = useState("");
  const [habilidad, setHabilidad] = useState<Habilidad | null>(null);
  const [habilidadClase, setHabilidadClase] = useState<HeroSkillCardData | null>(null);
  /**
   * Abrir borrador en curso. Escribiendo deprisa se dispararian varias aperturas
   * a la vez y la segunda chocaria con el indice unico, asi que todas esperan a
   * la misma promesa.
   */
  const abriendoBorrador = useRef<Promise<Army> | null>(null);
  const facInputRef = useRef<HTMLInputElement>(null);
  /** Se esta trabajando sobre el borrador, o mirando la version publicada. */
  const [viendoBorrador, setViendoBorrador] = useState(false);
  /**
   * De donde sale la pregunta sobre el borrador. Al entrar hay que decidir si o
   * si: cerrar sin elegir dejaria la edicion bloqueada sin que se sepa por que.
   * Reabierta desde la barra ya se sabe, y basta con poder cerrarla.
   */
  const [decidirBorrador, setDecidirBorrador] = useState<"entrada" | "peticion" | null>(null);
  const [faccionesDisponibles, setFaccionesDisponibles] = useState<ArmyBook[]>([]);
  const [cargandoFacciones, setCargandoFacciones] = useState(false);

  useEffect(() => {
    if (!armyId) return;
    let cancelled = false;
    // Las facciones conocidas son de este ejercito en concreto: si se
    // navega a otro no deberian arrastrarse las del anterior.
    setLibrosPorClave(new Map());
    setUnidadesPorLibro(new Map());
    setImagenesCatalogo([]);
    setPaquetesPorClave(new Map());
    setFacSeleccionada("");
    resolveArmy(armyId)
      .then(({ active: row, draft: pendiente }) => {
        if (cancelled) return;
        setArmy(row);
        setDraft(pendiente);
        // Se entra siempre viendo la version publicada; si hay un borrador a
        // medias se pregunta que hacer con el antes de tocar nada.
        mostrar(row);
        setDecidirBorrador(pendiente ? "entrada" : null);
      })
      .catch((err: unknown) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [armyId]);

  /** Vuelca una version del ejercito en el formulario y en el carrusel. */
  const mostrar = useCallback((version: Army) => {
    setForm({
      name: version.name,
      gameSystem: version.gameSystem,
      faction: version.faction ?? "",
      alliedFactions: version.alliedFactions ?? [],
      points: version.points,
      pointsLimit: version.pointsLimit ?? 0,
      pointsMargin: version.pointsMargin ?? 5,
      modelCount: version.modelCount,
      listId: version.listId ?? "",
      notes: version.notes ?? "",
      shared: version.shared,
    });
    setListJson(version.listJson);
    setImages(version.imageIds ?? []);
    setCoverId(version.coverId);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const cerrar = () => setMenuOpen(false);
    const conEscape = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    // En captura: si no, el propio clic que abre el menu lo cerraria acto seguido.
    document.addEventListener("click", cerrar);
    document.addEventListener("keydown", conEscape);
    return () => {
      document.removeEventListener("click", cerrar);
      document.removeEventListener("keydown", conEscape);
    };
  }, [menuOpen]);

  // La pregunta de entrada no se puede esquivar; la reabierta a peticion si.
  useEffect(() => {
    if (decidirBorrador !== "peticion") return undefined;
    const conEscape = (event: KeyboardEvent) => event.key === "Escape" && setDecidirBorrador(null);
    document.addEventListener("keydown", conEscape);
    return () => document.removeEventListener("keydown", conEscape);
  }, [decidirBorrador]);

  useEffect(() => {
    if (!importOpen) return undefined;
    const conEscape = (event: KeyboardEvent) => event.key === "Escape" && setImportOpen(false);
    document.addEventListener("keydown", conEscape);
    return () => document.removeEventListener("keydown", conEscape);
  }, [importOpen]);

  /** Pasar a edicion: abre el borrador y se planta en el. */
  async function onEditar() {
    setBusy(true);
    setError(null);
    try {
      const abierto = await conBorrador();
      if (!abierto) return;
      setViendoBorrador(true);
      mostrar(abierto);
      setNotice(`Editando un borrador. ${noun.articleCap} ${noun.singular} sigue como estaba hasta que pulses Guardar.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Alimenta el buscador de faccion junto al boton de anadir.
  useEffect(() => {
    let cancelado = false;
    setCargandoFacciones(true);
    listBooks(army?.gameSystem ?? form.gameSystem)
      .then((rows) => !cancelado && setFaccionesDisponibles(rows))
      .catch(() => !cancelado && setFaccionesDisponibles([]))
      .finally(() => !cancelado && setCargandoFacciones(false));
    return () => {
      cancelado = true;
    };
  }, [army?.gameSystem, form.gameSystem]);

  useEffect(() => {
    if (!facAbierta) return undefined;
    const cerrar = () => setFacAbierta(false);
    const conEscape = (event: KeyboardEvent) => event.key === "Escape" && setFacAbierta(false);
    document.addEventListener("click", cerrar);
    document.addEventListener("keydown", conEscape);
    return () => {
      document.removeEventListener("click", cerrar);
      document.removeEventListener("keydown", conEscape);
    };
  }, [facAbierta]);

  /**
   * Crea el ejercito directamente con la faccion elegida en el buscador: ya
   * no hace falta un paso aparte de "elegir faccion" antes de poder empezar a
   * construir uno.
   */
  async function crearConFaccion(bookKey: string) {
    const libroElegido = librosPorClave.get(bookKey);
    if (!libroElegido || !user) return;
    setBusy(true);
    setError(null);
    try {
      const listJsonNuevo = JSON.stringify({
        source: {
          builder: "manual",
          books: [
            {
              bookKey: libroElegido.$id,
              bookVersion: libroElegido.versionString,
              factionName: libroElegido.factionName ?? libroElegido.name,
            },
          ],
        },
      });
      const creado = await createArmy(user.$id, {
        name: form.name.trim() || libroElegido.name,
        setting: libroElegido.setting,
        gameSystem: libroElegido.gameSystem,
        faction: quest ? null : (libroElegido.factionName ?? libroElegido.name),
        alliedFactions: quest ? [libroElegido.factionName ?? libroElegido.name] : [],
        listJson: listJsonNuevo,
      });
      navigate(`/ejercitos/${creado.$id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** Devuelve el borrador sobre el que escribir, creandolo la primera vez. */
  const conBorrador = useCallback(async (): Promise<Army | null> => {
    if (!army || !user) return null;
    if (draft) return draft;
    if (!abriendoBorrador.current) {
      abriendoBorrador.current = startDraft(army, user.$id).finally(() => {
        abriendoBorrador.current = null;
      });
    }
    const abierto = await abriendoBorrador.current;
    setDraft(abierto);
    return abierto;
  }, [army, draft, user]);

  /**
   * Solo se edita el borrador, nunca el ejercito publicado.
   *
   * Mientras no haya uno, la vista es de consulta y no ensena nada que se pueda
   * tocar: ni configurar, ni quitar, ni anadir, ni los formularios. El paso a
   * edicion es explicito —el boton "Editar", que abre el borrador— en vez de
   * que cualquier cambio suelto lo abra por detras.
   *
   * Un ejercito que todavia no existe no tiene nada que consultar: se edita
   * desde el primer momento, sin borrador de por medio, porque `onSubmit` lo
   * crea directamente cuando `army` sigue siendo nulo.
   */
  const editable = !army || (Boolean(draft) && viendoBorrador);

  /**
   * El nombre se edita en la barra y se guarda solo, con un respiro para no
   * escribir a cada tecla. Si no habia borrador, escribirlo es lo que lo abre.
   */
  useEffect(() => {
    // Solo se escribe estando en el borrador: fuera de el, el nombre es de
    // consulta como el resto.
    if (!army || !editable) return undefined;
    const guardado = (viendoBorrador && draft ? draft : army).name;
    const nuevo = form.name.trim();
    if (!nuevo || nuevo === guardado) return undefined;

    const temporizador = window.setTimeout(() => {
      void (async () => {
        try {
          const destino = await conBorrador();
          if (!destino) return;
          setDraft(await saveDraft(destino.$id, { name: nuevo }));
          setViendoBorrador(true);
        } catch (err) {
          setError(errorMessage(err));
        }
      })();
    }, 700);

    return () => window.clearTimeout(temporizador);
  }, [form.name, army, editable, draft, viendoBorrador, conBorrador]);

  /**
   * Hay borrador pero se esta mirando la version publicada. Nada de lo que se
   * haga aqui deberia poder tocar el ejercito: la unica accion es decidir que
   * hacer con el borrador.
   */
  const ignorandoBorrador = Boolean(draft) && !viendoBorrador;


  const noun = useMemo(() => armyNounFor(getGameSystem(form.gameSystem)), [form.gameSystem]);
  const quest = isQuestSystem(getGameSystem(form.gameSystem)?.id);
  const unidadesGuardadas = useMemo(() => parseStoredList(listJson), [listJson]);
  const librosConocidos = useMemo(() => [...librosPorClave.values()], [librosPorClave]);
  const unidadesTodas = useMemo(() => [...unidadesPorLibro.values()].flat(), [unidadesPorLibro]);
  const imagenesPorObjetivo = useMemo(() => groupImages(imagenesCatalogo), [imagenesCatalogo]);
  /** uid de Army Forge -> `bookKey` propio, para leer listas importadas multi-faccion. */
  const uidABookKey = useMemo(() => new Map(librosConocidos.map((libro) => [libro.uid, libro.$id])), [librosConocidos]);
  const imagenCatalogoDe = useCallback(
    (unit: ResolvedUnit, tipo: "avatar" | "miniature"): string | null => {
      const defaultBookKey = librosConocidos.length === 1 ? librosConocidos[0].$id : undefined;
      const bookKey = unit.bookKey ?? defaultBookKey;
      if (!bookKey || !unit.unitKey) return null;
      const imagen = pickImageByType(imagenesPorObjetivo.get(targetKeyFor(bookKey, unit.unitKey)), tipo);
      return imagen ? catalogImageUrl(imagen.fileId) : null;
    },
    [imagenesPorObjetivo, librosConocidos],
  );
  const avatarDe = useCallback((unit: ResolvedUnit) => imagenCatalogoDe(unit, "avatar"), [imagenCatalogoDe]);
  const miniaturaDe = useCallback(
    (unit: ResolvedUnit) => imagenCatalogoDe(unit, "miniature"),
    [imagenCatalogoDe],
  );
  /**
   * Registra un libro ya resuelto (y su catalogo) entre los conocidos de este
   * ejercito, si no lo estaba ya.
   */
  const registrarLibro = useCallback(
    async (libro: ArmyBook) => {
      setLibrosPorClave((prev) => (prev.has(libro.$id) ? prev : new Map(prev).set(libro.$id, libro)));
      await Promise.all([
        unidadesPorLibro.has(libro.$id)
          ? Promise.resolve()
          : listCatalogUnits(libro.$id).then((unidades) => {
              setUnidadesPorLibro((prev) => (prev.has(libro.$id) ? prev : new Map(prev).set(libro.$id, unidades)));
            }),
        listUpgradePackages(libro.$id).then((paquetes) => {
          setPaquetesPorClave((prev) => {
            const siguiente = new Map(prev);
            for (const [clave, secciones] of paquetes) siguiente.set(clave, secciones);
            return siguiente;
          });
        }),
        listBookImages(libro.$id).then((imagenes) => {
          setImagenesCatalogo((prev) => [...prev.filter((image) => image.bookKey !== libro.$id), ...imagenes]);
        }),
      ]);
    },
    [unidadesPorLibro],
  );
  /** Como `registrarLibro`, pero partiendo solo de la clave propia. */
  const asegurarLibro = useCallback(
    async (bookKey: string) => {
      if (librosPorClave.has(bookKey)) return;
      const libro = await getBook(bookKey);
      await registrarLibro(libro);
    },
    [librosPorClave, registrarLibro],
  );

  /**
   * Las facciones con las que arranca el ejercito: las guardadas en
   * `source.books` (o el `bookKey` unico de antes de poder mezclar varias),
   * o si vino importado sin ninguna propia, las que resuelven por cada uid de
   * Army Forge que usa la lista.
   */
  useEffect(() => {
    if (!listJson) return undefined;
    let cancelado = false;
    void (async () => {
      try {
        const guardados = sourceBooks(listJson).map((libro) => libro.bookKey);
        if (guardados.length > 0) {
          await Promise.all(guardados.map((clave) => asegurarLibro(clave)));
          return;
        }
        const parsed = JSON.parse(listJson) as { raw?: ArmyForgeList; gameSystem?: string | null };
        const uids = parsed.raw ? requiredBookUids(parsed.raw) : [];
        const gameSystemId = getGameSystem(parsed.gameSystem)?.id;
        if (uids.length === 0 || !gameSystemId) return;
        const resueltos = await Promise.all(uids.map((uid) => getBookByUid(uid, gameSystemId)));
        if (cancelado) return;
        await Promise.all(resueltos.filter((libro): libro is ArmyBook => Boolean(libro)).map(registrarLibro));
      } catch {
        // Un fallo aqui solo deja sin resolver la faccion: no es motivo para
        // teñir de rojo la vista del ejercito.
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listJson]);

  /** El glosario es del sistema de juego, no de cada libro: basta con cargarlo una vez. */
  useEffect(() => {
    let cancelado = false;
    listRuleGlossary(form.gameSystem)
      .then((g) => !cancelado && setGlosario(g))
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [form.gameSystem]);

  /** Solo hace falta en quest, para el subtitulo y tienda comun de cada heroe. */
  useEffect(() => {
    if (!quest) {
      setHeroClasses([]);
      setQuestShopPackages([]);
      return undefined;
    }
    let cancelado = false;
    Promise.all([listHeroClasses(form.gameSystem), listQuestShopPackages(form.gameSystem)])
      .then(([classes, shopPackages]) => {
        if (cancelado) return;
        setHeroClasses(classes);
        setQuestShopPackages(shopPackages);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [quest, form.gameSystem]);

  /**
   * Las elecciones guardadas. Van en el mismo orden que las unidades —las
   * escribe `composeArmyPayload` del mismo array—, asi que el `sortOrder` de
   * una carta es su indice aqui. Un ejercito importado de Army Forge no las
   * trae de fabrica, pero en cuanto se resuelven sus libros por uid se
   * reconstruyen igual que en el constructor, a partir del JSON original de
   * Army Forge.
   */
  const entradasGuardadas = useMemo<StoredEntry[]>(() => {
    if (!listJson) return [];
    try {
      const parsed = JSON.parse(listJson) as { entries?: unknown; raw?: unknown };
      if (Array.isArray(parsed.entries)) return parsed.entries as StoredEntry[];
      if (parsed.raw && unidadesTodas.length > 0) {
        return serializeEntries(entriesFromForgeList(parsed.raw, unidadesTodas, uidABookKey));
      }
      return [];
    } catch {
      return [];
    }
  }, [listJson, unidadesTodas, uidABookKey]);

  const seccionesExtraQuest = useCallback(
    (entry: BuilderEntry, baseSections: UpgradeSection[]) =>
      questShopSectionsForEntry(entry, baseSections, questShopPackages, heroClasses, form.gameSystem),
    [form.gameSystem, heroClasses, questShopPackages],
  );

  const units = useMemo(() => {
    if (!quest || entradasGuardadas.length === 0 || unidadesTodas.length === 0 || paquetesPorClave.size === 0) {
      return unidadesGuardadas;
    }

    const defaultBookKey = librosConocidos.length === 1 ? librosConocidos[0].$id : undefined;
    const entradas = rehydrateEntries(entradasGuardadas, unidadesTodas, defaultBookKey);
    if (entradas.length !== entradasGuardadas.length) return unidadesGuardadas;
    return buildArmy(
      entradas,
      paquetesPorClave,
      heroClasses,
      form.gameSystem,
      seccionesExtraQuest,
    ).units;
  }, [
    entradasGuardadas,
    form.gameSystem,
    heroClasses,
    librosConocidos,
    paquetesPorClave,
    quest,
    seccionesExtraQuest,
    unidadesGuardadas,
    unidadesTodas,
  ]);
  /**
   * Unidades a las que puede unirse el heroe que se esta editando: las del
   * ejercito que no son heroes, quitando la propia. El indice es el de la lista
   * guardada, que es lo que persiste la union.
   */
  const unidadesParaUnir = useMemo(
    () =>
      units
        .map((unit, indice) => ({ indice, nombre: unit.name, heroe: esHeroe(unit.rules) }))
        .filter((u) => !u.heroe && u.indice !== editandoIndice)
        .map(({ indice, nombre }) => ({ indice, nombre })),
    [units, editandoIndice],
  );
  /**
   * Las filas de la lista, con los heroes ya emparejados con su unidad. La
   * union se guarda por indice en `entradasGuardadas`, que va en el mismo orden
   * que `units`.
   */
  const filasEjercito = useMemo(
    () => emparejarHeroes(units, entradasGuardadas.map((e) => e.attachedTo)),
    [units, entradasGuardadas],
  );
  /** Las unidades de verdad de esta lista, agrupadas por el libro del que
   *  vienen: lo que hace falta para saber que tarjetas aparecen de verdad en
   *  sus fichas, en vez de todo lo que publica el libro. */
  const unidadesEjercitoPorLibro = useMemo(() => {
    // Una lista importada de Army Forge y todavia no tocada por el
    // constructor no trae `bookKey` en sus unidades. Con una sola faccion
    // conocida no hay ambiguedad: son todas suyas.
    const defaultBookKey = librosConocidos.length === 1 ? librosConocidos[0].$id : undefined;
    const mapa = new Map<string, ResolvedUnit[]>();
    for (const unidad of units) {
      const bookKey = unidad.bookKey ?? defaultBookKey;
      if (!bookKey) continue;
      const lista = mapa.get(bookKey);
      if (lista) lista.push(unidad);
      else mapa.set(bookKey, [unidad]);
    }
    return mapa;
  }, [units, librosConocidos]);
  /** Reglas propias y del reglamento basico que aparecen de verdad en las
   *  fichas de esta lista, con `mostrarTodas` desactivado. */
  const reglasUsadas = useMemo(() => reglasUsadasEnEjercito(glosario, units), [glosario, units]);
  const nombresUsados = useMemo(() => new Set(reglasUsadas.map((regla) => regla.name.toLowerCase())), [reglasUsadas]);
  /**
   * Habilidades, equipo y hechizos van una fila por faccion conocida —
   * principal y aliadas por igual—, para no mezclar lo que aporta cada libro
   * cuando el ejercito mezcla varios. "Reglas generales" es la excepcion: es
   * el reglamento basico, comun a todas, y se sigue mostrando de una vez.
   *
   * Con `mostrarTodas` desactivado, cada una se recorta a lo que aparece de
   * verdad en las fichas de esta lista, en vez de todo lo que publica el
   * libro.
   */
  const hechizosPorFaccion = useMemo(
    () =>
      librosConocidos
        .map((libro) => ({ libro, spells: parseSpells(libro.spells ?? null) }))
        .filter((grupo) => grupo.spells.length > 0)
        .filter((grupo) => mostrarTodas || tieneCaster(unidadesEjercitoPorLibro.get(grupo.libro.$id) ?? [])),
    [librosConocidos, mostrarTodas, unidadesEjercitoPorLibro],
  );
  const habilidadesPorFaccion = useMemo(
    () =>
      librosConocidos
        .map((libro) => {
          const items = habilidadesDeFaccion(libro, glosario, unidadesPorLibro.get(libro.$id) ?? []);
          return {
            libro,
            items: mostrarTodas ? items : items.filter((regla) => nombresUsados.has(regla.name.toLowerCase())),
          };
        })
        .filter((grupo) => grupo.items.length > 0),
    [librosConocidos, glosario, unidadesPorLibro, mostrarTodas, nombresUsados],
  );
  const equipoPorFaccion = useMemo(
    () =>
      librosConocidos
        .map((libro) => ({
          libro,
          items: mostrarTodas
            ? equipoDeFaccion(unidadesPorLibro.get(libro.$id) ?? [])
            : equipoDeEjercito(unidadesEjercitoPorLibro.get(libro.$id) ?? []),
        }))
        .filter((grupo) => grupo.items.length > 0),
    [librosConocidos, unidadesPorLibro, mostrarTodas, unidadesEjercitoPorLibro],
  );
  const hechizos = useMemo(() => hechizosPorFaccion.flatMap((g) => g.spells), [hechizosPorFaccion]);
  const habilidades = useMemo(() => habilidadesPorFaccion.flatMap((g) => g.items), [habilidadesPorFaccion]);
  const equipo = useMemo(() => equipoPorFaccion.flatMap((g) => g.items), [equipoPorFaccion]);
  const generales = useMemo(
    () =>
      mostrarTodas
        ? reglasGeneralesDeFaccion(glosario, unidadesTodas, habilidades)
        : reglasUsadas.filter((regla) => regla.coreType !== null).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [mostrarTodas, glosario, unidadesTodas, habilidades, reglasUsadas],
  );
  const clasesDeHeroe = useMemo(() => heroClasses.filter((heroClass) => heroClass.classKey !== "default"), [heroClasses]);
  const habilidadesDeClase = useMemo<HeroSkillCardData[]>(
    () =>
      clasesDeHeroe.flatMap((heroClass) => [
        ...(heroClass.classFeatName && heroClass.classFeatText
          ? [
              {
                name: heroClass.classFeatName,
                description: heroClass.classFeatText,
                className: heroClass.name,
                levelLabel: "Feat inicial",
                statLabel: "Feat",
              },
            ]
          : []),
        ...parseHeroSkills(heroClass.skills).map((skill) => ({
          name: skill.name,
          description: skill.description,
          className: heroClass.name,
          levelLabel: HERO_SKILL_LEVEL_LABEL[skill.tier],
          statLabel: HERO_SKILL_STAT_LABEL[skill.stat],
        })),
      ]),
    [clasesDeHeroe],
  );
  const habilidadesParaHeroe = useCallback(
    (heroClassId: string | undefined, _level: number | undefined) => {
      const clase = heroClasses.find((candidate) => candidate.$id === heroClassId);
      if (!clase) return [];
      return [
        ...(clase.classFeatName && clase.classFeatText
          ? [
              {
                tier: 0,
                name: clase.classFeatName,
                description: clase.classFeatText,
                className: clase.name,
                levelLabel: "Feat",
                statLabel: "Feat",
              },
            ]
          : []),
        ...habilidadesInicialesQuest(clase).map((skill) => ({
            tier: skill.tier,
            levelLabel: HERO_SKILL_CHIP_LEVEL_LABEL[skill.tier],
            description: skill.description,
            className: clase.name,
            statLabel: HERO_SKILL_STAT_LABEL[skill.stat],
            name: skill.name,
          })),
      ];
    },
    [heroClasses],
  );

  /** La faccion con la que se anade la siguiente unidad: la elegida en el buscador, o la primera conocida. */
  const facActual = facSeleccionada && librosPorClave.has(facSeleccionada) ? facSeleccionada : (librosConocidos[0]?.$id ?? "");
  const libroActual = librosPorClave.get(facActual) ?? null;
  /**
   * El `bookKey` con el que abrir el asistente: reconfigurar una unidad usa
   * el suyo propio (sigue siendo de su faccion), no la que este elegida en
   * el buscador; anadir una nueva usa la faccion actual.
   */
  const bookKeyParaWizard =
    editandoIndice !== null ? entradasGuardadas[editandoIndice]?.bookKey || facActual : facActual;

  useEffect(() => {
    if (libroActual) setTextoFaccion(libroActual.factionName ?? libroActual.name);
  }, [libroActual]);

  /** Al abrir el desplegable se ve todo; escribir lo va acotando. */
  const opcionesFiltradas = useMemo(() => {
    const needle = filtroFaccion.trim().toLowerCase();
    if (!needle) return faccionesDisponibles;
    return faccionesDisponibles.filter((libro) => (libro.factionName ?? libro.name).toLowerCase().includes(needle));
  }, [faccionesDisponibles, filtroFaccion]);

  function seleccionarFaccion(libro: ArmyBook) {
    setFacSeleccionada(libro.$id);
    setTextoFaccion(libro.factionName ?? libro.name);
    setFacAbierta(false);
    setFiltroFaccion("");
    void registrarLibro(libro);
  }

  /**
   * El boton de anadir: si aun no hay faccion elegida, abre el desplegable en
   * vez de nada mas —ya no hace falta un paso previo de "elegir faccion"—; si
   * el ejercito todavia no existe, se crea con la faccion elegida antes de
   * poder anadir su primera unidad.
   */
  function onClickAnadir() {
    if (!facActual) {
      setFacAbierta(true);
      setFiltroFaccion("");
      facInputRef.current?.focus();
      return;
    }
    if (!army) {
      void crearConFaccion(facActual);
      return;
    }
    setAnadiendo(true);
  }

  async function importFromArmyForge() {
    const id = extractListId(form.listId);
    if (!id) {
      setError("Pega el enlace de la lista compartida de Army Forge o su identificador.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const list = await importList(id);
      setListJson(JSON.stringify(list));
      setForm((prev) => ({
        ...prev,
        listId: id,
        name: prev.name || list.name,
        faction: prev.faction || list.faction || "",
        points: list.points || prev.points,
        modelCount: list.modelCount || prev.modelCount,
      }));
      setImportOpen(false);
      setNotice(
        list.unresolvedUpgrades > 0
          ? `Importadas ${list.units.length} unidades. ${list.unresolvedUpgrades} mejoras ya no existen en el libro de ${noun.singular} actual, asi que el coste por unidad es aproximado; el total ${noun.ofThe} ${noun.singular} es el que guardo Army Forge.`
          : `Importadas ${list.units.length} unidades desde Army Forge.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length || !user) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = await Promise.all(Array.from(files).map((file) => uploadImage(user.$id, file)));
      const next = [...images, ...uploaded];
      setImages(next);
      if (!coverId) setCoverId(uploaded[0]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveImage(fileId: string) {
    setImages((prev) => prev.filter((id) => id !== fileId));
    if (coverId === fileId) setCoverId(null);
    await deleteImage(fileId).catch(() => undefined);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const gameSystem = getGameSystem(form.gameSystem);
    if (!gameSystem) return;

    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        setting: gameSystem.setting,
        gameSystem: gameSystem.id,
        faction: form.faction,
        points: form.points,
        pointsLimit: form.pointsLimit,
        pointsMargin: form.pointsMargin,
        modelCount: form.modelCount,
        listId: form.listId || null,
        sourceUrl: form.listId ? listUrl(form.listId) : null,
        listJson,
        notes: form.notes,
        shared: form.shared,
        coverId,
        imageIds: images,
      };
      if (!army) {
        const created = await createArmy(user.$id, payload);
        navigate(`/ejercitos/${created.$id}`, { replace: true });
        return;
      }
      // Editar no toca el ejercito activo: los cambios van a su borrador, y de
      // ahi no salen hasta que se aceptan.
      const destino = await conBorrador();
      if (!destino) return;
      const guardado = await saveDraft(destino.$id, payload);
      setDraft(guardado);
      setNotice("Cambios guardados en el borrador. Pulsa Guardar para aplicarlos.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function continuarBorrador() {
    if (draft) mostrar(draft);
    setViendoBorrador(true);
    setDecidirBorrador(null);
  }

  function ignorarBorrador() {
    if (army) mostrar(army);
    setViendoBorrador(false);
    setDecidirBorrador(null);
  }

  /** Acepta el borrador: pasa a ser el ejercito y el anterior queda archivado. */
  /**
   * Mete la unidad que sale del asistente en el borrador. Hay que recomponer la
   * lista entera —no basta con anadir una tarjeta— porque los puntos y las
   * miniaturas salen de la suma de todas.
   */
  /**
   * Quita una unidad del borrador.
   *
   * Se hace sobre lo guardado, donde el indice vale, y con dos cuidados que no
   * se ven hasta que fallan: `attachedTo` es un **indice**, asi que quitar una
   * unidad corre los de las que van detras, y la que estuviera unida a esta se
   * queda suelta en vez de apuntar a quien no es.
   */
  async function onRemoveUnit(indice: number, nombre: string) {
    if (!army || librosConocidos.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const restantes = entradasGuardadas
        .filter((_, i) => i !== indice)
        .map((entrada) => {
          if (entrada.attachedTo === undefined) return entrada;
          if (entrada.attachedTo === indice) {
            const { attachedTo: _quitada, ...suelta } = entrada;
            return suelta;
          }
          return entrada.attachedTo > indice ? { ...entrada, attachedTo: entrada.attachedTo - 1 } : entrada;
        });

      // Puede haber unidades de mas de una faccion: hacen falta el catalogo y
      // los paquetes de todas las conocidas, no solo de una.
      const [unidadesFrescas, paquetesFrescos] = await Promise.all([
        Promise.all(librosConocidos.map((libro) => listCatalogUnits(libro.$id))),
        Promise.all(librosConocidos.map((libro) => listUpgradePackages(libro.$id))),
      ]);
      const packages = new Map<string, UpgradeSection[]>();
      for (const mapa of paquetesFrescos) for (const [clave, secciones] of mapa) packages.set(clave, secciones);
      const defaultBookKey = librosConocidos.length === 1 ? librosConocidos[0].$id : undefined;

      const payload = composeArmyPayload(
        rehydrateEntries(restantes, unidadesFrescas.flat(), defaultBookKey),
        packages,
        librosConocidos,
        form.name,
        form.listId,
        heroClasses,
        seccionesExtraQuest,
      );

      const destino = await conBorrador();
      if (!destino) return;
      const guardado = await saveDraft(destino.$id, payload);
      setDraft(guardado);
      setViendoBorrador(true);
      mostrar(guardado);
      setNotice(`${nombre} quitada del borrador.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onAddUnit(
    nueva: BuilderEntry,
    book: ArmyBook,
    packages: Map<string, UpgradeSection[]>,
    catalogo: ArmyUnit[],
    indice: number | null = null,
    unirA: number | null = null,
  ) {
    if (!army) return;
    setBusy(true);
    setError(null);
    try {
      // Es la primera vez que se usa esta faccion en el ejercito: se registra
      // para que el autocompletar y las pestanas de hechizos/habilidades la
      // conozcan tambien.
      void registrarLibro(book);

      // El indice viene del array guardado, asi que se aplica ahi y no sobre la
      // lista ya rehidratada: rehidratar descarta las unidades que ya no estan
      // en el libro, y entonces los indices no serian los mismos y se
      // reconfiguraria otra unidad sin que nada avisara. `entradasGuardadas` es
      // ese array guardado, ya con su respaldo si la lista viene de una
      // importacion de Army Forge que todavia no tiene `entries` propio: leer
      // `listJson` a pelo aqui se lo saltaria y perderia todo lo importado.
      const anteriores = entradasGuardadas;
      // `serializeEntries` de una sola entrada no puede resolver la union —no
      // tiene el resto del array—, asi que el indice destino se pone aqui.
      const suya: StoredEntry = { ...serializeEntries([nueva])[0] };
      if (unirA === null) delete suya.attachedTo;
      else suya.attachedTo = unirA;
      const actualizadas =
        indice === null ? [...anteriores, suya] : anteriores.map((previa, i) => (i === indice ? suya : previa));

      // La faccion recien usada la trae el propio asistente, que ya la cargo;
      // el resto de facciones ya conocidas del ejercito se traen aparte,
      // porque `actualizadas` puede mezclar unidades de mas de una.
      const otrosLibros = librosConocidos.filter((otro) => otro.$id !== book.$id);
      const [otrasUnidades, otrosPaquetes] = await Promise.all([
        Promise.all(otrosLibros.map((otro) => listCatalogUnits(otro.$id))),
        Promise.all(otrosLibros.map((otro) => listUpgradePackages(otro.$id))),
      ]);
      const catalogoTotal = [...catalogo, ...otrasUnidades.flat()];
      const paquetesTotal = new Map(packages);
      for (const mapa of otrosPaquetes) for (const [clave, secciones] of mapa) paquetesTotal.set(clave, secciones);
      const librosTotal = [book, ...otrosLibros];
      const defaultBookKey = librosTotal.length === 1 ? librosTotal[0].$id : undefined;

      const payload = composeArmyPayload(
        rehydrateEntries(actualizadas, catalogoTotal, defaultBookKey),
        paquetesTotal,
        librosTotal,
        form.name,
        form.listId,
        heroClasses,
        seccionesExtraQuest,
      );

      const destino = await conBorrador();
      if (!destino) return;
      const guardado = await saveDraft(destino.$id, payload);
      setDraft(guardado);
      setViendoBorrador(true);
      mostrar(guardado);
      setAnadiendo(false);
      setEditandoIndice(null);
      setNotice(
        indice === null
          ? `${nueva.unit.name} anadida al borrador.`
          : `${nueva.unit.name} reconfigurada en el borrador.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const publicado = await publishDraft(draft);
      setArmy(publicado);
      setDraft(null);
      setViendoBorrador(false);
      setNotice("Cambios aplicados. La version anterior queda archivada.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    if (!draft || !army) return;
    setBusy(true);
    setError(null);
    try {
      await discardDraft(draft);
      setDraft(null);
      setViendoBorrador(false);
      setDecidirBorrador(null);
      mostrar(army);
      setNotice("Borrador descartado.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!army || !window.confirm(`¿Borrar "${army.name}" y sus imagenes?`)) return;
    setBusy(true);
    try {
      await deleteArmy(army);
      navigate("/ejercitos", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;

  if (imprimiendo) {
    return (
      <ArmyPrintView
        nombre={form.name}
        noun={noun}
        quest={quest}
        units={units}
        entradasAttachedTo={entradasGuardadas.map((entrada) => entrada.attachedTo)}
        glosario={glosario}
        librosConocidos={librosConocidos}
        avatarDe={avatarDe}
        miniaturaDe={miniaturaDe}
        onCerrar={() => setImprimiendo(false)}
      />
    );
  }

  return (
    <>
      <header className="army-bar">
        <div className="army-bar-main">
          <span className="row" style={{ gap: 8 }}>
            <input
              className="army-bar-name"
              value={form.name}
              aria-label={`Nombre ${noun.ofThe} ${noun.singular}`}
              placeholder={`Nombre ${noun.ofThe} ${noun.singular}`}
              readOnly={!editable}
              title={
                ignorandoBorrador
                  ? "Decide antes que hacer con el borrador pendiente"
                  : editable
                    ? undefined
                    : `Pulsa Editar para cambiar ${noun.article} ${noun.singular}`
              }
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <AvisoComposicion
              puntos={form.points}
              unidades={units}
              gameSystem={form.gameSystem}
              pointsLimit={form.pointsLimit}
              pointsMargin={form.pointsMargin}
            />
          </span>
          <p className="army-bar-sub small muted">
            {[resumenFaccion(form.faction || null, form.alliedFactions, form.gameSystem), getGameSystem(form.gameSystem)?.name ?? null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="army-bar-stats">
          <div className="army-stat">
            <span className="army-stat-key">Puntos</span>
            <span className="army-stat-value mono">{form.points}</span>
          </div>
          <label className="army-stat army-stat-input">
            <span className="army-stat-key">Objetivo</span>
            <input
              type="number"
              min={0}
              step={50}
              value={form.pointsLimit || ""}
              placeholder="sin limite"
              readOnly={!editable}
              title="Puntos objetivo, opcional: si se fija, los limites de composicion se calculan sobre este numero en vez de sobre lo que cuesta la lista"
              onChange={(e) => setForm({ ...form, pointsLimit: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          {form.pointsLimit > 0 ? (
            <label className="army-stat army-stat-input">
              <span className="army-stat-key">Margen %</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={form.pointsMargin}
                readOnly={!editable}
                title="Cuanto puede pasarse la lista del objetivo sin que cuente como incumplimiento"
                onChange={(e) => setForm({ ...form, pointsMargin: Math.min(100, Math.max(0, Number(e.target.value))) })}
              />
            </label>
          ) : null}
          <div className="army-stat">
            <span className="army-stat-key">Miniaturas</span>
            <span className="army-stat-value mono">{form.modelCount}</span>
          </div>
          <div className="army-stat">
            <span className="army-stat-key">Unidades</span>
            <span className="army-stat-value mono">{units.length}</span>
          </div>
        </div>

        <div className="army-bar-actions">
          {/* Crear desde cero y no encontrar la importacion es lo primero que
              se prueba: sin ejercito todavia no hay menu "Mas opciones" donde
              esconderla, asi que aqui va directa y a la vista. El buscador de
              faccion para empezar a anadir unidades vive junto al boton "+",
              no aqui. */}
          {!army ? (
            <button type="button" onClick={() => setImportOpen(true)}>
              Importar desde Army Forge
            </button>
          ) : null}
          {army ? (
            <button type="button" onClick={() => setImprimiendo(true)}>
              Imprimir
            </button>
          ) : null}
          {draft && !viendoBorrador ? (
            <button type="button" className="primary" onClick={() => setDecidirBorrador("peticion")}>
              Borrador
            </button>
          ) : null}
          {army && !draft ? (
            <button type="button" className="primary" disabled={busy} onClick={() => void onEditar()}>
              {busy ? "Abriendo…" : "Editar"}
            </button>
          ) : null}
          {draft && editable ? (
            <button type="button" className="primary" onClick={() => void onPublish()} disabled={busy}>
              {busy ? "Guardando…" : "Guardar"}
            </button>
          ) : null}
          {army && editable ? (
            <div className="menu-wrap">
              <button
                type="button"
                className="ghost menu-button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Mas opciones"
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen((abierto) => !abierto);
                }}
              >
                ⋯
              </button>
              {menuOpen ? (
                <div className="menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setImportOpen(true);
                      setMenuOpen(false);
                    }}
                  >
                    Importar desde Army Forge
                  </button>
                  {draft && viendoBorrador ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="danger"
                      disabled={busy}
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmando("descartar");
                      }}
                    >
                      Descartar el borrador
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className="danger"
                    disabled={busy}
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmando("borrar");
                    }}
                  >
                    Borrar {noun.singular}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <ErrorBanner error={error} />
      {notice ? <div className="banner ok">{notice}</div> : null}
      {armyId && librosConocidos.length === 0 ? (
        <p className="small muted">
          No se ha podido identificar de que faccion del catalogo viene {noun.demonstrative} {noun.singular}. Usa el
          buscador de faccion junto al boton de anadir para elegir una y empezar a anadir unidades.
        </p>
      ) : null}

      {draft && viendoBorrador ? (
        <div className="banner">
          Estas editando un <strong>borrador</strong>. {noun.articleCap} {noun.singular} sigue como estaba hasta que
          pulses Guardar.
        </div>
      ) : null}


      <Tabs
        value={pestana}
        onChange={setPestana}
        items={[
          { id: "unidades", label: "Unidades", count: units.length },
          { id: "habilidades", label: "Habilidades", count: habilidades.length },
          ...(quest ? [{ id: "habilidadesClase" as const, label: "Habs. clase", count: habilidadesDeClase.length }] : []),
          { id: "equipo", label: "Equipo", count: equipo.length },
          { id: "hechizos", label: "Hechizos", count: hechizos.length },
          { id: "generales", label: "Reglas generales", count: generales.length },
        ]}
      />
      <label className="row" style={{ cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={mostrarTodas}
          onChange={(e) => setMostrarTodas(e.target.checked)}
          style={{ width: "auto" }}
        />
        <span>Mostrar todas las tarjetas</span>
      </label>

      {pestana === "habilidades" ? (
        habilidades.length === 0 ? (
          <EmptyState title="Ninguna faccion de esta lista publica reglas propias" />
        ) : (
          <div className="army-strip">
            {habilidadesPorFaccion.map(({ libro, items }) => (
              <Fragment key={libro.$id}>
                <div className="army-divider" role="separator" aria-label={libro.factionName ?? libro.name}>
                  <span className="army-divider-label">{libro.factionName ?? libro.name}</span>
                  <span className="army-divider-count">{items.length}</span>
                </div>
                {items.map((regla) => (
                  <div key={regla.$id} className="army-slide">
                    <RuleCard
                      habilidad={parseHabilidad(regla.name, "regla")}
                      regla={regla}
                      glosario={glosario}
                      onAbrir={setHabilidad}
                    />
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        )
      ) : pestana === "habilidadesClase" ? (
        habilidadesDeClase.length === 0 ? (
          <EmptyState title="No hay habilidades de clase cargadas" />
        ) : (
          <div className="army-strip">
            {habilidadesDeClase.map((skill) => (
              <div key={`${skill.className}-${skill.levelLabel}-${skill.name}`} className="army-slide">
                <HeroSkillCard skill={skill} glosario={glosario} onAbrir={setHabilidad} />
              </div>
            ))}
          </div>
        )
      ) : pestana === "equipo" ? (
        equipo.length === 0 ? (
          <EmptyState title="Ninguna unidad de esta lista lleva equipo" />
        ) : (
          <div className="army-strip">
            {equipoPorFaccion.map(({ libro, items }) => (
              <Fragment key={libro.$id}>
                <div className="army-divider" role="separator" aria-label={libro.factionName ?? libro.name}>
                  <span className="army-divider-label">{libro.factionName ?? libro.name}</span>
                  <span className="army-divider-count">{items.length}</span>
                </div>
                {items.map((pieza) => (
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
              </Fragment>
            ))}
          </div>
        )
      ) : pestana === "hechizos" ? (
        hechizos.length === 0 ? (
          <EmptyState title="Ninguna faccion de esta lista tiene hechizos">
            <p className="muted">
              {librosConocidos.length > 0
                ? `Su libro de ${noun.singular} no trae ninguno.`
                : `${noun.demonstrativeCap} ${noun.singular} no guarda de que faccion viene, asi que no se pueden mostrar.`}
            </p>
          </EmptyState>
        ) : (
          <div className="army-strip">
            {hechizosPorFaccion.map(({ libro, spells }) => (
              <Fragment key={libro.$id}>
                <div className="army-divider" role="separator" aria-label={libro.factionName ?? libro.name}>
                  <span className="army-divider-label">{libro.factionName ?? libro.name}</span>
                  <span className="army-divider-count">{spells.length}</span>
                </div>
                {spells.map((spell) => (
                  <div key={spell.key} className="army-slide">
                    <SpellCard
                      spell={spell}
                      faction={libro.factionName ?? libro.name}
                      glosario={glosario}
                      onAbrir={setHabilidad}
                    />
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        )
      ) : pestana === "generales" ? (
        generales.length === 0 ? (
          <EmptyState title="No hay reglas del reglamento basico que mostrar">
            <p className="muted">
              {librosConocidos.length > 0
                ? "Sus unidades solo usan reglas propias, o el glosario todavia no ha cargado."
                : `${noun.demonstrativeCap} ${noun.singular} no guarda de que faccion viene, asi que no se pueden deducir.`}
            </p>
          </EmptyState>
        ) : (
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
        )
      ) : units.length > 0 ? (
        <div className="army-strip">
          {agruparUnidades(filasEjercito).map((seccion) => (
            <Fragment key={seccion.grupo}>
              <div className="army-divider" role="separator" aria-label={seccion.etiqueta}>
                <span className="army-divider-label">{seccion.etiqueta}</span>
                <span className="army-divider-count">{seccion.unidades.length}</span>
              </div>
              {seccion.unidades.map((fila) => {
                const u = fila.principal;
                const perfil = (v: (typeof fila)["principal"]) => ({
                  name: v.name,
                  size: v.size,
                  quality: v.quality,
                  defense: v.defense,
                  cost: v.cost,
                  maxWounds: v.maxWounds,
                  rules: v.rules,
                  loadout: v.loadout,
                  strength: v.strength,
                  dexterity: v.dexterity,
                  willpower: v.willpower,
                  power: v.power,
                  level: v.level,
                  experience: v.experience,
                  gold: v.gold,
                });
                // "Clase · tipo de unidad" para el subtitulo de la ficha: solo
                // en quest, donde el nombre de arriba es el propio del heroe.
                const subtituloDe = (v: (typeof fila)["principal"]) =>
                  quest
                    ? [heroClasses.find((clase) => clase.$id === v.heroClassId)?.name, v.unitTypeName]
                        .filter(Boolean)
                        .join(" · ")
                    : undefined;
                // Solo en el borrador: sobre el ejercito publicado la vista es
                // de consulta y no ensena nada que se pueda tocar.
                const acciones = (indice: number, nombre: string) =>
                  editable && librosConocidos.length > 0 && entradasGuardadas[indice] ? (
                    <>
                      <button type="button" onClick={() => setEditandoIndice(indice)}>
                        Configurar
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={busy}
                        onClick={() => void onRemoveUnit(indice, nombre)}
                      >
                        Quitar
                      </button>
                    </>
                  ) : null;
                return (
                  <div key={fila.key} className="army-slide">
                    <UnitCard
                      variant="ejercito"
                      quest={quest}
                      formato={quest ? "personaje" : "tarot"}
                      subtitulo={subtituloDe(u)}
                      upgrades={u.upgrades ?? []}
                      glosario={glosario}
                      onHabilidad={setHabilidad}
                      avatarUrl={avatarDe(u)}
                      unit={perfil(u)}
                      questClassSkills={habilidadesParaHeroe(u.heroClassId, u.level)}
                      onQuestClassSkill={setHabilidadClase}
                      combinada={u.combined}
                      notas={u.notes}
                      adjunta={
                        fila.adjunta
                          ? { ...perfil(fila.adjunta), combinada: fila.adjunta.combined, upgrades: fila.adjunta.upgrades ?? [] }
                          : undefined
                      }
                      accion={acciones(fila.indice, u.name)}
                      accionAdjunta={
                        fila.indiceAdjunta !== undefined && fila.adjunta
                          ? acciones(fila.indiceAdjunta, fila.adjunta.name)
                          : null
                      }
                    />
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      ) : (
        <EmptyState title={`${noun.demonstrativeCap} ${noun.singular} no tiene unidades todavia`}>
          <p className="muted">
            {librosConocidos.length > 0
              ? "Anadelas desde su faccion, o importa una lista de Army Forge."
              : `Importa una lista de Army Forge, o crea${noun.pronoun} desde una faccion del catalogo.`}
          </p>
        </EmptyState>
      )}

      {decidirBorrador && draft ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Borrador pendiente"
          onClick={decidirBorrador === "peticion" ? () => setDecidirBorrador(null) : undefined}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Borrador sin aplicar</h2>
            <p className="muted">
              Hay un borrador sin aplicar de {noun.demonstrative} {noun.singular}
              {draft.updatedAt ? `, de ${formatDateTime(draft.updatedAt)}` : ""}. Estas viendo la version publicada, y
              no se puede editar sin decidir antes que hacer con el.
            </p>
            <div className="stack">
              <button type="button" className="primary" onClick={continuarBorrador}>
                {decidirBorrador === "entrada" ? "Continuar editando el borrador" : "Editar el borrador"}
              </button>
              {decidirBorrador === "entrada" ? (
                <button type="button" onClick={ignorarBorrador}>
                  Ignorar el borrador y ver {noun.article} {noun.singular}
                </button>
              ) : null}
              <button type="button" className="danger" disabled={busy} onClick={() => setConfirmando("descartar")}>
                Descartar el borrador
              </button>
            </div>
            {decidirBorrador === "entrada" ? (
              <p className="small muted" style={{ marginTop: 12, marginBottom: 0 }}>
                Ignorarlo no lo borra: podras volver a el desde el boton Borrador.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {confirmando === "descartar" && draft ? (
        <ConfirmDialog
          title="Descartar el borrador"
          confirmLabel="Descartar"
          danger
          busy={busy}
          onCancel={() => setConfirmando(null)}
          onConfirm={() => {
            setConfirmando(null);
            void onDiscard();
          }}
        >
          <p>
            Se perderan los cambios sin aplicar de <strong>{draft.name}</strong>. {noun.articleCap} {noun.singular}{" "}
            publicad{noun.genderSuffix} se queda como esta.
          </p>
        </ConfirmDialog>
      ) : null}

      {confirmando === "borrar" && army ? (
        <ConfirmDialog
          title={`Borrar ${noun.article} ${noun.singular}`}
          confirmLabel="Borrar"
          danger
          busy={busy}
          onCancel={() => setConfirmando(null)}
          onConfirm={() => {
            setConfirmando(null);
            void onDelete();
          }}
        >
          <p>
            Se borra <strong>{army.name}</strong> enter{noun.genderSuffix}: la version publicada, su borrador si lo
            hay y todas las versiones archivadas. No se puede deshacer.
          </p>
        </ConfirmDialog>
      ) : null}

      {importOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Importar desde Army Forge"
          onClick={() => setImportOpen(false)}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="spread">
              <h2 style={{ margin: 0 }}>Importar desde Army Forge</h2>
              <button type="button" className="ghost tiny" onClick={() => setImportOpen(false)}>
                Cerrar
              </button>
            </div>
            <p className="muted small">
              Comparte la lista en Army Forge y pega aqui el enlace. Las unidades se guardan para poder usarlas como
              marcadores durante la partida.
            </p>
            <div className="row">
              <input
                placeholder="https://army-forge.onepagerules.com/share?id=…"
                value={form.listId}
                onChange={(e) => setForm({ ...form, listId: e.target.value })}
                style={{ flex: 1, minWidth: 220 }}
              />
              <button type="button" className="primary" onClick={() => void importFromArmyForge()} disabled={busy}>
                {busy ? "Importando…" : "Importar"}
              </button>
            </div>
            {units.length > 0 ? (
              <p className="small muted" style={{ marginBottom: 0 }}>
                Lista guardada con {units.length} unidades.{" "}
                {form.listId ? (
                  <a href={listUrl(form.listId)} target="_blank" rel="noreferrer">
                    Abrir en Army Forge
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {editable ? (
        <div className="fab-group">
          <div className="menu-wrap">
            <input
              ref={facInputRef}
              type="text"
              className="fac-buscador"
              value={facAbierta ? filtroFaccion : textoFaccion}
              placeholder={librosConocidos.length > 0 ? "Cambiar faccion…" : "Buscar faccion…"}
              aria-label="Faccion con la que anadir la siguiente unidad"
              onClick={(event) => {
                event.stopPropagation();
                setFacAbierta(true);
                setFiltroFaccion("");
              }}
              onChange={(event) => {
                setFiltroFaccion(event.target.value);
                setFacAbierta(true);
              }}
            />
            {facAbierta ? (
              <div
                className="menu"
                role="menu"
                style={{ bottom: "calc(100% + 6px)", top: "auto", left: 0, right: "auto" }}
                onClick={(event) => event.stopPropagation()}
              >
                {cargandoFacciones && faccionesDisponibles.length === 0 ? (
                  <span className="menu-label">Cargando…</span>
                ) : opcionesFiltradas.length === 0 ? (
                  <span className="menu-label">Ninguna faccion coincide</span>
                ) : (
                  opcionesFiltradas.map((libroDisponible) => (
                    <button
                      key={libroDisponible.$id}
                      type="button"
                      role="menuitem"
                      className={libroDisponible.$id === facActual ? "active" : undefined}
                      onClick={() => seleccionarFaccion(libroDisponible)}
                    >
                      {libroDisponible.factionName ?? libroDisponible.name}
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="fab"
            title={facActual ? `Anadir unidad de ${libroActual?.factionName ?? libroActual?.name ?? ""}` : "Elegir faccion"}
            aria-label="Anadir una unidad"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              onClickAnadir();
            }}
          >
            +
          </button>
        </div>
      ) : null}

      {habilidad ? (
        <RuleCardModal habilidad={habilidad} glosario={glosario} onCerrar={() => setHabilidad(null)} onAbrir={setHabilidad} />
      ) : null}

      {habilidadClase ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={habilidadClase.name} onClick={() => setHabilidadClase(null)}>
          <div onClick={(event) => event.stopPropagation()}>
            <HeroSkillCard
              skill={habilidadClase}
              glosario={glosario}
              onAbrir={(regla) => {
                setHabilidadClase(null);
                setHabilidad(regla);
              }}
            />
          </div>
        </div>
      ) : null}

      {(anadiendo || editandoIndice !== null) && bookKeyParaWizard ? (
        <AddUnitWizard
          bookKey={bookKeyParaWizard}
          busy={busy}
          editando={editandoIndice === null ? null : entradasGuardadas[editandoIndice]}
          unidadesDelEjercito={unidadesParaUnir}
          onCancel={() => {
            setAnadiendo(false);
            setEditandoIndice(null);
          }}
          onConfirm={(entry, book, packages, catalogo, unirA) =>
            void onAddUnit(entry, book, packages, catalogo, editandoIndice, unirA)
          }
        />
      ) : null}

      {/* La vista es de consulta: los datos y las imagenes se pliegan para que
          las cartas lleven el peso, y se abren cuando hay algo que cambiar. */}
      <details className="army-details" open={!army}>
        <summary>
          Datos e imagenes
          {editable ? null : <span className="small muted"> · solo lectura</span>}
        </summary>
        <form id="army-form" onSubmit={onSubmit} className="stack">
        {/* Un `fieldset` y no campo por campo: asi lo que se anada manana queda
            bloqueado tambien sin que haya que acordarse. */}
        <fieldset className="desnudo stack" disabled={!editable}>
        <section className="card">
          {/* Nombre, modo, faccion, puntos y miniaturas no viven aqui: o estan en
              la barra, o los calcula el constructor a partir de las unidades y
              editarlos a mano solo serviria para descuadrarlos. */}
          <h2>Datos</h2>
          <div className="field">
            <label htmlFor="notes">Notas</label>
            <textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <label className="row" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={form.shared}
              onChange={(e) => setForm({ ...form, shared: e.target.checked })}
              style={{ width: "auto" }}
            />
            <span>Compartir con el resto de usuarios aceptados</span>
          </label>
          {army && form.shared !== army.shared ? (
            <p className="small muted">
              El cambio de visibilidad se aplica a {noun.pluralArticle} {noun.plural} nuevos. Para uno ya creado,
              ajusta los permisos de la fila desde la consola de Appwrite.
            </p>
          ) : null}
        </section>

        <section className="card">
          <h2>Imagenes</h2>
          <input type="file" accept="image/*" multiple onChange={(e) => void onUpload(e.target.files)} disabled={busy} />
          {images.length > 0 ? (
            <div className="grid" style={{ marginTop: 12, gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
              {images.map((fileId) => (
                <div key={fileId} className="card" style={{ padding: 8 }}>
                  <img
                    src={imageUrl(fileId)}
                    alt=""
                    style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6 }}
                  />
                  <div className="row small" style={{ marginTop: 6 }}>
                    <button type="button" className="tiny ghost" onClick={() => setCoverId(fileId)}>
                      {coverId === fileId ? "Portada ✓" : "Portada"}
                    </button>
                    <button type="button" className="tiny ghost danger" onClick={() => void onRemoveImage(fileId)}>
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <div className="row">
          <button
            type="submit"
            className="primary"
            disabled={busy || !editable}
            title={editable ? undefined : `Pulsa Editar para cambiar ${noun.article} ${noun.singular}`}
          >
            {busy ? "Guardando…" : "Guardar en el borrador"}
          </button>
        </div>
        </fieldset>
      </form>
      </details>
    </>
  );
}
