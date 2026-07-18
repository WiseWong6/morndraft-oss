type CaptureRect = { x: number; y: number; width: number; height: number };

const getCanvasContentBounds = (canvas: HTMLCanvasElement, padding = 0): CaptureRect => {
  const fallback = { x: 0, y: 0, width: Math.max(1, canvas.width), height: Math.max(1, canvas.height) };
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || canvas.width === 0 || canvas.height === 0) return fallback;

  try {
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = data[offset + 3];
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const isVisibleContent = alpha > 8 && (alpha < 245 || red < 248 || green < 248 || blue < 248);

        if (isVisibleContent) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (maxX < 0 || maxY < 0) return fallback;

    const left = Math.max(0, minX - padding);
    const top = Math.max(0, minY - padding);
    const right = Math.min(width, maxX + 1 + padding);
    const bottom = Math.min(height, maxY + 1 + padding);
    return {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  } catch (err) {
    console.warn('Failed to inspect canvas pixels for cropping:', err);
    return fallback;
  }
};

export const cropCanvasToContent = (canvas: HTMLCanvasElement, padding = 0) => {
  const bounds = getCanvasContentBounds(canvas, padding);
  if (bounds.x === 0 && bounds.y === 0 && bounds.width === canvas.width && bounds.height === canvas.height) {
    return canvas;
  }

  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = bounds.width;
  croppedCanvas.height = bounds.height;

  const context = croppedCanvas.getContext('2d');
  if (!context) return canvas;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, croppedCanvas.width, croppedCanvas.height);
  context.drawImage(
    canvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    croppedCanvas.width,
    croppedCanvas.height,
  );

  return croppedCanvas;
};
