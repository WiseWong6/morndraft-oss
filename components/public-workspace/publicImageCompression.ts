export const PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PUBLIC_IMPORT_MAX_IMAGE_DIMENSION = 16_384;
export const PUBLIC_IMPORT_MAX_IMAGE_PIXELS = 32 * 1024 * 1024;
export const PUBLIC_IMPORT_MAX_ENCODE_PIXELS = 8 * 1024 * 1024;

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
const ENCODE_QUALITY = 0.8;
const MAX_ENCODE_ATTEMPTS_PER_TYPE = 6;
const ENCODE_SCALE_SAFETY_FACTOR = 0.92;
const CANVAS_CAPABILITY_TIMEOUT_MS = 1_500;
const IMAGE_DECODE_TIMEOUT_MS = 10_000;
const CANVAS_ENCODE_TIMEOUT_MS = 10_000;

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
const PUBLIC_IMPORT_MAX_AVIF_BOXES = 4096;
type PublicAvifScanState = {
  boxCount: number;
  worst: PublicImageDimensions | null;
  worstRisk: number;
};

const getImageDimensionRisk = (candidate: PublicImageDimensions) => Math.max(
  candidate.width / PUBLIC_IMPORT_MAX_IMAGE_DIMENSION,
  candidate.height / PUBLIC_IMPORT_MAX_IMAGE_DIMENSION,
  (candidate.width * candidate.height) / PUBLIC_IMPORT_MAX_IMAGE_PIXELS,
);

const findAvifImageDimensions = (
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  state: PublicAvifScanState,
  depth = 0,
): boolean => {
  if (depth > 4) return false;
  let offset = start;
  while (offset + 8 <= end) {
    state.boxCount += 1;
    if (state.boxCount > PUBLIC_IMPORT_MAX_AVIF_BOXES) return false;
    const shortSize = view.getUint32(offset);
    const type = readAscii(bytes, offset + 4, offset + 8);
    let headerSize = 8;
    let boxSize = shortSize;
    if (shortSize === 1) {
      if (offset + 16 > end) return false;
      const extendedSize = view.getBigUint64(offset + 8);
      if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) return false;
      headerSize = 16;
      boxSize = Number(extendedSize);
    } else if (shortSize === 0) {
      boxSize = end - offset;
    }
    if (boxSize < headerSize || offset + boxSize > end) return false;
    const payloadStart = offset + headerSize;
    const boxEnd = offset + boxSize;
    if (type === 'ispe') {
      if (payloadStart + 12 > boxEnd) return false;
      const candidate = { width: view.getUint32(payloadStart + 4), height: view.getUint32(payloadStart + 8) };
      const risk = getImageDimensionRisk(candidate);
      if (!state.worst || risk > state.worstRisk) {
        state.worst = candidate;
        state.worstRisk = risk;
      }
    }
    if (AVIF_CONTAINER_BOXES.has(type)) {
      const childStart = payloadStart + (type === 'meta' ? 4 : 0);
      if (childStart > boxEnd || !findAvifImageDimensions(bytes, view, childStart, boxEnd, state, depth + 1)) return false;
    }
    offset = boxEnd;
  }
  // A truncated trailing box header is malformed, not evidence that a prior
  // thumbnail was the only image in the container.
  return offset === end;
};

const PUBLIC_IMPORT_MAX_GIF_BLOCKS = 4096;
const PUBLIC_IMPORT_MAX_GIF_FRAMES = 512;
const PUBLIC_IMPORT_MAX_GIF_TOTAL_FRAME_PIXELS = 64 * 1024 * 1024;
type PublicGifScanState = { blockCount: number };

const skipGifSubBlocks = (bytes: Uint8Array, start: number, state: PublicGifScanState) => {
  let offset = start;
  while (offset < bytes.length) {
    state.blockCount += 1;
    if (state.blockCount > PUBLIC_IMPORT_MAX_GIF_BLOCKS) return -1;
    const size = bytes[offset++];
    if (size === 0) return offset;
    if (offset + size > bytes.length) return -1;
    offset += size;
  }
  return -1;
};

