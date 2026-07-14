export type PublicCaptureResourceFormat = Readonly<{
  contentType: string;
  kind: 'font' | 'image';
  name: 'avif' | 'gif' | 'jpeg' | 'png' | 'truetype' | 'webp' | 'woff' | 'woff2';
}>;

export type PublicCaptureResourceInspection = Readonly<{
  format?: PublicCaptureResourceFormat;
  reason?: 'animated' | 'invalid' | 'svg' | 'unknown';
}>;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

const hasBytes = (bytes: Uint8Array, offset: number, expected: readonly number[]) => (
  offset >= 0
  && offset + expected.length <= bytes.length
  && expected.every((value, index) => bytes[offset + index] === value)
);

const readAscii = (bytes: Uint8Array, start: number, length: number) => {
  let value = '';
  for (let index = start; index < start + length && index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
};

const readUint32BigEndian = (bytes: Uint8Array, offset: number) => (
  ((bytes[offset] << 24) >>> 0)
  + (bytes[offset + 1] << 16)
  + (bytes[offset + 2] << 8)
  + bytes[offset + 3]
);

const readUint32LittleEndian = (bytes: Uint8Array, offset: number) => (
  bytes[offset]
  + (bytes[offset + 1] << 8)
  + (bytes[offset + 2] << 16)
  + ((bytes[offset + 3] << 24) >>> 0)
);

const inspectPng = (bytes: Uint8Array): PublicCaptureResourceInspection | null => {
  if (!hasBytes(bytes, 0, PNG_SIGNATURE)) return null;
  let offset: number = PNG_SIGNATURE.length;
  let sawHeader = false;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = readUint32BigEndian(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    const next = offset + 12 + length;
    if (!Number.isSafeInteger(next) || next > bytes.length) return { reason: 'invalid' };
    if (!sawHeader) {
      if (type !== 'IHDR' || length !== 13) return { reason: 'invalid' };
      const width = readUint32BigEndian(bytes, offset + 8);
      const height = readUint32BigEndian(bytes, offset + 12);
      if (width === 0 || height === 0) return { reason: 'invalid' };
      sawHeader = true;
    }
    if (type === 'acTL') return { reason: 'animated' };
    if (type === 'IEND') {
      if (length !== 0) return { reason: 'invalid' };
      sawEnd = true;
      break;
    }
    offset = next;
  }
  if (!sawHeader || !sawEnd) return { reason: 'invalid' };
  return {
    format: { contentType: 'image/png', kind: 'image', name: 'png' },
  };
};

const inspectJpeg = (bytes: Uint8Array): PublicCaptureResourceInspection | null => {
  if (!hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return null;
  let offset = 2;
  let sawFrame = false;
  let sawScan = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return { reason: 'invalid' };
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return { reason: 'invalid' };
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9) {
      return sawFrame && sawScan && offset === bytes.length
        ? { format: { contentType: 'image/jpeg', kind: 'image', name: 'jpeg' } }
        : { reason: 'invalid' };
    }
    if (marker === 0x00 || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      return { reason: 'invalid' };
    }
    if (offset + 2 > bytes.length) return { reason: 'invalid' };
    const segmentLength = (bytes[offset] << 8) + bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return { reason: 'invalid' };
    if (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    ) {
      sawFrame = true;
    }
    offset += segmentLength;
    if (marker !== 0xda) continue;
    sawScan = true;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      let markerOffset = offset + 1;
      while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) markerOffset += 1;
      if (markerOffset >= bytes.length) return { reason: 'invalid' };
      const entropyMarker = bytes[markerOffset];
      if (entropyMarker === 0x00 || (entropyMarker >= 0xd0 && entropyMarker <= 0xd7)) {
        offset = markerOffset + 1;
        continue;
      }
      offset = markerOffset - 1;
      break;
    }
  }
  return { reason: 'invalid' };
};

const skipGifSubBlocks = (bytes: Uint8Array, start: number) => {
  let offset = start;
  while (offset < bytes.length) {
    const length = bytes[offset];
    offset += 1;
    if (length === 0) return offset;
    if (offset + length > bytes.length) return null;
    offset += length;
  }
  return null;
};

