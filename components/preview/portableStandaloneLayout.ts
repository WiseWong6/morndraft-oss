import { STANDALONE_MERMAID_SIZE_ATTR } from './mermaidCapture';
import { assertNotLivePreviewMutationTarget } from './livePreviewSurfaceRegistry';
import { PRESERVE_LAYOUT_ATTR } from './portableHtmlCopySections';

const STANDALONE_BLOCK_LAYOUT_SELECTOR =
  '.aad-artifact-block,.aad-code-frame,.aad-code-block,.aad-json-viewer,.mermaid-container';
const STANDALONE_BLOCK_SHADOW_RESET_SELECTOR =
  `${STANDALONE_BLOCK_LAYOUT_SELECTOR},.aad-html-frame,.aad-collapsible-body,.aad-collapsible-body-inner,.aad-block-header`;
const STANDALONE_LAYOUT_ATTR = 'data-morndraft-standalone-layout';
const STANDALONE_SWISS_CATALOG_ATTR = 'data-morndraft-standalone-swiss-catalog';
const STANDALONE_DELIVERY_LAYOUT_STYLE_ATTR = 'data-morndraft-standalone-delivery-layout';
const STANDALONE_SWISS_CATALOG_SELECTOR =
  `[${PRESERVE_LAYOUT_ATTR}="true"] .component-shell[data-renderer="swiss-catalog"]`;
const STANDALONE_SWISS_WIDE_CONTENT_SELECTOR = [
  '.arch-platform',
  '.process-annotated-stack',
  '.process-chain',
  '.timeline[data-type="horizontal"]',
].join(',');
const STANDALONE_SWISS_MEDIUM_CONTENT_SELECTOR = [
  '.iceberg',
  '.mind-map-fit--vertical',
].join(',');
const STANDALONE_DELIVERY_LAYOUT_CSS = `
body:has([${STANDALONE_LAYOUT_ATTR}="true"]) {
  display: block !important;
  align-items: initial !important;
  justify-content: initial !important;
  padding: 0 !important;
}
[${STANDALONE_LAYOUT_ATTR}="true"] .aad-html-frame,
[${STANDALONE_LAYOUT_ATTR}="true"] .aad-collapsible-body,
[${STANDALONE_LAYOUT_ATTR}="true"] .aad-collapsible-body-inner {
  max-width: 100% !important;
  overflow-x: auto !important;
  overscroll-behavior-x: contain !important;
}
[${STANDALONE_SWISS_CATALOG_ATTR}="true"] {
  align-items: stretch !important;
  height: auto !important;
  justify-content: flex-start !important;
  max-width: none !important;
  min-height: 0 !important;
  max-height: none !important;
  aspect-ratio: auto !important;
  overflow: visible !important;
  white-space: normal !important;
}
[${STANDALONE_SWISS_CATALOG_ATTR}="true"].component-shell[data-renderer="swiss-catalog"] {
  aspect-ratio: auto !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  white-space: normal !important;
}
[${STANDALONE_SWISS_CATALOG_ATTR}="true"] .process-annotated-grid {
  grid-template-columns: repeat(var(--annotated-count, 4), minmax(0, 1fr)) !important;
  column-gap: 10px !important;
  row-gap: 0 !important;
}
[${STANDALONE_SWISS_CATALOG_ATTR}="true"] .process-chain:not([data-type="wrap"]) {
  flex-wrap: nowrap !important;
  justify-content: center !important;
}
[${STANDALONE_SWISS_CATALOG_ATTR}="true"] .process-chain:not([data-type="wrap"]) .step {
  flex: 1 1 0 !important;
  min-width: 64px !important;
}
[${STANDALONE_SWISS_CATALOG_ATTR}="true"] .process-chain[data-type="arrow"] {
  flex-wrap: nowrap !important;
  gap: 0 !important;
}
[${STANDALONE_SWISS_CATALOG_ATTR}="true"] .process-chain[data-type="arrow"] .step {
  flex: 1 1 0 !important;
  min-width: 0 !important;
  white-space: nowrap !important;
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%) !important;
  border-radius: 0 !important;
}
[${STANDALONE_SWISS_CATALOG_ATTR}="true"] .process-chain[data-type="arrow"] .step:first-child {
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%) !important;
  padding-left: 12px !important;
}
[${STANDALONE_SWISS_CATALOG_ATTR}="true"] .process-chain[data-type="arrow"] .step:last-child {
  clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%) !important;
  padding-left: 18px !important;
  padding-right: 18px !important;
}
[${STANDALONE_SWISS_CATALOG_ATTR}="true"] .process-chain:not([data-type="wrap"]) .arrow {
  display: inline-flex !important;
}
[${STANDALONE_SWISS_CATALOG_ATTR}="true"] .process-chain[data-type="arrow"] .arrow {
  display: none !important;
}
[${STANDALONE_SWISS_CATALOG_ATTR}="true"] .concentric {
  overflow: visible !important;
}
`.trim();
const A4_SURFACE_STYLE_PROPERTIES = [
  '--aad-preview-a4-page-width',
  '--aad-preview-a4-page-height',
  '--aad-preview-a4-page-margin',
  '--aad-preview-a4-page-gap',
  '--aad-preview-a4-page-count',
  'min-height',
];