const findGifImageDimensions = (
  bytes: Uint8Array,
  view: DataView,
): PublicImageDimensions | null => {
  if (bytes.length < 13) return null;
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, 6));
  if (header !== 'GIF87a' && header !== 'GIF89a') return null;
  const logicalScreen = { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  let worst = logicalScreen;
  let worstRisk = getImageDimensionRisk(worst);
  const globalColorTableBytes = bytes[10] & 0x80 ? 3 * (2 ** ((bytes[10] & 0x07) + 1)) : 0;
  let offset = 13 + globalColorTableBytes;
  if (offset > bytes.length) return null;
  const state: PublicGifScanState = { blockCount: 0 };
  let frameCount = 0;
  let totalFramePixels = 0;
  while (offset < bytes.length) {
    state.blockCount += 1;
    if (state.blockCount > PUBLIC_IMPORT_MAX_GIF_BLOCKS) return null;
    const introducer = bytes[offset++];
    if (introducer === 0x3b) return worst;
    if (introducer === 0x21) {
      if (offset >= bytes.length) return null;
      offset += 1; // extension label
      offset = skipGifSubBlocks(bytes, offset, state);
      if (offset < 0) return null;
      continue;
    }
    if (introducer !== 0x2c || offset + 9 > bytes.length) return null;
    const left = view.getUint16(offset, true);
    const top = view.getUint16(offset + 2, true);
    const candidate = { width: view.getUint16(offset + 4, true), height: view.getUint16(offset + 6, true) };
    const packed = bytes[offset + 8];
    offset += 9;
    frameCount += 1;
    totalFramePixels += candidate.width * candidate.height;
    if (
      frameCount > PUBLIC_IMPORT_MAX_GIF_FRAMES ||
      totalFramePixels > PUBLIC_IMPORT_MAX_GIF_TOTAL_FRAME_PIXELS ||
      candidate.width <= 0 || candidate.height <= 0 ||
      left + candidate.width > logicalScreen.width || top + candidate.height > logicalScreen.height
    ) return null;
    const risk = getImageDimensionRisk(candidate);
    if (risk > worstRisk) {
      worst = candidate;
      worstRisk = risk;
    }
    const localColorTableBytes = packed & 0x80 ? 3 * (2 ** ((packed & 0x07) + 1)) : 0;
    if (offset + localColorTableBytes + 1 > bytes.length) return null;
    offset += localColorTableBytes + 1; // color table and LZW minimum code size
    offset = skipGifSubBlocks(bytes, offset, state);
    if (offset < 0) return null;
  }
  return null;
};

export const readPublicImportImageDimensions = async (
  file: File,
  contentType: string,
): Promise<PublicImageDimensions | null> => {
  // AVIF metadata can precede a large mdat whose declared box extends far
  // beyond a prefix sample. Imports are already capped at a 20 MiB batch, so
  // read that bounded container in full to distinguish valid media payloads
  // from truncated metadata while still inspecting every ispe box.
  if (contentType === 'image/avif' && file.size > 20 * 1024 * 1024) return null;
  if (contentType === 'image/gif' && file.size > PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES) return null;
  const bytes = new Uint8Array(await (
    contentType === 'image/avif' || contentType === 'image/gif'
      ? file.arrayBuffer()
      : file.slice(0, 256 * 1024).arrayBuffer()
  ));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (contentType === 'image/png' && bytes.length >= 24) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((byte, index) => bytes[index] === byte) || readAscii(bytes, 12, 16) !== 'IHDR') return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (contentType === 'image/gif') return findGifImageDimensions(bytes, view);
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
    const state: PublicAvifScanState = { boxCount: 0, worst: null, worstRisk: Number.NEGATIVE_INFINITY };
    return findAvifImageDimensions(bytes, view, 0, bytes.length, state) ? state.worst : null;
  }
  return null;
};

