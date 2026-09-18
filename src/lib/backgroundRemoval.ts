/**
 * Quita el fondo de una foto de producto de forma aproximada: parte de las
 * cuatro esquinas y vacia (alpha 0) todo pixel conectado a ellas cuyo color
 * quede cerca del de la esquina. Funciona bien con fotos de estudio sobre
 * fondo solido o casi solido, que es lo habitual en el catalogo de WarHub;
 * no es una segmentacion real y no distingue un fondo con textura o color
 * variable.
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
    clearFromCorners(imageData, tolerance);
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

/** Inundacion desde las cuatro esquinas: vacia lo conectado a un color parecido al suyo. */
function clearFromCorners(imageData: ImageData, tolerance: number) {
  const { data, width, height } = imageData;
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];

  let refR = 0;
  let refG = 0;
  let refB = 0;
  for (const idx of corners) {
    refR += data[idx * 4];
    refG += data[idx * 4 + 1];
    refB += data[idx * 4 + 2];
  }
  refR /= corners.length;
  refG /= corners.length;
  refB /= corners.length;

  const toleranceSq = tolerance * tolerance * 3;
  const visited = new Uint8Array(width * height);
  const stack = [...corners];

  while (stack.length > 0) {
    const idx = stack.pop();
    if (idx === undefined || visited[idx]) continue;
    visited[idx] = 1;

    const offset = idx * 4;
    const dr = data[offset] - refR;
    const dg = data[offset + 1] - refG;
    const db = data[offset + 2] - refB;
    if (dr * dr + dg * dg + db * db > toleranceSq) continue;

    data[offset + 3] = 0;
    const x = idx % width;
    const y = Math.floor(idx / width);
    if (x > 0) stack.push(idx - 1);
    if (x < width - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - width);
    if (y < height - 1) stack.push(idx + width);
  }
}