const readA4SurfaceStyles = (root: HTMLElement) => {
  const styles = new Map(
    A4_SURFACE_STYLE_PROPERTIES
      .map((property) => [property, root.style.getPropertyValue(property)] as const)
      .filter(([, value]) => value),
  );
  const minHeight = styles.get('min-height');
  if (!minHeight || minHeight === '0' || minHeight === '0px') {
    const pageCount = Number(
      root.getAttribute('data-preview-a4-page-count') ??
      styles.get('--aad-preview-a4-page-count') ??
      '0',
    );
    const pageHeight = Number.parseFloat(styles.get('--aad-preview-a4-page-height') ?? '');
    const pageGap = Number.parseFloat(styles.get('--aad-preview-a4-page-gap') ?? '');
    if (
      Number.isFinite(pageCount) &&
      pageCount > 0 &&
      Number.isFinite(pageHeight) &&
      pageHeight > 0 &&
      Number.isFinite(pageGap)
    ) {
      styles.set('min-height', `${pageCount * pageHeight + Math.max(0, pageCount - 1) * pageGap}px`);
    }
  }
  return styles;
};

const readStandalonePx = (value: string | null | undefined) => {
  const match = value?.trim().match(/^([0-9]+(?:\.[0-9]+)?)px$/);
  if (!match) return 0;
  const width = Number.parseFloat(match[1] ?? '');
  return Number.isFinite(width) && width > 0 ? Math.ceil(width) : 0;
};

const resolveStandaloneSwissCatalogWidth = (section: HTMLElement, shell: HTMLElement) => {
  const declaredWidth = Math.max(
    readStandalonePx(section.style.maxWidth),
    readStandalonePx(section.style.width),
    readStandalonePx(shell.style.width),
  );
  if (shell.getAttribute('data-target') === '16:9') return Math.max(declaredWidth, 744);
  if (shell.querySelector(STANDALONE_SWISS_WIDE_CONTENT_SELECTOR)) {
    return Math.max(declaredWidth, 744);
  }
  if (shell.querySelector(STANDALONE_SWISS_MEDIUM_CONTENT_SELECTOR)) {
    return Math.max(declaredWidth, 600);
  }
  return Math.max(declaredWidth, 480);
};

const applyStandaloneSwissCatalogLayout = (root: HTMLElement) => {
  root.querySelectorAll<HTMLElement>(STANDALONE_SWISS_CATALOG_SELECTOR).forEach((shell) => {
    const section = shell.closest<HTMLElement>(`[${PRESERVE_LAYOUT_ATTR}="true"]`);
    if (!section) return;
    const width = resolveStandaloneSwissCatalogWidth(section, shell);
    section.setAttribute(STANDALONE_SWISS_CATALOG_ATTR, 'true');
    section.style.setProperty('width', `${width}px`);
    section.style.setProperty('min-width', `${width}px`);
    section.style.setProperty('max-width', 'none');
    section.style.setProperty('height', 'auto', 'important');
    section.style.setProperty('min-height', '0', 'important');
    section.style.setProperty('max-height', 'none', 'important');
    section.style.setProperty('aspect-ratio', 'auto', 'important');
    section.style.setProperty('align-items', 'stretch', 'important');
    section.style.setProperty('justify-content', 'flex-start', 'important');
    section.style.setProperty('overflow', 'visible');
    section.style.setProperty('white-space', 'normal', 'important');
    shell.setAttribute(STANDALONE_SWISS_CATALOG_ATTR, 'true');
    shell.style.setProperty('width', `${width}px`, 'important');
    shell.style.setProperty('min-width', `${width}px`, 'important');
    shell.style.setProperty('max-width', 'none', 'important');
    shell.style.setProperty('height', 'auto', 'important');
    shell.style.setProperty('min-height', '0', 'important');
    shell.style.setProperty('max-height', 'none', 'important');
    shell.style.setProperty('aspect-ratio', 'auto', 'important');
    shell.style.setProperty('align-items', 'stretch', 'important');
    shell.style.setProperty('justify-content', 'flex-start', 'important');
    shell.style.setProperty('overflow', 'visible', 'important');
    shell.style.setProperty('white-space', 'normal', 'important');
  });
};

