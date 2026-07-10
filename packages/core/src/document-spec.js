import JSON5 from 'json5';

export const DOCUMENT_SPEC_VERSION = 'v1';
export const DOCUMENT_SPEC_TARGETS = Object.freeze(['3:4', '16:9']);
export const DOCUMENT_SPEC_THEME_SCHEMES = Object.freeze(['K', 'L', 'M']);
export const DOCUMENT_SPEC_THEME_FAMILIES = Object.freeze([
  'editorial',
  'signal',
  'guide',
  'broadcast',
  'launch',
  'brief',
]);

export const DOCUMENT_SPEC_LAYOUTS = Object.freeze([
  Object.freeze({ id: 'cover', label: 'Cover', group: 'intro', description: 'Title-led opening page.' }),
  Object.freeze({ id: 'title-card', label: 'Title Card', group: 'intro', description: 'Section title card.' }),
  Object.freeze({ id: 'before-after', label: 'Before After', group: 'comparison', description: 'Before and after comparison.' }),
  Object.freeze({ id: 'swot', label: 'SWOT', group: 'comparison', description: 'SWOT analysis grid.' }),
  Object.freeze({ id: 'quadrant-axis', label: 'Quadrant Axis', group: 'comparison', description: 'Two-axis quadrant map.' }),
  Object.freeze({ id: 'impossible-triangle', label: 'Impossible Triangle', group: 'comparison', description: 'Three-point tradeoff triangle.' }),
  Object.freeze({ id: 'comparison-table', label: 'Comparison Table', group: 'comparison', description: 'Structured comparison table.' }),
  Object.freeze({ id: 'process', label: 'Process', group: 'flow', description: 'Step-by-step process.' }),
  Object.freeze({ id: 'process-loop', label: 'Process Loop', group: 'flow', description: 'Loop process model.' }),
  Object.freeze({ id: 'journey', label: 'Journey', group: 'flow', description: 'Journey path diagram.' }),
  Object.freeze({ id: 'gantt', label: 'Gantt', group: 'flow', description: 'Task timeline plan.' }),
  Object.freeze({ id: 'timeline', label: 'Timeline', group: 'flow', description: 'Time ordered milestones.' }),
  Object.freeze({ id: 'pyramid', label: 'Pyramid', group: 'structure', description: 'Layered pyramid.' }),
  Object.freeze({ id: 'fishbone', label: 'Fishbone', group: 'structure', description: 'Cause and effect fishbone.' }),
  Object.freeze({ id: 'iceberg', label: 'Iceberg', group: 'structure', description: 'Surface and depth iceberg model.' }),
  Object.freeze({ id: 'venn', label: 'Venn', group: 'structure', description: 'Venn overlap diagram.' }),
  Object.freeze({ id: 'architecture', label: 'Architecture', group: 'structure', description: 'Architecture layer diagram.' }),
  Object.freeze({ id: 'arch-platform', label: 'Architecture Platform', group: 'structure', description: 'Platform architecture rows.' }),
  Object.freeze({ id: 'arch-platform-complex-v', label: 'Architecture Complex Vertical', group: 'structure', description: 'Vertical platform architecture rows.' }),
  Object.freeze({ id: 'mind-map', label: 'Mind Map', group: 'structure', description: 'Root and branch mind map.' }),
  Object.freeze({ id: 'matrix', label: 'Matrix', group: 'comparison', description: 'Grid comparison.' }),
  Object.freeze({ id: 'radar', label: 'Radar', group: 'analysis', description: 'Radial capability scan.' }),
  Object.freeze({ id: 'radar-hex', label: 'Radar Hex', group: 'analysis', description: 'Hexagonal radar scan.' }),
  Object.freeze({ id: 'code-block', label: 'Code Block', group: 'technical', description: 'Code or structured source page.' }),
  Object.freeze({ id: 'vs', label: 'VS', group: 'comparison', description: 'Two-sided comparison.' }),
  Object.freeze({ id: 'stat-card', label: 'Stat Card', group: 'analysis', description: 'Metric cards.' }),
  Object.freeze({ id: 'concentric', label: 'Concentric', group: 'structure', description: 'Layered concentric model.' }),
  Object.freeze({ id: 'list-card', label: 'List Card', group: 'content', description: 'Numbered list card.' }),
  Object.freeze({ id: 'toc-card', label: 'TOC Card', group: 'content', description: 'Table of contents card.' }),
  Object.freeze({ id: 'form-card', label: 'Form Card', group: 'content', description: 'Form summary card.' }),
  Object.freeze({ id: 'two-col', label: 'Two Column', group: 'content', description: 'Two-column content layout.' }),
  Object.freeze({ id: 'three-col', label: 'Three Column', group: 'content', description: 'Three-column content layout.' }),
  Object.freeze({ id: 'split-v', label: 'Split Vertical', group: 'content', description: 'Vertical split panel.' }),
  Object.freeze({ id: 'quote', label: 'Quote', group: 'content', description: 'Quote page.' }),
  Object.freeze({ id: 'alert-box', label: 'Alert Box', group: 'content', description: 'Alert message stack.' }),
  Object.freeze({ id: 'terminal-box', label: 'Terminal Box', group: 'content', description: 'Term definition box.' }),
  Object.freeze({ id: 'iframe-card', label: 'Iframe Card', group: 'content', description: 'Embedded iframe preview card.' }),
]);

