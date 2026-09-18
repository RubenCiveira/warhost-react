/**
 * Quita el fondo de una foto de producto de forma aproximada: parte de las
 * cuatro esquinas e inunda de transparencia lo conectado a ellas cuyo color
 * quede cerca del suyo. Funciona bien con fotos de estudio sobre fondo
 * solido o casi solido, que es lo habitual en el catalogo de WarHub; no es
 * una segmentacion real y no distingue un fondo con textura o color
 * variable.
 *
 * Un hueco "entre las piernas" o "entre el brazo y el torso" puede ser fondo
 * de verdad, pero la inundacion nunca llega hasta ahi si esta completamente
 * rodeado por la silueta. Por eso, tras limpiar lo conectado al borde, se
 * buscan tambien islas internas pequenas cuyo color siga pareciendose al
 * fondo.
 *
 * Ampliar la mascara ya despejada con un cierre morfologico (dilatar y
 * luego erosionar) si ayuda: un hueco estrecho —de pocos pixeles de ancho—
 * queda completamente engullido al dilatar y no se recupera al erosionar,
 * mientras que una zona clara del propio modelo (un puno blanco, un filo
 * plateado), al ser mucho mas ancha que el radio de cierre, se recupera
 * entera. No hace falta mirar el color en este paso: closeRadius decide
 * solo por el ancho del hueco.
 */
export async function removeBackground(file: File, tolerance = 0, closeRadius = 6): Promise<File> {
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
    const { data, width, height } = imageData;

    const background = backgroundColor(imageData);
    let cleared = floodFromCorners(imageData, background, tolerance);
    clearEnclosedBackground(imageData, cleared, background, tolerance);
    if (closeRadius > 0) cleared = closeMask(cleared, width, height, closeRadius);
    for (let idx = 0; idx < cleared.length; idx += 1) {
      if (cleared[idx]) data[idx * 4 + 3] = 0;
    }

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

/** Inundacion desde las cuatro esquinas: marca lo conectado a ellas cuyo color quede cerca del suyo. */
function floodFromCorners(imageData: ImageData, background: Rgb, tolerance: number): Uint8Array {
  const { data, width, height } = imageData;
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  const cleared = new Uint8Array(width * height);
  const stack = [...corners];

  while (stack.length > 0) {
    const idx = stack.pop();
    if (idx === undefined || cleared[idx]) continue;

    if (!isNearBackground(data, idx, background, tolerance)) continue;

    cleared[idx] = 1;
    const x = idx % width;
    const y = Math.floor(idx / width);
    if (x > 0) stack.push(idx - 1);
    if (x < width - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - width);
    if (y < height - 1) stack.push(idx + width);
  }
  return cleared;
}

type Rgb = { r: number; g: number; b: number };

function backgroundColor(imageData: ImageData): Rgb {
  const { data, width, height } = imageData;
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const idx of corners) {
    r += data[idx * 4];
    g += data[idx * 4 + 1];
    b += data[idx * 4 + 2];
  }
  return { r: r / corners.length, g: g / corners.length, b: b / corners.length };
}

function isNearBackground(data: Uint8ClampedArray, idx: number, background: Rgb, tolerance: number): boolean {
  const offset = idx * 4;
  const dr = data[offset] - background.r;
  const dg = data[offset + 1] - background.g;
  const db = data[offset + 2] - background.b;
  return dr * dr + dg * dg + db * db <= tolerance * tolerance * 3;
}

function clearEnclosedBackground(
  imageData: ImageData,
  cleared: Uint8Array,
  background: Rgb,
  tolerance: number,
): void {
  const { data, width, height } = imageData;
  const visited = new Uint8Array(width * height);
  const innerTolerance = tolerance === 0 ? 0 : Math.min(140, tolerance * 1.75 + 12);
  const maxArea = width * height * 0.08;

  for (let start = 0; start < cleared.length; start += 1) {
    if (cleared[start] || visited[start] || !isNearBackground(data, start, background, innerTolerance)) continue;

    const component: number[] = [];
    const stack = [start];
    let touchesBorder = false;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;

    while (stack.length > 0) {
      const idx = stack.pop();
      if (idx === undefined || visited[idx] || cleared[idx] || !isNearBackground(data, idx, background, innerTolerance)) {
        continue;
      }

      visited[idx] = 1;
      component.push(idx);
      const x = idx % width;
      const y = Math.floor(idx / width);
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) touchesBorder = true;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      if (x > 0) stack.push(idx - 1);
      if (x < width - 1) stack.push(idx + 1);
      if (y > 0) stack.push(idx - width);
      if (y < height - 1) stack.push(idx + width);
    }

    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const looksLikeHole =
      !touchesBorder && component.length <= maxArea && componentWidth < width * 0.7 && componentHeight < height * 0.7;
    if (!looksLikeHole) continue;

    for (const idx of component) cleared[idx] = 1;
  }
}

/** Cierre morfologico (dilatar y erosionar) para rellenar huecos mas estrechos que `radius`. */
function closeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  return erode(dilate(mask, width, height, radius), width, height, radius);
}

function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  return maxFilter(maxFilter(mask, width, height, radius, true), width, height, radius, false);
}

function erode(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const inverted = invert(mask);
  return invert(dilate(inverted, width, height, radius));
}

function invert(mask: Uint8Array): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) out[i] = mask[i] ? 0 : 1;
  return out;
}

/** Filtro de maximo en una direccion: aproxima un elemento estructurante cuadrado en dos pasadas. */
function maxFilter(mask: Uint8Array, width: number, height: number, radius: number, horizontal: boolean): Uint8Array {
  const out = new Uint8Array(mask.length);
  if (horizontal) {
    for (let y = 0; y < height; y += 1) {
      const row = y * width;
      for (let x = 0; x < width; x += 1) {
        let hit = 0;
        for (let dx = -radius; dx <= radius && !hit; dx += 1) {
          const xx = x + dx;
          if (xx >= 0 && xx < width && mask[row + xx]) hit = 1;
        }
        out[row + x] = hit;
      }
    }
  } else {
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < height; y += 1) {
        let hit = 0;
        for (let dy = -radius; dy <= radius && !hit; dy += 1) {
          const yy = y + dy;
          if (yy >= 0 && yy < height && mask[yy * width + x]) hit = 1;
        }
        out[y * width + x] = hit;
      }
    }
  }
  return out;
}