const preflightBrowserBitmapDimensions = async (file: File, contentType: string) => {
  if (typeof document === 'undefined') return;
  let dimensions: PublicImageDimensions | null;
  try {
    dimensions = await readPublicImportImageDimensions(file, contentType);
  } catch (error) {
    throw new PublicImageCompressionError(
      'unsupported-file-type',
      `${file.name} bitmap metadata could not be read safely.`,
      { cause: error },
    );
  }
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

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  contentType: string,
  quality: number,
  timeoutMs = CANVAS_ENCODE_TIMEOUT_MS,
) => new Promise<Blob | null>((resolve, reject) => {
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    reject(new Error(`Canvas ${contentType} encoding timed out.`));
  }, timeoutMs);
  try {
    canvas.toBlob((blob) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(blob);
    }, contentType, quality);
  } catch (error) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    reject(error);
  }
});

let supportedCanvasTargetTypes: Promise<readonly (typeof TARGET_TYPES)[number][]> | undefined;

const getSupportedCanvasTargetTypes = () => {
  if (!supportedCanvasTargetTypes) {
    const probe = async () => {
      let transientFailures = 0;
      const results = await Promise.all(TARGET_TYPES.map(async (targetType) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        try {
          const encoded = await canvasToBlob(canvas, targetType, 0.8, CANVAS_CAPABILITY_TIMEOUT_MS);
          // Unsupported canvas encoders may silently return PNG.
          return encoded?.type === targetType ? targetType : null;
        } catch {
          transientFailures += 1;
          return null;
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }));
      const supported = results.filter((value): value is (typeof TARGET_TYPES)[number] => value !== null);
      if (supported.length === 0 && transientFailures > 0) {
        throw new Error('Canvas encoder capability probing failed.');
      }
      return supported;
    };
    const recoverable: Promise<readonly (typeof TARGET_TYPES)[number][]> = probe().catch((error) => {
      // A rejected or timed-out probe is environmental, not a permanent
      // browser capability result. Let the next import retry from clean state.
      if (supportedCanvasTargetTypes === recoverable) supportedCanvasTargetTypes = undefined;
      throw error;
    });
    supportedCanvasTargetTypes = recoverable;
  }
  return supportedCanvasTargetTypes;
};

/** Test-only state reset; production callers never need to reprobe a stable document. */
export const resetPublicImageCompressionStateForTest = () => {
  supportedCanvasTargetTypes = undefined;
};

const createImageBitmapWithTimeout = (file: File) => new Promise<ImageBitmap>((resolve, reject) => {
  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    reject(new Error('Image bitmap decoding timed out.'));
  }, IMAGE_DECODE_TIMEOUT_MS);
  let pending: Promise<ImageBitmap>;
  try {
    pending = createImageBitmap(file);
  } catch (error) {
    settled = true;
    clearTimeout(timer);
    reject(error);
    return;
  }
  pending.then((bitmap) => {
    if (settled) {
      bitmap.close();
      return;
    }
    settled = true;
    clearTimeout(timer);
    resolve(bitmap);
  }, (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    reject(error);
  });
});

const loadImageBitmap = async (file: File) => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmapWithTimeout(file);
      return {
        close: () => bitmap.close(),
        height: bitmap.height,
        paint: (context: CanvasRenderingContext2D, width: number, height: number) => {
          context.drawImage(bitmap, 0, 0, width, height);
        },
        width: bitmap.width,
      };
    } catch {
      // Some browsers expose createImageBitmap but support fewer codecs than
      // their image element. Fall through to the browser's regular decoder.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.decoding = 'async';
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        element.onload = null;
        element.onerror = null;
        callback();
      };
      const timer = setTimeout(() => {
        finish(() => {
          element.src = '';
          reject(new Error('Image element decoding timed out.'));
        });
      }, IMAGE_DECODE_TIMEOUT_MS);
      element.onload = () => finish(() => resolve(element));
      element.onerror = () => finish(() => reject(new Error('Failed to decode image.')));
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

const getInitialEncodeScale = (file: File, image: PublicImageDimensions) => {
  const pixels = image.width * image.height;
  const pixelScale = pixels > PUBLIC_IMPORT_MAX_ENCODE_PIXELS
    ? Math.sqrt(PUBLIC_IMPORT_MAX_ENCODE_PIXELS / pixels) * 0.999
    : 1;
  const byteScale = file.size > PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES
    ? Math.min(1, Math.sqrt(PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES / file.size) * 1.1)
    : 1;
  return Math.min(pixelScale, byteScale);
};

