import { PUBLIC_IMPORT_LIMITS } from '../public-workspace/publicImportContract';

export type EditorImportErrorCode =
  | 'asset_upload_unavailable'
  | 'batch-too-large'
  | 'empty-import'
  | 'file-too-large'
  | 'local-markdown-required'
  | 'public_output_moderation_rejected'
  | 'public_output_moderation_request_invalid'
  | 'public_output_moderation_unavailable'
  | 'too-many-files'
  | 'unsupported-file-type';

export class EditorImportError extends Error {
  code: EditorImportErrorCode;

  constructor(code: EditorImportErrorCode, message: string) {
    super(message);
    this.name = 'EditorImportError';
    this.code = code;
  }
}

export type EditorImportLimits = {
  maxFiles: number;
  maxTextFileBytes: number;
  maxImageFileBytes: number;
  maxTotalBytes: number;
};

export type EditorImportImageAsset = {
  markdown: string;
};

export type EditorImportOptions = {
  limits?: EditorImportLimits;
  resolveImageAsset?: (file: File) => Promise<EditorImportImageAsset>;
};

export type EditorImportDropData = {
  files?: Iterable<File> | ArrayLike<File> | null;
  getData?: (type: string) => string;
  html?: string;
  plainText?: string;
  uriList?: string;
};

export const DEFAULT_EDITOR_IMPORT_LIMITS: EditorImportLimits = PUBLIC_IMPORT_LIMITS;

const TEXT_EXTENSIONS = new Set([
  'csv',
  'htm',
  'html',
  'json',
  'json5',
  'markdown',
  'md',
  'mermaid',
  'mmd',
  'txt',
  'xml',
  'yaml',
  'yml',
]);

const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp']);
const IMAGE_MIME_TYPES = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);
const TEXT_BINARY_SAMPLE_BYTES = 4096;

export const EDITOR_IMPORT_FILE_ACCEPT = [
  '.md',
  '.markdown',
  '.txt',
  '.json',
  '.json5',
  '.html',
  '.htm',
  '.mmd',
  '.mermaid',
  '.csv',
  '.yaml',
  '.yml',
  '.xml',
  'image/png',
  'image/jpeg',
  'image/avif',
  'image/webp',
  'image/gif',
].join(',');

const getExtension = (fileName: string) => {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
};

const isTextFile = (file: File) => {
  const extension = getExtension(file.name);
  if (TEXT_EXTENSIONS.has(extension)) return true;
  return file.type.startsWith('text/') || file.type === 'application/json' || file.type === 'application/xml';
};

const isImageFile = (file: File) => {
  const extension = getExtension(file.name);
  if (extension === 'svg' || file.type === 'image/svg+xml') return false;
  return IMAGE_EXTENSIONS.has(extension) || IMAGE_MIME_TYPES.has(file.type);
};

const normalizeFiles = (files: Iterable<File> | ArrayLike<File>) => Array.from(files as Iterable<File>);

export const snapshotEditorImportFiles = (
  inputFiles: Iterable<File> | ArrayLike<File> | null | undefined,
): File[] => (inputFiles ? normalizeFiles(inputFiles) : []);

const EDITOR_IMPORT_DROP_TYPES = new Set(['Files', 'text/plain', 'text/html', 'text/uri-list']);

export const hasEditorImportDropPayload = (
  dataTransfer: Pick<DataTransfer, 'files' | 'types'> | null | undefined,
) => {
  if (!dataTransfer) return false;
  if (dataTransfer.files?.length) return true;
  return Array.from(dataTransfer.types ?? []).some(type => EDITOR_IMPORT_DROP_TYPES.has(type));
};

export const snapshotEditorImportDropData = (data: EditorImportDropData): EditorImportDropData => ({
  files: snapshotEditorImportFiles(data.files),
  plainText: data.plainText ?? data.getData?.('text/plain') ?? '',
  html: data.html ?? data.getData?.('text/html') ?? '',
  uriList: data.uriList ?? data.getData?.('text/uri-list') ?? '',
});