export const DOCUMENT_SPEC_FENCE_LANGUAGES = Object.freeze(['swiss', 'morndraft-expression']);

const DEFAULT_THEME = Object.freeze({
  scheme: 'K',
  family: 'editorial',
});

const layoutMap = new Map(DOCUMENT_SPEC_LAYOUTS.map((layout) => [layout.id, layout]));

const createDiagnostic = ({ code, message, severity = 'info', path = '', line = null, column = null }) => ({
  code,
  message,
  severity,
  ...(path ? { path } : {}),
  ...(line ? { line } : {}),
  ...(column ? { column } : {}),
});

const parseJsonErrorLocation = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\bat\s+(\d+):(\d+)/i) ?? message.match(/\bline\s+(\d+)\D+column\s+(\d+)/i);
  if (!match) return {};
  return {
    line: Number(match[1]),
    column: Number(match[2]),
  };
};

const isRecord = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toStringValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

const normalizeSlots = (slots) => {
  if (!isRecord(slots)) return {};
  return Object.fromEntries(
    Object.entries(slots).map(([key, value]) => [key, toStringValue(value)]),
  );
};

const normalizeItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    if (isRecord(item)) {
      return Object.fromEntries(
        Object.entries(item).map(([key, value]) => [key, toStringValue(value)]),
      );
    }
    return { label: toStringValue(item) };
  });
};

const parseDocumentSpecInput = (input) => {
  if (typeof input !== 'string') {
    return { ok: true, value: input };
  }

  try {
    return { ok: true, value: JSON5.parse(input) };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [createDiagnostic({
        code: 'document_spec.parse_error',
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
        ...parseJsonErrorLocation(error),
      })],
    };
  }
};

export const listDocumentSpecLayouts = () =>
  DOCUMENT_SPEC_LAYOUTS.map((layout) => ({ ...layout }));

export const getDocumentSpecLayout = (layoutId) =>
  layoutMap.get(String(layoutId ?? '')) ?? null;

export const isDocumentSpecLayout = (layoutId) =>
  layoutMap.has(String(layoutId ?? ''));

export const normalizeDocumentSpec = (input) => {
  const source = isRecord(input) ? input : {};
  const theme = isRecord(source.theme) ? source.theme : {};
  const pages = Array.isArray(source.pages) ? source.pages : [];

  return {
    version: source.version ?? DOCUMENT_SPEC_VERSION,
    target: source.target ?? '3:4',
    theme: {
      scheme: theme.scheme ?? DEFAULT_THEME.scheme,
      family: theme.family ?? DEFAULT_THEME.family,
    },
    pages: pages.map((page) => {
      const pageRecord = isRecord(page) ? page : {};
      return {
        layout: pageRecord.layout ?? '',
        ...(pageRecord.variant ? { variant: toStringValue(pageRecord.variant) } : {}),
        slots: normalizeSlots(pageRecord.slots),
        items: normalizeItems(pageRecord.items),
      };
    }),
  };
};