const ensureStandaloneDeliveryLayoutStyle = (root: HTMLElement) => {
  if (root.querySelector(`style[${STANDALONE_DELIVERY_LAYOUT_STYLE_ATTR}]`)) return;
  const style = root.ownerDocument.createElement('style');
  style.setAttribute(STANDALONE_DELIVERY_LAYOUT_STYLE_ATTR, 'true');
  style.textContent = STANDALONE_DELIVERY_LAYOUT_CSS;
  root.appendChild(style);
};

export const applyStandalonePreviewLayout = (root: HTMLElement) => {
  assertNotLivePreviewMutationTarget(root, 'applyStandalonePreviewLayout');
  root.setAttribute(STANDALONE_LAYOUT_ATTR, 'true');

  root.querySelectorAll<HTMLElement>(`${STANDALONE_BLOCK_LAYOUT_SELECTOR},pre`).forEach((element) => {
    element.style.setProperty('width', '100%');
    element.style.setProperty('max-width', '100%');
    element.style.setProperty('box-sizing', 'border-box');
  });

  root.querySelectorAll<HTMLElement>(STANDALONE_BLOCK_SHADOW_RESET_SELECTOR).forEach((element) => {
    element.style.setProperty('box-shadow', 'none');
  });

  root.querySelectorAll<HTMLElement>([
    '.aad-artifact-block',
    '.aad-collapsible-body',
    '.aad-collapsible-body-inner',
    '.aad-html-frame',
    '.aad-json-viewer',
    '.aad-markdown-image-frame',
    '.mermaid-container',
    '[data-copy-role]',
    'figure',
    'table',
  ].join(',')).forEach((element) => {
    element.style.setProperty('max-width', '100%');
    element.style.setProperty('overflow-x', 'auto');
    element.style.setProperty('overscroll-behavior-x', 'contain');
  });

  root.querySelectorAll<HTMLElement>('.aad-code-block').forEach((element) => {
    element.style.setProperty('overflow-x', 'auto');
    element.style.setProperty('overflow-wrap', 'normal');
    element.style.setProperty('tab-size', '2');
    element.style.setProperty('text-align', 'left');
    element.style.setProperty('text-indent', '0');
    element.style.setProperty('white-space', 'pre');
    element.style.setProperty('word-break', 'normal');
  });

  root.querySelectorAll<HTMLElement>('pre:not(.aad-code-block)').forEach((element) => {
    element.style.setProperty('overflow-x', 'auto');
    element.style.setProperty('white-space', 'pre-wrap');
    element.style.setProperty('overflow-wrap', 'anywhere');
  });

  root.querySelectorAll<HTMLElement>('.aad-mermaid-block').forEach((element) => {
    element.style.setProperty('text-align', 'center');
  });

  root.querySelectorAll<SVGElement>('.aad-mermaid-block svg').forEach((svg) => {
    svg.style.setProperty('display', 'block');
    if (!svg.hasAttribute(PRESERVE_LAYOUT_ATTR) && !svg.hasAttribute(STANDALONE_MERMAID_SIZE_ATTR)) {
      svg.style.setProperty('max-width', '100%');
    }
    svg.style.setProperty('height', 'auto');
    svg.style.setProperty('margin', '0 auto');
  });

  applyStandaloneSwissCatalogLayout(root);
  ensureStandaloneDeliveryLayoutStyle(root);
};

export const restoreStandaloneDocumentSurface = (
  root: HTMLElement,
  options: { preserveA4Pagination?: boolean } = {},
) => {
  assertNotLivePreviewMutationTarget(root, 'restoreStandaloneDocumentSurface');

  const a4Styles = options.preserveA4Pagination ? readA4SurfaceStyles(root) : null;
  root.className = 'aad-document-surface';
  root.removeAttribute('style');
  a4Styles?.forEach((value, property) => {
    root.style.setProperty(property, value);
  });
};
