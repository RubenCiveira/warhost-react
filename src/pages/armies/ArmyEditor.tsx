import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useGameSystem } from "../../context/GameSystemContext";
import { armyNounFor, getGameSystem, resumenFaccion } from "../../lib/gameSystems";
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
import type { ArmyForgeList } from "../../lib/armyForgeResolve";
import type { Army } from "../../lib/types";
import { errorMessage, formatDateTime } from "../../lib/format";
import { EmptyState, ErrorBanner, Spinner } from "../../components/ui";
import UnitCard from "../../components/UnitCard";
import ConfirmDialog from "../../components/ConfirmDialog";
import AddUnitWizard from "../../components/AddUnitWizard";
import { entriesFromForgeList, esHeroe, rehydrateEntries, serializeEntries } from "../../lib/builder";
import type { StoredEntry } from "../../lib/builder";
import type { BuilderEntry, UpgradeSection } from "../../lib/builder";
import { getBook, getBookByUid, listBooks, listRuleGlossary } from "../../api/catalog";
import type { ArmyBook, ArmyUnit, CatalogRule } from "../../api/catalog";
import SpellCard from "../../components/SpellCard";
import RuleCardModal from "../../components/RuleCardModal";
import type { Habilidad } from "../../lib/reglas";
import { parseHabilidad } from "../../lib/reglas";
import RuleCard from "../../components/RuleCard";
import AvisoComposicion from "../../components/AvisoComposicion";
import { equipoDeFaccion, habilidadesDeFaccion, reglasGeneralesDeFaccion } from "../../lib/faccion";
import { agruparUnidades, emparejarHeroes } from "../../lib/unidades";
import { listUnits as listCatalogUnits, listUpgradePackages } from "../../api/catalog";
import Tabs from "../../components/Tabs";
import { parseSpells } from "../../lib/spells";
import { composeArmyPayload, sourceBooks } from "../../lib/armyPayload";

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
  const [importOpen, setImportOpen] = useState(false);
  /** Accion destructiva a la espera de confirmacion. */
  const [confirmando, setConfirmando] = useState<"descartar" | "borrar" | null>(null);
  const [anadiendo, setAnadiendo] = useState(false);
  /** Indice en `entries` de la unidad que se esta reconfigurando. */
  const [editandoIndice, setEditandoIndice] = useState<number | null>(null);
  const [pestana, setPestana] = useState<"unidades" | "hechizos" | "habilidades" | "equipo" | "generales">("unidades");
  const [verGenerales, setVerGenerales] = useState(false);
  /**
   * Las facciones conocidas de este ejercito (puede haber varias) y las
   * unidades de su catalogo, solo para saber que hechizos/habilidades/equipo
   * publica cada una: el ejercito en si no las guarda.
   */
  const [librosPorClave, setLibrosPorClave] = useState<Map<string, ArmyBook>>(new Map());
  const [unidadesPorLibro, setUnidadesPorLibro] = useState<Map<string, ArmyUnit[]>>(new Map());
  const [glosario, setGlosario] = useState<Map<string, CatalogRule>>(new Map());
  /** `bookKey` elegido en el buscador: con esa faccion se anade la siguiente unidad. */
  const [facSeleccionada, setFacSeleccionada] = useState("");
  const [textoFaccion, setTextoFaccion] = useState("");
  /** El desplegable de facciones, junto al boton de anadir: abierto o no, y el filtro mientras esta abierto. */
  const [facAbierta, setFacAbierta] = useState(false);
  const [filtroFaccion, setFiltroFaccion] = useState("");
  const [habilidad, setHabilidad] = useState<Habilidad | null>(null);
  /**
   * Abrir borrador en curso. Escribiendo deprisa se dispararian varias aperturas
   * a la vez y la segunda chocaria con el indice unico, asi que todas esperan a
   * la misma promesa.
   */
  const abriendoBorrador = useRef<Promise<Army> | null>(null);
  /** Se esta trabajando sobre el borrador, o mirando la version publicada. */
  const [viendoBorrador, setViendoBorrador] = useState(false);
  /**
   * De donde sale la pregunta sobre el borrador. Al entrar hay que decidir si o
   * si: cerrar sin elegir dejaria la edicion bloqueada sin que se sepa por que.
   * Reabierta desde la barra ya se sabe, y basta con poder cerrarla.
   */
  const [decidirBorrador, setDecidirBorrador] = useState<"entrada" | "peticion" | null>(null);
  /** Sin faccion de origen resuelta: pide elegir una antes de poder editar. */
  const [eligiendoFaccion, setEligiendoFaccion] = useState(false);
  const [faccionesDisponibles, setFaccionesDisponibles] = useState<ArmyBook[]>([]);
  const [cargandoFacciones, setCargandoFacciones] = useState(false);
  const [faccionElegida, setFaccionElegida] = useState("");

  useEffect(() => {
    if (!armyId) return;
    let cancelled = false;
    // Las facciones conocidas son de este ejercito en concreto: si se
    // navega a otro no deberian arrastrarse las del anterior.
    setLibrosPorClave(new Map());
    setUnidadesPorLibro(new Map());
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
    // Sin ninguna faccion de origen no hay como anadir ni reconfigurar
    // unidades: se pide elegir una antes de abrir el borrador.
    if (librosConocidos.length === 0) {
      setFaccionElegida("");
      setEligiendoFaccion(true);
      return;
    }
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

  // Sirve tanto al dialogo de "elegir faccion" como al autocompletar de la
  // cabecera, asi que se carga en cuanto se sabe el sistema de juego, no solo
  // al abrir el dialogo.
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
    if (!eligiendoFaccion) return undefined;
    const conEscape = (event: KeyboardEvent) => event.key === "Escape" && setEligiendoFaccion(false);
    document.addEventListener("keydown", conEscape);
    return () => document.removeEventListener("keydown", conEscape);
  }, [eligiendoFaccion]);

  /** Asigna la faccion elegida como origen y entra a editar en el mismo paso. */
  async function onAsignarFaccion() {
    if (!faccionElegida || !user) return;
    setBusy(true);
    setError(null);
    try {
      const libroElegido = await getBook(faccionElegida);
      void registrarLibro(libroElegido);

      // Ejercito nuevo, todavia sin guardar: se crea ya con la faccion puesta,
      // en vez de guardar uno vacio y obligar a un "Editar" aparte.
      if (!army) {
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
        setEligiendoFaccion(false);
        setFaccionElegida("");
        navigate(`/ejercitos/${creado.$id}`, { replace: true });
        return;
      }

      const abierto = await conBorrador();
      if (!abierto) return;
      const base = (() => {
        try {
          return JSON.parse(abierto.listJson ?? "{}") as Record<string, unknown>;
        } catch {
          return {};
        }
      })();
      const actualizado = {
        ...base,
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
      };
      const guardado = await saveDraft(abierto.$id, { listJson: JSON.stringify(actualizado) });
      setDraft(guardado);
      setViendoBorrador(true);
      mostrar(guardado);
      setEligiendoFaccion(false);
      setFaccionElegida("");
      setNotice(
        `Faccion asignada. Editando un borrador. ${noun.articleCap} ${noun.singular} sigue como estaba hasta que pulses Guardar.`,
      );
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
  const quest = getGameSystem(form.gameSystem)?.id === "gfsq" || getGameSystem(form.gameSystem)?.id === "aofq";
  const units = useMemo(() => parseStoredList(listJson), [listJson]);
  const librosConocidos = useMemo(() => [...librosPorClave.values()], [librosPorClave]);
  const unidadesTodas = useMemo(() => [...unidadesPorLibro.values()].flat(), [unidadesPorLibro]);
  /** uid de Army Forge -> `bookKey` propio, para leer listas importadas multi-faccion. */
  const uidABookKey = useMemo(() => new Map(librosConocidos.map((libro) => [libro.uid, libro.$id])), [librosConocidos]);
  /**
   * Registra un libro ya resuelto (y su catalogo) entre los conocidos de este
   * ejercito, si no lo estaba ya.
   */
  const registrarLibro = useCallback(
    async (libro: ArmyBook) => {
      setLibrosPorClave((prev) => (prev.has(libro.$id) ? prev : new Map(prev).set(libro.$id, libro)));
      if (unidadesPorLibro.has(libro.$id)) return;
      const unidades = await listCatalogUnits(libro.$id);
      setUnidadesPorLibro((prev) => (prev.has(libro.$id) ? prev : new Map(prev).set(libro.$id, unidades)));
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
  /** Un hechizo por cada uno que publique cualquiera de las facciones conocidas. */
  const hechizos = useMemo(
    () =>
      librosConocidos.flatMap((libro) =>
        parseSpells(libro.spells ?? null).map((spell) => ({ spell, faccion: libro.factionName ?? libro.name })),
      ),
    [librosConocidos],
  );
  /** Union de las reglas propias de cada faccion, sin repetir. */
  const habilidades = useMemo(() => {
    const vistas = new Map<string, CatalogRule>();
    for (const libro of librosConocidos) {
      for (const regla of habilidadesDeFaccion(libro, glosario, unidadesPorLibro.get(libro.$id) ?? [])) {
        vistas.set(regla.$id, regla);
      }
    }
    return [...vistas.values()];
  }, [librosConocidos, glosario, unidadesPorLibro]);
  const equipo = useMemo(() => equipoDeFaccion(unidadesTodas), [unidadesTodas]);
  const generales = useMemo(
    () => reglasGeneralesDeFaccion(glosario, unidadesTodas, habilidades),
    [glosario, unidadesTodas, habilidades],
  );

  /** La faccion con la que se anade la siguiente unidad: la elegida en el autocompletar, o la primera conocida. */
  const facActual = facSeleccionada && librosPorClave.has(facSeleccionada) ? facSeleccionada : (librosConocidos[0]?.$id ?? "");
  const libroActual = librosPorClave.get(facActual) ?? null;
  /**
   * El `bookKey` con el que abrir el asistente: reconfigurar una unidad usa
   * el suyo propio (sigue siendo de su faccion), no la que este elegida en
   * el autocompletar; anadir una nueva usa la faccion actual.
   */
  const bookKeyParaWizard =
    editandoIndice !== null ? entradasGuardadas[editandoIndice]?.bookKey || facActual : facActual;

  useEffect(() => {
    if (libroActual) setTextoFaccion(libroActual.factionName ?? libroActual.name);
  }, [libroActual]);

  /** El texto del autocompletar coincide con una faccion del catalogo: la registra y la deja seleccionada. */
  function elegirFaccionParaAnadir(texto: string) {
    setTextoFaccion(texto);
    const encontrada = faccionesDisponibles.find((libro) => (libro.factionName ?? libro.name) === texto);
    if (!encontrada) return;
    setFacSeleccionada(encontrada.$id);
    void registrarLibro(encontrada);
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

      const guardadas = (() => {
        try {
          return (JSON.parse(listJson ?? "{}") as { entries?: unknown }).entries;
        } catch {
          return undefined;
        }
      })();
      // El indice viene del array guardado, asi que se aplica ahi y no sobre la
      // lista ya rehidratada: rehidratar descarta las unidades que ya no estan
      // en el libro, y entonces los indices no serian los mismos y se
      // reconfiguraria otra unidad sin que nada avisara.
      const anteriores = Array.isArray(guardadas) ? (guardadas as StoredEntry[]) : [];
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
          {/* Un ejercito puede mezclar varias facciones: esto elige con cual
              se anade la siguiente unidad, y de paso deja anadir una nueva
              faccion sin pasar por el dialogo de "sin faccion de origen". */}
          {editable && librosConocidos.length > 0 ? (
            <span className="row" style={{ gap: 6 }}>
              <input
                list="army-facciones-elegibles"
                value={textoFaccion}
                placeholder="Buscar faccion para anadir…"
                aria-label="Faccion con la que anadir la siguiente unidad"
                onChange={(e) => elegirFaccionParaAnadir(e.target.value)}
                style={{ minWidth: 180 }}
              />
              <datalist id="army-facciones-elegibles">
                {faccionesDisponibles.map((libroDisponible) => (
                  <option key={libroDisponible.$id} value={libroDisponible.factionName ?? libroDisponible.name} />
                ))}
              </datalist>
            </span>
          ) : null}
          {/* Crear desde cero y no encontrar la importacion es lo primero que
              se prueba: sin ejercito todavia no hay menu "Mas opciones" donde
              esconderla, asi que aqui va directa y a la vista. */}
          {!army ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setFaccionElegida("");
                  setEligiendoFaccion(true);
                }}
              >
                Elegir faccion
              </button>
              <button type="button" onClick={() => setImportOpen(true)}>
                Importar desde Army Forge
              </button>
            </>
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
          No se ha podido identificar de que faccion del catalogo viene {noun.demonstrative} {noun.singular}, asi
          que no se pueden anadir unidades desde aqui. Edita{noun.pronoun} en Army Forge y vuelve a
          importar{noun.pronoun}, o crea {noun.indefArticle} {noun.newForm} desde su faccion.
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
          <EmptyState title="Esta faccion no publica reglas propias" />
        ) : (
          <div className="army-strip">
            {habilidades.map((regla) => (
              <div key={regla.$id} className="army-slide">
                <RuleCard habilidad={parseHabilidad(regla.name, "regla")} regla={regla} />
              </div>
            ))}
          </div>
        )
      ) : pestana === "equipo" ? (
        equipo.length === 0 ? (
          <EmptyState title="Ninguna unidad de esta faccion lleva equipo" />
        ) : (
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
        )
      ) : pestana === "hechizos" ? (
        hechizos.length === 0 ? (
          <EmptyState title="Esta faccion no tiene hechizos">
            <p className="muted">
              {librosConocidos.length > 0
                ? `Su libro de ${noun.singular} no trae ninguno.`
                : `${noun.demonstrativeCap} ${noun.singular} no guarda de que faccion viene, asi que no se pueden mostrar.`}
            </p>
          </EmptyState>
        ) : (
          <div className="army-strip">
            {hechizos.map(({ spell, faccion }) => (
              <div key={spell.key} className="army-slide">
                <SpellCard spell={spell} faction={faccion} />
              </div>
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
                <RuleCard habilidad={parseHabilidad(regla.name, "regla")} regla={regla} />
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
                });
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
                      upgrades={u.upgrades ?? []}
                      glosario={glosario}
                      onHabilidad={setHabilidad}
                      unit={perfil(u)}
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

      {eligiendoFaccion ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={army ? "Sin faccion de origen" : "Elegir faccion de origen"}
          onClick={() => setEligiendoFaccion(false)}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>
              {army ? "Sin faccion de origen no se puede editar" : "Elige la faccion de origen"}
            </h2>
            <p className="muted">
              {army
                ? `No se ha podido identificar de que faccion del catalogo viene ${noun.demonstrative} ${noun.singular}, asi que no se pueden anadir ni reconfigurar unidades. Elige la faccion de la que viene para poder editarl${noun.genderSuffix}.`
                : `Elige de que faccion del catalogo viene ${noun.demonstrative} ${noun.singular} para poder empezar a anadir unidades.`}
            </p>
            <div className="field">
              <label htmlFor="faccion-origen">Faccion</label>
              <select
                id="faccion-origen"
                value={faccionElegida}
                onChange={(event) => setFaccionElegida(event.target.value)}
                disabled={cargandoFacciones}
              >
                <option value="">{cargandoFacciones ? "Cargando…" : "Elige una faccion"}</option>
                {faccionesDisponibles.map((libroDisponible) => (
                  <option key={libroDisponible.$id} value={libroDisponible.$id}>
                    {libroDisponible.factionName ?? libroDisponible.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <button type="button" onClick={() => setEligiendoFaccion(false)}>
                {army ? "Cancelar edicion" : "Cancelar"}
              </button>
              <button
                type="button"
                className="primary"
                disabled={!faccionElegida || busy}
                onClick={() => void onAsignarFaccion()}
              >
                {army
                  ? busy
                    ? "Asignando…"
                    : "Asignar faccion y editar"
                  : busy
                    ? "Creando…"
                    : "Elegir faccion y crear"}
              </button>
            </div>
          </div>
        </div>
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

      {armyId && facActual && editable ? (
        <button
          type="button"
          className="fab"
          title={`Anadir unidad de ${libroActual?.factionName ?? libroActual?.name ?? ""}`}
          aria-label="Anadir una unidad"
          onClick={() => setAnadiendo(true)}
        >
          +
        </button>
      ) : null}

      {habilidad ? (
        <RuleCardModal habilidad={habilidad} glosario={glosario} onCerrar={() => setHabilidad(null)} />
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
