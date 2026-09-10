/**
 * Desmonta una opcion de mejora en lo que da: armas, equipo y reglas.
 *
 * La etiqueta que trae el catalogo lo dice todo de corrido —"Heavy Rifle (24",
 * A1, AP(1)), Heavy CCW (A1, AP(1))"— y ahi dentro hay dos cosas mezcladas: el
 * perfil del arma, que se lee, y las reglas, que hay que consultar. Se
 * reconstruye desde `gains`, no partiendo el texto, porque el texto ya viene
 * armado por Army Forge y volver a partirlo es adivinar.
 */
import type { UpgradeOption } from "./builder";
import type { Gain } from "./loadout";
import { parseHabilidad } from "./reglas";
import type { Habilidad } from "./reglas";

/** Un arma o una pieza de equipo que da la opcion. */
export interface GananciaOpcion {
  nombre: string;
  /** El perfil de un arma: `24", A1`. Null cuando no es arma. */
  perfil: string | null;
  /** Lo que concede: reglas del arma, o las del objeto. */
  reglas: Habilidad[];
  cuantas: number;
}

export interface DesgloseOpcion {
  ganancias: GananciaOpcion[];
  /** Reglas que la opcion da por si misma, sin objeto de por medio. */
  reglas: Habilidad[];
  /** Cierto si no se ha podido desmontar y hay que pintar la etiqueta cruda. */
  crudo: boolean;
}

function etiquetaRegla(regla: { name?: string; label?: string; rating?: string | number }): string {
  if (regla.label) return regla.label;
  if (!regla.name) return "";
  return regla.rating === undefined || regla.rating === null || regla.rating === ""
    ? regla.name
    : `${regla.name}(${regla.rating})`;
}

function esRegla(gain: Gain): boolean {
  // El catalogo no siempre pone `type`, asi que tambien vale la forma: una
  // regla no tiene perfil ni contenido.
  if (gain.type) return gain.type.includes("Rule");
  return gain.range === undefined && gain.attacks === undefined && !gain.specialRules && !gain.content;
}

function perfilDe(gain: Gain): string | null {
  const partes: string[] = [];
  if (typeof gain.range === "number" && gain.range > 0) partes.push(`${gain.range}"`);
  if (typeof gain.attacks === "number") partes.push(`A${gain.attacks}`);
  return partes.length > 0 ? partes.join(", ") : null;
}

export function desglosarOpcion(option: UpgradeOption): DesgloseOpcion {
  const gains = option.gains ?? [];
  if (gains.length === 0) {
    return { ganancias: [], reglas: [], crudo: true };
  }

  const ganancias: GananciaOpcion[] = [];
  const reglas: Habilidad[] = [];

  for (const gain of gains) {
    if (esRegla(gain)) {
      const etiqueta = etiquetaRegla(gain);
      if (etiqueta) reglas.push(parseHabilidad(etiqueta, "regla"));
      continue;
    }
    const nombre = gain.name ?? gain.label ?? "";
    if (!nombre) continue;
    ganancias.push({
      nombre,
      perfil: perfilDe(gain),
      reglas: (gain.specialRules ?? gain.content ?? [])
        .map(etiquetaRegla)
        .filter(Boolean)
        .map((etiqueta) => parseHabilidad(etiqueta, "regla")),
      cuantas: gain.count ?? 1,
    });
  }

  // Si de todo esto no ha salido nada legible, mejor la etiqueta original que
  // una fila vacia.
  if (ganancias.length === 0 && reglas.length === 0) return { ganancias: [], reglas: [], crudo: true };
  return { ganancias, reglas, crudo: false };
}