const sanitizeAltText = (value: string) =>
  value.replace(/[\r\n[\]]+/g, ' ').replace(/\s+/g, ' ').trim() || 'image';

const bytesToBase64 = (bytes: Uint8Array) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
};

const isLikelyBinaryTextSample = (bytes: Uint8Array) => {
  if (bytes.length === 0) return false;
  let controlByteCount = 0;
  for (const byte of bytes) {
    if (byte === 0) return true;
    const isAllowedControl = byte === 9 || byte === 10 || byte === 12 || byte === 13;
    if (byte < 32 && !isAllowedControl) controlByteCount += 1;
  }
  return controlByteCount / bytes.length > 0.02;
};

const assertReadableTextFile = async (file: File) => {
  const sample = new Uint8Array(await file.slice(0, TEXT_BINARY_SAMPLE_BYTES).arrayBuffer());
  if (isLikelyBinaryTextSample(sample)) {
    throw new EditorImportError('unsupported-file-type', `${file.name} appears to be a binary file.`);
  }
};

const defaultResolveImageAsset = async (file: File): Promise<EditorImportImageAsset> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = file.type || `image/${getExtension(file.name) || 'png'}`;
  return {
    markdown: `![${sanitizeAltText(file.name)}](data:${mimeType};base64,${bytesToBase64(bytes)})`,
  };
};

const validateFiles = (files: readonly File[], limits: EditorImportLimits) => {
  if (files.length === 0) {
    throw new EditorImportError('empty-import', 'No importable content was provided.');
  }
  if (files.length > limits.maxFiles) {
    throw new EditorImportError('too-many-files', `Select up to ${limits.maxFiles} files.`);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > limits.maxTotalBytes) {
    throw new EditorImportError('batch-too-large', 'The selected files are too large to import together.');
  }

  for (const file of files) {
    if (isTextFile(file)) {
      if (file.size > limits.maxTextFileBytes) {
        throw new EditorImportError('file-too-large', `${file.name} is larger than the text import limit.`);
      }
      continue;
    }
    if (isImageFile(file)) {
      if (file.size > limits.maxImageFileBytes) {
        throw new EditorImportError('file-too-large', `${file.name} is larger than the image import limit.`);
      }
      continue;
    }
    throw new EditorImportError('unsupported-file-type', `${file.name} is not a supported import file.`);
  }
};

export const buildEditorImportContentFromFiles = async (
  inputFiles: Iterable<File> | ArrayLike<File>,
  options: EditorImportOptions = {},
) => {
  const files = normalizeFiles(inputFiles);
  const limits = options.limits ?? DEFAULT_EDITOR_IMPORT_LIMITS;
  const resolveImageAsset = options.resolveImageAsset ?? defaultResolveImageAsset;
  validateFiles(files, limits);

  const parts: string[] = [];
  for (const file of files) {
    if (isTextFile(file)) {
      await assertReadableTextFile(file);
      parts.push(await file.text());
      continue;
    }
    parts.push((await resolveImageAsset(file)).markdown);
  }

  return parts.map(part => part.trim()).filter(Boolean).join('\n\n');
};

export const buildEditorImportContentFromDropData = async (
  data: EditorImportDropData,
  options: EditorImportOptions = {},
) => {
  const files = data.files ? normalizeFiles(data.files) : [];
  if (files.length > 0) {
    return buildEditorImportContentFromFiles(files, options);
  }

  const droppedText =
    data.plainText ||
    data.getData?.('text/plain') ||
    data.html ||
    data.getData?.('text/html') ||
    data.uriList ||
    data.getData?.('text/uri-list') ||
    '';
  const content = droppedText.trim();
  if (!content) {
    throw new EditorImportError('empty-import', 'No importable content was provided.');
  }
  return content;
};
