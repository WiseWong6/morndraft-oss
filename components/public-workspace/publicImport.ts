import type { ImportedDocument, PublicImportAdapter } from './types';
import {
  compressPublicImportImage,
  PublicImageCompressionError,
} from './publicImageCompression';
import {
  PUBLIC_IMPORT_LIMITS,
  PUBLIC_IMPORT_MAX_EXPANDED_SOURCE_LENGTH,
  PUBLIC_IMPORT_MAX_IMAGE_REPLACEMENTS,
} from './publicImportContract';
export { PUBLIC_IMPORT_LIMITS } from './publicImportContract';

export const PUBLIC_IMPORT_ACCEPT = [
  '.md', '.markdown', '.txt', '.json', '.json5', '.html', '.htm', '.mmd', '.mermaid',
  '.csv', '.yaml', '.yml', '.xml', 'image/png', 'image/jpeg', 'image/avif', 'image/webp', 'image/gif',
].join(',');

export type PublicImportErrorCode =
  | 'batch-too-large'
  | 'document-too-complex'
  | 'duplicate-image-name'
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
  const reference = rawReference.trim();
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

const normalizePublicImageName = (value: string) => value.normalize('NFC').toLocaleLowerCase('en-US');
const getLocalImageReferenceKey = (reference: string) => {
  const basename = getDecodedLocalImageBasename(reference);
  return basename ? normalizePublicImageName(basename) : null;
};

type PublicSourceReplacement = { end: number; start: number; value: string };
type PublicImageReferenceResolver = (reference: string) => string | null;
type PublicMarkdownImageScanMetrics = { maxSourceLength: number; parseCalls: number; steps: number };
type PublicMarkdownToken = {
  _tokenizer?: { events: PublicMarkdownEvent[] };
  contentType?: string;
  end: { offset?: number };
  next?: PublicMarkdownToken;
  previous?: PublicMarkdownToken;
  start: { offset?: number };
  type: string;
};
type PublicMarkdownEvent = ['enter' | 'exit', PublicMarkdownToken, unknown];

type PublicMarkdownRuntime = {
  decodeString(value: string): string;
  parse: typeof import('micromark')['parse'];
  postprocess: typeof import('micromark')['postprocess'];
  preprocess: typeof import('micromark')['preprocess'];
};
let publicMarkdownRuntime: Promise<PublicMarkdownRuntime> | undefined;
const loadPublicMarkdownRuntime = () => {
  publicMarkdownRuntime ??= Promise.all([
    import('micromark'),
    import('micromark-util-decode-string'),
  ]).then(([micromark, decoder]) => ({
    decodeString: decoder.decodeString,
    parse: micromark.parse,
    postprocess: micromark.postprocess,
    preprocess: micromark.preprocess,
  }));
  return publicMarkdownRuntime;
};

const getPublicMarkdownBudgetContext = (documentEvents: readonly PublicMarkdownEvent[]) => {
  const flowEventLists = new Set<PublicMarkdownEvent[]>();
  for (const [phase, token] of documentEvents) {
    if (phase === 'enter' && token.type === 'chunkFlow' && token._tokenizer) {
      flowEventLists.add(token._tokenizer.events);
    }
  }
  const visited = new Set<PublicMarkdownToken>();
  const blocks: Array<Array<{ end: number; start: number }>> = [];
  const inertBlockRangeKeys = new Set<string>();
  const inertBlockRanges: Array<readonly [number, number]> = [];
  for (const flowEvents of flowEventLists) {
    for (const [phase, token] of flowEvents) {
      if (
        phase === 'enter' &&
        (token.type === 'codeFenced' || token.type === 'codeIndented' || token.type === 'htmlFlow')
      ) {
        const start = token.start.offset;
        const end = token.end.offset;
        const key = `${start}:${end}`;
        if (start !== undefined && end !== undefined && end > start && !inertBlockRangeKeys.has(key)) {
          inertBlockRangeKeys.add(key);
          inertBlockRanges.push([start, end]);
        }
      }
      if (phase !== 'enter' || token.type !== 'chunkText' || token.contentType !== 'text' || visited.has(token)) {
        continue;
      }
      let first = token;
      while (first.previous) first = first.previous;
      const segments: Array<{ end: number; start: number }> = [];
      for (let current: PublicMarkdownToken | undefined = first; current; current = current.next) {
        if (visited.has(current)) break;
        visited.add(current);
        const start = current.start.offset;
        const end = current.end.offset;
        if (start !== undefined && end !== undefined && end > start) segments.push({ start, end });
      }
      if (segments.length > 0) blocks.push(segments);
    }
  }
  inertBlockRanges.sort((left, right) => left[0] - right[0]);
  return {
    inertBlockRanges: Uint32Array.from(inertBlockRanges.flat()),
    inlineBlocks: blocks,
  };
};