export const validateDocumentSpec = (input) => {
  const parsed = parseDocumentSpecInput(input);
  if (!parsed.ok) {
    return {
      ok: false,
      spec: null,
      diagnostics: parsed.diagnostics,
    };
  }

  const diagnostics = [];
  if (!isRecord(parsed.value)) {
    diagnostics.push(createDiagnostic({
      code: 'document_spec.not_object',
      severity: 'error',
      path: '$',
      message: 'DocumentSpec must be a JSON object.',
    }));
    return { ok: false, spec: null, diagnostics };
  }

  const spec = normalizeDocumentSpec(parsed.value);
  const sourcePages = Array.isArray(parsed.value.pages) ? parsed.value.pages : [];

  if (spec.version !== DOCUMENT_SPEC_VERSION) {
    diagnostics.push(createDiagnostic({
      code: 'document_spec.invalid_version',
      severity: 'error',
      path: '$.version',
      message: `DocumentSpec version must be "${DOCUMENT_SPEC_VERSION}".`,
    }));
  }

  if (!DOCUMENT_SPEC_TARGETS.includes(spec.target)) {
    diagnostics.push(createDiagnostic({
      code: 'document_spec.invalid_target',
      severity: 'error',
      path: '$.target',
      message: `DocumentSpec target must be one of: ${DOCUMENT_SPEC_TARGETS.join(', ')}.`,
    }));
  }

  if (!DOCUMENT_SPEC_THEME_SCHEMES.includes(spec.theme.scheme)) {
    diagnostics.push(createDiagnostic({
      code: 'document_spec.invalid_theme_scheme',
      severity: 'error',
      path: '$.theme.scheme',
      message: `Theme scheme must be one of: ${DOCUMENT_SPEC_THEME_SCHEMES.join(', ')}.`,
    }));
  }

  if (!DOCUMENT_SPEC_THEME_FAMILIES.includes(spec.theme.family)) {
    diagnostics.push(createDiagnostic({
      code: 'document_spec.invalid_theme_family',
      severity: 'error',
      path: '$.theme.family',
      message: `Theme family must be one of: ${DOCUMENT_SPEC_THEME_FAMILIES.join(', ')}.`,
    }));
  }

  if (spec.pages.length === 0) {
    diagnostics.push(createDiagnostic({
      code: 'document_spec.pages_required',
      severity: 'error',
      path: '$.pages',
      message: 'DocumentSpec must contain at least one page.',
    }));
  }

  spec.pages.forEach((page, index) => {
    const sourcePage = isRecord(sourcePages[index]) ? sourcePages[index] : {};
    if (!page.layout) {
      diagnostics.push(createDiagnostic({
        code: 'document_spec.layout_required',
        severity: 'error',
        path: `$.pages[${index}].layout`,
        message: 'Page layout is required.',
      }));
      return;
    }

    if (!isDocumentSpecLayout(page.layout)) {
      diagnostics.push(createDiagnostic({
        code: 'document_spec.unknown_layout',
        severity: 'error',
        path: `$.pages[${index}].layout`,
        message: `Unknown DocumentSpec layout "${page.layout}".`,
      }));
    }

    if (
      Object.prototype.hasOwnProperty.call(sourcePage, 'slots') &&
      sourcePage.slots !== undefined &&
      !isRecord(sourcePage.slots)
    ) {
      diagnostics.push(createDiagnostic({
        code: 'document_spec.invalid_slots',
        severity: 'error',
        path: `$.pages[${index}].slots`,
        message: 'Page slots must be an object with string-like values.',
      }));
    }

    if (
      Object.prototype.hasOwnProperty.call(sourcePage, 'items') &&
      sourcePage.items !== undefined &&
      !Array.isArray(sourcePage.items)
    ) {
      diagnostics.push(createDiagnostic({
        code: 'document_spec.invalid_items',
        severity: 'error',
        path: `$.pages[${index}].items`,
        message: 'Page items must be an array.',
      }));
    }
  });

  const hasError = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  return {
    ok: !hasError,
    spec,
    diagnostics,
  };
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getSlot = (slots, key) => toStringValue(slots?.[key] ?? '');

const renderTextBlock = (value, className) =>
  value ? `<div class="${className}">${escapeHtml(value)}</div>` : '';

const renderItems = (items, className = 'morndraft-docspec-items') => {
  if (!items.length) return '';
  return `<ol class="${className}">
${items.map((item, index) => `<li>
  <span class="morndraft-docspec-item-index">${index + 1}</span>
  <span class="morndraft-docspec-item-main">${escapeHtml(item.label || item.value || `Item ${index + 1}`)}</span>
  ${item.note ? `<span class="morndraft-docspec-item-note">${escapeHtml(item.note)}</span>` : ''}
  ${item.badge ? `<span class="morndraft-docspec-item-badge">${escapeHtml(item.badge)}</span>` : ''}
</li>`).join('\n')}
</ol>`;
};

const renderPageHeader = (page) => `
${renderTextBlock(getSlot(page.slots, 'eyebrow'), 'morndraft-docspec-eyebrow')}
${renderTextBlock(getSlot(page.slots, 'title'), 'morndraft-docspec-title')}
${renderTextBlock(getSlot(page.slots, 'subtitle'), 'morndraft-docspec-subtitle')}
`;

const renderCover = (page) => `
<section class="morndraft-docspec-cover-main">
  ${renderPageHeader(page)}
  ${renderTextBlock(getSlot(page.slots, 'caption'), 'morndraft-docspec-caption')}
  ${renderTextBlock(getSlot(page.slots, 'meta'), 'morndraft-docspec-meta')}
</section>`;

const renderMatrix = (page) => `
${renderPageHeader(page)}
<div class="morndraft-docspec-grid">
${page.items.map((item) => `<article>
  ${item.badge ? `<strong>${escapeHtml(item.badge)}</strong>` : ''}
  <h3>${escapeHtml(item.label || item.value || '')}</h3>
  ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ''}
