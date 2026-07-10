import {
  adaptMornDraftFlatComponent,
  adaptMornDraftFlatComponentSource,
} from './morndraft-flat-adapter.js';
import {
  MORNDRAFT_HTML_SOURCE_STYLE_ATTR,
  renderSwissCatalogDocumentSpecToHtml,
} from './swiss-catalog-renderer.js';

const STRUCTURE_COMMENT_PREFIX = '<!-- morndraft:structure ';
const STRUCTURE_COMMENT_RE = /<!--\s*morndraft:structure\s+([\s\S]*?)\s*-->/i;
const DEFAULT_FENCED_LANGUAGE = 'html';

const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const stripMornDraftHtmlSourceEditMetadata = (value) => {
  if (Array.isArray(value)) return value.map(stripMornDraftHtmlSourceEditMetadata);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '__morndraftEditPaths')
      .map(([key, entry]) => [key, stripMornDraftHtmlSourceEditMetadata(entry)]),
  );
};

const escapeHtmlAttr = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const serializeHtmlCommentJson = (value) => JSON.stringify(value)
  .replace(/--/g, '\\u002d\\u002d')
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026');

const createItemMetadata = (items) => (
  Array.isArray(items)
    ? items.map((item, index) => {
      if (!isRecord(item)) return { index };
      return {
        index,
        ...(typeof item.label === 'string' && item.label ? { label: item.label } : {}),
        ...(typeof item.value === 'string' && item.value ? { value: item.value } : {}),
      };
    })
    : []
);

const normalizeMetadataComponent = (value) => {
  const stripped = stripMornDraftHtmlSourceEditMetadata(value);
  if (Array.isArray(stripped)) return stripped;
  if (!isRecord(stripped)) return stripped;
  return Object.fromEntries(
    Object.entries(stripped)
      .filter(([, entry]) => entry !== undefined),
  );
};

export const createMornDraftHtmlStructureMetadata = (validation) => {
  const component = isRecord(validation?.component) ? validation.component : {};
  const layout = typeof component.layout === 'string'
    ? component.layout
    : validation?.metadata?.layout ?? null;
  const variant = typeof component.variant === 'string'
    ? component.variant
    : validation?.metadata?.variant ?? null;
  return {
    schema: 'morndraft-html-structure.v1',
    source: 'morndraft-flat',
    renderer: 'swiss-catalog',
    layout,
    variant,
    pair: layout && variant ? `${layout}/${variant}` : null,
    target: validation?.metadata?.target ?? null,
    itemCount: Array.isArray(component.items) ? component.items.length : 0,
    items: createItemMetadata(component.items),
    component: normalizeMetadataComponent(component),
  };
};

export const injectMornDraftHtmlSourceMetadata = (html, metadata) => {
  const comment = `${STRUCTURE_COMMENT_PREFIX}${serializeHtmlCommentJson(metadata)} -->`;
  const withComment = String(html).replace(/^<!doctype html>\n/i, (doctype) => `${doctype}${comment}\n`);
  const attributes = [
    ['data-morndraft-source', 'morndraft-flat'],
    ['data-morndraft-layout', metadata.layout],
    ['data-morndraft-variant', metadata.variant],
  ].filter(([, value]) => value);

  return withComment.replace(
    /<div class="component-shell"/,
    (match) => `${match} ${attributes
      .map(([name, value]) => `${name}="${escapeHtmlAttr(value)}"`)
      .join(' ')}`,
  );
};

export const createMornDraftHtmlMarkdownFence = (
  html,
  language = DEFAULT_FENCED_LANGUAGE,
) => {
  const body = String(html ?? '');
  return `\`\`\`${language}\n${body}${body.endsWith('\n') ? '' : '\n'}\`\`\``;
};

export const readMornDraftHtmlSourceStructureMetadata = (html) => {
  if (typeof html !== 'string') {
    return { ok: false, reason: 'invalid-html-source', metadata: null };
  }
  const match = html.match(STRUCTURE_COMMENT_RE);
  if (!match?.[1]) {
    return { ok: false, reason: 'missing-structure-metadata', metadata: null };
  }
  try {
    const metadata = JSON.parse(match[1]);
    if (!isRecord(metadata)) {
      return { ok: false, reason: 'invalid-structure-metadata', metadata: null };
    }
    return { ok: true, metadata };
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid-structure-metadata-json',
      metadata: null,
      error,
    };
  }
};

const getMornDraftHtmlSourceMetadataComponent = (metadata) => {
  if (!isRecord(metadata)) return null;
  if (isRecord(metadata.component)) return metadata.component;
  if (isRecord(metadata.structure)) return metadata.structure;
  return null;
};

export const parseMornDraftHtmlSourceStructure = (html) => {
  const metadataResult = readMornDraftHtmlSourceStructureMetadata(html);
  if (!metadataResult.ok) {
    return {
      ok: false,
      reason: metadataResult.reason,
      metadata: null,
      component: null,
      diagnostics: [],
      validation: null,
    };
  }

  const component = getMornDraftHtmlSourceMetadataComponent(metadataResult.metadata);
  if (!component) {
    return {
      ok: false,
      reason: 'missing-component-metadata',
      metadata: metadataResult.metadata,
      component: null,
      diagnostics: [],
      validation: null,
    };
  }

  const validation = adaptMornDraftFlatComponent(component);
  return {
    ok: validation.ok,
    reason: validation.ok ? null : 'invalid-component-metadata',
    metadata: metadataResult.metadata,
    component: validation.component,
    diagnostics: validation.diagnostics,
    validation,
  };
};

const SOURCE_STYLE_RE = new RegExp(
  `<style\\b(?=[^>]*\\b${MORNDRAFT_HTML_SOURCE_STYLE_ATTR}\\b)[^>]*>[\\s\\S]*?<\\/style>`,
  'i',
);