const replaceMarkdownImageReferences = async (
  source: string,
  resolveReference: PublicImageReferenceResolver,
  metrics?: PublicMarkdownImageScanMetrics,
) => {
  if (!source.includes('![')) {
    if (metrics) metrics.steps = source.length;
    return source;
  }
  if (metrics) {
    metrics.maxSourceLength = Math.max(metrics.maxSourceLength, source.length);
    metrics.parseCalls += 1;
  }
  const budget = await import('./publicImportMarkdownBudget');
  try {
    budget.assertPublicMarkdownDocumentShapeBudget(source);
  } catch (error) {
    if (error instanceof budget.PublicMarkdownImageDelimiterBudgetError) {
      throw new PublicImportError('document-too-complex', error.message);
    }
    throw error;
  }
  const { decodeString, parse, postprocess, preprocess } = await loadPublicMarkdownRuntime();
  const documentEvents = parse().document().write(preprocess()(source, undefined, true));
  try {
    const { inertBlockRanges, inlineBlocks } = getPublicMarkdownBudgetContext(
      documentEvents as unknown as PublicMarkdownEvent[],
    );
    const inlineParser = parse();
    const inlineHtmlRanges = budget.getPublicMarkdownInlineHtmlRanges(
      source,
      inlineBlocks,
      (candidate, htmlStart) => inlineParser.text().write([candidate, null]).some(([phase, token]) => (
        phase === 'enter' && token.type === 'htmlText' &&
        token.start.offset === htmlStart && token.end.offset === candidate.length
      )),
    );
    const steps = budget.assertPublicMarkdownImageDelimiterBudget(
      source,
      inlineBlocks,
      inlineHtmlRanges,
      inertBlockRanges,
    );
    if (metrics) metrics.steps = steps;
  } catch (error) {
    if (error instanceof budget.PublicMarkdownImageDelimiterBudgetError) {
      throw new PublicImportError('document-too-complex', error.message);
    }
    throw error;
  }
  const events = postprocess(documentEvents);
  if (metrics) metrics.steps += events.length;
  const referencedLabels = new Set<string>();
  const definitions: Array<{ destination: Omit<PublicSourceReplacement, 'value'>; label: string }> = [];
  const replacements: PublicSourceReplacement[] = [];
  const addReplacement = (replacement: PublicSourceReplacement) => {
    if (replacements.length >= PUBLIC_IMPORT_MAX_IMAGE_REPLACEMENTS) {
      throw new PublicImportError(
        'document-too-complex',
        `Markdown source exceeds the ${PUBLIC_IMPORT_MAX_IMAGE_REPLACEMENTS}-image-reference safety limit.`,
      );
    }
    replacements.push(replacement);
  };
  const imageStack: Array<{ direct: boolean; label: string; reference: string }> = [];
  const definitionStack: Array<{ destination: Omit<PublicSourceReplacement, 'value'> | null; label: string }> = [];
  const normalizeIdentifier = (value: string) => decodeString(value)
    .replace(/[\t\n\r ]+/gu, ' ')
    .trim()
    .toLowerCase()
    .toUpperCase();
  const getRange = (token: { start: { offset?: number }; end: { offset?: number } }) => {
    const start = token.start.offset;
    const end = token.end.offset;
    return start === undefined || end === undefined ? null : { start, end };
  };

  for (const [phase, token] of events) {
    if (phase === 'enter' && token.type === 'image') {
      imageStack.push({ direct: false, label: '', reference: '' });
      continue;
    }
    const image = imageStack.at(-1);
    if (phase === 'enter' && image && token.type === 'labelText') {
      const range = getRange(token);
      if (range) image.label = source.slice(range.start, range.end);
    } else if (phase === 'enter' && image && token.type === 'referenceString') {
      const range = getRange(token);
      if (range) image.reference = source.slice(range.start, range.end);
    } else if (phase === 'enter' && image && token.type === 'resourceDestinationString') {
      image.direct = true;
      const range = getRange(token);
      const value = range && range.end > range.start
        ? resolveReference(decodeString(source.slice(range.start, range.end)))
        : null;
      if (range && value) addReplacement({ ...range, value });
    } else if (phase === 'exit' && token.type === 'image') {
      const completed = imageStack.pop();
      if (completed && !completed.direct) {
        const label = normalizeIdentifier(completed.reference || completed.label);
        if (label) referencedLabels.add(label);
      }
      continue;
    }

    if (phase === 'enter' && token.type === 'definition') {
      definitionStack.push({ destination: null, label: '' });
      continue;
    }
    const definition = definitionStack.at(-1);
    if (phase === 'enter' && definition && token.type === 'definitionLabelString') {
      const range = getRange(token);
      if (range) definition.label = normalizeIdentifier(source.slice(range.start, range.end));
    } else if (phase === 'enter' && definition && token.type === 'definitionDestinationString') {
      definition.destination = getRange(token);
    } else if (phase === 'exit' && token.type === 'definition') {
      const completed = definitionStack.pop();
      if (completed?.label && completed.destination) definitions.push({
        destination: completed.destination,
        label: completed.label,
      });
    }
  }

  const seenDefinitions = new Set<string>();
  for (const definition of definitions) {
    if (seenDefinitions.has(definition.label)) continue;
    seenDefinitions.add(definition.label);
    const rawDestination = source.slice(definition.destination.start, definition.destination.end);
    const value = referencedLabels.has(definition.label)
      ? resolveReference(decodeString(rawDestination))
      : null;
    if (value) addReplacement({ ...definition.destination, value });
  }
  if (replacements.length === 0) return source;
  replacements.sort((left, right) => left.start - right.start);
  let expandedLength = source.length;
  let budgetCursor = 0;
  for (const replacement of replacements) {
    if (replacement.start < budgetCursor) continue;
    expandedLength += replacement.value.length - (replacement.end - replacement.start);
    if (expandedLength > PUBLIC_IMPORT_MAX_EXPANDED_SOURCE_LENGTH) {
      throw new PublicImportError(
        'document-too-complex',
        `Imported Source would exceed the ${PUBLIC_IMPORT_MAX_EXPANDED_SOURCE_LENGTH}-character expansion limit.`,
      );
    }
    budgetCursor = replacement.end;
  }
  const chunks: string[] = [];
  let sourceCursor = 0;
  for (const replacement of replacements) {
    if (replacement.start < sourceCursor) continue;
    chunks.push(source.slice(sourceCursor, replacement.start), replacement.value);
    sourceCursor = replacement.end;
  }
  chunks.push(source.slice(sourceCursor));
  return chunks.join('');
};

