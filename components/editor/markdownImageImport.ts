import { EditorImportError, type EditorImportImageAsset } from './editorImport';

export type MarkdownImageAssetReference = {
  alt: string;
  end: number;
  rawDestination: string;
  resolvedPath: string;
  start: number;
};

export type MarkdownFolderImportSelection = {
  markdownFile: File;
  markdownRelativePath: string;
};

export type MarkdownFolderImportOptions = {
  resolveImageAsset: (file: File, reference: MarkdownImageAssetReference) => Promise<EditorImportImageAsset>;
};

export type MarkdownAssetFilesImportOptions = MarkdownFolderImportOptions & {
  missingAssetErrorCode?: 'local-markdown-required' | 'unsupported-file-type';
};

export type HtmlAssetFilesImportOptions = MarkdownAssetFilesImportOptions;

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown']);
const HTML_EXTENSIONS = new Set(['htm', 'html']);
const IMAGE_REFERENCE_PATTERN = /!\[([^\]\r\n]*)\]\((<[^>\r\n]+>|[^)\r\n]+)\)/g;
const HTML_IMAGE_SOURCE_PATTERN = /<img\b[^>]*\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const IMAGE_ASSET_UPLOAD_CONCURRENCY = 3;

const getExtension = (fileName: string) => {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
};

const getRelativePath = (file: File) => {
  const value = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return value && value.trim() ? value : file.name;
};

const normalizePath = (path: string) => {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
};

const dirname = (path: string) => {
  const index = path.lastIndexOf('/');
  return index >= 0 ? path.slice(0, index) : '';
};

const basename = (path: string) => {
  const index = path.lastIndexOf('/');
  return index >= 0 ? path.slice(index + 1) : path;
};

const isRemoteOrAbsoluteDestination = (value: string) => (
  /^[a-z][a-z0-9+.-]*:/i.test(value) ||
  value.startsWith('//') ||
  value.startsWith('/') ||
  value.startsWith('#')
);

const stripDestination = (value: string) => {
  const trimmed = value.trim();
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1).trim() : trimmed;
};

const stripHtmlAttributeValue = (value: string) => {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
};

const safeDecodeUri = (value: string) => {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
};