</article>`).join('\n')}
</div>`;

const renderCodeBlock = (page) => `
${renderPageHeader(page)}
<pre class="morndraft-docspec-code"><code>${escapeHtml(getSlot(page.slots, 'code') || page.items.map((item) => item.label).join('\n'))}</code></pre>`;

const renderVs = (page) => `
${renderPageHeader(page)}
<div class="morndraft-docspec-vs">
${page.items.slice(0, 2).map((item) => `<article>
  <h3>${escapeHtml(item.label || '')}</h3>
  <p>${escapeHtml(item.note || item.value || '')}</p>
</article>`).join('\n')}
</div>`;

const renderConcentric = (page) => `
${renderPageHeader(page)}
<div class="morndraft-docspec-concentric">
${page.items.map((item, index) => `<span style="--ring:${index}">${escapeHtml(item.label || item.value || '')}</span>`).join('\n')}
</div>
${renderTextBlock(getSlot(page.slots, 'caption'), 'morndraft-docspec-caption')}`;

const renderPageBody = (page) => {
  switch (page.layout) {
    case 'cover':
      return renderCover(page);
    case 'matrix':
    case 'impossible-triangle':
    case 'radar':
    case 'stat-card':
      return renderMatrix(page);
    case 'code-block':
      return renderCodeBlock(page);
    case 'vs':
      return renderVs(page);
    case 'concentric':
      return renderConcentric(page);
    case 'process':
    case 'timeline':
    default:
      return `
${renderPageHeader(page)}
${renderItems(page.items)}`;
  }
};

const renderPage = (page, index) => `
<section class="morndraft-docspec-page morndraft-docspec-layout-${escapeHtml(page.layout)}" data-layout="${escapeHtml(page.layout)}" data-page="${index + 1}">
  ${renderPageBody(page)}
</section>`;

const getThemeColors = (scheme) => {
  switch (scheme) {
    case 'L':
      return { bg: '#f7f5ef', page: '#fffdf7', text: '#25231f', muted: '#6d675f', accent: '#9a3412', line: '#ded6ca' };
    case 'M':
      return { bg: '#eef4f8', page: '#fbfdff', text: '#17212b', muted: '#5c6b77', accent: '#0f766e', line: '#cfdae3' };
    case 'K':
    default:
      return { bg: '#141414', page: '#20201e', text: '#f6f1e7', muted: '#b7afa2', accent: '#f1b84b', line: '#3b3935' };
  }
};