/** Test-only complexity probe; production calls do not allocate metrics. */
export const inspectPublicMarkdownImageReferenceWorkForTest = (source: string) => {
  const metrics: PublicMarkdownImageScanMetrics = { maxSourceLength: 0, parseCalls: 0, steps: 0 };
  return replaceMarkdownImageReferences(
    source,
    reference => getLocalImageReferenceKey(reference) === 'hero.png' ? 'data:image/png;base64,AA==' : null,
    metrics,
  )
    .then(result => ({ changed: result !== source, scanSteps: metrics.steps }));
};

/** Test-only batch probe; verifies parsers never receive already-expanded data URLs. */
export const inspectPublicBatchImageReferenceWorkForTest = async (
  source: string,
  fileNames: readonly string[],
  replacementLength: number,
) => {
  const replacements = new Map(fileNames.map((name, index) => [
    normalizePublicImageName(name),
    `data:image/png;base64,${String(index).padStart(2, '0')}${'A'.repeat(replacementLength)}`,
  ]));
  const metrics: PublicMarkdownImageScanMetrics = { maxSourceLength: 0, parseCalls: 0, steps: 0 };
  const result = await replaceMarkdownImageReferences(
    source,
    reference => {
      const key = getLocalImageReferenceKey(reference);
      return key ? replacements.get(key) ?? null : null;
    },
    metrics,
  );
  return { maxSourceLength: metrics.maxSourceLength, outputLength: result.length, parseCalls: metrics.parseCalls };
};

