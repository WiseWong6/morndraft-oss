import {
  createMornDraftHtmlSource,
  extractMornDraftHtmlSourceStyleTag,
  parseMornDraftHtmlSourceStructure,
} from '@morndraft/core/oss-public';

const SOURCE_STYLE_SENTINEL = '<style data-morndraft-source-style>__MORNDRAFT_SOURCE_STYLE__</style>';

const isCanonicalFlatMetadata = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const record = metadata as Record<string, unknown>;
  return record.schema === 'morndraft-html-structure.v1'
    && record.source === 'morndraft-flat'
    && record.renderer === 'swiss-catalog';
};

const normalizeCanonicalFlatSource = (html: string) => {
  const styleTag = extractMornDraftHtmlSourceStyleTag(html);
  if (!styleTag) return null;
  return html
    .replace(styleTag, SOURCE_STYLE_SENTINEL)
    .replace(/\r\n?/gu, '\n')
    .trim();
};

const matchesCanonicalFlatDom = (html: string, canonicalHtml: string) => {
  if (typeof DOMParser === 'undefined') return null;
  const parser = new DOMParser();
  const actual = parser.parseFromString(html, 'text/html');
  const canonical = parser.parseFromString(canonicalHtml, 'text/html');
  const actualStyles = actual.querySelectorAll('style[data-morndraft-source-style]');
  const canonicalStyles = canonical.querySelectorAll('style[data-morndraft-source-style]');
  if (actualStyles.length !== 1 || canonicalStyles.length !== 1) return false;

  // The source style is the one supported customization point and is preserved
  // by the canonical patcher. Replace it before comparing the actual DOM so
  // scripts, templates, comments, extra body nodes, and forged attributes still
  // make the document non-canonical.
  actualStyles[0].replaceWith(actual.importNode(canonicalStyles[0], true));
  return actual.isEqualNode(canonical);
};

export const parsePublicMornDraftFlatHtml = (html: string) => {
  if (typeof html !== 'string') return null;
  const structure = parseMornDraftHtmlSourceStructure(html);
  if (!structure.ok || !structure.component || !isCanonicalFlatMetadata(structure.metadata)) return null;

  const canonical = createMornDraftHtmlSource(structure.component);
  if (!canonical.ok || typeof canonical.html !== 'string') return null;

  // Markdown fence extraction intentionally removes the newline immediately
  // before the closing fence. Treat that boundary-only difference as the same
  // canonical document before asking DOMParser to compare parsed trees (where
  // it otherwise becomes a different whitespace text node inside <body>).
  const actualSource = normalizeCanonicalFlatSource(html);
  const canonicalSource = normalizeCanonicalFlatSource(canonical.html);
  if (actualSource && canonicalSource && actualSource === canonicalSource) return structure;

  const domMatch = matchesCanonicalFlatDom(html, canonical.html);
  if (domMatch === false) return null;
  if (domMatch === null) {
    if (!actualSource || !canonicalSource || actualSource !== canonicalSource) return null;
  }
  return structure;
};

export const isPublicMornDraftFlatHtml = (html: string) => (
  parsePublicMornDraftFlatHtml(html) !== null
);
