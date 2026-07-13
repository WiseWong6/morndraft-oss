import JSON5 from 'json5';
import { MERMAID_KEYWORDS } from '@morndraft/core/oss-public';
import type { PublicContentType } from './types';

export type PublicDocumentKind = Exclude<PublicContentType, 'mixed'>;

export type PublicDocument = {
  kind: PublicDocumentKind;
  content: string;
  fence?: {
    opening: string;
    closing: string;
  };
};

export type PublicDocumentSegment =
  | { kind: 'markdown'; content: string; start: number; end: number }
  | { kind: 'fence'; content: string; language: string; marker: string; start: number; end: number };

const PUBLIC_DOCUMENT_CONTENT_START = Symbol('public-document-content-start');
type PublicDocumentWithContentStart = PublicDocument & {
  [PUBLIC_DOCUMENT_CONTENT_START]?: number;
};

const recordPublicDocumentContentStart = <T extends PublicDocument>(document: T, contentStart: number): T => {
  Object.defineProperty(document, PUBLIC_DOCUMENT_CONTENT_START, { value: contentStart });
  return document;
};

const PUBLIC_FENCE_KINDS: Record<string, PublicDocumentKind> = {
  html: 'html',
  'html-preview': 'html',
  json: 'json',
  json5: 'json',
  markdown: 'markdown',
  md: 'markdown',
  mermaid: 'mermaid',
};

export const normalizePublicFenceLanguage = (value: string) => (
  value.trim().split(/\s+/u, 1)[0]?.toLowerCase() ?? ''
);