const inspectGif = (bytes: Uint8Array): PublicCaptureResourceInspection | null => {
  const signature = readAscii(bytes, 0, 6);
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return null;
  if (bytes.length < 14) return { reason: 'invalid' };
  let offset = 13;
  const globalColorTableFlags = bytes[10];
  if ((globalColorTableFlags & 0x80) !== 0) {
    offset += 3 * (2 ** ((globalColorTableFlags & 0x07) + 1));
  }
  let imageCount = 0;
  let sawTrailer = false;
  while (offset < bytes.length) {
    const marker = bytes[offset];
    if (marker === 0x3b) {
      sawTrailer = true;
      break;
    }
    if (marker === 0x21) {
      if (offset + 2 > bytes.length) return { reason: 'invalid' };
      const next = skipGifSubBlocks(bytes, offset + 2);
      if (next === null) return { reason: 'invalid' };
      offset = next;
      continue;
    }
    if (marker !== 0x2c || offset + 10 > bytes.length) return { reason: 'invalid' };
    imageCount += 1;
    if (imageCount > 1) return { reason: 'animated' };
    const localColorTableFlags = bytes[offset + 9];
    offset += 10;
    if ((localColorTableFlags & 0x80) !== 0) {
      offset += 3 * (2 ** ((localColorTableFlags & 0x07) + 1));
    }
    if (offset >= bytes.length) return { reason: 'invalid' };
    offset += 1;
    const next = skipGifSubBlocks(bytes, offset);
    if (next === null) return { reason: 'invalid' };
    offset = next;
  }
  if (!sawTrailer || imageCount !== 1) return { reason: 'invalid' };
  return {
    format: { contentType: 'image/gif', kind: 'image', name: 'gif' },
  };
};

const inspectWebp = (bytes: Uint8Array): PublicCaptureResourceInspection | null => {
  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WEBP') return null;
  if (bytes.length < 20 || readUint32LittleEndian(bytes, 4) + 8 > bytes.length) {
    return { reason: 'invalid' };
  }
  let offset = 12;
  let sawImagePayload = false;
  while (offset + 8 <= bytes.length) {
    const type = readAscii(bytes, offset, 4);
    const length = readUint32LittleEndian(bytes, offset + 4);
    const dataStart = offset + 8;
    const next = dataStart + length + (length % 2);
    if (!Number.isSafeInteger(next) || next > bytes.length) return { reason: 'invalid' };
    if (type === 'ANIM' || type === 'ANMF') return { reason: 'animated' };
    if (type === 'VP8X') {
      if (length < 10) return { reason: 'invalid' };
      if ((bytes[dataStart] & 0x02) !== 0) return { reason: 'animated' };
    } else if (type === 'VP8 ') {
      if (
        length < 10
        || !hasBytes(bytes, dataStart + 3, [0x9d, 0x01, 0x2a])
      ) return { reason: 'invalid' };
      sawImagePayload = true;
    } else if (type === 'VP8L') {
      if (length < 5 || bytes[dataStart] !== 0x2f) return { reason: 'invalid' };
      sawImagePayload = true;
    }
    offset = next;
  }
  if (!sawImagePayload) return { reason: 'invalid' };
  return {
    format: { contentType: 'image/webp', kind: 'image', name: 'webp' },
  };
};

const readBmffBoxSize = (bytes: Uint8Array, offset: number) => {
  if (offset + 8 > bytes.length) return null;
  const shortSize = readUint32BigEndian(bytes, offset);
  if (shortSize === 0) return { headerSize: 8, size: bytes.length - offset };
  if (shortSize !== 1) return { headerSize: 8, size: shortSize };
  if (offset + 16 > bytes.length) return null;
  const high = readUint32BigEndian(bytes, offset + 8);
  const low = readUint32BigEndian(bytes, offset + 12);
  const size = high * 0x1_0000_0000 + low;
  return Number.isSafeInteger(size) ? { headerSize: 16, size } : null;
};

