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
import { gainIsRule, gainLabel, walkGains } from "./armyForgeGains";

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
    if (gainIsRule(gain)) {
      const etiqueta = gainLabel(gain);
      if (etiqueta) reglas.push(parseHabilidad(etiqueta, "regla"));
      continue;
    }
    const nombre = gain.name ?? gain.label ?? "";
    if (!nombre) continue;
    ganancias.push({
      nombre,
      perfil: perfilDe(gain),
      reglas: reglasDe(gain),
      cuantas: gain.count ?? 1,
    });
  }

  // Si de todo esto no ha salido nada legible, mejor la etiqueta original que
  // una fila vacia.
  if (ganancias.length === 0 && reglas.length === 0) return { ganancias: [], reglas: [], crudo: true };
  return { ganancias, reglas, crudo: false };
}

function reglasDe(gain: Gain): Habilidad[] {
  const reglas: Habilidad[] = [];
  walkGains([...(gain.specialRules ?? []), ...(gain.content ?? [])], (nested) => {
    if (!gainIsRule(nested)) return;
    const etiqueta = gainLabel(nested);
    if (etiqueta) reglas.push(parseHabilidad(etiqueta, "regla"));
  });
  return reglas;
}
