import {
  CODE_FENCE_LANGUAGE_KINDS,
  getCodeFenceLanguageKind,
  MERMAID_KEYWORDS,
  normalizeCodeFenceLanguage,
} from '@morndraft/core/oss-public';

export type OssDocumentKind = 'markdown' | 'json' | 'mermaid' | 'html';

export type OssDocument = {
  kind: OssDocumentKind;
  content: string;
};

const mapFenceLanguageToKind = (language: string): OssDocumentKind | null => {
  switch (getCodeFenceLanguageKind(language)) {
    case CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW:
      return 'html';
    case CODE_FENCE_LANGUAGE_KINDS.JSON:
    case CODE_FENCE_LANGUAGE_KINDS.JSON5:
      return 'json';
    case CODE_FENCE_LANGUAGE_KINDS.MERMAID:
      return 'mermaid';
    case CODE_FENCE_LANGUAGE_KINDS.MARKDOWN:
      return 'markdown';
    default:
      return null;
  }
};

const unwrapStandaloneFence = (source: string): OssDocument | null => {
  const match = source.match(/^\s*(`{3,}|~{3,})\s*([^\n]*)\n([\s\S]*?)\n\1\s*$/);
  if (!match) return null;
  const kind = mapFenceLanguageToKind(match[2]);
  return kind ? { kind, content: match[3] } : null;
};

const looksLikeJson = (source: string) => {
  if (!/^(?:\{|\[)/.test(source)) return false;
  try {
    JSON.parse(source);
    return true;
  } catch {
    return false;
  }
};

const looksLikeMermaid = (source: string) => {
  const firstToken = normalizeCodeFenceLanguage(source.split(/\s|\n/, 1)[0]);
  return MERMAID_KEYWORDS.has(firstToken);
};

export const detectOssDocument = (rawSource: string): OssDocument => {
  const source = String(rawSource ?? '').trim();
  const fenced = unwrapStandaloneFence(source);
  if (fenced) return fenced;
  if (/^(?:<!doctype\s+html\b|<html\b)/i.test(source)) return { kind: 'html', content: source };
  if (looksLikeJson(source)) return { kind: 'json', content: source };
  if (looksLikeMermaid(source)) return { kind: 'mermaid', content: source };
  return { kind: 'markdown', content: rawSource };
};

export const getEmbeddedFenceKind = (className?: string): OssDocumentKind | null => {
  const language = className?.match(/(?:^|\s)language-([^\s]+)/)?.[1] ?? '';
  return mapFenceLanguageToKind(language);
};
