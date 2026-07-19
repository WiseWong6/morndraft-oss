const MAX_INLINE_IMAGE_PIXELS = 4_000_000;

export type PortableImageFallback = 'source' | 'placeholder';

const escapeSvgText = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const makeImagePlaceholderDataUrl = (image: HTMLImageElement) => {
  const width = Math.max(1, Math.round(image.naturalWidth || image.clientWidth || 640));
  const height = Math.max(1, Math.round(image.naturalHeight || image.clientHeight || 320));
  const source = image.currentSrc || image.src || image.alt || 'Image';
  const label = (() => {
    try {
      return new URL(source, window.location.href).host || source;
    } catch {
      return source;
    }
  })();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><rect width="100%" height="100%" fill="#f8f6f0"/><rect x="8" y="8" width="${Math.max(1, width - 16)}" height="${Math.max(1, height - 16)}" rx="12" fill="none" stroke="#d8d4ca" stroke-width="2"/><text x="50%" y="48%" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#6f6a60">Image kept as source link</text><text x="50%" y="58%" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="#8a8173">${escapeSvgText(label).slice(0, 96)}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const imageToPortableDataUrl = (
  image: HTMLImageElement,
  options: { quality?: number; fallback?: PortableImageFallback } = {},
) => {
  const fallback = options.fallback ?? 'source';
  const fallbackValue = () =>
    fallback === 'placeholder' ? makeImagePlaceholderDataUrl(image) : image.currentSrc || image.src;
  try {
    if (!image.naturalWidth || !image.naturalHeight) return fallbackValue();
    if (image.naturalWidth * image.naturalHeight > MAX_INLINE_IMAGE_PIXELS) return fallbackValue();

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext('2d');
    if (!context) return fallbackValue();

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);

    return canvas.toDataURL('image/jpeg', options.quality ?? 0.82);
  } catch (err) {
    console.warn('Image data URL fallback:', err);
    return fallbackValue();
  }
};
