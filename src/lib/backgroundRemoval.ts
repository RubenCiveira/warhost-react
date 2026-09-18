/**
 * Quita el fondo de una foto de producto de forma aproximada. Funciona bien
 * con fotos de estudio sobre fondo solido o casi solido, que es lo habitual
 * en el catalogo de WarHub; no es una segmentacion real y no distingue un
 * fondo con textura o color muy variable.
 *
 * Dos pasadas, no una:
 *
 * 1. Inundacion desde todo el borde de la imagen (no solo las esquinas),
 *    comparando cada pixel con el vecino que lo descubrio y no con un color
 *    fijo. Con un color fijo, una sombra que va oscureciendo el fondo hacia
 *    el centro corta la inundacion en cuanto se aleja demasiado de ese
 *    color; comparando contra el vecino, la diferencia en cada paso es
 *    pequeña aunque la acumulada sea grande, y la sombra no frena nada.
 * 2. Un barrido del resto de la imagen que vacia cualquier pixel que siga
 *    pareciendose al color del fondo, sin exigir que este conectado al
 *    borde. Hace falta porque un hueco "entre las piernas" o "entre el
 *    brazo y el torso" es fondo de verdad pero puede quedar completamente
 *    rodeado por la silueta, sin ningun camino hasta el borde por floja que
 *    se ponga la tolerancia de la primera pasada.
 */
export async function removeBackground(file: File, tolerance = 32): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar el lienzo.");
    context.drawImage(image, 0, 0);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    clearBackground(imageData, tolerance);
    context.putImageData(imageData, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("No se pudo generar la imagen sin fondo.");
    const name = `${file.name.replace(/\.[^.]+$/, "")}-sin-fondo.png`;
    return new File([blob], name, { type: "image/png", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function clearBackground(imageData: ImageData, tolerance: number) {
  const { data, width, height } = imageData;
  const toleranceSq = tolerance * tolerance * 3;
  // Un poco mas laxa solo para decidir que pixel de borde sirve de semilla:
  // una esquina o un lateral ya tocado por la silueta no debe arrancar nada.
  const seedToleranceSq = (tolerance * 1.5) ** 2 * 3;
  const ref = cornerReference(data, width, height);

  const cleared = new Uint8Array(width * height);
  const stack: number[] = [];
  const trySeed = (idx: number) => {
    if (colorDistSqToRef(data, idx, ref) <= seedToleranceSq) stack.push(idx);
  };
  for (let x = 0; x < width; x += 1) {
    trySeed(x);
    trySeed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    trySeed(y * width);
    trySeed(y * width + width - 1);
  }

  while (stack.length > 0) {
    const idx = stack.pop();
    if (idx === undefined || cleared[idx]) continue;
    cleared[idx] = 1;

    const x = idx % width;
    const y = (idx / width) | 0;
    if (x > 0) tryGrow(data, idx, idx - 1, toleranceSq, cleared, stack);
    if (x < width - 1) tryGrow(data, idx, idx + 1, toleranceSq, cleared, stack);
    if (y > 0) tryGrow(data, idx, idx - width, toleranceSq, cleared, stack);
    if (y < height - 1) tryGrow(data, idx, idx + width, toleranceSq, cleared, stack);
  }

  // Bolsas de fondo encerradas por la silueta: no conectan con el borde por
  // ningun camino, asi que se comparan directamente contra el color de
  // referencia en vez de esperar a que la inundacion las alcance.
  for (let idx = 0; idx < cleared.length; idx += 1) {
    if (!cleared[idx] && colorDistSqToRef(data, idx, ref) <= toleranceSq) cleared[idx] = 1;
  }

  for (let idx = 0; idx < cleared.length; idx += 1) {
    if (cleared[idx]) data[idx * 4 + 3] = 0;
  }
}

function tryGrow(data: Uint8ClampedArray, from: number, to: number, toleranceSq: number, cleared: Uint8Array, stack: number[]) {
  if (cleared[to]) return;
  if (colorDistSq(data, from, to) <= toleranceSq) stack.push(to);
}

function colorDistSq(data: Uint8ClampedArray, idxA: number, idxB: number): number {
  const a = idxA * 4;
  const b = idxB * 4;
  const dr = data[a] - data[b];
  const dg = data[a + 1] - data[b + 1];
  const db = data[a + 2] - data[b + 2];
  return dr * dr + dg * dg + db * db;
}

function colorDistSqToRef(data: Uint8ClampedArray, idx: number, ref: [number, number, number]): number {
  const o = idx * 4;
  const dr = data[o] - ref[0];
  const dg = data[o + 1] - ref[1];
  const db = data[o + 2] - ref[2];
  return dr * dr + dg * dg + db * db;
}

function cornerReference(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const idx of corners) {
    r += data[idx * 4];
    g += data[idx * 4 + 1];
    b += data[idx * 4 + 2];
  }
  return [r / corners.length, g / corners.length, b / corners.length];
}
