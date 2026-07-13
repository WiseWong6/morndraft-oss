export const PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export type PublicImageCompressionErrorCode = 'file-too-large' | 'unsupported-file-type';

export class PublicImageCompressionError extends Error {
  code: PublicImageCompressionErrorCode;

  constructor(code: PublicImageCompressionErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'PublicImageCompressionError';
    this.code = code;
    if (options && 'cause' in options) (this as Error & { cause?: unknown }).cause = options.cause;
  }
}

export type CompressedPublicImportImage = {
  blob: Blob;
  contentType: string;
  fileName: string;
  height?: number;
  width?: number;
};

const RASTER_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);
const TARGET_TYPES = ['image/avif', 'image/webp'] as const;
const ENCODE_QUALITIES = [0.86, 0.78, 0.68, 0.58, 0.48];
const ENCODE_SCALES = [1, 0.85, 0.7, 0.55, 0.45];

const inferContentType = (file: File) => {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'avif') return 'image/avif';
  if (extension === 'gif') return 'image/gif';
  return '';
};

const getExtensionForType = (contentType: string) => {
  if (contentType === 'image/avif') return 'avif';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/gif') return 'gif';
  return 'png';
};

const replaceExtension = (fileName: string, contentType: string) => {
  const base = fileName.replace(/\.[^.]+$/u, '') || 'image';
  return `${base}.${getExtensionForType(contentType)}`;
};

const canvasToBlob = (canvas: HTMLCanvasElement, contentType: string, quality: number) => (
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, contentType, quality))
);

const loadImageBitmap = async (file: File) => {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      close: () => bitmap.close(),
      height: bitmap.height,
      paint: (context: CanvasRenderingContext2D, width: number, height: number) => {
        context.drawImage(bitmap, 0, 0, width, height);
      },
      width: bitmap.width,
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.decoding = 'async';
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Failed to decode image.'));
      element.src = objectUrl;
    });
    return {
      close: () => URL.revokeObjectURL(objectUrl),
      height: image.naturalHeight || image.height,
      paint: (context: CanvasRenderingContext2D, width: number, height: number) => {
        context.drawImage(image, 0, 0, width, height);
      },
      width: image.naturalWidth || image.width,
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
};

export async function compressPublicImportImage(file: File): Promise<CompressedPublicImportImage> {
  const contentType = inferContentType(file);
  if (contentType === 'image/gif') {
    if (file.size > PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES) {
      throw new PublicImageCompressionError('file-too-large', `${file.name} is larger than the final image limit.`);
    }
    return { blob: file, contentType, fileName: replaceExtension(file.name, contentType) };
  }
  if (!RASTER_IMAGE_TYPES.has(contentType)) {
    throw new PublicImageCompressionError('unsupported-file-type', `${file.name} is not a supported bitmap image.`);
  }
  if (typeof document === 'undefined') {
    if (file.size <= PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES) {
      return { blob: file, contentType, fileName: replaceExtension(file.name, contentType) };
    }
    throw new PublicImageCompressionError('unsupported-file-type', 'Browser image compression is unavailable.');
  }

  let image: Awaited<ReturnType<typeof loadImageBitmap>>;
  try {
    image = await loadImageBitmap(file);
  } catch (error) {
    throw new PublicImageCompressionError(
      'unsupported-file-type',
      `${file.name} could not be decoded as a bitmap image.`,
      { cause: error },
    );
  }
  try {
    let best: CompressedPublicImportImage | null = null;
    for (const targetType of TARGET_TYPES) {
      for (const scale of ENCODE_SCALES) {
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        try {
          const context = canvas.getContext('2d');
          if (!context) continue;
          context.clearRect(0, 0, width, height);
          image.paint(context, width, height);
          for (const quality of ENCODE_QUALITIES) {
            const blob = await canvasToBlob(canvas, targetType, quality);
            if (!blob || blob.type !== targetType) continue;
            const candidate = {
              blob,
              contentType: targetType,
              fileName: replaceExtension(file.name, targetType),
              width,
              height,
            };
            if (!best || candidate.blob.size < best.blob.size) best = candidate;
            if (blob.size <= PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES) return candidate;
          }
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
    }
    if (best && best.blob.size <= PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES) return best;
    throw new PublicImageCompressionError('file-too-large', `${file.name} is larger than the final image limit.`);
  } finally {
    image.close();
  }
}