const parseStandaloneFence = (source: string): PublicDocument | null => {
  const match = source.match(/^(((?:[ \t]*\n)*[ \t]*)(`{3,}|~{3,})[ \t]*([^\n]*))\n([\s\S]*?)\n(\3[ \t]*)([ \t\r\n]*)$/u);
  if (!match) return null;
  const language = normalizePublicFenceLanguage(match[4]);
  const kind = PUBLIC_FENCE_KINDS[language];
  if (!kind) return null;
  return recordPublicDocumentContentStart({
    kind,
    content: match[5],
    fence: {
      opening: match[1],
      closing: `${match[6]}${match[7]}`,
    },
  }, match[1].length + 1);
};

const parsesAsJson5Container = (source: string) => {
  const firstToken = source.replace(/^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/u, '');
  if (!/^(?:\{|\[)/u.test(firstToken)) return false;
  try {
    const value = JSON5.parse(source);
    return value !== null && typeof value === 'object';
  } catch {
    return false;
  }
};

const looksLikeMermaid = (source: string) => {
  const opener = source.trimStart().split(/\s|\n/u, 1)[0]?.toLowerCase() ?? '';
  return MERMAID_KEYWORDS.has(opener);
};

export const detectPublicDocument = (rawSource: string): PublicDocument => {
  const source = String(rawSource ?? '');
  const trimmed = source.trim();
  const fenced = parseStandaloneFence(source);
  if (fenced) return fenced;
  if (/^(?:<!doctype\s+html\b|<html\b)/iu.test(trimmed)) {
    return recordPublicDocumentContentStart({ kind: 'html', content: source }, 0);
  }
  if (parsesAsJson5Container(trimmed)) return recordPublicDocumentContentStart({ kind: 'json', content: source }, 0);
  if (looksLikeMermaid(trimmed)) return recordPublicDocumentContentStart({ kind: 'mermaid', content: source }, 0);
  return recordPublicDocumentContentStart({ kind: 'markdown', content: source }, 0);
};

export const getPublicContentType = (source: string): PublicContentType => {
  const document = detectPublicDocument(source);
  if (document.kind !== 'markdown') return document.kind;
  const segments = splitPublicDocumentSegments(source);
  const embeddedKinds = new Set(
    segments.filter((segment) => segment.kind === 'fence')
      .map((segment) => PUBLIC_FENCE_KINDS[normalizePublicFenceLanguage(segment.language)])
      .filter(Boolean),
  );
  return embeddedKinds.size > 0 ? 'mixed' : 'markdown';
};

export const serializePublicDocumentEdit = (document: PublicDocument, content: string) => {
  if (!document.fence) return content;
  return `${document.fence.opening}\n${content}\n${document.fence.closing}`;
};

export const getPublicDocumentContentOffset = (_source: string, document: PublicDocument) => (
  (document as PublicDocumentWithContentStart)[PUBLIC_DOCUMENT_CONTENT_START] ?? 0
);

export const formatPublicJson5 = (source: string) => JSON.stringify(JSON5.parse(source), null, 2);

export const splitPublicDocumentSegments = (source: string): PublicDocumentSegment[] => {
  const lines = source.split('\n');
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }
  const segments: PublicDocumentSegment[] = [];
  let markdown: string[] = [];
  let markdownStart = 0;
  let activeFence: {
    content: string[];
    language: string;
    marker: string;
    openingLine: string;
    start: number;
  } | null = null;
  const flushMarkdown = () => {
    if (markdown.length === 0) return;
    const content = markdown.join('\n');
    segments.push({ kind: 'markdown', content, start: markdownStart, end: markdownStart + content.length });
    markdown = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    if (activeFence) {
      const closing = lines[index].match(/^\s*(`+|~+)\s*$/u)?.[1];
      if (closing && closing[0] === activeFence.marker[0] && closing.length >= activeFence.marker.length) {
        segments.push({
          kind: 'fence',
          content: activeFence.content.join('\n'),
          language: activeFence.language,
          marker: activeFence.marker,
          start: activeFence.start,
          end: lineOffsets[index] + lines[index].length,
        });
        activeFence = null;
      } else {
        activeFence.content.push(lines[index]);
      }
      continue;
    }

    const opening = lines[index].match(/^\s*(`{3,}|~{3,})\s*([^\s]*)?.*$/u);
    if (!opening) {
      if (markdown.length === 0) markdownStart = lineOffsets[index];
      markdown.push(lines[index]);
      continue;
    }
    flushMarkdown();
    activeFence = {
      content: [],
      language: opening[2] ?? '',
      marker: opening[1],
      openingLine: lines[index],
      start: lineOffsets[index],
    };
  }

  if (activeFence) {
    markdownStart = activeFence.start;
    markdown = [activeFence.openingLine, ...activeFence.content];
  }
  flushMarkdown();
  return segments;
};

export const replacePublicFenceSegmentContent = (
  source: string,
  segment: PublicDocumentSegment,
  nextContent: string,
) => {
  if (segment.kind !== 'fence') return null;
  const openingEnd = source.indexOf('\n', segment.start);
  const closingStart = source.lastIndexOf('\n', segment.end - 1);
  if (openingEnd < segment.start || closingStart < openingEnd || closingStart > segment.end) return null;
  return `${source.slice(0, openingEnd + 1)}${nextContent}${source.slice(closingStart)}`;
};

export const findPublicSlashTrigger = (source: string, cursor: number) => {
  const safeCursor = Math.max(0, Math.min(cursor, source.length));
  const lineStart = source.lastIndexOf('\n', safeCursor - 1) + 1;
  const beforeCursor = source.slice(lineStart, safeCursor);
  const match = beforeCursor.match(/^\s*\/([^\n]*)$/u);
  if (!match) return null;
  return { start: lineStart, end: safeCursor, query: match[1].trim().toLowerCase() };
};

export const applyPublicInsert = (
  source: string,
  range: { start: number; end: number },
  insertion: string,
) => {
  const before = source.slice(0, range.start);
  const after = source.slice(range.end);
  const leading = before && !before.endsWith('\n') ? '\n' : '';
  const trailing = after && !after.startsWith('\n') ? '\n' : '';
  const next = `${before}${leading}${insertion.trim()}${trailing}${after}`;
  return { source: next, cursor: before.length + leading.length + insertion.trim().length };
};
