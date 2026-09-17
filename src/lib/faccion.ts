import type { ArmyBook, ArmyUnit, CatalogRule } from "../api/catalog";
import { parseHabilidad } from "./reglas";
import type { Habilidad } from "./reglas";
import { baseLoadout } from "./loadout";
import type { ResolvedUnit } from "./armyForgeResolve";

/** "Tough(3)" -> "Tough": el glosario indexa por el nombre pelado. */
function nombreBase(etiqueta: string): string {
  return etiqueta.replace(/\(.*\)$/, "").trim();
}

/**
 * Lo que una faccion aporta de su cosecha.
 *
 * Un libro publica sus reglas y las comunes que usan sus unidades mezcladas en
 * la misma lista. Separarlas no es cosa nuestra: el propio dato marca con
 * `coreType` las que vienen del reglamento, y deja en nulo las suyas. Sobre 14
 * libros de Grimdark Future, el 56% de las reglas son exclusivas de una faccion.
 */
export function habilidadesDeFaccion(
  book: ArmyBook | null,
  glosario: Map<string, CatalogRule>,
  units: ArmyUnit[] = [],
): CatalogRule[] {
  // Lo que publica el libro es la respuesta buena. Pero un libro que aun no se
  // haya vuelto a volcar no lo lleva, y entonces no es que no tenga reglas
  // propias: es que no lo sabemos. En ese caso se deducen de las que usan sus
  // unidades, que se queda corto —no incluye las publicadas y no usadas— pero
  // no miente diciendo que no hay ninguna.
  const nombres = book?.ruleNames?.length
    ? book.ruleNames
    : [...new Set(units.flatMap((unit) => unit.rules ?? []).map(nombreBase))];

  const vistas = new Set<string>();
  return nombres
    .map((nombre) => glosario.get(nombre.toLowerCase()))
    .filter((regla): regla is CatalogRule => {
      if (!regla || regla.coreType !== null) return false;
      if (vistas.has(regla.$id)) return false;
      vistas.add(regla.$id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Cierto si `nombre` aparece como palabra suelta en el texto, respetando
 *  mayusculas: las reglas del reglamento se nombran en capital ("get Bane in
 *  melee"), y exigirlo evita que "fast" en una frase cuente como la regla Fast. */
function mencionada(nombre: string, texto: string): boolean {
  const escapado = nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escapado}\\b`).test(texto);
}

/**
 * La cara B: las reglas del reglamento basico que tocan las unidades de la
 * faccion. Las marca `coreType`, y se recogen tanto de las reglas de unidad
 * como de las de sus armas y equipo, para que "Reglas generales" tenga la carta
 * de un AP o un Blast y no solo la de un Fast.
 *
 * Ademas se sigue el rastro por el texto: una regla propia que dice "get Bane
 * in melee" arrastra la carta de Bane aunque ninguna unidad la lleve escrita, y
 * se repite hasta que ninguna descripcion nueva mencione otra.
 */
export function reglasGeneralesDeFaccion(
  glosario: Map<string, CatalogRule>,
  units: ArmyUnit[] = [],
  propias: CatalogRule[] = [],
): CatalogRule[] {
  const directos = new Set<string>();
  for (const unit of units) {
    for (const etiqueta of unit.rules ?? []) directos.add(nombreBase(etiqueta));
    for (const entrada of baseLoadout(unit.weapons, unit.items)) {
      for (const regla of entrada.rules) directos.add(nombreBase(regla));
    }
  }

  const nucleo = new Map<string, CatalogRule>();
  const textos = propias.map((regla) => regla.description).filter(Boolean);
  const incorporar = (regla: CatalogRule | undefined): boolean => {
    if (!regla || regla.coreType === null || nucleo.has(regla.$id)) return false;
    nucleo.set(regla.$id, regla);
    if (regla.description) textos.push(regla.description);
    return true;
  };

  for (const nombre of directos) {
    const regla = glosario.get(nombre.toLowerCase());
    if (regla?.description) textos.push(regla.description);
    incorporar(regla);
  }

  const candidatas = [...glosario.values()].filter((regla) => regla.coreType !== null);
  for (let cambio = true; cambio; ) {
    cambio = false;
    const corpus = textos.join("\n");
    for (const regla of candidatas) {
      if (!nucleo.has(regla.$id) && mencionada(regla.name, corpus) && incorporar(regla)) cambio = true;
    }
  }

  return [...nucleo.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/**
 * Todo lo que aparece de verdad en las fichas de datos de estas unidades: lo
 * que llevan escrito, lo que concede su equipo ya resuelto, y lo que se
 * arrastra por texto desde ahi —un "Preacher" que concede "Bane in melee"
 * cuenta a Bane como aparecida aunque ninguna unidad la lleve escrita—.
 *
 * A diferencia de `reglasGeneralesDeFaccion`, no se limita a las reglas del
 * reglamento basico: el nucleo mezcla reglas propias y comunes, porque sirve
 * para filtrar ambas pestanas por igual.
 */
export function reglasUsadasEnEjercito(glosario: Map<string, CatalogRule>, units: ResolvedUnit[]): CatalogRule[] {
  const directos = new Set<string>();
  for (const unit of units) {
    for (const etiqueta of unit.rules) directos.add(nombreBase(etiqueta));
    for (const entrada of unit.loadout) {
      for (const regla of entrada.rules) directos.add(nombreBase(regla));
    }
  }

  const nucleo = new Map<string, CatalogRule>();
  const textos: string[] = [];
  const incorporar = (regla: CatalogRule | undefined): boolean => {
    if (!regla || nucleo.has(regla.$id)) return false;
    nucleo.set(regla.$id, regla);
    if (regla.description) textos.push(regla.description);
    return true;
  };

  for (const nombre of directos) incorporar(glosario.get(nombre.toLowerCase()));

  const candidatas = [...glosario.values()];
  for (let cambio = true; cambio; ) {
    cambio = false;
    const corpus = textos.join("\n");
    for (const regla of candidatas) {
      if (!nucleo.has(regla.$id) && mencionada(regla.name, corpus) && incorporar(regla)) cambio = true;
    }
  }

  return [...nucleo.values()];
}

/** Cierto si alguna de estas unidades puede lanzar hechizos: no dice cuales
 *  conoce cada una —el libro no lo guarda por unidad—, asi que solo sirve
 *  para decidir si hay algo que mostrar en "Hechizos". La regla puede venir
 *  escrita en la unidad o concedida por un objeto de su equipo —un "High
 *  Oracle" que da Caster(2)—, asi que se miran las dos.
 */
export function tieneCaster(units: ResolvedUnit[]): boolean {
  const esCaster = (regla: string) => /^caster(?:\(\d+\))?$/i.test(regla.trim());
  return units.some((unit) => unit.rules.some(esCaster) || unit.loadout.some((entrada) => entrada.rules.some(esCaster)));
}

export interface EquipoDeFaccion {
  habilidad: Habilidad;
  /** Unidades del libro que lo llevan de serie. */
  unidades: string[];
}

/** Lo comun a agrupar equipo por nombre, venga de un catalogo o de un
 *  ejercito ya resuelto: cuenta en cuantas unidades distintas sale cada uno. */
function agruparEquipo(entradas: Array<{ unidad: string; objetos: ReturnType<typeof baseLoadout> }>): EquipoDeFaccion[] {
  const porNombre = new Map<string, EquipoDeFaccion>();

  for (const { unidad, objetos } of entradas) {
    for (const item of objetos.filter((entry) => entry.kind === "gear")) {
      const clave = item.name.toLowerCase();
      const ya = porNombre.get(clave);
      if (ya) {
        if (!ya.unidades.includes(unidad)) ya.unidades.push(unidad);
        continue;
      }
      porNombre.set(clave, {
        habilidad: { ...parseHabilidad(item.name, "equipo"), concede: item.rules },
        unidades: [unidad],
      });
    }
  }

  return [...porNombre.values()].sort((a, b) => a.habilidad.nombre.localeCompare(b.habilidad.nombre, "es"));
}

/**
 * El equipo que aparece en el libro, sacado de las unidades.
 *
 * No hay una lista de equipo en el libro: cada unidad lleva el suyo, asi que se
 * juntan y se cuenta en cuantas sale. Es lo que permite ver de un vistazo si un
 * objeto es de una unidad concreta o de toda la faccion.
 *
 * `baseLoadout` tambien saca, de cada objeto, las armas que trae dentro (el
 * Combat Shield concede Bash, un cuerpo a cuerpo) como entradas propias de
 * tipo "weapon": eso esta bien para la ficha de la unidad, donde tienen que
 * salir en su tabla de armas, pero aqui colarian como si "Bash" fuera un
 * objeto mas de equipo, con una carta vacia porque un arma no tiene reglas
 * propias que conceder. Solo interesan los objetos de verdad (`kind ===
 * "gear"`); sus armas ya se ven en la unidad que las lleva.
 */
export function equipoDeFaccion(units: ArmyUnit[]): EquipoDeFaccion[] {
  return agruparEquipo(units.map((unit) => ({ unidad: unit.name, objetos: baseLoadout(null, unit.items) })));
}

/**
 * La cara del ejercito: el equipo que llevan de verdad las unidades de esta
 * lista, con los reemplazos ya aplicados —no el equipo de serie de todo lo
 * que existe en el libro, que es lo que da `equipoDeFaccion`—.
 */
export function equipoDeEjercito(units: ResolvedUnit[]): EquipoDeFaccion[] {
  return agruparEquipo(units.map((unit) => ({ unidad: unit.unitTypeName ?? unit.name, objetos: unit.loadout })));
}
