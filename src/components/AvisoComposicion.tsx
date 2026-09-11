import { useEffect, useState } from "react";
import { verificacionesComposicion } from "../lib/composicion";
import type { UnidadComposicion } from "../lib/composicion";
import type { GameSystemId } from "../lib/gameSystems";

/**
 * El estado de composicion, repetido en la lista de ejercitos y en su ficha:
 * no bloquea nada, solo lo dice. En rojo si se pasa de algun limite, en verde
 * si los cumple todos — un icono que solo saliera cuando algo va mal dejaria
 * sin decir si se ha comprobado la composicion o si nunca se ha mirado.
 *
 * El detalle siempre ensena las reglas completas (heroes, unidades,
 * modelos/Tough si el sistema los limita, y copias), cada una con su propio
 * check o warn: aunque el conjunto no cumpla, el usuario tiene que poder ver
 * de un vistazo cuales de las reglas si pasa y cual es la que falla, no solo
 * la lista de lo que va mal.
 *
 * El detalle se despliega al pulsarlo, no con el `title` nativo del
 * navegador: ese no responde al tacto, y en la lista el icono vive dentro del
 * enlace a la ficha, donde un simple tooltip se pierde entre el hover del
 * propio enlace.
 */
export default function AvisoComposicion({
  puntos,
  unidades,
  gameSystem,
}: {
  puntos: number;
  unidades: UnidadComposicion[];
  gameSystem: GameSystemId;
}) {
  const verificaciones = verificacionesComposicion(puntos, unidades, gameSystem);
  const cumple = verificaciones.every((verificacion) => verificacion.ok);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = () => setAbierto(false);
    const conEscape = (event: KeyboardEvent) => event.key === "Escape" && setAbierto(false);
    document.addEventListener("click", cerrar);
    document.addEventListener("keydown", conEscape);
    return () => {
      document.removeEventListener("click", cerrar);
      document.removeEventListener("keydown", conEscape);
    };
  }, [abierto]);

  return (
    <span className="aviso-composicion-wrap">
      <button
        type="button"
        className={cumple ? "aviso-composicion ok" : "aviso-composicion"}
        aria-haspopup="true"
        aria-expanded={abierto}
        aria-label={`${cumple ? "Cumple" : "No cumple"} la composicion, pulsa para ver el detalle`}
        onClick={(event) => {
          // El icono suele vivir dentro de un enlace a la ficha del ejercito:
          // abrirlo no tiene que ademas navegar hasta ella.
          event.preventDefault();
          event.stopPropagation();
          setAbierto((valor) => !valor);
        }}
      >
        {cumple ? "✓" : "⚠"}
      </button>
      {abierto ? (
        <div className="aviso-composicion-pop" role="tooltip" onClick={(event) => event.stopPropagation()}>
          <p className={cumple ? "aviso-composicion-titulo ok" : "aviso-composicion-titulo"}>
            {cumple ? "Cumple la composicion" : "No cumple la composicion"}
          </p>
          <ul>
            {verificaciones.map((verificacion) => (
              <li key={verificacion.clave} className={verificacion.ok ? "ok" : "warn"}>
                <span aria-hidden="true">{verificacion.ok ? "✓" : "⚠"}</span> {verificacion.mensaje}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </span>
  );
}