const inspectAvif = (bytes: Uint8Array): PublicCaptureResourceInspection | null => {
  if (bytes.length < 16 || readAscii(bytes, 4, 4) !== 'ftyp') return null;
  const first = readBmffBoxSize(bytes, 0);
  if (!first || first.size < first.headerSize + 8 || first.size > bytes.length) return { reason: 'invalid' };
  const brands = new Set<string>();
  const brandStart = first.headerSize + 4;
  for (let offset = brandStart; offset + 4 <= first.size; offset += 4) {
    if (offset === first.headerSize + 4) continue;
    brands.add(readAscii(bytes, offset, 4));
  }
  brands.add(readAscii(bytes, first.headerSize, 4));
  if (!brands.has('avif') && !brands.has('avis')) return null;
  if (brands.has('avis')) return { reason: 'animated' };
  let offset = first.size;
  let sawMediaData = false;
  let sawMetadata = false;
  while (offset < bytes.length) {
    const box = readBmffBoxSize(bytes, offset);
    if (!box || box.size < box.headerSize || offset + box.size > bytes.length) {
      return { reason: 'invalid' };
    }
    const type = readAscii(bytes, offset + 4, 4);
    if (type === 'moov') return { reason: 'animated' };
    if (type === 'meta') sawMetadata = true;
    if (type === 'mdat') sawMediaData = true;
    offset += box.size;
  }
  if (!sawMetadata || !sawMediaData) return { reason: 'invalid' };
  return {
    format: { contentType: 'image/avif', kind: 'image', name: 'avif' },
  };
};

const inspectFont = (bytes: Uint8Array): PublicCaptureResourceInspection | null => {
  const signature = readAscii(bytes, 0, 4);
  if (signature === 'wOFF') {
    if (
      bytes.length < 44
      || readUint32BigEndian(bytes, 8) !== bytes.length
      || ((bytes[12] << 8) + bytes[13]) === 0
    ) return { reason: 'invalid' };
    return { format: { contentType: 'font/woff', kind: 'font', name: 'woff' } };
  }
  if (signature === 'wOF2') {
    if (
      bytes.length < 48
      || readUint32BigEndian(bytes, 8) !== bytes.length
      || ((bytes[12] << 8) + bytes[13]) === 0
    ) return { reason: 'invalid' };
    return { format: { contentType: 'font/woff2', kind: 'font', name: 'woff2' } };
  }
  if (signature === 'OTTO' || hasBytes(bytes, 0, [0x00, 0x01, 0x00, 0x00])) {
    const tableCount = (bytes[4] << 8) + bytes[5];
    if (bytes.length < 12 || tableCount === 0 || 12 + tableCount * 16 > bytes.length) {
      return { reason: 'invalid' };
    }
    return { format: { contentType: 'font/ttf', kind: 'font', name: 'truetype' } };
  }
  if (signature === 'ttcf') return { reason: 'invalid' };
  return null;
};

const looksLikeSvg = (bytes: Uint8Array, declaredContentType: string) => {
  if (/^image\/svg\+xml(?:\s*;|$)/iu.test(declaredContentType)) return true;
  const prefix = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 1024)))
    .replace(/^\uFEFF/u, '')
    .trimStart()
    .toLowerCase();
  return prefix.startsWith('<svg') || prefix.startsWith('<?xml') || prefix.startsWith('<!doctype svg');
};

/**
 * Browser MIME labels are advisory. The capture gate derives a safe Blob type
 * from actual bytes and rejects formats whose pixels can change over time.
 */
export const inspectPublicCaptureResource = (
  bytes: Uint8Array,
  declaredContentType = '',
): PublicCaptureResourceInspection => {
  if (looksLikeSvg(bytes, declaredContentType)) return { reason: 'svg' };
  return inspectPng(bytes)
    ?? inspectJpeg(bytes)
    ?? inspectGif(bytes)
    ?? inspectWebp(bytes)
    ?? inspectAvif(bytes)
    ?? inspectFont(bytes)
    ?? { reason: 'unknown' };
};
