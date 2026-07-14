import JSON5 from 'json5';
import {
  MERMAID_KEYWORDS,
  normalizePublicFenceInfoLanguage,
  parsePublicStandaloneFence,
} from '@morndraft/core/oss-public';
import type { PublicContentType } from './types';
import { isPublicMornDraftFlatHtml } from './publicMornDraftFlat';

export type PublicDocumentKind = Exclude<PublicContentType, 'mixed'>;

export type PublicDocument = {
  kind: PublicDocumentKind;
  content: string;
  fence?: {
    opening: string;
    closing: string;
    marker: string;
    openingLineBreak: '\n' | '\r\n';
    closingLineBreak: '\n' | '\r\n';
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

export const normalizePublicFenceLanguage = normalizePublicFenceInfoLanguage;

const parseStandaloneFence = (source: string): PublicDocument | null => {
  const parsed = parsePublicStandaloneFence(source);
  if (!parsed) return null;
  const kind = PUBLIC_FENCE_KINDS[parsed.language];
  if (!kind) return null;
  return recordPublicDocumentContentStart({
    kind,
    content: parsed.content,
    fence: {
      opening: parsed.opening,
      closing: parsed.closing,
      marker: parsed.marker,
      openingLineBreak: parsed.openingLineBreak as '\n' | '\r\n',
      closingLineBreak: parsed.closingLineBreak as '\n' | '\r\n',
    },
  }, parsed.contentStart);
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
  if (fenced?.kind === 'html' && isPublicMornDraftFlatHtml(fenced.content)) {
    return recordPublicDocumentContentStart({ kind: 'markdown', content: source }, 0);
  }
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

const getCollisionSafePublicFenceMarker = (marker: string, content: string) => {
  let longestClosingRun = marker.length - 1;
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length < marker.length || line[0] !== marker[0]) continue;
    if ([...line].every(character => character === marker[0])) {
      longestClosingRun = Math.max(longestClosingRun, line.length);
    }
  }
  return marker[0].repeat(longestClosingRun + 1);
};

const replaceFirstExactMarker = (value: string, marker: string, replacement: string) => {
  const index = value.indexOf(marker);
  return index < 0 ? null : `${value.slice(0, index)}${replacement}${value.slice(index + marker.length)}`;
};

export const serializePublicDocumentEdit = (document: PublicDocument, content: string) => {
  if (!document.fence) return content;
  const marker = getCollisionSafePublicFenceMarker(document.fence.marker, content);
  const opening = replaceFirstExactMarker(document.fence.opening, document.fence.marker, marker);
  const closing = replaceFirstExactMarker(document.fence.closing, document.fence.marker, marker);
  if (opening === null || closing === null) return content;
  return `${opening}${document.fence.openingLineBreak}${content}${document.fence.closingLineBreak}${closing}`;
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
    contentStart: number;
    language: string;
    marker: string;
    start: number;
  } | null = null;
  const flushMarkdown = (beforeFence = false) => {
    if (markdown.length === 0) return;
    const joined = markdown.join('\n');
    const content = beforeFence && joined.endsWith('\r') ? joined.slice(0, -1) : joined;
    segments.push({ kind: 'markdown', content, start: markdownStart, end: markdownStart + content.length });
    markdown = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (activeFence) {
      const closing = line.match(/^[ \t]*(`+|~+)[ \t]*$/u)?.[1];
      if (closing && closing[0] === activeFence.marker[0] && closing.length >= activeFence.marker.length) {
        const closingStart = lineOffsets[index];
        let contentEnd = closingStart;
        if (contentEnd > activeFence.contentStart && source[contentEnd - 1] === '\n') {
          contentEnd -= 1;
          if (contentEnd > activeFence.contentStart && source[contentEnd - 1] === '\r') contentEnd -= 1;
        }
        segments.push({
          kind: 'fence',
          content: source.slice(activeFence.contentStart, contentEnd),
          language: activeFence.language,
          marker: activeFence.marker,
          start: activeFence.start,
          end: lineOffsets[index] + rawLine.length,
        });
        activeFence = null;
      }
      continue;
    }

    const opening = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*(.*)$/u);
    if (!opening) {
      if (markdown.length === 0) markdownStart = lineOffsets[index];
      markdown.push(rawLine);
      continue;
    }
    flushMarkdown(true);
    const info = opening[2] ?? '';
    activeFence = {
      contentStart: Math.min(source.length, lineOffsets[index] + rawLine.length + 1),
      language: info.trim().split(/\s+/u, 1)[0] ?? '',
      marker: opening[1],
      start: lineOffsets[index],
    };
  }

  if (activeFence) {
    markdownStart = activeFence.start;
    markdown = [source.slice(activeFence.start)];
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
  const closingLineBreakStart = source[closingStart - 1] === '\r' ? closingStart - 1 : closingStart;
  const marker = getCollisionSafePublicFenceMarker(segment.marker, nextContent);
  const openingLine = source.slice(segment.start, openingEnd);
  const closingLineEnd = source.indexOf('\n', closingStart + 1);
  const safeClosingLineEnd = closingLineEnd < 0 ? source.length : closingLineEnd;
  const closingLine = source.slice(closingStart + 1, safeClosingLineEnd);
  const nextOpeningLine = replaceFirstExactMarker(openingLine, segment.marker, marker);
  const nextClosingLine = replaceFirstExactMarker(closingLine, segment.marker, marker);
  if (nextOpeningLine === null || nextClosingLine === null) return null;
  return `${source.slice(0, segment.start)}${nextOpeningLine}${source.slice(openingEnd, openingEnd + 1)}${nextContent}${source.slice(closingLineBreakStart, closingStart + 1)}${nextClosingLine}${source.slice(safeClosingLineEnd)}`;
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
