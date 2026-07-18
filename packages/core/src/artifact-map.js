import { detectArtifactContent } from './content-detection.js';
import {
  CODE_FENCE_LANGUAGE_KINDS,
  getCodeFenceLanguageKind,
  normalizeCodeFenceLanguage,
} from './code-fence-language.js';

const KIND_LABELS = {
  code: 'Code',
  documentSpec: 'DocumentSpec',
  heading: 'Heading',
  html: 'HTML',
  image: 'Image',
  json: 'JSON',
  markdown: 'Markdown',
  mermaid: 'Mermaid',
};

const getFenceKind = (language) => {
  switch (getCodeFenceLanguageKind(language)) {
    case CODE_FENCE_LANGUAGE_KINDS.JSON:
    case CODE_FENCE_LANGUAGE_KINDS.JSON5:
      return 'json';
    case CODE_FENCE_LANGUAGE_KINDS.DOCUMENT_SPEC:
      return 'documentSpec';
    case CODE_FENCE_LANGUAGE_KINDS.MERMAID:
      return 'mermaid';
    case CODE_FENCE_LANGUAGE_KINDS.MARKDOWN:
      return 'markdown';
    case CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW:
      return 'html';
    default:
      return 'code';
  }
};

const slugify = (value) => {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~[\](){}:;,.!?'"\\/|]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'item';
};

const stripInlineMarkdown = (value) =>
  String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const createEntry = ({ kind, line, level = 1, title, index }) => ({
  id: `artifact-${index + 1}-${line}-${kind}-${slugify(title)}`,
  kind,
  kindLabel: KIND_LABELS[kind] ?? KIND_LABELS.code,
  line,
  level,
  title: title || KIND_LABELS[kind] || KIND_LABELS.code,
});

const isHeadingChildEntry = (entry) => entry.kind !== 'heading';

const addArtifactMapHierarchy = (entries, lineCount) => {
  const headingStack = [];
  let previousEntry = null;

  const closePreviousLeafEntry = (nextLine) => {
    if (previousEntry && previousEntry.kind !== 'heading') {
      previousEntry.sectionEndLine = Math.max(previousEntry.line, nextLine - 1);
    }
  };

  entries.forEach((entry) => {
    closePreviousLeafEntry(entry.line);

    if (entry.kind === 'heading') {
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= entry.level) {
        const closedHeading = headingStack.pop();
        closedHeading.sectionEndLine = Math.max(closedHeading.line, entry.line - 1);
      }
    }

    const parent = headingStack[headingStack.length - 1] ?? null;
    entry.parentId = parent?.id;
    entry.hasChildren = false;
    entry.sectionEndLine = lineCount;
    if (parent) parent.hasChildren = true;

    if (isHeadingChildEntry(entry)) {
      entry.level = parent ? parent.level + 1 : 1;
    }

    if (entry.kind === 'heading') {
      headingStack.push(entry);
    }

    previousEntry = entry;
  });

  closePreviousLeafEntry(lineCount + 1);
  return entries;
};

const getStandaloneKind = (source) => {
  const detected = detectArtifactContent(source);
  switch (detected.primaryType) {
    case 'json':
    case 'html':
    case 'mermaid':
      return detected.primaryType;
    default:
      return 'markdown';
  }
};

export const buildArtifactMap = (rawCode) => {
  const source = String(rawCode ?? '');
  const lines = source.split(/\r?\n/);
  const entries = [];
  let fence = null;

  const pushEntry = (entry) => {
    const created = createEntry({ ...entry, index: entries.length });
    entries.push(created);
    return created;
  };

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (fence) {
      if (new RegExp(`^\\s*${fence.marker}{${fence.length},}\\s*$`).test(line)) {
        fence = null;
      }
      return;
    }

    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})\s*([^\s`~]*)?/);
    if (fenceMatch) {
      const marker = fenceMatch[2][0];
      const language = normalizeCodeFenceLanguage(fenceMatch[3]);
      const kind = getFenceKind(language);
      const entry = {
        kind,
        line: lineNumber,
        level: 2,
        title: kind === 'code' && language ? `${language} code` : KIND_LABELS[kind],
      };
      pushEntry(entry);
      fence = { marker, length: fenceMatch[2].length };
      return;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      pushEntry({
        kind: 'heading',
        line: lineNumber,
        level,
        title: stripInlineMarkdown(headingMatch[2]) || KIND_LABELS.heading,
      });
      return;
    }

    const imageMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch) {
      const title = stripInlineMarkdown(imageMatch[1]) || imageMatch[2].trim();
      pushEntry({
        kind: 'image',
        line: lineNumber,
        level: 2,
        title,
      });
    }
  });

  if (entries.length === 0 && source.trim()) {
    const kind = getStandaloneKind(source);
    pushEntry({
      kind,
      line: 1,
      level: 1,
      title: KIND_LABELS[kind],
    });
  }

  return addArtifactMapHierarchy(entries, lines.length);
};

export const findArtifactMapEntryForLine = (entries, line) => {
  const targetLine = Number(line);
  if (!Array.isArray(entries) || !Number.isFinite(targetLine) || targetLine < 1) return null;

  let matchedEntry = null;
  for (const entry of entries) {
    if (!entry || typeof entry.line !== 'number') continue;
    if (entry.line > targetLine) break;
    matchedEntry = entry;
  }

  return matchedEntry;
};
