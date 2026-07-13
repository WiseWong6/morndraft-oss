import type { ImportedDocument, PublicImportAdapter } from './types';
import {
  compressPublicImportImage,
  PublicImageCompressionError,
} from './publicImageCompression';
import { PUBLIC_IMPORT_LIMITS } from './publicImportContract';
export { PUBLIC_IMPORT_LIMITS } from './publicImportContract';

export const PUBLIC_IMPORT_ACCEPT = [
  '.md', '.markdown', '.txt', '.json', '.json5', '.html', '.htm', '.mmd', '.mermaid',
  '.csv', '.yaml', '.yml', '.xml', 'image/png', 'image/jpeg', 'image/avif', 'image/webp', 'image/gif',
].join(',');

export type PublicImportErrorCode =
  | 'batch-too-large'
  | 'empty-import'
  | 'file-too-large'
  | 'multiple-documents'
  | 'too-many-files'
  | 'unreferenced-image'
  | 'unsupported-file-type';

export class PublicImportError extends Error {
  code: PublicImportErrorCode;

  constructor(code: PublicImportErrorCode, message: string) {
    super(message);
    this.name = 'PublicImportError';
    this.code = code;
  }
}

const TEXT_EXTENSIONS = new Set([
  'csv', 'htm', 'html', 'json', 'json5', 'markdown', 'md', 'mermaid', 'mmd', 'txt', 'xml', 'yaml', 'yml',
]);
const IMAGE_EXTENSIONS = new Set(['avif', 'gif', 'jpeg', 'jpg', 'png', 'webp']);
const PUBLIC_TEXT_BINARY_SAMPLE_BYTES = 4096;

const getExtension = (name: string) => name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : '';
const IMAGE_MIME_TYPES = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp']);
const getFileKind = (file: File): 'image' | 'text' | 'unsupported' => {
  const extension = getExtension(file.name);
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith('image/')) return IMAGE_MIME_TYPES.has(mimeType) ? 'image' : 'unsupported';
  if (IMAGE_EXTENSIONS.has(extension)) {
    return !mimeType || mimeType === 'application/octet-stream' ? 'image' : 'unsupported';
  }
  if (TEXT_EXTENSIONS.has(extension)) {
    return !mimeType || mimeType === 'application/octet-stream' || mimeType.startsWith('text/') || /application\/(?:json|xml)/u.test(mimeType)
      ? 'text'
      : 'unsupported';
  }
  if (mimeType.startsWith('text/') || /application\/(?:json|xml)/u.test(mimeType)) return 'text';
  return 'unsupported';
};
const isImage = (file: File) => getFileKind(file) === 'image';
const isText = (file: File) => getFileKind(file) === 'text';
const sanitizeAlt = (name: string) => name.replace(/[\r\n[\]]+/gu, ' ').replace(/\s+/gu, ' ').trim() || 'image';

const assertReadableTextFile = async (file: File) => {
  const bytes = new Uint8Array(await file.slice(0, PUBLIC_TEXT_BINARY_SAMPLE_BYTES).arrayBuffer());
  if (bytes.length === 0) return;
  let controlByteCount = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      throw new PublicImportError('unsupported-file-type', `${file.name} appears to be a binary file.`);
    }
    const isAllowedControl = byte === 9 || byte === 10 || byte === 12 || byte === 13;
    if (byte < 32 && !isAllowedControl) controlByteCount += 1;
  }
  if (controlByteCount / bytes.length > 0.02) {
    throw new PublicImportError('unsupported-file-type', `${file.name} appears to be a binary file.`);
  }
};

const readAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  if (typeof FileReader === 'undefined') {
    file.arrayBuffer().then((buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.slice(index, index + 0x8000));
      }
      const encoded = typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
      resolve(`data:${file.type || 'application/octet-stream'};base64,${encoded}`);
    }, reject);
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Unable to read the compressed image.'));
  reader.onload = () => resolve(String(reader.result ?? ''));
  reader.readAsDataURL(file);
});

export const resolvePublicImageDataUrl = async (file: File) => {
  try {
    const compressed = await compressPublicImportImage(file);
    return await readAsDataUrl(compressed.blob);
  } catch (error) {
    if (error instanceof PublicImageCompressionError) {
      throw new PublicImportError(error.code, error.message);
    }
    throw error;
  }
};

