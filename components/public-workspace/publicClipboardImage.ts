import { PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES } from './publicImageCompression';
import { resolvePublicImageDataUrl } from './publicImport';

const PUBLIC_CLIPBOARD_IMAGE_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const PUBLIC_CLIPBOARD_IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp']);
const PUBLIC_CLIPBOARD_IMAGE_DATA_URL_PATTERN = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,([A-Za-z\d+/]+={0,2})$/u;
const PUBLIC_CLIPBOARD_IMAGE_MAX_ALT_CODE_POINTS = 160;
const PUBLIC_CLIPBOARD_IMAGE_MAX_BASE64_LENGTH = 4 * Math.ceil(PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES / 3);

export type PublicClipboardSourceRange = Readonly<{
  end: number;
  start: number;
}>;

export type PublicClipboardImageInsertResult =
  | {
      insertedRange: PublicClipboardSourceRange;
      ok: true;
      source: string;
    }
  | {
      ok: false;
      reason: 'invalid-range' | 'range-out-of-bounds' | 'reversed-range' | 'unsafe-markdown';
    };

type PublicClipboardImageDataTransfer = Pick<DataTransfer, 'files' | 'items'>;
type PublicClipboardImageEvent = Pick<ClipboardEvent, 'clipboardData'>;
type PublicImageDataUrlResolver = (file: File) => Promise<string>;

const getFileExtension = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
};

export const isSupportedPublicClipboardImageFile = (file: File) => {
  const contentType = file.type.trim().toLowerCase();
  const extension = getFileExtension(file.name);
  if (contentType === 'image/svg+xml' || extension === 'svg') return false;
  if (PUBLIC_CLIPBOARD_IMAGE_MIME_TYPES.has(contentType)) return true;
  return (
    (!contentType || contentType === 'application/octet-stream')
    && PUBLIC_CLIPBOARD_IMAGE_EXTENSIONS.has(extension)
  );
};

const getSupportedItemFile = (item: DataTransferItem) => {
  if (item.kind !== 'file') return null;
  try {
    const file = item.getAsFile();
    return file && isSupportedPublicClipboardImageFile(file) ? file : null;
  } catch {
    return null;
  }
};

export const getFirstPublicClipboardImageFile = (
  dataTransfer: PublicClipboardImageDataTransfer | null | undefined,
) => {
  if (!dataTransfer) return null;
  for (const item of Array.from(dataTransfer.items ?? [])) {
    const file = getSupportedItemFile(item);
    if (file) return file;
  }
  return Array.from(dataTransfer.files ?? []).find(isSupportedPublicClipboardImageFile) ?? null;
};

export const getFirstPublicClipboardEventImageFile = (
  event: PublicClipboardImageEvent | null | undefined,
) => getFirstPublicClipboardImageFile(event?.clipboardData);

export const sanitizePublicClipboardImageAlt = (fileName: string) => {
  const normalized = Array.from(String(fileName ?? '').normalize('NFC'), (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      codePoint <= 0x1f
      || codePoint === 0x7f
      || codePoint === 0x2028
      || codePoint === 0x2029
      || character === '['
      || character === ']'
      || character === '\\'
    ) ? ' ' : character;
  }).join('')
    .replace(/\s+/gu, ' ')
    .trim();
  const bounded = Array.from(normalized).slice(0, PUBLIC_CLIPBOARD_IMAGE_MAX_ALT_CODE_POINTS).join('');
  return bounded || 'image';
};

export const isSafePublicClipboardImageDataUrl = (dataUrl: string) => {
  const match = String(dataUrl ?? '').match(PUBLIC_CLIPBOARD_IMAGE_DATA_URL_PATTERN);
  if (!match) return false;
  const payload = match[1];
  return payload.length <= PUBLIC_CLIPBOARD_IMAGE_MAX_BASE64_LENGTH && payload.length % 4 === 0;
};

export const createPublicClipboardImageMarkdown = ({
  dataUrl,
  fileName,
}: {
  dataUrl: string;
  fileName: string;
}) => {
  if (!isSafePublicClipboardImageDataUrl(dataUrl)) return null;
  return `![${sanitizePublicClipboardImageAlt(fileName)}](${dataUrl})`;
};

export const isSafePublicClipboardImageMarkdown = (markdown: string) => {
  const match = String(markdown ?? '').match(/^!\[([^\]\r\n]*)\]\((data:image\/[^\s)]+)\)$/u);
  return Boolean(match && isSafePublicClipboardImageDataUrl(match[2]));
};

export const resolvePublicClipboardImageMarkdown = async (
  file: File,
  resolveImageDataUrl: PublicImageDataUrlResolver = resolvePublicImageDataUrl,
) => {
  if (!isSupportedPublicClipboardImageFile(file)) return null;
  const dataUrl = await resolveImageDataUrl(file);
  return createPublicClipboardImageMarkdown({ dataUrl, fileName: file.name });
};

export const insertPublicClipboardImageMarkdown = (
  source: string,
  range: PublicClipboardSourceRange | null | undefined,
  markdown: string,
): PublicClipboardImageInsertResult => {
  if (!range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)) {
    return { ok: false, reason: 'invalid-range' };
  }
  if (range.start < 0 || range.end > source.length) {
    return { ok: false, reason: 'range-out-of-bounds' };
  }
  if (range.end < range.start) {
    return { ok: false, reason: 'reversed-range' };
  }
  if (!isSafePublicClipboardImageMarkdown(markdown)) {
    return { ok: false, reason: 'unsafe-markdown' };
  }
  return {
    insertedRange: { start: range.start, end: range.start + markdown.length },
    ok: true,
    source: `${source.slice(0, range.start)}${markdown}${source.slice(range.end)}`,
  };
};
