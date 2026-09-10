/**
 * El simbolo que precede a cada arma en la tabla: sirve para recorrer la lista
 * y saber que hace cada una sin leer sus reglas.
 *
 * Van en SVG y no como imagen porque son parte de la maquetacion: se imprimen a
 * cualquier tamano y toman el color de la carta.
 *
 * El arma a distancia se dibuja distinta en cada ambientacion —proyectiles en
 * grimdark, arco en fantasy—, y quien elige es el tema: se pintan las dos y el
 * CSS esconde la que no toca. Asi el icono correcto sale tambien donde no hay
 * contexto de React, como en el banco de pruebas de las cartas.
 */

/**
 * Lienzo cuadrado, al contrario que el apaisado de kt-cartas. Alli la columna
 * del icono era ancha y baja; aqui un lienzo tumbado aplastaba el arco hasta
 * dejarlo en una raya con una curva. Una espada en diagonal y un arco de pie
 * necesitan alto.
 */
const LADO = 14;

/** 2,6 mm: se lee sin competir con el nombre del arma, que es el dato que se busca. */
const ALTO = "2.6mm";

const comun = { height: ALTO, width: ALTO, flex: "none" as const };
const lienzo = `0 0 ${LADO} ${LADO}`;

/*
 * Los tres van macizos y de pie. A este tamano una silueta rellena se reconoce y
 * un trazo fino se convierte en una mota: se probo con lineas y no se leian.
 * De pie, ademas, los tres comparten eje y la columna no baila.
 */

export default function IconoArma({ tipo }: { tipo: "cac" | "distancia" }) {
  if (tipo === "cac") {
    // Espada en diagonal, punta arriba a la derecha: es la silueta que se
    // reconoce de inmediato, y en diagonal la hoja gana todo el largo del
    // lienzo en vez de la mitad.
    return (
      <svg viewBox={lienzo} style={comun} className="arma-icono" aria-hidden="true" fill="currentColor">
        <path d="M7 0.4 L9.3 5 V8.2 H4.7 V5 Z" />
        <path d="M2.2 8.2 H11.8 V9.9 H2.2 Z" />
        <path d="M6.1 9.9 H7.9 V12.2 H6.1 Z" />
        <circle cx="7" cy="12.8" r="1.2" />
      </svg>
    );
  }

  return (
    <>
      {/* Tres proyectiles de pie: cuerpo recto y punta redondeada. */}
      <svg viewBox={lienzo} style={comun} className="arma-icono arma-balas" aria-hidden="true" fill="currentColor">
        {[1.4, 5.9, 10.4].map((x) => (
          <path key={x} d={`M${x} 12.4 V5.2 A1.1 1.1 0 0 1 ${x + 2.2} 5.2 V12.4 Z`} />
        ))}
      </svg>
      {/* Arco tensado: la pala curva a la izquierda, la cuerda recta y la
          flecha saliendo. De pie el gesto se reconoce; tumbado no. */}
      <svg viewBox={lienzo} style={comun} className="arma-icono arma-arco" aria-hidden="true" fill="currentColor">
        {/* Pala del arco: media luna maciza, no una linea curva. */}
        <path d="M5.2 0.6 Q0.4 7 5.2 13.4 L6.9 13.4 Q2.5 7 6.9 0.6 Z" />
        {/* Cuerda. */}
        <path d="M5.6 0.8 H6.5 V13.2 H5.6 Z" />
        {/* Flecha saliendo hacia la derecha. */}
        <path d="M4.6 6.2 H10.6 V7.8 H4.6 Z" />
        <path d="M10.2 4.4 L13.6 7 L10.2 9.6 Z" />
      </svg>
    </>
  );
}
