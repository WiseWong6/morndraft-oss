const LANGUAGE_ALIASES = Object.freeze({
  bash: 'bash',
  html: 'html',
  htmlpreview: 'html',
  javascript: 'javascript',
  js: 'javascript',
  json: 'json',
  json5: 'json5',
  morndraftexpression: 'documentspec',
  markdown: 'markdown',
  md: 'markdown',
  mermaid: 'mermaid',
  mjs: 'javascript',
  py: 'python',
  python: 'python',
  sh: 'bash',
  shell: 'bash',
  swiss: 'documentspec',
  ts: 'typescript',
  tsx: 'tsx',
  typescript: 'typescript',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
});

export const CODE_FENCE_LANGUAGE_KINDS = Object.freeze({
  CODE: 'code',
  DOCUMENT_SPEC: 'documentSpec',
  HTML_PREVIEW: 'htmlPreview',
  JSON: 'json',
  JSON5: 'json5',
  MARKDOWN: 'markdown',
  MERMAID: 'mermaid',
  MORNDRAFT_FLAT: 'morndraftFlat',
});

export const normalizeCodeFenceLanguage = (language) => {
  const normalized = String(language ?? '').trim().toLowerCase();
  if (!normalized) return '';
  const compact = normalized.replace(/[\s_-]+/g, '');
  return LANGUAGE_ALIASES[normalized] ?? LANGUAGE_ALIASES[compact] ?? normalized;
};

export const getCodeFenceLanguageKind = (language) => {
  switch (normalizeCodeFenceLanguage(language)) {
    case 'documentspec':
      return CODE_FENCE_LANGUAGE_KINDS.DOCUMENT_SPEC;
    case 'html':
      return CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW;
    case 'json':
      return CODE_FENCE_LANGUAGE_KINDS.JSON;
    case 'json5':
      return CODE_FENCE_LANGUAGE_KINDS.JSON5;
    case 'markdown':
      return CODE_FENCE_LANGUAGE_KINDS.MARKDOWN;
    case 'mermaid':
      return CODE_FENCE_LANGUAGE_KINDS.MERMAID;
    default:
      return CODE_FENCE_LANGUAGE_KINDS.CODE;
  }
};

export const isHtmlPreviewFenceLanguage = (language) =>
  getCodeFenceLanguageKind(language) === CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW;

export const isHtmlIframeFenceLanguage = () => false;

export const isMarkdownPreviewFenceLanguage = (language) =>
  getCodeFenceLanguageKind(language) === CODE_FENCE_LANGUAGE_KINDS.MARKDOWN;

export const isDocumentSpecFenceLanguage = (language) =>
  getCodeFenceLanguageKind(language) === CODE_FENCE_LANGUAGE_KINDS.DOCUMENT_SPEC;

export const isMornDraftFlatFenceLanguage = (language) =>
  getCodeFenceLanguageKind(language) === CODE_FENCE_LANGUAGE_KINDS.MORNDRAFT_FLAT;