const collectFenceRanges = (markdown: string) => {
  const ranges: Array<{ start: number; end: number }> = [];
  const fencePattern = /^(\s*)(`{3,}|~{3,}).*$/gm;
  let active: { marker: string; start: number } | null = null;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(markdown))) {
    const marker = match[2][0];
    if (!active) {
      active = { marker, start: match.index };
      continue;
    }
    if (marker === active.marker) {
      ranges.push({ start: active.start, end: fencePattern.lastIndex });
      active = null;
    }
  }
  if (active) ranges.push({ start: active.start, end: markdown.length });
  return ranges;
};

const isInsideRange = (index: number, ranges: readonly { start: number; end: number }[]) => (
  ranges.some(range => index >= range.start && index < range.end)
);

export const selectMarkdownFileFromFolder = (files: readonly File[]): MarkdownFolderImportSelection => {
  const markdownFiles = files
    .map(file => ({ file, relativePath: getRelativePath(file) }))
    .filter(entry => MARKDOWN_EXTENSIONS.has(getExtension(entry.relativePath)))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }));
  if (markdownFiles.length === 0) {
    throw new EditorImportError('empty-import', 'No Markdown file was found in the selected folder.');
  }
  const preferred = markdownFiles.find(entry => /终稿|final/i.test(entry.relativePath)) ?? markdownFiles[0];
  return {
    markdownFile: preferred.file,
    markdownRelativePath: preferred.relativePath,
  };
};

const selectHtmlFileFromFiles = (files: readonly File[]) => (
  files
    .map(file => ({ file, relativePath: getRelativePath(file) }))
    .filter(entry => HTML_EXTENSIONS.has(getExtension(entry.relativePath)))
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true, sensitivity: 'base' }))[0] ?? null
);

export const collectMarkdownImageAssetReferences = (
  markdown: string,
  markdownRelativePath: string,
): MarkdownImageAssetReference[] => {
  const references: MarkdownImageAssetReference[] = [];
  const fenceRanges = collectFenceRanges(markdown);
  const markdownDir = dirname(markdownRelativePath);
  let match: RegExpExecArray | null;
  while ((match = IMAGE_REFERENCE_PATTERN.exec(markdown))) {
    if (isInsideRange(match.index, fenceRanges)) continue;
    const rawDestination = stripDestination(match[2]);
    if (!rawDestination || isRemoteOrAbsoluteDestination(rawDestination)) continue;
    const resolvedPath = normalizePath(`${markdownDir ? `${markdownDir}/` : ''}${safeDecodeUri(rawDestination)}`);
    if (!resolvedPath) continue;
    references.push({
      alt: match[1],
      start: match.index,
      end: match.index + match[0].length,
      rawDestination,
      resolvedPath,
    });
  }
  return references;
};

export const collectHtmlImageAssetReferences = (
  html: string,
  htmlRelativePath: string,
): MarkdownImageAssetReference[] => {
  const references: MarkdownImageAssetReference[] = [];
  const htmlDir = dirname(htmlRelativePath);
  let match: RegExpExecArray | null;
  while ((match = HTML_IMAGE_SOURCE_PATTERN.exec(html))) {
    const rawAttributeValue = match[1];
    const rawDestination = stripHtmlAttributeValue(rawAttributeValue);
    if (!rawDestination || isRemoteOrAbsoluteDestination(rawDestination)) continue;
    const resolvedPath = normalizePath(`${htmlDir ? `${htmlDir}/` : ''}${safeDecodeUri(rawDestination)}`);
    if (!resolvedPath) continue;
    const attributeStart = match.index + match[0].lastIndexOf(rawAttributeValue);
    const isQuoted = rawAttributeValue.startsWith('"') || rawAttributeValue.startsWith("'");
    const start = attributeStart + (isQuoted ? 1 : 0);
    references.push({
      alt: rawDestination,
      end: start + rawDestination.length,
      rawDestination,
      resolvedPath,
      start,
    });
  }
  return references;
};

export const buildEditorImportContentFromMarkdownFolder = async (
  inputFiles: Iterable<File> | ArrayLike<File>,
  options: MarkdownFolderImportOptions,
) => {
  const files = Array.from(inputFiles as Iterable<File>);
  const selection = selectMarkdownFileFromFolder(files);
  const markdown = await selection.markdownFile.text();
  const filesByPath = new Map(files.map(file => [normalizePath(getRelativePath(file)) ?? getRelativePath(file), file]));
  const references = collectMarkdownImageAssetReferences(markdown, selection.markdownRelativePath);
  if (references.length === 0) return markdown.trim();

  const uploadsByPath = await uploadReferencedImageAssets({
    filesByPath,
    getUploadedValue: asset => asset.markdown,
    missingAssetErrorCode: 'unsupported-file-type',
    references,
    resolveImageAsset: options.resolveImageAsset,
  });

  return rewriteMarkdownImageAssetReferences(markdown, references, reference => uploadsByPath.get(reference.resolvedPath)).trim();
};

const extractMarkdownImageDestination = (markdown: string | undefined) => {
  const destinationMatch = markdown?.match(/\]\(([^)]+)\)$/);
  return destinationMatch?.[1] ?? null;
};

const findReferencedAssetFile = ({
  filesByBasename,
  filesByPath,
  reference,
}: {
  filesByBasename?: ReadonlyMap<string, readonly File[]>;
  filesByPath: ReadonlyMap<string, File>;
  reference: MarkdownImageAssetReference;
}) => {
  const basenameMatches = filesByBasename?.get(basename(reference.resolvedPath)) ?? [];
  return filesByPath.get(reference.resolvedPath) ?? (basenameMatches.length === 1 ? basenameMatches[0] : null);
};

const uploadReferencedImageAssets = async ({
  filesByBasename,
  filesByPath,
  getUploadedValue,
  missingAssetErrorCode,
  references,
  resolveImageAsset,
}: {
  filesByBasename?: ReadonlyMap<string, readonly File[]>;
  filesByPath: ReadonlyMap<string, File>;
  getUploadedValue: (asset: EditorImportImageAsset) => string;
  missingAssetErrorCode?: 'local-markdown-required' | 'unsupported-file-type';
  references: readonly MarkdownImageAssetReference[];
  resolveImageAsset: (file: File, reference: MarkdownImageAssetReference) => Promise<EditorImportImageAsset>;
}) => {
  const uploadsByPath = new Map<string, string>();
  const uploadRequests: Array<{ file: File; reference: MarkdownImageAssetReference }> = [];

  for (const reference of references) {
    if (uploadsByPath.has(reference.resolvedPath)) continue;
    uploadsByPath.set(reference.resolvedPath, '');
    const file = findReferencedAssetFile({ filesByBasename, filesByPath, reference });
    if (!file) {
      throw new EditorImportError(missingAssetErrorCode ?? 'unsupported-file-type', `Missing image asset: ${reference.rawDestination}`);
    }
    uploadRequests.push({ file, reference });
  }

  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < uploadRequests.length) {
      const request = uploadRequests[nextIndex];
      nextIndex += 1;
      const uploaded = await resolveImageAsset(request.file, request.reference);
      uploadsByPath.set(request.reference.resolvedPath, getUploadedValue(uploaded));
    }
  };

  const workerCount = Math.min(IMAGE_ASSET_UPLOAD_CONCURRENCY, uploadRequests.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return uploadsByPath;
};

const rewriteInlineAssetDestinations = (
  source: string,
  references: readonly MarkdownImageAssetReference[],
  getDestination: (reference: MarkdownImageAssetReference) => string | undefined,
) => {
  let nextSource = '';
  let cursor = 0;
  for (const reference of references) {
    nextSource += source.slice(cursor, reference.start);
    nextSource += getDestination(reference) ?? reference.rawDestination;
    cursor = reference.end;
  }
  nextSource += source.slice(cursor);
  return nextSource;
};

export const rewriteMarkdownImageAssetReferences = (
  markdown: string,
  references: readonly MarkdownImageAssetReference[],
  getUploadedMarkdown: (reference: MarkdownImageAssetReference) => string | undefined,
) => {
  let nextMarkdown = '';
  let cursor = 0;
  for (const reference of references) {
    nextMarkdown += markdown.slice(cursor, reference.start);
    const destination = extractMarkdownImageDestination(getUploadedMarkdown(reference)) ?? reference.rawDestination;
    nextMarkdown += `![${reference.alt}](${destination})`;
    cursor = reference.end;
  }
  nextMarkdown += markdown.slice(cursor);
  return nextMarkdown;
};

export const buildEditorImportContentFromMarkdownAssetFiles = async (
  inputFiles: Iterable<File> | ArrayLike<File>,
  options: MarkdownAssetFilesImportOptions,
) => {
  const files = Array.from(inputFiles as Iterable<File>);
  const selection = selectMarkdownFileFromFolder(files);
  const markdown = await selection.markdownFile.text();
  const references = collectMarkdownImageAssetReferences(markdown, selection.markdownRelativePath);
  if (references.length === 0) return null;

  const filesByPath = new Map(files.map(file => [normalizePath(getRelativePath(file)) ?? getRelativePath(file), file]));
  const filesByBasename = new Map<string, File[]>();
  for (const file of files) {
    const key = basename(normalizePath(getRelativePath(file)) ?? getRelativePath(file));
    filesByBasename.set(key, [...(filesByBasename.get(key) ?? []), file]);
  }

  const uploadsByPath = await uploadReferencedImageAssets({
    filesByBasename,
    filesByPath,
    getUploadedValue: asset => asset.markdown,
    missingAssetErrorCode: options.missingAssetErrorCode,
    references,
    resolveImageAsset: options.resolveImageAsset,
  });

  return rewriteMarkdownImageAssetReferences(markdown, references, reference => uploadsByPath.get(reference.resolvedPath)).trim();
};

export const buildEditorImportContentFromHtmlAssetFiles = async (
  inputFiles: Iterable<File> | ArrayLike<File>,
  options: HtmlAssetFilesImportOptions,
) => {
  const files = Array.from(inputFiles as Iterable<File>);
  const selection = selectHtmlFileFromFiles(files);
  if (!selection) return null;
  const html = await selection.file.text();
  const references = collectHtmlImageAssetReferences(html, selection.relativePath);
  if (references.length === 0) return html.trim();

  const filesByPath = new Map(files.map(file => [normalizePath(getRelativePath(file)) ?? getRelativePath(file), file]));
  const filesByBasename = new Map<string, File[]>();
  for (const file of files) {
    const key = basename(normalizePath(getRelativePath(file)) ?? getRelativePath(file));
    filesByBasename.set(key, [...(filesByBasename.get(key) ?? []), file]);
  }

  const uploadedDestinationsByPath = await uploadReferencedImageAssets({
    filesByBasename,
    filesByPath,
    getUploadedValue: (asset) => {
      const destination = extractMarkdownImageDestination(asset.markdown);
      if (!destination) {
        throw new Error('Uploaded image asset response is invalid.');
      }
      return destination;
    },
    missingAssetErrorCode: options.missingAssetErrorCode,
    references,
    resolveImageAsset: options.resolveImageAsset,
  });

  return rewriteInlineAssetDestinations(
    html,
    references,
    reference => uploadedDestinationsByPath.get(reference.resolvedPath),
  ).trim();
};