const renderStyles = (spec) => {
  const colors = getThemeColors(spec.theme.scheme);
  return `<style>
:root {
  color-scheme: ${spec.theme.scheme === 'K' ? 'dark' : 'light'};
  --morndraft-docspec-bg: ${colors.bg};
  --morndraft-docspec-page: ${colors.page};
  --morndraft-docspec-text: ${colors.text};
  --morndraft-docspec-muted: ${colors.muted};
  --morndraft-docspec-accent: ${colors.accent};
  --morndraft-docspec-line: ${colors.line};
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--morndraft-docspec-bg);
  color: var(--morndraft-docspec-text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.morndraft-docspec-root {
  display: grid;
  gap: 28px;
  min-height: 100vh;
  padding: 28px;
  place-items: center;
}
.morndraft-docspec-page {
  aspect-ratio: ${spec.target === '16:9' ? '16 / 9' : '3 / 4'};
  background: var(--morndraft-docspec-page);
  border: 1px solid var(--morndraft-docspec-line);
  border-radius: 8px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
  display: flex;
  flex-direction: column;
  gap: 24px;
  justify-content: center;
  max-width: min(100%, ${spec.target === '16:9' ? '1120px' : '720px'});
  overflow: hidden;
  padding: ${spec.target === '16:9' ? '56px 64px' : '56px 44px'};
  width: 100%;
}
.morndraft-docspec-eyebrow {
  color: var(--morndraft-docspec-accent);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}
.morndraft-docspec-title {
  font-size: clamp(36px, 7vw, 72px);
  font-weight: 850;
  line-height: 0.98;
}
.morndraft-docspec-subtitle {
  color: var(--morndraft-docspec-muted);
  font-size: clamp(18px, 2.4vw, 28px);
  line-height: 1.35;
  max-width: 18em;
}
.morndraft-docspec-caption,
.morndraft-docspec-meta {
  color: var(--morndraft-docspec-muted);
  font-size: 14px;
  line-height: 1.5;
}
.morndraft-docspec-items {
  counter-reset: item;
  display: grid;
  gap: 14px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.morndraft-docspec-items li {
  align-items: start;
  border-top: 1px solid var(--morndraft-docspec-line);
  display: grid;
  gap: 4px 14px;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  padding-top: 14px;
}
.morndraft-docspec-item-index {
  color: var(--morndraft-docspec-accent);
  font-weight: 800;
}
.morndraft-docspec-item-main {
  font-size: 22px;
  font-weight: 750;
}
.morndraft-docspec-item-note {
  color: var(--morndraft-docspec-muted);
  grid-column: 2 / -1;
  line-height: 1.45;
}
.morndraft-docspec-item-badge {
  border: 1px solid var(--morndraft-docspec-line);
  border-radius: 999px;
  color: var(--morndraft-docspec-muted);
  font-size: 12px;
  padding: 3px 8px;
}
.morndraft-docspec-grid,
.morndraft-docspec-vs {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
.morndraft-docspec-grid article,
.morndraft-docspec-vs article {
  border: 1px solid var(--morndraft-docspec-line);
  border-radius: 8px;
  padding: 18px;
}
.morndraft-docspec-grid h3,
.morndraft-docspec-vs h3 {
  font-size: 22px;
  margin: 8px 0;
}
.morndraft-docspec-grid p,
.morndraft-docspec-vs p {
  color: var(--morndraft-docspec-muted);
  line-height: 1.45;
  margin: 0;
}
.morndraft-docspec-code {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--morndraft-docspec-line);
  border-radius: 8px;
  margin: 0;
  overflow: auto;
  padding: 18px;
  white-space: pre-wrap;
}
.morndraft-docspec-concentric {
  display: grid;
  gap: 10px;
  place-items: center;
}
.morndraft-docspec-concentric span {
  align-items: center;
  aspect-ratio: 1;
  border: 2px solid var(--morndraft-docspec-accent);
  border-radius: 999px;
  display: flex;
  font-weight: 750;
  justify-content: center;
  min-width: max(140px, calc(72px + var(--ring) * 54px));
  padding: 18px;
}
@media (max-width: 720px) {
  .morndraft-docspec-root { padding: 16px; }
  .morndraft-docspec-page { padding: 32px 24px; }
  .morndraft-docspec-title { font-size: 36px; }
}
</style>`;
};

export const renderDocumentSpecToHtml = (input) => {
  const validation = validateDocumentSpec(input);
  if (!validation.ok) {
    return {
      ok: false,
      html: '',
      diagnostics: validation.diagnostics,
      spec: validation.spec,
    };
  }

  const spec = validation.spec;
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(getSlot(spec.pages[0]?.slots, 'title') || 'MornDraft DocumentSpec')}</title>
${renderStyles(spec)}
</head>
<body>
<main class="morndraft-docspec-root" data-version="${escapeHtml(spec.version)}" data-target="${escapeHtml(spec.target)}" data-theme="${escapeHtml(spec.theme.scheme)}">
${spec.pages.map(renderPage).join('\n')}
</main>
</body>
</html>
`;

  return {
    ok: true,
    html,
    diagnostics: validation.diagnostics,
    spec,
  };
};

export const createDocumentSpecMarkdownFence = (input, language = 'swiss') => {
  const validation = validateDocumentSpec(input);
  if (!validation.ok) {
    return {
      ok: false,
      markdown: '',
      diagnostics: validation.diagnostics,
      spec: validation.spec,
    };
  }

  return {
    ok: true,
    markdown: `\`\`\`${language}\n${JSON.stringify(validation.spec, null, 2)}\n\`\`\`\n`,
    diagnostics: validation.diagnostics,
    spec: validation.spec,
  };
};
