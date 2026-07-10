import JSON5 from 'json5';

const URL_CANDIDATE_RE = /https?:\/\/[^\s<>"']+/gi;
const MARKDOWN_LINK_RE =
  /(!?)\[([^\]\n]*)]\(\s*(https?:\/\/[^\s)]+)(?:\s+(?:"((?:\\.|[^"\\\n])*)"|'((?:\\.|[^'\\\n])*)'))?\s*\)/gi;
const IMAGE_RESOURCE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'svg',
  'avif',
  'bmp',
  'ico',
  'tiff',
  'tif',
]);
const TRAILING_URL_PUNCTUATION_RE = /[),.;:!?]+$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const LOCALHOST_RE = /^localhost(?::|\/|$|\?|#)/i;
const IPV4_HOST_RE = /^(?:\d{1,3}\.){3}\d{1,3}(?::|\/|$|\?|#)/;
const BRACKETED_IPV6_HOST_RE = /^\[[0-9a-f:]+](?::|\/|$|\?|#)/i;
const DOMAIN_HOST_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[:/?#]|$)/i;

export const MERMAID_KEYWORDS = new Set([
  'architecture',
  'architecture-beta',
  'block',
  'block-beta',
  'c4component',
  'c4container',
  'c4context',
  'c4deployment',
  'c4dynamic',
  'classdiagram',
  'erdiagram',
  'flowchart',
  'gantt',
  'gitgraph',
  'graph',
  'ishikawa-beta',
  'journey',
  'kanban',
  'mindmap',
  'packet-beta',
  'pie',
  'quadrantchart',
  'requirementdiagram',
  'sankey-beta',
  'sequencediagram',
  'statediagram',
  'statediagram-v2',
  'timeline',
  'treemap',
  'venn-beta',
  'xychart-beta',
]);

export const splitUrlTrailingPunctuation = (rawUrl) => {
  const match = rawUrl.match(TRAILING_URL_PUNCTUATION_RE);
  if (!match) return { url: rawUrl, trailing: '' };
  return {
    url: rawUrl.slice(0, -match[0].length),
    trailing: match[0],
  };
};

export const normalizeEmbeddableResourceUrl = (rawUrl) => {
  const trimmed = String(rawUrl ?? '').trim();
  if (!trimmed || /\s/.test(trimmed)) return '';

  let candidate = trimmed;
  const runtimeLocation = globalThis.location?.href;
  if (/^\/\//.test(candidate)) {
    candidate = `https:${candidate}`;
  } else if (/^(?:\.{1,2}\/|\/)/.test(candidate) && runtimeLocation) {
    candidate = new globalThis.URL(candidate, runtimeLocation).href;
  } else if (/^https?:[^/]/i.test(candidate)) {
    candidate = candidate.replace(/^(https?):\/*/i, '$1://');
  } else if (!/^https?:\/\//i.test(candidate)) {
    const isLocalishHost =
      LOCALHOST_RE.test(candidate) ||
      IPV4_HOST_RE.test(candidate) ||
      BRACKETED_IPV6_HOST_RE.test(candidate);
    const looksSchemaless = isLocalishHost || DOMAIN_HOST_RE.test(candidate);

    if (!looksSchemaless || (SCHEME_RE.test(candidate) && !isLocalishHost && !DOMAIN_HOST_RE.test(candidate))) {
      return '';
    }

    candidate = `${isLocalishHost ? 'http' : 'https'}://${candidate}`;
  }

  try {
    const url = new globalThis.URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href;
  } catch {
    return '';
  }
};

const parseHttpUrl = (rawUrl) => {
  const normalizedUrl = normalizeEmbeddableResourceUrl(rawUrl);
  if (!normalizedUrl) return null;

  try {
    return new globalThis.URL(normalizedUrl);
  } catch {
    return null;
  }
};

const getUrlPathExtension = (url) => {
  const lastSegment = url.pathname.split('/').pop() ?? '';
  const match = lastSegment.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
};

const hasHtmlAttributePrefix = (line, offset) =>
  /\b(?:src|href)=["']?$/i.test(line.slice(0, offset));

export const isImageResourceUrl = (rawUrl) => {
  const parsed = parseHttpUrl(rawUrl);
  if (!parsed) return false;
  return IMAGE_RESOURCE_EXTENSIONS.has(getUrlPathExtension(parsed));
};

export const isEmbeddableResourceUrl = (rawUrl) => Boolean(parseHttpUrl(rawUrl));

export const isStandaloneResourceUrlLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  const { url, trailing } = splitUrlTrailingPunctuation(trimmed);
  return !trailing && isEmbeddableResourceUrl(url);
};

export const isStandaloneHtmlPageUrlLine = isStandaloneResourceUrlLine;

export const isHtmlPageUrl = isEmbeddableResourceUrl;

export const getStrictStandaloneResourceUrl = (rawCode) => {
  const lines = String(rawCode ?? '')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length !== 1) return '';
  const { url, trailing } = splitUrlTrailingPunctuation(lines[0]);
  if (!url || trailing) return '';
  return normalizeEmbeddableResourceUrl(url);
};

const STRICT_MARKDOWN_IMAGE_RE =
  /^!\[[^\]\n]*]\(\s*([^)\s]+)(?:\s+(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))?\s*\)$/i;
const STRICT_HTML_IMAGE_RE = /^<img\b[^>]*\bsrc=(["'])([^"']+)\1[^>]*>\s*$/i;

export const getStrictStandaloneImageUrl = (rawCode) => {
  const code = String(rawCode ?? '').trim();
  if (!code) return '';

  const standaloneUrl = getStrictStandaloneResourceUrl(code);
  if (standaloneUrl && isImageResourceUrl(standaloneUrl)) return standaloneUrl;

  const markdownImageMatch = code.match(STRICT_MARKDOWN_IMAGE_RE);
  if (markdownImageMatch) {
    const normalizedUrl = normalizeEmbeddableResourceUrl(markdownImageMatch[1]);
    return normalizedUrl && isImageResourceUrl(normalizedUrl) ? normalizedUrl : '';
  }

  const htmlImageMatch = code.match(STRICT_HTML_IMAGE_RE);
  if (htmlImageMatch) {
    const normalizedUrl = normalizeEmbeddableResourceUrl(htmlImageMatch[2]);
    return normalizedUrl && isImageResourceUrl(normalizedUrl) ? normalizedUrl : '';
  }

  return '';
};

export const isPureImageArtifactSource = (rawCode) =>
  Boolean(getStrictStandaloneImageUrl(rawCode));

const toImageMarkdown = (url, alt = '', title = undefined, titleQuote = '"') => {
  const titleText = title === undefined ? '' : ` ${titleQuote}${title}${titleQuote}`;
  return `![${alt}](${url}${titleText})`;
};

const transformBareUrlsInLine = (line) =>
  line.replace(URL_CANDIDATE_RE, (rawCandidate, offset) => {
    const { url, trailing } = splitUrlTrailingPunctuation(rawCandidate);
    if (!url || !isEmbeddableResourceUrl(url)) return rawCandidate;
    if (hasHtmlAttributePrefix(line, offset)) return rawCandidate;
    return `${isImageResourceUrl(url) ? toImageMarkdown(url) : url}${trailing}`;
  });

const transformMarkdownLinksInLine = (line) => {
  const replacements = [];
  const tokenized = line.replace(MARKDOWN_LINK_RE, (match, imageMarker, label, rawUrl, doubleTitle, singleTitle) => {
    const title = doubleTitle ?? singleTitle;
    const titleQuote = singleTitle !== undefined ? "'" : '"';
    const replacement =
      isImageResourceUrl(rawUrl) && !imageMarker
        ? toImageMarkdown(rawUrl, label, title, titleQuote)
        : match;
    const token = `\u0000MORNDRAFT_LINK_${replacements.length}\u0000`;
    replacements.push(replacement);
    return token;
  });

  const transformed = transformBareUrlsInLine(tokenized);
  return replacements.reduce(
    (result, replacement, index) => result.replace(`\u0000MORNDRAFT_LINK_${index}\u0000`, replacement),
    transformed,
  );
};

export const preprocessResourceLinks = (rawCode) => {
  const lines = rawCode.split(/\r?\n/);
  let openFence = null;

  return lines
    .map((line) => {
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1];
        const markerChar = marker[0];
        const markerLength = marker.length;

        if (!openFence) {
          openFence = { markerChar, markerLength };
        } else if (
          markerChar === openFence.markerChar &&
          markerLength >= openFence.markerLength
        ) {
          openFence = null;
        }

        return line;
      }

      if (openFence) return line;

      return transformMarkdownLinksInLine(line);
    })
    .join('\n');
};

export const hasMultipleFencedCodeBlocks = (rawCode) => {
  const lines = rawCode.split(/\r?\n/);
  let openFence = null;
  let blockCount = 0;

  for (const rawLine of lines) {
    const match = rawLine.match(/^\s*(`{3,}|~{3,})/);
    if (!match) continue;

    const marker = match[1];
    const markerChar = marker[0];
    const markerLength = marker.length;

    if (!openFence) {
      openFence = { markerChar, markerLength };
      continue;
    }

    if (markerChar === openFence.markerChar && markerLength >= openFence.markerLength) {
      blockCount += 1;
      if (blockCount >= 2) return true;
      openFence = null;
    }
  }

  return false;
};

export const hasFencedCodeBlock = (rawCode) => /^\s*(`{3,}|~{3,})/m.test(rawCode);

const HTML_PREVIEW_FENCE_LANGUAGES = new Set(['html', 'htmlpreview']);

const normalizeStandaloneHtmlFenceLanguage = (language) =>
  String(language ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');

const looksLikeFullHtmlDocument = (rawCode) => {
  const trimmed = String(rawCode ?? '').trim();
  return /^<!doctype\s+html[\s>]/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
};

export const extractStandaloneHtmlPreviewFence = (rawCode) => {
  const source = String(rawCode ?? '').trim();
  if (!source) return null;

  const lines = source.split(/\r?\n/);
  if (lines.length < 3) return null;

  const openingMatch = lines[0].match(/^(`{3,}|~{3,})[ \t]*([^\s`~]*)[^\r\n]*$/);
  if (!openingMatch) return null;

  const language = normalizeStandaloneHtmlFenceLanguage(openingMatch[2]);
  if (!HTML_PREVIEW_FENCE_LANGUAGES.has(language)) return null;

  const marker = openingMatch[1];
  const markerChar = marker[0];
  const closingFencePattern = new RegExp(`^${markerChar === '`' ? '`' : '~'}{${marker.length},}\\s*$`);
  let closingIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (!closingFencePattern.test(lines[index].trim())) continue;
    closingIndex = index;
    break;
  }

  if (closingIndex !== lines.length - 1) return null;

  const html = lines.slice(1, closingIndex).join('\n').trim();
  if (!looksLikeFullHtmlDocument(html)) return null;

  return {
    html,
    language: language === 'htmlpreview' ? 'html-preview' : 'html',
  };
};

export const looksLikeJson = (rawCode) => {
  const trimmed = rawCode.trim();
  if (!looksLikeJsonCandidate(trimmed)) return false;

  try {
    JSON5.parse(trimmed);
    return true;
  } catch {
    return false;
  }
};

export const looksLikeJsonCandidate = (rawCode) => {
  const trimmed = rawCode.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
};

export const looksLikeHtml = (rawCode) => {
  const trimmed = rawCode.trim();
  if (!trimmed) return false;

  if (/^<!doctype\s+html[\s>]/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return true;
  }

  if (/^<[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return false;
  }

  // Accept standard and custom elements, while avoiding Markdown autolinks like
  // <https://example.com> or comparison text that does not start with a tag.
  const startsWithHtmlTag = /^<[a-z][\w:-]*(?:\s|>|\/)/i.test(trimmed);
  const hasPairedHtmlTag = /<([a-z][\w:-]*)(?:\s|>)[\s\S]*<\/\1>/i.test(trimmed);
  return startsWithHtmlTag || hasPairedHtmlTag;
};

const MARKDOWN_RICH_INLINE_HTML_TAGS = new Set([
  'b',
  'br',
  'code',
  'del',
  'em',
  'i',
  'mark',
  's',
  'span',
  'strong',
  'sub',
  'sup',
  'u',
]);

const looksLikeMarkdownRichInlineHtml = (rawCode) => {
  const trimmed = String(rawCode ?? '').trim();
  if (!trimmed) return false;

  const tagPattern = /<\/?([a-z][\w:-]*)(?:\s[^>]*)?>/gi;
  let sawTag = false;
  let match;
  while ((match = tagPattern.exec(trimmed))) {
    sawTag = true;
    if (!MARKDOWN_RICH_INLINE_HTML_TAGS.has(match[1].toLowerCase())) return false;
  }
  return sawTag;
};

const skipFrontmatter = (lines) => {
  if (lines[0]?.trim() !== '---') return lines;

  const closingIndex = lines.slice(1).findIndex((line) => line.trim() === '---');
  if (closingIndex < 0) return lines;
  return lines.slice(closingIndex + 2);
};

export const getMermaidDiagramKeyword = (rawCode) => {
  const lines = skipFrontmatter(rawCode.trim().split('\n'));

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('%%')) continue;

    const firstWord = line.split(/\s+/)[0] ?? '';
    return firstWord.toLowerCase();
  }

  return '';
};

export const looksLikeMermaid = (rawCode) =>
  MERMAID_KEYWORDS.has(getMermaidDiagramKeyword(rawCode));

export const detectArtifactContent = (rawCode) => {
  const trimmed = rawCode.trim();
  if (!trimmed) return { primaryType: 'markdown', hasMultipleFences: false };

  if (looksLikeJsonCandidate(trimmed)) {
    return { primaryType: 'json', hasMultipleFences: false };
  }

  if (looksLikeMermaid(trimmed)) {
    return { primaryType: 'mermaid', hasMultipleFences: false };
  }

  if (extractStandaloneHtmlPreviewFence(trimmed)) {
    return { primaryType: 'html', hasMultipleFences: false };
  }

  const multipleFences = hasMultipleFencedCodeBlocks(trimmed);
  if (multipleFences) {
    return { primaryType: 'mixed', hasMultipleFences: true };
  }

  if (hasFencedCodeBlock(trimmed)) {
    return { primaryType: 'markdown', hasMultipleFences: false };
  }

  if (looksLikeMarkdownRichInlineHtml(trimmed)) {
    return { primaryType: 'markdown', hasMultipleFences: false };
  }

  if (looksLikeHtml(trimmed)) {
    return { primaryType: 'html', hasMultipleFences: false };
  }

  return { primaryType: 'markdown', hasMultipleFences: false };
};