const replaceLocalImageReferences = async (
  source: string,
  resolveReference: PublicImageReferenceResolver,
  documentExtension: string,
) => {
  if (documentExtension === 'md' || documentExtension === 'markdown' || documentExtension === 'txt') {
    return replaceMarkdownImageReferences(source, resolveReference);
  }
  if (documentExtension === 'html' || documentExtension === 'htm') {
    const html = await import('./publicImportHtml');
    try {
      return await html.replacePublicHtmlImageReferences(source, resolveReference);
    } catch (error) {
      if (error instanceof html.PublicHtmlImageReferenceBudgetError) {
        throw new PublicImportError('document-too-complex', error.message);
      }
      throw error;
    }
  }
  return source;
};

const validateFiles = (files: readonly File[]) => {
  const limits = PUBLIC_IMPORT_LIMITS;
  if (files.length === 0) throw new PublicImportError('empty-import', 'No importable files were selected.');
  if (files.length > limits.maxFiles) throw new PublicImportError('too-many-files', `Select up to ${limits.maxFiles} files.`);
  if (files.reduce((total, file) => total + file.size, 0) > limits.maxTotalBytes) {
    throw new PublicImportError('batch-too-large', 'The selected files exceed the 20 MiB batch limit.');
  }
  const imageNames = new Set<string>();
  for (const file of files) {
    const kind = getFileKind(file);
    if (kind === 'unsupported') throw new PublicImportError('unsupported-file-type', `${file.name} is not supported.`);
    if (isText(file) && file.size > limits.maxTextFileBytes) throw new PublicImportError('file-too-large', `${file.name} exceeds the 2 MiB text limit.`);
    if (isImage(file)) {
      if (file.size > limits.maxImageFileBytes) throw new PublicImportError('file-too-large', `${file.name} exceeds the image limit.`);
      const normalizedName = normalizePublicImageName(file.name);
      if (imageNames.has(normalizedName)) {
        throw new PublicImportError(
          'duplicate-image-name',
          `Multiple selected images are named ${file.name}; local references would be ambiguous.`,
        );
      }
      imageNames.add(normalizedName);
    }
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
  const documentExtension = documents[0] ? getExtension(documents[0].name) : '';
  const resolvedImages: Array<{ dataUrl: string; file: File; key: string }> = [];
  for (const image of images) {
    const dataUrl = await resolvePublicImageDataUrl(image);
    resolvedImages.push({ dataUrl, file: image, key: normalizePublicImageName(image.name) });
  }
  const resolvedByKey = new Map(resolvedImages.map(image => [image.key, image]));
  const referencedKeys = new Set<string>();
  if (source && resolvedImages.length > 0) source = await replaceLocalImageReferences(source, (reference) => {
    const key = getLocalImageReferenceKey(reference);
    const resolved = key ? resolvedByKey.get(key) : undefined;
    if (!resolved) return null;
    referencedKeys.add(resolved.key);
    return resolved.dataUrl;
  }, documentExtension);
  const unattachedImages = resolvedImages
    .filter(image => !referencedKeys.has(image.key))
    .map(image => `![${sanitizeAlt(image.file.name)}](${image.dataUrl})`);
  if (unattachedImages.length > 0) {
    const canAppendMarkdown = documents.length === 0 || documentExtension === 'md' || documentExtension === 'markdown' || documentExtension === 'txt';
    if (!canAppendMarkdown) {
      throw new PublicImportError(
        'unreferenced-image',
        'Every attached image must already be referenced by a non-Markdown document.',
      );
    }
    const attachments = unattachedImages.join('\n\n');
    if (!source) {
      if (attachments.length > PUBLIC_IMPORT_MAX_EXPANDED_SOURCE_LENGTH) {
        throw new PublicImportError('document-too-complex', 'Imported Source exceeds the expansion limit.');
      }
      source = attachments;
    } else {
      const separator = source.endsWith('\n\n') ? '' : source.endsWith('\n') ? '\n' : '\n\n';
      if (source.length + separator.length + attachments.length > PUBLIC_IMPORT_MAX_EXPANDED_SOURCE_LENGTH) {
        throw new PublicImportError('document-too-complex', 'Imported Source exceeds the expansion limit.');
      }
      source = `${source}${separator}${attachments}`;
    }
  }
  if (!source.trim()) throw new PublicImportError('empty-import', 'The selected files did not contain importable content.');
  const suggestedTitle = documents[0]?.name.replace(/\.[^.]+$/u, '') || images[0]?.name.replace(/\.[^.]+$/u, '');
  return { source, suggestedTitle };
};

export const createLocalPublicImportAdapter = (): PublicImportAdapter => ({
  importFiles: buildPublicImportedDocument,
});