const decodePublicImportImage = async (file: File) => {
  try {
    return await loadImageBitmap(file);
  } catch (error) {
    throw new PublicImageCompressionError(
      'unsupported-file-type',
      `${file.name} could not be decoded as a bitmap image.`,
      { cause: error },
    );
  }
};

export async function compressPublicImportImage(file: File): Promise<CompressedPublicImportImage> {
  const contentType = inferContentType(file);
  if (contentType === 'image/gif') {
    if (file.size > PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES) {
      throw new PublicImageCompressionError('file-too-large', `${file.name} is larger than the final image limit.`);
    }
    await preflightBrowserBitmapDimensions(file, contentType);
    if (typeof document === 'undefined') {
      return {
        blob: withCanonicalBlobType(file, contentType),
        contentType,
        fileName: replaceExtension(file.name, contentType),
      };
    }
    const image = await decodePublicImportImage(file);
    try {
      assertPublicImportImageDimensions(image, file.name);
      return {
        blob: withCanonicalBlobType(file, contentType),
        contentType,
        fileName: replaceExtension(file.name, contentType),
        width: image.width,
        height: image.height,
      };
    } finally {
      image.close();
    }
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

  const image = await decodePublicImportImage(file);
  try {
    assertPublicImportImageDimensions(image, file.name);
    if (file.size <= PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES) {
      return {
        blob: withCanonicalBlobType(file, contentType),
        contentType,
        fileName: replaceExtension(file.name, contentType),
        width: image.width,
        height: image.height,
      };
    }
    let best: CompressedPublicImportImage | null = null;
    let encoderFailure: unknown;
    let supportedTargetTypes: readonly (typeof TARGET_TYPES)[number][];
    try {
      supportedTargetTypes = await getSupportedCanvasTargetTypes();
    } catch (error) {
      throw new PublicImageCompressionError(
        'unsupported-file-type',
        `${file.name} could not initialize a browser image encoder.`,
        { cause: error },
      );
    }
    for (const targetType of supportedTargetTypes) {
      let scale = getInitialEncodeScale(file, image);
      for (let attempt = 0; attempt < MAX_ENCODE_ATTEMPTS_PER_TYPE; attempt += 1) {
        const width = Math.max(1, Math.floor(image.width * scale));
        const height = Math.max(1, Math.floor(image.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        try {
          const context = canvas.getContext('2d');
          if (!context) continue;
          context.clearRect(0, 0, width, height);
          image.paint(context, width, height);
          let blob: Blob | null;
          try {
            blob = await canvasToBlob(canvas, targetType, ENCODE_QUALITY);
          } catch (error) {
            encoderFailure = error;
            break;
          }
          if (!blob || blob.type !== targetType) break;
          const candidate = {
            blob,
            contentType: targetType,
            fileName: replaceExtension(file.name, targetType),
            width,
            height,
          };
          if (!best || candidate.blob.size < best.blob.size) best = candidate;
          if (blob.size <= PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES) return candidate;

          // Encoded byte size is approximately proportional to pixel area.
          // Use the observed result to jump directly near the target instead
          // of trying every quality at every fixed scale.
          const targetRatio = Math.sqrt(PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES / blob.size);
          const nextScale = scale * Math.min(0.9, targetRatio * ENCODE_SCALE_SAFETY_FACTOR);
          if (nextScale >= scale || (width === 1 && height === 1)) break;
          scale = Math.max(1 / Math.max(image.width, image.height), nextScale);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
    }
    if (best && best.blob.size <= PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES) return best;
    if (encoderFailure && !best) {
      throw new PublicImageCompressionError(
        'unsupported-file-type',
        `${file.name} could not be encoded by the browser.`,
        { cause: encoderFailure },
      );
    }
    throw new PublicImageCompressionError('file-too-large', `${file.name} is larger than the final image limit.`);
  } finally {
    image.close();
  }
}