export const extractMornDraftHtmlSourceStyleTag = (html) => (
  typeof html === 'string'
    ? html.match(SOURCE_STYLE_RE)?.[0] ?? null
    : null
);

export const preserveMornDraftHtmlSourceStyleOverrides = (previousHtml, nextHtml) => {
  const previousStyle = extractMornDraftHtmlSourceStyleTag(previousHtml);
  if (!previousStyle || typeof nextHtml !== 'string') return nextHtml;
  if (!SOURCE_STYLE_RE.test(nextHtml)) return nextHtml;
  return nextHtml.replace(SOURCE_STYLE_RE, previousStyle);
};

const cloneJsonValue = (value) => JSON.parse(JSON.stringify(value));

export const updateMornDraftHtmlSourceComponent = (html, mutateComponent, options = {}) => {
  const parsed = parseMornDraftHtmlSourceStructure(html);
  if (!parsed.ok || !parsed.component) {
    return {
      ok: false,
      reason: parsed.reason,
      diagnostics: parsed.diagnostics ?? [],
      html,
      component: parsed.component,
    };
  }

  let nextComponent = cloneJsonValue(parsed.component);
  const mutationResult = mutateComponent(nextComponent);
  if (mutationResult !== undefined) nextComponent = mutationResult;
  const result = createMornDraftHtmlSource(nextComponent, options);
  if (!result.ok) {
    return {
      ok: false,
      reason: 'invalid-mutated-component',
      diagnostics: result.diagnostics,
      html,
      component: nextComponent,
    };
  }

  const nextHtml = preserveMornDraftHtmlSourceStyleOverrides(html, result.html);
  return {
    ok: true,
    diagnostics: result.diagnostics,
    metadata: result.metadata,
    component: result.component,
    html: nextHtml,
    changed: nextHtml !== html,
  };
};

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const patchCssVariable = (styleText, name, value) => {
  const declaration = `${name}: ${String(value).trim()};`;
  const declarationRe = new RegExp(`(${escapeRegExp(name)}\\s*:\\s*)[^;]+(;?)`, 'i');
  if (declarationRe.test(styleText)) {
    return styleText.replace(declarationRe, `$1${String(value).trim()}$2`);
  }
  const rootRe = /(:root\s*\{)([\s\S]*?)(\})/i;
  if (!rootRe.test(styleText)) return styleText;
  return styleText.replace(rootRe, (_, open, body, close) => {
    const separator = body.endsWith('\n') ? '' : '\n';
    return `${open}${body}${separator}  ${declaration}\n${close}`;
  });
};

export const patchMornDraftHtmlSourceStyleVariables = (html, variables) => {
  if (typeof html !== 'string' || !isRecord(variables)) {
    return { ok: false, reason: 'invalid-style-variable-input', html };
  }
  const styleTag = extractMornDraftHtmlSourceStyleTag(html);
  if (!styleTag) return { ok: false, reason: 'missing-source-style', html };
  if (Object.values(variables).some((value) => String(value).includes('</style>'))) {
    return { ok: false, reason: 'invalid-style-variable-value', html };
  }

  const openEnd = styleTag.indexOf('>');
  const closeStart = styleTag.toLowerCase().lastIndexOf('</style>');
  if (openEnd < 0 || closeStart <= openEnd) return { ok: false, reason: 'invalid-source-style', html };
  let styleText = styleTag.slice(openEnd + 1, closeStart);
  Object.entries(variables).forEach(([name, value]) => {
    if (!/^--morndraft-[a-z0-9-]+$/i.test(name)) return;
    styleText = patchCssVariable(styleText, name, value);
  });
  const nextStyleTag = `${styleTag.slice(0, openEnd + 1)}${styleText}${styleTag.slice(closeStart)}`;
  const nextHtml = html.replace(SOURCE_STYLE_RE, nextStyleTag);
  return {
    ok: true,
    html: nextHtml,
    changed: nextHtml !== html,
  };
};

export const createMornDraftHtmlSource = (component, options = {}) => {
  const {
    cssMode = 'shared',
    ...adapterOptions
  } = options ?? {};
  const validation = typeof component === 'string'
    ? adaptMornDraftFlatComponentSource(component, adapterOptions)
    : adaptMornDraftFlatComponent(component, adapterOptions);
  const metadata = createMornDraftHtmlStructureMetadata(validation);
  if (!validation.ok) {
    return {
      ok: false,
      diagnostics: validation.diagnostics,
      component: validation.component,
      documentSpec: null,
      metadata,
      html: null,
      markdown: null,
      fencedLanguage: DEFAULT_FENCED_LANGUAGE,
      mimeType: 'text/html;charset=utf-8',
    };
  }

  const documentSpec = stripMornDraftHtmlSourceEditMetadata(validation.documentSpec);
  const rendered = renderSwissCatalogDocumentSpecToHtml(documentSpec, { cssMode });
  if (!rendered.ok) {
    return {
      ok: false,
      diagnostics: rendered.diagnostics,
      component: validation.component,
      documentSpec,
      metadata,
      html: null,
      markdown: null,
      fencedLanguage: DEFAULT_FENCED_LANGUAGE,
      mimeType: 'text/html;charset=utf-8',
    };
  }

  const html = injectMornDraftHtmlSourceMetadata(rendered.html, metadata);
  return {
    ok: true,
    diagnostics: [
      ...validation.diagnostics,
      ...rendered.diagnostics,
    ],
    component: validation.component,
    documentSpec,
    metadata,
    html,
    markdown: createMornDraftHtmlMarkdownFence(html),
    fencedLanguage: DEFAULT_FENCED_LANGUAGE,
    mimeType: 'text/html;charset=utf-8',
  };
};
