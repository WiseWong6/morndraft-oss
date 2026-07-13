export const PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PUBLIC_IMPORT_MAX_IMAGE_DIMENSION = 16_384;
export const PUBLIC_IMPORT_MAX_IMAGE_PIXELS = 32 * 1024 * 1024;

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
  const extension = file.name.split('.').pop()?.toLowerCase();
  const extensionType = extension === 'jpg' || extension === 'jpeg'
    ? 'image/jpeg'
    : extension === 'png'
      ? 'image/png'
      : extension === 'webp'
        ? 'image/webp'
        : extension === 'avif'
          ? 'image/avif'
          : extension === 'gif'
            ? 'image/gif'
            : '';
  const declaredType = file.type.trim().toLowerCase();
  if (!declaredType || declaredType === 'application/octet-stream') return extensionType;
  if (declaredType) return declaredType;
  return '';
};

type PublicImageDimensions = { height: number; width: number };

export const assertPublicImportImageDimensions = (
  dimensions: PublicImageDimensions,
  fileName = 'image',
) => {
  const { height, width } = dimensions;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new PublicImageCompressionError('unsupported-file-type', `${fileName} has invalid bitmap dimensions.`);
  }
  if (
    width > PUBLIC_IMPORT_MAX_IMAGE_DIMENSION
    || height > PUBLIC_IMPORT_MAX_IMAGE_DIMENSION
    || width * height > PUBLIC_IMPORT_MAX_IMAGE_PIXELS
  ) {
    throw new PublicImageCompressionError(
      'file-too-large',
      `${fileName} exceeds the ${PUBLIC_IMPORT_MAX_IMAGE_DIMENSION}px or ${PUBLIC_IMPORT_MAX_IMAGE_PIXELS}-pixel image limit.`,
    );
  }
};

const readUint24LittleEndian = (bytes: Uint8Array, offset: number) => (
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
);

const readAscii = (bytes: Uint8Array, start: number, end: number) => (
  String.fromCharCode(...bytes.slice(start, end))
);

const AVIF_CONTAINER_BOXES = new Set(['meta', 'iprp', 'ipco']);
const findAvifImageDimensions = (
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  depth = 0,
): PublicImageDimensions | null => {
  if (depth > 4) return null;
  let offset = start;
  while (offset + 8 <= end) {
    const shortSize = view.getUint32(offset);
    const type = readAscii(bytes, offset + 4, offset + 8);
    let headerSize = 8;
    let boxSize = shortSize;
    if (shortSize === 1) {
      if (offset + 16 > end) return null;
      const extendedSize = view.getBigUint64(offset + 8);
      if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      headerSize = 16;
      boxSize = Number(extendedSize);
    } else if (shortSize === 0) {
      boxSize = end - offset;
    }
    if (boxSize < headerSize || offset + boxSize > end) return null;
    const payloadStart = offset + headerSize;
    const boxEnd = offset + boxSize;
    if (type === 'ispe') {
      if (payloadStart + 12 > boxEnd) return null;
      return { width: view.getUint32(payloadStart + 4), height: view.getUint32(payloadStart + 8) };
    }
    if (AVIF_CONTAINER_BOXES.has(type)) {
      const childStart = payloadStart + (type === 'meta' ? 4 : 0);
      const nested = findAvifImageDimensions(bytes, view, childStart, boxEnd, depth + 1);
      if (nested) return nested;
    }
    offset = boxEnd;
  }
  return null;
};

export const readPublicImportImageDimensions = async (
  file: File,
  contentType: string,
): Promise<PublicImageDimensions | null> => {
  const bytes = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (contentType === 'image/png' && bytes.length >= 24) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((byte, index) => bytes[index] === byte) || readAscii(bytes, 12, 16) !== 'IHDR') return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (contentType === 'image/gif' && bytes.length >= 10) {
    const header = new TextDecoder('ascii').decode(bytes.slice(0, 6));
    if (header !== 'GIF87a' && header !== 'GIF89a') return null;
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (contentType === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        if (length < 7) return null;
        return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
      }
      offset += length;
    }
    return null;
  }
  if (contentType === 'image/webp' && bytes.length >= 30) {
    if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 12) !== 'WEBP') return null;
    const chunk = readAscii(bytes, 12, 16);
    if (chunk === 'VP8X') {
      return {
        width: readUint24LittleEndian(bytes, 24) + 1,
        height: readUint24LittleEndian(bytes, 27) + 1,
      };
    }
    if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (contentType === 'image/avif') {
    return findAvifImageDimensions(bytes, view, 0, bytes.length);
  }
  return null;
};

const preflightBrowserBitmapDimensions = async (file: File, contentType: string) => {
  if (typeof document === 'undefined') return;
  const dimensions = await readPublicImportImageDimensions(file, contentType);
  if (!dimensions) {
    throw new PublicImageCompressionError(
      'unsupported-file-type',
      `${file.name} does not contain readable bitmap dimensions.`,
    );
  }
  assertPublicImportImageDimensions(dimensions, file.name);
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

const withCanonicalBlobType = (file: File, contentType: string): Blob => (
  file.type.toLowerCase() === contentType ? file : new Blob([file], { type: contentType })
);

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
    await preflightBrowserBitmapDimensions(file, contentType);
    return {
      blob: withCanonicalBlobType(file, contentType),
      contentType,
      fileName: replaceExtension(file.name, contentType),
    };
  }
  if (!RASTER_IMAGE_TYPES.has(contentType)) {
    throw new PublicImageCompressionError('unsupported-file-type', `${file.name} is not a supported bitmap image.`);
  }
  if (typeof document === 'undefined') {
    if (file.size <= PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES) {
      return {
        blob: withCanonicalBlobType(file, contentType),
        contentType,
        fileName: replaceExtension(file.name, contentType),
      };
    }
    throw new PublicImageCompressionError('unsupported-file-type', 'Browser image compression is unavailable.');
  }

  await preflightBrowserBitmapDimensions(file, contentType);

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
    assertPublicImportImageDimensions(image, file.name);
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