const getDecodedLocalImageBasename = (rawReference: string) => {
  const reference = rawReference.trim().replace(/^<|>$/gu, '');
  if (
    !reference || reference.startsWith('/') || reference.startsWith('\\') ||
    reference.startsWith('//') || /^[a-z][a-z\d+.-]*:/iu.test(reference)
  ) return null;
  const pathOnly = reference.split(/[?#]/u, 1)[0];
  let decoded = pathOnly;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    // A malformed escape cannot refer to the selected local filename.
    return null;
  }
  const normalized = decoded.replace(/\\/gu, '/');
  return normalized.split('/').filter(Boolean).at(-1) ?? null;
};

const isMatchingLocalImageReference = (reference: string, fileName: string) => (
  getDecodedLocalImageBasename(reference)?.normalize('NFC').toLocaleLowerCase('en-US') ===
  fileName.normalize('NFC').toLocaleLowerCase('en-US')
);

const replaceLocalImageReferences = (source: string, fileName: string, dataUrl: string) => source
  .replace(
    /(!\[[^\]\r\n]*\]\(\s*)(<[^>\r\n]+>|[^\s)\r\n]+)(\s*(?:["'][^"'\r\n]*["'])?\))/giu,
    (match, prefix: string, reference: string, suffix: string) => (
      isMatchingLocalImageReference(reference, fileName) ? `${prefix}${dataUrl}${suffix}` : match
    ),
  )
  .replace(
    /((?:src|href)\s*=\s*)(["'])([^"']+)\2/giu,
    (match, prefix: string, quote: string, reference: string) => (
      isMatchingLocalImageReference(reference, fileName)
        ? `${prefix}${quote}${dataUrl}${quote}`
        : match
    ),
  );

const validateFiles = (files: readonly File[]) => {
  const limits = PUBLIC_IMPORT_LIMITS;
  if (files.length === 0) throw new PublicImportError('empty-import', 'No importable files were selected.');
  if (files.length > limits.maxFiles) throw new PublicImportError('too-many-files', `Select up to ${limits.maxFiles} files.`);
  if (files.reduce((total, file) => total + file.size, 0) > limits.maxTotalBytes) {
    throw new PublicImportError('batch-too-large', 'The selected files exceed the 20 MiB batch limit.');
  }
  for (const file of files) {
    const kind = getFileKind(file);
    if (kind === 'unsupported') throw new PublicImportError('unsupported-file-type', `${file.name} is not supported.`);
    if (isText(file) && file.size > limits.maxTextFileBytes) throw new PublicImportError('file-too-large', `${file.name} exceeds the 2 MiB text limit.`);
    if (isImage(file) && file.size > limits.maxImageFileBytes) throw new PublicImportError('file-too-large', `${file.name} exceeds the image limit.`);
  }
};

export const buildPublicImportedDocument = async (files: readonly File[]): Promise<ImportedDocument> => {
  validateFiles(files);
  const documents = files.filter(isText);
  const images = files.filter(isImage);
  if (documents.length > 1) {
    throw new PublicImportError('multiple-documents', 'Select one main document and optional images.');
  }

  await Promise.all(documents.map(assertReadableTextFile));

  let source = documents.length === 1 ? await documents[0].text() : '';
  const unattachedImages: string[] = [];
  for (const image of images) {
    const dataUrl = await resolvePublicImageDataUrl(image);
    const replaced = replaceLocalImageReferences(source, image.name, dataUrl);
    if (replaced === source) unattachedImages.push(`![${sanitizeAlt(image.name)}](${dataUrl})`);
    source = replaced;
  }
  if (unattachedImages.length > 0) {
    const documentExtension = documents[0] ? getExtension(documents[0].name) : '';
    const canAppendMarkdown = documents.length === 0 || documentExtension === 'md' || documentExtension === 'markdown' || documentExtension === 'txt';
    if (!canAppendMarkdown) {
      throw new PublicImportError(
        'unreferenced-image',
        'Every attached image must already be referenced by a non-Markdown document.',
      );
    }
    source = [source.trim(), ...unattachedImages].filter(Boolean).join('\n\n');
  }
  if (!source.trim()) throw new PublicImportError('empty-import', 'The selected files did not contain importable content.');
  const suggestedTitle = documents[0]?.name.replace(/\.[^.]+$/u, '') || images[0]?.name.replace(/\.[^.]+$/u, '');
  return { source, suggestedTitle };
};

export const createLocalPublicImportAdapter = (): PublicImportAdapter => ({
  importFiles: buildPublicImportedDocument,
});
