import type { CopyPayload } from './clipboardWriters';
import {
  captureHtmlFrameWithModernScreenshot,
  createStaticHtmlCaptureFrame,
  inlineUnreadableRemoteStylesheets,
  resizeStaticCaptureFrameToContent,
  waitForElementAssets,
  type HtmlCapture,
} from './htmlScreenshotCapture';
import { buildStandaloneThemeCss } from '../../utils/html-theme.js';
import { assertNotLivePreviewMutationTarget } from './livePreviewSurfaceRegistry';
import {
  flattenStandaloneMermaidBlocks,
  replaceMermaidBlocksWithImages,
} from './mermaidCapture';
import { replaceMermaidBlocksWithRichCopyShells } from './mermaidRichCopy';
import { PORTABLE_CODE_BLOCK_CLASS_ALLOWLIST, replacePortableCodeBlocks } from './portableCodeBlocks';
import {
  COPY_STYLE_PROPS,
  RICH_COPY_STYLE_PROPS,
  sanitizeRichCopyStyles,
} from './portableCopyStyles';
import { inlinePortableBlockHeaders } from './portableBlockHeaders';
import { PRESERVE_LAYOUT_ATTR } from './portableHtmlCopySections';
import {
  CAPTURED_HTML_IMAGE_SECTION_ATTR,
  replaceHtmlFramesWithStaticCaptures,
  waitForHtmlPreviewFrames,
  type HtmlFrameStrategy,
} from './portableHtmlFrameCaptures';
import {
  imageToPortableDataUrl,
  type PortableImageFallback,
} from './portableImageFallback';
import {
  replaceFallbackArtifactBlocksWithRichCopyShells,
  replaceJsonBlocksWithRichCopyShells,
} from './portableRichCopyArtifacts';
import {
  prependPortableArtifactMapList,
  removePortableBlockChrome,
  removePortableRichCopyChrome,
  wrapPortableArtifactMapSidecar,
  type DeliveryDisplayOptions,
  type PortableArtifactMapEntry,
} from './portablePreviewDelivery';
import {
  applyStandalonePreviewLayout,
  restoreStandaloneDocumentSurface,
} from './portableStandaloneLayout';
import {
  PREVIEW_A4_BREAK_ATTR,
  PREVIEW_A4_DEFAULT_PAGE_WIDTH_PX,
  PREVIEW_A4_LAYOUT_SIGNATURE_ATTR,
  PREVIEW_A4_ORIGINAL_MARGIN_TOP_ATTR,
  PREVIEW_A4_PAGE_COUNT_ATTR,
  PREVIEW_A4_PAGINATION_ATTR,
  layoutPreviewA4Pagination,
  type PreviewA4PaginationMetrics,
} from './previewA4PaginationLayout';
import { wrapStandaloneHtml } from './standaloneHtml';
import { exceedsPreviewCapturePixelBudget } from './capturePixelBudget';
export type { DeliveryDisplayOptions } from './portablePreviewDelivery';
type PreviewTheme = 'dark' | 'light';
type PortableDeliveryOptions = {
  artifactMapEntries?: readonly PortableArtifactMapEntry[];
  artifactMapTitle?: string;
  captureScale?: number;
  deliveryDisplayOptions?: DeliveryDisplayOptions;
  imagePageCapture?: boolean;
  pdfPageCapture?: boolean;
};

type InlineStyleOptions = {
  styleProps?: readonly string[];
  inlineImages?: boolean;
  imageFallback?: PortableImageFallback;
};
type InlineStyleMode = 'portable' | 'standalone-html';

const WECHAT_ARTICLE_WIDTH = 677;
const PORTABLE_CAPTURE_SAFE_GUTTER = 24;
const PORTABLE_PDF_SEGMENT_PADDING = 12;
const PORTABLE_PDF_A4_WIDTH_PT = 595.28;
const PORTABLE_PDF_A4_HEIGHT_PT = 841.89;
const PORTABLE_PDF_MARGIN_PT = 36;
const STANDALONE_A4_RELAYOUT_VIEWPORT_WIDTH = 1440;
const STANDALONE_A4_RELAYOUT_VIEWPORT_HEIGHT = 1200;
const HTML2CANVAS_UNSUPPORTED_COLOR_FUNCTION_RE = /\b(?:oklch|oklab|lch|lab|color-mix)\(/i;
const CAPTURED_HTML_IMAGE_SECTION_SELECTOR = `[${CAPTURED_HTML_IMAGE_SECTION_ATTR}="true"]`;
const PORTABLE_SCREENSHOT_BLOCK_ATTR = 'data-aad-portable-screenshot-block';
const PORTABLE_SCREENSHOT_FLOW_ATTR = 'data-aad-portable-screenshot-flow';
const PORTABLE_SCREENSHOT_MEDIA_ATTR = 'data-aad-portable-screenshot-media';
const PORTABLE_SCREENSHOT_PRE_ATTR = 'data-aad-portable-screenshot-pre';
const PORTABLE_SCREENSHOT_TABLE_ATTR = 'data-aad-portable-screenshot-table';
const MORNDRAFT_FLAT_EDIT_PATH_ATTR = 'data-morndraft-edit-path';
const PORTABLE_SCREENSHOT_BLOCK_SELECTOR = [
  '.aad-artifact-block',
  '.aad-collapsible-block',
  '.aad-code-block',
  '.aad-json-viewer',
  '.aad-markdown-image-frame',
  '.mermaid-container',
  '[data-copy-role]',
].join(',');
const PORTABLE_PDF_SEGMENT_CONTAINER_SELECTOR = [
  '.aad-document-surface',
  '.aad-nested-markdown',
  '[data-aad-portable-capture-content="true"]',
].join(',');
const PORTABLE_PDF_ATOMIC_SEGMENT_SELECTOR = [
  '.aad-artifact-block',
  '.aad-collapsible-block',
  '.aad-markdown-image-frame',
  '[data-copy-role]',
  'blockquote',
  'pre',
  'table',
].join(',');
const FLOW_TEXT_TAGS = new Set([
  'article',
  'section',
  'div',
  'p',
  'blockquote',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'span',
  'strong',
  'em',
  'code',
]);

const RESPONSIVE_MEDIA_TAGS = new Set(['img', 'svg', 'canvas', 'video']);
const STANDALONE_CLASS_ALLOWLIST = new Set([
  ...PORTABLE_CODE_BLOCK_CLASS_ALLOWLIST, 'mermaid-container', 'mermaid-diagram-canvas',
]);
const STANDALONE_CODE_TOKEN_CLASS_ALLOWLIST = new Set([
  'boolean',
  'builtin',
  'cdata',
  'char',
  'class-name',
  'comment',
  'constant',
  'doctype',
  'function',
  'important',
  'interpolation',
  'interpolation-punctuation',
  'keyword',
  'maybe-class-name',
  'number',
  'operator',
  'parameter',
  'prolog',
  'property',
  'punctuation',
  'regex',
  'string',
  'symbol',
  'tag',
  'template-string',
  'token',
  'variable',
]);
const STANDALONE_WIDTH_RESET_SELECTOR = [
  '.aad-document-surface',
  '.aad-artifact-block',
  '.aad-code-block',
  '.aad-json-viewer',
  '.mermaid-container',
  'pre',
].join(',');

const shouldSkipPreviewA4InlineStyle = (source: Element, prop: string) => {
  if (source.hasAttribute(PREVIEW_A4_BREAK_ATTR)) {
    return prop === 'margin' || prop === 'margin-top';
  }
  if (source.hasAttribute(PREVIEW_A4_PAGINATION_ATTR)) {
    return (
      prop === 'background' ||
      prop === 'background-image' ||
      prop === 'min-height' ||
      prop.startsWith('--aad-preview-a4-')
    );
  }
  return false;
};

export const getReadableText = (element: HTMLElement) =>
  (element.textContent || '').replace(/\n{3,}/g, '\n\n').trim();

const getStandaloneClassName = (element: HTMLElement) => {
  const keepCodeTokenClasses = Boolean(element.closest('.aad-code-block, pre'));
  const classNames = Array.from(element.classList).filter((className) => (
    className.startsWith('aad-') ||
    STANDALONE_CLASS_ALLOWLIST.has(className) ||
    (keepCodeTokenClasses && STANDALONE_CODE_TOKEN_CLASS_ALLOWLIST.has(className))
  ));
  return classNames.join(' ');
};

const getEditableCodeTextareaValue = (layer: HTMLElement) => {
  const textarea = layer.querySelector<HTMLTextAreaElement>('textarea.aad-code-edit-textarea');
  if (!textarea) return '';
  return textarea.value || textarea.textContent || textarea.getAttribute('value') || '';
};

const createStandaloneStaticCodeBlock = (
  doc: Document,
  content: { html?: string; text?: string },
) => {
  const pre = doc.createElement('pre');
  pre.className = 'aad-code-block';
  const code = doc.createElement('code');
  if (content.html !== undefined) {
    code.innerHTML = content.html;
  } else {
    code.textContent = content.text ?? '';
  }
  pre.append(code);
  return pre;
};

const normalizeStandaloneEditableCodeBlocks = (root: HTMLElement) => {
  root.querySelectorAll<HTMLElement>('.aad-editable-code-layer').forEach((layer) => {
    const jsonTree = layer.querySelector<HTMLElement>('.aad-editable-json-tree');
    if (jsonTree) {
      jsonTree.removeAttribute('data-code-edit-trigger');
      jsonTree.removeAttribute('role');
      jsonTree.removeAttribute('tabindex');
      jsonTree.removeAttribute('aria-label');
      jsonTree.removeAttribute('title');
      jsonTree.removeAttribute('data-code-edit-edge');
      return;
    }

    const doc = layer.ownerDocument;
    const highlightCode = layer.querySelector<HTMLElement>('.aad-code-highlight-overlay code');
    const staticCodeBlock = createStandaloneStaticCodeBlock(
      doc,
      highlightCode
        ? { html: highlightCode.innerHTML }
        : { text: getEditableCodeTextareaValue(layer) },
    );
    layer.classList.remove('has-json-highlight');
    layer.replaceChildren(staticCodeBlock);
  });
};

const appendInlineStyles = (source: Element, target: Element, options: InlineStyleOptions = {}) => {
  const view = source.ownerDocument.defaultView;
  const targetStyle = (target as HTMLElement | SVGElement).style;
  const styleProps = options.styleProps ?? COPY_STYLE_PROPS;
  const inlineImages = options.inlineImages ?? true;
  const imageFallback = options.imageFallback ?? 'source';
  const computedStyle = styleProps.length ? view?.getComputedStyle(source) : undefined;

  if (computedStyle && targetStyle) {
    styleProps.forEach((prop) => {
      if (shouldSkipPreviewA4InlineStyle(source, prop)) return;
      const value = computedStyle.getPropertyValue(prop);
      if (value) {
        targetStyle.setProperty(prop, value);
      }
    });
  }

  const sourceTagName = source.tagName.toLowerCase();
  const targetTagName = target.tagName.toLowerCase();

  if (inlineImages && sourceTagName === 'img' && targetTagName === 'img') {
    (target as HTMLImageElement).src = imageToPortableDataUrl(
      source as HTMLImageElement,
      { quality: 0.82, fallback: imageFallback },
    );
  }

  if (sourceTagName === 'li' && targetTagName === 'li' && view) {
    const beforeContent = view.getComputedStyle(source, '::before').content;
    if (beforeContent && beforeContent !== 'none' && beforeContent !== 'normal') {
      const cleanContent = beforeContent.replace(/^["']|["']$/g, '').trim();
      if (cleanContent) {
        target.insertBefore(document.createTextNode(`${cleanContent} `), target.firstChild);
      }
    }
  }

  const SVG_ROOT_LAYOUT_PROPS = [
    'display',
    'width',
    'max-width',
    'height',
    'aspect-ratio',
    'margin',
    'vertical-align',
    'overflow',
  ];

  Array.from(source.children).forEach((sourceChild, index) => {
    const targetChild = target.children[index];
    if (!targetChild) return;

    if (
      sourceChild.tagName.toLowerCase() === 'svg' &&
      sourceChild.closest('[data-copy-role="mermaid-block"]')
    ) {
      const childComputedStyle = view?.getComputedStyle(sourceChild);
      const childTargetStyle = (targetChild as SVGElement).style;
      if (childComputedStyle && childTargetStyle) {
        SVG_ROOT_LAYOUT_PROPS.forEach((prop) => {
          const value = childComputedStyle.getPropertyValue(prop);
          if (value) childTargetStyle.setProperty(prop, value);
        });
      }
      return;
    }

    appendInlineStyles(sourceChild, targetChild, options);
  });
};

const cleanupStandaloneMermaidHeader = (header: HTMLElement) => {
  const labelText = header.querySelector('.aad-block-label')?.textContent?.trim() || 'Mermaid';
  const standaloneToolbar = header.querySelector<HTMLElement>('[data-morndraft-standalone-mermaid-toolbar]');
  const label = document.createElement('span');
  label.className = 'aad-block-label';
  label.textContent = labelText;
  if (standaloneToolbar) {
    const main = document.createElement('div');
    main.className = 'aad-block-header-main';
    main.append(label, standaloneToolbar);
    header.replaceChildren(main);
    return;
  }
  header.replaceChildren(label);
};

const resetStandaloneInlineWidth = (element: HTMLElement) => {
  element.style.removeProperty('width');
  element.style.removeProperty('min-width');
  element.style.removeProperty('max-width');
};

const findStandaloneDocumentSurface = (root: HTMLElement) =>
  root.matches('.aad-document-surface')
    ? root
    : root.querySelector<HTMLElement>('.aad-document-surface');

const hasStandaloneMermaidZoomBlocks = (root: HTMLElement) =>
  Boolean(
    root.matches('[data-morndraft-standalone-mermaid-zoom]') ||
    root.querySelector('[data-morndraft-standalone-mermaid-zoom]'),
  );

const cleanupPortableHtml = (
  root: HTMLElement,
  options: {
    normalizeEditableCodeBlocks?: boolean;
    preserveStandaloneInteractivity?: boolean;
    replaceCodeBlocks?: boolean;
    richCopy?: boolean;
    theme?: PreviewTheme;
  } = {},
) => {
  if (options.replaceCodeBlocks !== false) {
    replacePortableCodeBlocks(root, options.theme);
  }
  if (options.normalizeEditableCodeBlocks) {
    normalizeStandaloneEditableCodeBlocks(root);
  }

  root.querySelectorAll('[data-copy-remove="true"], script').forEach((element) => {
    if (!options.richCopy && element.matches('.aad-collapsible-block > .aad-block-header')) {
      element.removeAttribute('data-copy-remove');
      if (element.matches('.aad-mermaid-block > .aad-block-header')) {
        cleanupStandaloneMermaidHeader(element as HTMLElement);
      }
      return;
    }
    if (
      options.preserveStandaloneInteractivity &&
      element.matches('.aad-json-tree-toggle')
    ) {
      element.removeAttribute('data-copy-remove');
      return;
    }
    element.remove();
  });

  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  const preserveLayoutElements = new WeakSet<HTMLElement>();
  elements.forEach((element) => {
    if (element.closest(`[${PRESERVE_LAYOUT_ATTR}="true"]`)) {
      preserveLayoutElements.add(element);
    }
  });

  elements.forEach((element) => {
    const preserveLayout = preserveLayoutElements.has(element);
    Array.from(element.attributes).forEach((attr) => {
      if (
        (
          attr.name.startsWith('data-copy-') ||
          (options.richCopy && attr.name.startsWith('data-'))
        ) &&
        attr.name !== PRESERVE_LAYOUT_ATTR
      ) {
        element.removeAttribute(attr.name);
      } else if (attr.name === MORNDRAFT_FLAT_EDIT_PATH_ATTR) {
        element.removeAttribute(attr.name);
      }
    });
    if (element.closest('svg')) {
      element.removeAttribute('contenteditable');
    } else if (preserveLayout) {
      element.removeAttribute('contenteditable');
    } else {
      const standaloneClassName = options.richCopy ? '' : getStandaloneClassName(element);
      if (standaloneClassName) {
        element.setAttribute('class', standaloneClassName);
      } else {
        element.removeAttribute('class');
      }
      element.removeAttribute('id');
      element.removeAttribute('contenteditable');
    }

    const tagName = element.tagName.toLowerCase();
    const isStandaloneSurface = element === root && element.classList.contains('aad-document-surface');
    const shouldResetStandaloneWidth =
      isStandaloneSurface ||
      (!preserveLayout && element.matches(STANDALONE_WIDTH_RESET_SELECTOR));

    if (shouldResetStandaloneWidth) {
      resetStandaloneInlineWidth(element);
    }

    if (isStandaloneSurface) {
      element.style.removeProperty('margin');
      element.style.removeProperty('margin-top');
      element.style.removeProperty('margin-right');
      element.style.removeProperty('margin-bottom');
      element.style.removeProperty('margin-left');
    }

    if (!preserveLayout && FLOW_TEXT_TAGS.has(tagName)) {
      element.style.removeProperty('width');
      element.style.removeProperty('min-width');
      element.style.removeProperty('height');
      element.style.removeProperty('min-height');
      element.style.removeProperty('max-height');
      element.style.removeProperty('overflow');
      element.style.removeProperty('overflow-x');
      element.style.removeProperty('overflow-y');
    }

    if (RESPONSIVE_MEDIA_TAGS.has(tagName)) {
      if (preserveLayout) {
        element.style.setProperty('vertical-align', 'top');
      } else {
        element.removeAttribute('width');
        element.removeAttribute('height');
        element.style.setProperty('max-width', '100%');
        element.style.setProperty('height', 'auto');
        element.style.setProperty('vertical-align', 'top');
        element.style.setProperty('display', 'block');
        element.style.setProperty('width', '100%');
        element.style.setProperty('margin', '16px auto');
        element.style.setProperty('border', '0');
      }
    }

    if (!preserveLayout && tagName === 'table') {
      element.style.setProperty('width', '100%');
      element.style.setProperty('max-width', '100%');
      element.style.setProperty('border-collapse', 'collapse');
      element.style.setProperty('table-layout', 'auto');
    }

    if (!preserveLayout && tagName === 'pre') {
      element.style.removeProperty('height');
      element.style.removeProperty('max-height');
      element.style.setProperty('white-space', 'pre-wrap');
      element.style.setProperty('word-break', 'break-word');
      element.style.setProperty('overflow-wrap', 'anywhere');
    }
  });
};

const cleanupPreviewChrome = (root: HTMLElement) => {
  root.querySelectorAll('[data-copy-remove="true"], script').forEach((element) => {
    if (element.matches('.aad-collapsible-block > .aad-block-header')) {
      element.removeAttribute('data-copy-remove');
      return;
    }
    element.remove();
  });
};

const expandCollapsibleBodies = (root: HTMLElement) => {
  root.querySelectorAll<HTMLElement>('.aad-collapsible-body').forEach((element) => {
    element.style.setProperty('display', 'block');
    element.style.setProperty('grid-template-rows', 'none');
    element.style.setProperty('height', 'auto');
    element.style.setProperty('max-height', 'none');
    element.style.setProperty('overflow', 'visible');
    element.style.setProperty('overflow-x', 'visible');
    element.style.setProperty('overflow-y', 'visible');
  });

  root.querySelectorAll<HTMLElement>('.aad-collapsible-body-inner').forEach((element) => {
    element.style.setProperty('display', 'block');
    element.style.setProperty('height', 'auto');
    element.style.setProperty('min-height', '0');
    element.style.setProperty('max-height', 'none');
    element.style.setProperty('overflow', 'visible');
    element.style.setProperty('overflow-x', 'visible');
    element.style.setProperty('overflow-y', 'visible');
  });
};

const stripPreviewA4PaginationPresentation = (
  root: HTMLElement,
  {
    keepBreakMarkers = false,
  }: { keepBreakMarkers?: boolean } = {},
) => {
  assertNotLivePreviewMutationTarget(root, 'stripPreviewA4PaginationPresentation');

  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  elements.forEach((element) => {
    if (element.hasAttribute(PREVIEW_A4_PAGINATION_ATTR)) {
      element.removeAttribute(PREVIEW_A4_PAGINATION_ATTR);
      element.removeAttribute(PREVIEW_A4_PAGE_COUNT_ATTR);
      element.removeAttribute(PREVIEW_A4_LAYOUT_SIGNATURE_ATTR);
      element.style.removeProperty('--aad-preview-a4-page-width');
      element.style.removeProperty('--aad-preview-a4-page-height');
      element.style.removeProperty('--aad-preview-a4-page-margin');
      element.style.removeProperty('--aad-preview-a4-page-gap');
      element.style.removeProperty('--aad-preview-a4-page-count');
      element.style.removeProperty('min-height');
      element.style.removeProperty('background');
      element.style.removeProperty('background-image');
    }

    if (!element.hasAttribute(PREVIEW_A4_BREAK_ATTR)) return;
    const originalMarginTop = element.getAttribute(PREVIEW_A4_ORIGINAL_MARGIN_TOP_ATTR);
    element.style.removeProperty('margin');
    if (originalMarginTop !== null) {
      element.style.marginTop = originalMarginTop;
    } else {
      element.style.removeProperty('margin-top');
    }
    element.removeAttribute('data-preview-a4-break-spacer');
    element.removeAttribute(PREVIEW_A4_ORIGINAL_MARGIN_TOP_ATTR);
    if (!keepBreakMarkers) {
      element.removeAttribute(PREVIEW_A4_BREAK_ATTR);
      element.removeAttribute('data-preview-a4-break-source-y');
    }
  });
};

const markPortableScreenshotLayoutRoles = (root: HTMLElement) => {
  assertNotLivePreviewMutationTarget(root, 'markPortableScreenshotLayoutRoles');

  [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))].forEach((element) => {
    if (element.matches(PORTABLE_SCREENSHOT_BLOCK_SELECTOR)) {
      element.setAttribute(PORTABLE_SCREENSHOT_BLOCK_ATTR, 'true');
    }
    const tagName = element.tagName.toLowerCase();
    if (FLOW_TEXT_TAGS.has(tagName)) {
      element.setAttribute(PORTABLE_SCREENSHOT_FLOW_ATTR, 'true');
    }
    if (RESPONSIVE_MEDIA_TAGS.has(tagName)) {
      element.setAttribute(PORTABLE_SCREENSHOT_MEDIA_ATTR, 'true');
    }
    if (tagName === 'pre' || tagName === 'code') {
      element.setAttribute(PORTABLE_SCREENSHOT_PRE_ATTR, 'true');
    }
    if (tagName === 'table') {
      element.setAttribute(PORTABLE_SCREENSHOT_TABLE_ATTR, 'true');
    }
  });
};

const sanitizeStylesForHtml2Canvas = (root: HTMLElement) => {
  [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))].forEach((element) => {
    if (!element.closest(`[${PRESERVE_LAYOUT_ATTR}="true"]`)) {
      element.removeAttribute('class');
    }

    for (let index = element.style.length - 1; index >= 0; index -= 1) {
      const property = element.style.item(index);
      const value = element.style.getPropertyValue(property);
      if (HTML2CANVAS_UNSUPPORTED_COLOR_FUNCTION_RE.test(value)) {
        element.style.removeProperty(property);
      }
    }
  });
};

const expandPortableScreenshotLayout = (root: HTMLElement) => {
  assertNotLivePreviewMutationTarget(root, 'expandPortableScreenshotLayout');

  [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))].forEach((element) => {
    const preserveLayout = Boolean(element.closest(`[${PRESERVE_LAYOUT_ATTR}="true"]`));
    const overflowValues = [
      element.style.getPropertyValue('overflow'),
      element.style.getPropertyValue('overflow-x'),
      element.style.getPropertyValue('overflow-y'),
    ].join(' ');
    const clipsContent =
      /\b(?:auto|scroll|hidden|clip)\b/i.test(overflowValues) ||
      Boolean(element.style.getPropertyValue('max-height'));

    if (!preserveLayout && element.style.getPropertyValue('min-height')) {
      element.style.setProperty('min-height', '0');
    }

    if (!clipsContent && element !== root) return;

    element.style.setProperty('height', 'auto');
    element.style.setProperty('max-height', 'none');
    element.style.setProperty('overflow', 'visible');
    element.style.setProperty('overflow-x', 'visible');
    element.style.setProperty('overflow-y', 'visible');
  });
};

const normalizePortableScreenshotWidths = (root: HTMLElement) => {
  [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))].forEach((element) => {
    if (element.closest(`[${PRESERVE_LAYOUT_ATTR}="true"]`)) return;
    element.style.removeProperty('width');
    element.style.removeProperty('min-width');
    element.style.removeProperty('max-width');
    element.style.removeProperty('transform');
    element.style.removeProperty('transform-origin');
    element.style.setProperty('box-sizing', 'border-box');
  });

  root.querySelectorAll<HTMLElement>([
    '.aad-artifact-block',
    '.aad-collapsible-block',
    '[data-copy-role]',
    `[${PORTABLE_SCREENSHOT_BLOCK_ATTR}="true"]`,
  ].join(',')).forEach((element) => {
    if (element.closest(`[${PRESERVE_LAYOUT_ATTR}="true"]`)) return;
    element.style.setProperty('width', '100%');
    element.style.setProperty('max-width', '100%');
    element.style.setProperty('box-sizing', 'border-box');
    element.style.setProperty('overflow-x', 'hidden');
  });

  root.querySelectorAll<HTMLElement>([
    'pre',
    'code',
    `[${PORTABLE_SCREENSHOT_PRE_ATTR}="true"]`,
  ].join(',')).forEach((element) => {
    if (element.closest(`[${PRESERVE_LAYOUT_ATTR}="true"]`)) return;
    element.style.setProperty('max-width', '100%');
    element.style.setProperty('box-sizing', 'border-box');
    element.style.setProperty('white-space', 'pre-wrap');
    element.style.setProperty('word-break', 'break-word');
    element.style.setProperty('overflow-wrap', 'anywhere');
    element.style.setProperty('overflow-x', 'hidden');
  });

  root.querySelectorAll<HTMLElement>([
    'img',
    'svg',
    'canvas',
    'video',
    `[${PORTABLE_SCREENSHOT_MEDIA_ATTR}="true"]`,
  ].join(',')).forEach((element) => {
    if (element.closest(`[${PRESERVE_LAYOUT_ATTR}="true"]`)) return;
    element.style.setProperty('max-width', '100%');
    element.style.setProperty('box-sizing', 'border-box');
  });

  root.querySelectorAll<HTMLElement>([
    'table',
    `[${PORTABLE_SCREENSHOT_TABLE_ATTR}="true"]`,
  ].join(',')).forEach((element) => {
    if (element.closest(`[${PRESERVE_LAYOUT_ATTR}="true"]`)) return;
    element.style.setProperty('width', '100%');
    element.style.setProperty('max-width', '100%');
    element.style.setProperty('box-sizing', 'border-box');
    element.style.setProperty('table-layout', 'auto');
  });

  root.querySelectorAll<HTMLElement>([
    '.aad-collapsible-body',
    '.aad-collapsible-body-inner',
    CAPTURED_HTML_IMAGE_SECTION_SELECTOR,
  ].join(',')).forEach((element) => {
    element.style.setProperty('width', '100%');
    element.style.setProperty('max-width', '100%');
    element.style.setProperty('box-sizing', 'border-box');
  });
};

const restoreCapturedHtmlImageFrameClipping = (root: HTMLElement) => {
  root.querySelectorAll<HTMLElement>(CAPTURED_HTML_IMAGE_SECTION_SELECTOR).forEach((section) => {
    section.style.setProperty('background', 'transparent');
    section.style.setProperty('overflow', 'hidden');
    section.style.setProperty('overflow-x', 'hidden');
    section.style.setProperty('overflow-y', 'hidden');

    const block = section.closest<HTMLElement>('.aad-artifact-block, .aad-collapsible-block');
    if (!block) return;

    block.style.setProperty('overflow', 'hidden');
    block.style.setProperty('overflow-x', 'hidden');
    block.style.setProperty('overflow-y', 'hidden');

    const body = block.querySelector<HTMLElement>(':scope > .aad-collapsible-body');
    const bodyInner = body?.querySelector<HTMLElement>(':scope > .aad-collapsible-body-inner');

    [body, bodyInner].forEach((element) => {
      if (!element) return;
      element.style.setProperty('height', 'auto');
      element.style.setProperty('max-height', 'none');
      element.style.setProperty('overflow', 'hidden');
      element.style.setProperty('overflow-x', 'hidden');
      element.style.setProperty('overflow-y', 'hidden');
    });
  });
};

const getArticleCopyBackground = (source: HTMLElement, theme: PreviewTheme) => {
  const backgroundSources = [
    source.closest<HTMLElement>('.aad-document-surface'),
    source.closest<HTMLElement>('.aad-preview-content'),
    source,
  ].filter(Boolean) as HTMLElement[];

  for (const element of backgroundSources) {
    const background = window.getComputedStyle(element).backgroundColor;
    if (!isTransparentColor(background)) return background;
  }

  return theme === 'dark' ? '#161618' : '#ffffff';
};

const wrapArticleHtml = (html: string, source: HTMLElement, theme: PreviewTheme) => {
  const computedStyle = window.getComputedStyle(source);
  const wrapper = document.createElement('section');
  wrapper.style.cssText = [
    `max-width:${WECHAT_ARTICLE_WIDTH}px`,
    'margin:0 auto',
    'box-sizing:border-box',
    `color:${computedStyle.color}`,
    `font-family:${computedStyle.fontFamily}`,
    `font-size:${computedStyle.fontSize}`,
    `line-height:${computedStyle.lineHeight}`,
    `background:${getArticleCopyBackground(source, theme)}`,
    `padding:${computedStyle.paddingTop} ${computedStyle.paddingRight} ${computedStyle.paddingBottom} ${computedStyle.paddingLeft}`,
  ].join(';');
  wrapper.innerHTML = html;
  return wrapper.outerHTML;
};

const isTransparentColor = (color: string) =>
  !color || color === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/i.test(color.trim());

const getPortableCaptureBackground = (theme: PreviewTheme) =>
  theme === 'dark' ? '#1C1C1E' : '#FFFFFF';

const getPreviewCaptureBackground = (_sourceRoot: HTMLElement, theme: PreviewTheme) =>
  getPortableCaptureBackground(theme);

const buildPortablePreviewCaptureHtml = (
  clone: HTMLElement,
  width: number,
  contentWidth: number,
  theme: PreviewTheme,
  background = getPortableCaptureBackground(theme),
) => {
  clone.setAttribute('data-aad-portable-capture-content', 'true');
  clone.style.setProperty('width', `${contentWidth}px`);
  clone.style.setProperty('max-width', 'none');
  clone.style.setProperty('overflow', 'visible');
  clone.style.setProperty('box-sizing', 'border-box');
  clone.style.setProperty('background', background);
  clone.style.setProperty('margin', '0 auto');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${width}, initial-scale=1.0">
<style>
html,body{margin:0;padding:0;width:${width}px;background:${background};}
body{box-sizing:border-box;overflow:visible;}
*,*::before,*::after{box-sizing:border-box;}
</style>
</head>
<body>
<main data-aad-portable-capture-root="true" style="width:${width}px;max-width:none;box-sizing:border-box;overflow:visible;background:${background};padding:0 ${PORTABLE_CAPTURE_SAFE_GUTTER}px;">
${clone.outerHTML}
</main>
</body>
</html>`;
};

const buildPortablePreviewPdfCaptureHtml = (
  clone: HTMLElement,
  theme: PreviewTheme,
  pageWidth = PREVIEW_A4_DEFAULT_PAGE_WIDTH_PX,
) => {
  const background = getPortableCaptureBackground(theme);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=${pageWidth}, initial-scale=1.0">
<style>${buildStandaloneThemeCss(theme)}</style>
<style>
html,body{margin:0;padding:0;width:${pageWidth}px;min-height:0;background:${background};overflow:visible;}
body{box-sizing:border-box;}
main.container{display:block;width:${pageWidth}px;min-height:0;margin:0;padding:0;background:${background};overflow:visible;}
.aad-document-surface[data-preview-a4-pagination="true"]{--aad-preview-a4-page-width:${pageWidth}px!important;width:${pageWidth}px!important;max-width:none!important;margin:0!important;}
</style>
</head>
<body>
<main class="container" data-aad-portable-pdf-capture-root="true">
${clone.outerHTML}
</main>
</body>
</html>`;
};

const getStandaloneRelayoutRoot = (container: HTMLElement) => {
  const root = container.firstElementChild;
  const view = container.ownerDocument.defaultView;
  return view?.HTMLElement && root instanceof view.HTMLElement ? root : null;
};

const relayoutStandaloneA4PaginationClone = async (
  clone: HTMLElement,
  title: string,
  theme: PreviewTheme,
) => {
  const frame = await createStaticHtmlCaptureFrame(
    wrapStandaloneHtml(clone.outerHTML, title, theme, {
      includeA4PaginationRuntime: false,
      includeMermaidZoomRuntime: hasStandaloneMermaidZoomBlocks(clone),
    }),
    STANDALONE_A4_RELAYOUT_VIEWPORT_WIDTH,
    STANDALONE_A4_RELAYOUT_VIEWPORT_HEIGHT,
  );
  try {
    const container = frame.contentDocument?.querySelector<HTMLElement>('main.container');
    if (!container) return null;
    const relayoutRoot = getStandaloneRelayoutRoot(container);
    if (!relayoutRoot) return null;
    const surface = findStandaloneDocumentSurface(relayoutRoot);
    if (!surface?.hasAttribute(PREVIEW_A4_PAGINATION_ATTR)) return null;

    await inlineUnreadableRemoteStylesheets(container);
    await waitForElementAssets(container);
    await resizeStaticCaptureFrameToContent(frame, container, {
      stableWidth: STANDALONE_A4_RELAYOUT_VIEWPORT_WIDTH,
    });
    const metrics = layoutPreviewA4Pagination(surface);
    if (!metrics) return null;
    await waitForElementAssets(surface);
    await resizeStaticCaptureFrameToContent(frame, container, {
      stableWidth: STANDALONE_A4_RELAYOUT_VIEWPORT_WIDTH,
    });
    return relayoutRoot.cloneNode(true) as HTMLElement;
  } catch (error) {
    console.warn('Failed to relayout standalone A4 pagination:', error);
    return null;
  } finally {
    frame.remove();
  }
};

const preparePortablePreviewPdfA4Clone = async (
  sourceRoot: HTMLElement,
  theme: PreviewTheme,
  options: PortableDeliveryOptions,
) => {
  const { clone } = await preparePortablePreviewClone(sourceRoot, theme, {
    artifactMapEntries: options.artifactMapEntries,
    artifactMapTitle: options.artifactMapTitle,
    cleanup: true,
    convertMermaidToImages: false,
    deliveryDisplayOptions: {
      ...options.deliveryDisplayOptions,
      includeA4Pagination: false,
      includeArtifactMap: false,
    },
    htmlFrameStrategy: 'capture-image',
    replaceCodeBlocks: false,
  });
  const surface = clone.matches('.aad-document-surface')
    ? clone
    : clone.querySelector<HTMLElement>('.aad-document-surface');
  if (!surface) throw new Error('Preview PDF capture surface is missing.');
  stripPreviewA4PaginationPresentation(surface);
  restoreStandaloneDocumentSurface(surface);
  surface.setAttribute(PREVIEW_A4_PAGINATION_ATTR, 'true');
  applyStandalonePreviewLayout(clone);
  return clone;
};

const getSurfacePaperBackground = (surface: HTMLElement, theme: PreviewTheme) => {
  const computedStyle = surface.ownerDocument.defaultView?.getComputedStyle(surface);
  const paper = computedStyle?.getPropertyValue('--aad-paper')?.trim();
  return paper || (theme === 'dark' ? '#161618' : '#FFFFFF');
};

const createPdfPageFrame = ({
  metrics,
  pageBackground,
  pageIndex,
  surface,
}: {
  metrics: PreviewA4PaginationMetrics;
  pageBackground: string;
  pageIndex: number;
  surface: HTMLElement;
}) => {
  const doc = surface.ownerDocument;
  const frame = doc.createElement('section');
  frame.setAttribute('data-morndraft-pdf-page-frame', 'true');
  frame.style.cssText = [
    `width:${metrics.pageWidth}px`,
    `height:${metrics.pageHeight}px`,
    'position:relative',
    'overflow:hidden',
    'box-sizing:border-box',
    `background:${pageBackground}`,
  ].join(';');

  const pageSurface = surface.cloneNode(true) as HTMLElement;
  pageSurface.style.setProperty('position', 'absolute');
  pageSurface.style.setProperty('left', '0');
  pageSurface.style.setProperty('top', `${-pageIndex * metrics.pageStride}px`);
  pageSurface.style.setProperty('margin', '0');
  pageSurface.style.setProperty('width', `${metrics.pageWidth}px`);
  pageSurface.style.setProperty('max-width', 'none');
  frame.appendChild(pageSurface);
  return frame;
};

const capturePortablePreviewA4PageCaptures = async (
  sourceRoot: HTMLElement,
  theme: PreviewTheme,
  options: PortableDeliveryOptions,
): Promise<{
  firstPage: NonNullable<HtmlCapture['pdfPages']>[number];
  pages: Array<NonNullable<HtmlCapture['pdfPages']>[number]>;
}> => {
  const clone = await preparePortablePreviewPdfA4Clone(sourceRoot, theme, options);
  const pageWidth = PREVIEW_A4_DEFAULT_PAGE_WIDTH_PX;
  const captureFrame = await createStaticHtmlCaptureFrame(
    buildPortablePreviewPdfCaptureHtml(clone, theme, pageWidth),
    pageWidth,
    Math.ceil(pageWidth * (PORTABLE_PDF_A4_HEIGHT_PT / PORTABLE_PDF_A4_WIDTH_PT)),
  );
  const captureRoot = captureFrame.contentDocument?.querySelector<HTMLElement>(
    '[data-aad-portable-pdf-capture-root="true"]',
  );
  const surface = captureRoot?.querySelector<HTMLElement>(
    `.aad-document-surface[${PREVIEW_A4_PAGINATION_ATTR}="true"]`,
  );

  try {
    if (!captureRoot || !surface) throw new Error('Preview PDF capture environment failed to initialize.');
    await inlineUnreadableRemoteStylesheets(captureRoot);
    await waitForElementAssets(captureRoot);
    await resizeStaticCaptureFrameToContent(captureFrame, captureRoot, {
      stableWidth: pageWidth,
    });
    const metrics = layoutPreviewA4Pagination(surface);
    if (!metrics) throw new Error('Preview PDF A4 pagination failed.');
    await waitForElementAssets(surface);
    await resizeStaticCaptureFrameToContent(captureFrame, captureRoot, {
      stableWidth: pageWidth,
    });

    const pageBackground = getSurfacePaperBackground(surface, theme);
    const pages: Array<NonNullable<HtmlCapture['pdfPages']>[number]> = [];
    for (let pageIndex = 0; pageIndex < metrics.pageCount; pageIndex += 1) {
      const pageFrame = createPdfPageFrame({
        metrics,
        pageBackground,
        pageIndex,
        surface,
      });
      captureFrame.contentDocument?.body.appendChild(pageFrame);
      await waitForElementAssets(pageFrame);
      const pageCapture = await captureHtmlFrameWithModernScreenshot(
        pageFrame,
        pageBackground,
        {
          crop: false,
          captureHeight: metrics.pageHeight,
          captureScale: options.captureScale,
          captureWidth: metrics.pageWidth,
        },
      );
      pages.push(pageCapture);
      pageFrame.remove();
    }

    const firstPage = pages[0];
    if (!firstPage) throw new Error('Preview PDF page capture failed.');
    return { firstPage, pages };
  } finally {
    captureFrame.remove();
  }
};

const capturePortablePreviewImagePages = async (
  sourceRoot: HTMLElement,
  theme: PreviewTheme,
  options: PortableDeliveryOptions,
): Promise<HtmlCapture> => {
  const { firstPage, pages } = await capturePortablePreviewA4PageCaptures(sourceRoot, theme, options);
  return {
    ...firstPage,
    imagePages: pages,
  };
};

const capturePortablePreviewPdfPages = async (
  sourceRoot: HTMLElement,
  theme: PreviewTheme,
  options: PortableDeliveryOptions,
): Promise<HtmlCapture> => {
  const { firstPage, pages } = await capturePortablePreviewA4PageCaptures(sourceRoot, theme, options);
  return {
    ...firstPage,
    pdfPages: pages,
  };
};

const getPortableScreenshotCaptureHeight = (sourceRoot: HTMLElement) => {
  const sourceRect = sourceRoot.getBoundingClientRect();
  const sourceWidth = Math.max(1, sourceRect.width || sourceRoot.clientWidth || WECHAT_ARTICLE_WIDTH);
  const sourceHeight = Math.max(
    900,
    Math.ceil(sourceRect.height || sourceRoot.clientHeight || sourceRoot.scrollHeight || 0),
    sourceRoot.scrollHeight,
  );
  return Math.ceil(sourceHeight * Math.max(1, sourceWidth / WECHAT_ARTICLE_WIDTH));
};

const isVisiblePdfSegmentElement = (element: Element): element is HTMLElement => {
  const view = element.ownerDocument.defaultView;
  if (!view?.HTMLElement || !(element instanceof view.HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const isPdfSegmentHeading = (element: Element) =>
  /^H[2-6]$/i.test(element.tagName);

const getVisiblePdfSegmentChildren = (element: HTMLElement) =>
  Array.from(element.children).filter(isVisiblePdfSegmentElement);

const shouldDrillIntoPdfSegmentElement = (element: HTMLElement) => {
  if (isPdfSegmentHeading(element) || element.matches(PORTABLE_PDF_ATOMIC_SEGMENT_SELECTOR)) {
    return false;
  }
  return element.matches(PORTABLE_PDF_SEGMENT_CONTAINER_SELECTOR);
};

const collectPortablePdfSegmentElements = (
  element: HTMLElement,
  depth = 0,
): HTMLElement[] => {
  const children = getVisiblePdfSegmentChildren(element);
  if (children.length === 0) return [];
  return children.flatMap((child) => {
    if (
      depth < 2 &&
      getVisiblePdfSegmentChildren(child).length > 1 &&
      shouldDrillIntoPdfSegmentElement(child)
    ) {
      return collectPortablePdfSegmentElements(child, depth + 1);
    }
    return [child];
  });
};

const getPortablePdfApproxPageSourceHeight = (captureRoot: HTMLElement) => {
  const width = captureRoot.getBoundingClientRect().width || WECHAT_ARTICLE_WIDTH + PORTABLE_CAPTURE_SAFE_GUTTER * 2;
  const pageContentWidth = PORTABLE_PDF_A4_WIDTH_PT - PORTABLE_PDF_MARGIN_PT * 2;
  const pageContentHeight = PORTABLE_PDF_A4_HEIGHT_PT - PORTABLE_PDF_MARGIN_PT * 2;
  return pageContentHeight / (pageContentWidth / width);
};

const getPdfSegmentBounds = (
  elements: readonly HTMLElement[],
  rootTop: number,
) => {
  if (elements.length === 0) return null;
  const rects = elements.map((element) => element.getBoundingClientRect());
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  const y = Math.max(0, Math.floor(top - rootTop - PORTABLE_PDF_SEGMENT_PADDING));
  const height = Math.max(
    1,
    Math.ceil(bottom - rootTop + PORTABLE_PDF_SEGMENT_PADDING) - y,
  );
  return { y, height };
};

const collectPortablePdfPageBreakHints = (captureRoot: HTMLElement) => {
  const contentRoot =
    captureRoot.querySelector<HTMLElement>('[data-aad-portable-capture-content="true"]') ??
    captureRoot;
  const rootTop = captureRoot.getBoundingClientRect().top;
  const pageSourceHeight = getPortablePdfApproxPageSourceHeight(captureRoot);
  const children = collectPortablePdfSegmentElements(contentRoot);
  const hints: Array<{ height: number; y: number }> = [];

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const next = children[index + 1];
    let group = [child];
    let bounds = getPdfSegmentBounds(group, rootTop);
    if (isPdfSegmentHeading(child) && next && !isPdfSegmentHeading(next)) {
      const headingGroup = [child, next];
      const headingGroupBounds = getPdfSegmentBounds(headingGroup, rootTop);
      if (headingGroupBounds && headingGroupBounds.height <= pageSourceHeight) {
        group = headingGroup;
        bounds = headingGroupBounds;
      }
    }
    if (bounds) hints.push(bounds);
    if (group.length > 1) index += 1;
  }

  return hints;
};

const preparePortablePreviewClone = async (
  sourceRoot: HTMLElement,
  theme: PreviewTheme,
  options: {
    artifactMapEntries?: readonly PortableArtifactMapEntry[];
    artifactMapTitle?: string;
    cleanup?: boolean;
    richCopy?: boolean;
    deliveryDisplayOptions?: DeliveryDisplayOptions;
    stripChromeOnly?: boolean;
    convertMermaidToImages?: boolean;
    htmlFrameStrategy?: HtmlFrameStrategy;
    htmlPreviewRichCopyFallbackMessage?: string;
    inlineStyleMode?: InlineStyleMode;
    freezeEditableCodeBlocks?: boolean;
    preserveStandaloneInteractivity?: boolean;
    replaceCodeBlocks?: boolean;
  } = {},
) => {
  const deliveryDisplayOptions = options.deliveryDisplayOptions ?? {};
  const keepA4Pagination = deliveryDisplayOptions.includeA4Pagination === true;
  const htmlFrameStrategy = options.htmlFrameStrategy ?? 'capture-image';
  if (htmlFrameStrategy === 'capture-image' || htmlFrameStrategy === 'rich-copy-image') {
    await waitForHtmlPreviewFrames(sourceRoot);
  }
  const clone = sourceRoot.cloneNode(true) as HTMLElement;
  const styleProps = options.inlineStyleMode === 'standalone-html'
    ? []
    : options.richCopy ? RICH_COPY_STYLE_PROPS : COPY_STYLE_PROPS;

  appendInlineStyles(sourceRoot, clone, {
    imageFallback: options.stripChromeOnly ? 'placeholder' : 'source',
    styleProps,
  });
  const inlineStyles = (source: Element, target: Element) => appendInlineStyles(source, target, {
    imageFallback: options.stripChromeOnly ? 'placeholder' : 'source',
    styleProps,
  });
  const hasHtmlFrameImages = await replaceHtmlFramesWithStaticCaptures(sourceRoot, clone, inlineStyles, {
    htmlFrameStrategy,
    crop: options.stripChromeOnly ? false : undefined,
    minViewportWidth: (
      options.stripChromeOnly ||
      htmlFrameStrategy === 'capture-image'
    ) ? WECHAT_ARTICLE_WIDTH : undefined,
    richCopyFallbackMessage: options.htmlPreviewRichCopyFallbackMessage,
    theme,
  });
  if (options.convertMermaidToImages === false) {
    flattenStandaloneMermaidBlocks(sourceRoot, clone, theme);
  }

  let hasEmbeddedImages = hasHtmlFrameImages;
  if (options.convertMermaidToImages !== false) {
    const hasMermaidImages = options.richCopy
      ? await replaceMermaidBlocksWithRichCopyShells(clone, theme, sourceRoot)
      : await replaceMermaidBlocksWithImages(clone, theme, sourceRoot);
    hasEmbeddedImages = hasEmbeddedImages || hasMermaidImages;
  }

  if (!keepA4Pagination) {
    stripPreviewA4PaginationPresentation(clone);
  }

  if (options.cleanup) {
    if (options.richCopy) {
      replaceJsonBlocksWithRichCopyShells(clone, theme);
      replaceFallbackArtifactBlocksWithRichCopyShells(clone, theme);
      cleanupPortableHtml(clone, { replaceCodeBlocks: options.replaceCodeBlocks, richCopy: true, theme });
      if (deliveryDisplayOptions.includeCodeChrome === false) {
        removePortableRichCopyChrome(clone);
      }
      if (deliveryDisplayOptions.includeCodeChrome === false) {
        removePortableBlockChrome(clone);
      }
    } else {
      cleanupPortableHtml(clone, {
        normalizeEditableCodeBlocks: options.freezeEditableCodeBlocks,
        preserveStandaloneInteractivity: options.preserveStandaloneInteractivity,
        replaceCodeBlocks: options.replaceCodeBlocks,
        theme,
      });
      if (deliveryDisplayOptions.includeCodeChrome === false) {
        removePortableBlockChrome(clone);
      } else if (!options.preserveStandaloneInteractivity) {
        inlinePortableBlockHeaders(clone, theme);
      }
    }
  } else if (options.stripChromeOnly) {
    cleanupPreviewChrome(clone);
    if (deliveryDisplayOptions.includeCodeChrome === false) {
      removePortableBlockChrome(clone);
    }
    markPortableScreenshotLayoutRoles(clone);
    sanitizeStylesForHtml2Canvas(clone);
  }
  if (keepA4Pagination && options.stripChromeOnly) {
    stripPreviewA4PaginationPresentation(clone, { keepBreakMarkers: true });
  }
  if (!options.preserveStandaloneInteractivity) {
    expandCollapsibleBodies(clone);
  }
  if (options.richCopy) {
    sanitizeRichCopyStyles(clone);
  }

  clone.querySelectorAll<HTMLElement>('[data-artifact-id]').forEach((el) => { const aid = el.getAttribute('data-artifact-id'); if (aid && !el.id) el.id = aid; });
  const outputRoot = deliveryDisplayOptions.includeArtifactMap === false
    ? clone
    : options.richCopy
      ? prependPortableArtifactMapList(clone, options.artifactMapEntries, theme, options.artifactMapTitle)
      : wrapPortableArtifactMapSidecar(clone, options.artifactMapEntries, theme, options.artifactMapTitle);

  return { clone: outputRoot, hasEmbeddedImages };
};

export const buildStandaloneHtml = async (
  sourceRoot: HTMLElement,
  theme: PreviewTheme,
  title: string,
  options: PortableDeliveryOptions = {},
): Promise<string> => {
  const { clone } = await preparePortablePreviewClone(sourceRoot, theme, {
    artifactMapEntries: options.artifactMapEntries,
    artifactMapTitle: options.artifactMapTitle,
    cleanup: true,
    convertMermaidToImages: false,
    deliveryDisplayOptions: options.deliveryDisplayOptions,
    htmlFrameStrategy: 'static-html',
    inlineStyleMode: 'standalone-html',
    freezeEditableCodeBlocks: true,
    preserveStandaloneInteractivity: true,
    replaceCodeBlocks: false,
  });
  const surface = findStandaloneDocumentSurface(clone);
  const preserveA4Pagination = options.deliveryDisplayOptions?.includeA4Pagination === true;
  if (surface) {
    stripPreviewA4PaginationPresentation(surface);
    restoreStandaloneDocumentSurface(surface);
    if (preserveA4Pagination) {
      surface.setAttribute(PREVIEW_A4_PAGINATION_ATTR, 'true');
    }
  }
  applyStandalonePreviewLayout(clone);
  const relayoutClone = preserveA4Pagination
    ? await relayoutStandaloneA4PaginationClone(clone, title, theme)
    : null;
  const outputClone = relayoutClone ?? clone;
  return wrapStandaloneHtml(outputClone.outerHTML, title, theme, {
    includeA4PaginationRuntime: false,
    includeMornDraftRuntime: true,
    includeMermaidZoomRuntime: hasStandaloneMermaidZoomBlocks(outputClone),
  });
};

export const buildPreviewCopyPayload = async (
  sourceRoot: HTMLElement,
  theme: PreviewTheme,
  options: {
    artifactMapEntries?: readonly PortableArtifactMapEntry[];
    artifactMapTitle?: string;
    deliveryDisplayOptions?: DeliveryDisplayOptions;
    htmlPreviewRichCopyFallbackMessage?: string;
  } = {},
): Promise<CopyPayload> => {
  const { clone, hasEmbeddedImages } = await preparePortablePreviewClone(sourceRoot, theme, {
    artifactMapEntries: options.artifactMapEntries,
    artifactMapTitle: options.artifactMapTitle,
    cleanup: true,
    richCopy: true,
    deliveryDisplayOptions: options.deliveryDisplayOptions,
    htmlPreviewRichCopyFallbackMessage: options.htmlPreviewRichCopyFallbackMessage,
    htmlFrameStrategy: 'rich-copy-image',
  });

  return {
    html: wrapArticleHtml(clone.innerHTML, sourceRoot, theme),
    plain: getReadableText(clone),
    hasEmbeddedImages,
  };
};

export const capturePortablePreviewScreenshot = async (
  sourceRoot: HTMLElement,
  theme: PreviewTheme,
  options: PortableDeliveryOptions = {},
): Promise<HtmlCapture> => {
  if (options.pdfPageCapture) {
    return capturePortablePreviewPdfPages(sourceRoot, theme, options);
  }

  const captureContentWidth = WECHAT_ARTICLE_WIDTH;
  const captureWidth = captureContentWidth + PORTABLE_CAPTURE_SAFE_GUTTER * 2;
  const estimatedCaptureHeight = getPortableScreenshotCaptureHeight(sourceRoot);
  const exceedsPixelBudget = exceedsPreviewCapturePixelBudget({
    captureScale: options.captureScale,
    height: estimatedCaptureHeight,
    width: captureWidth,
  });
  if (options.imagePageCapture && (
    options.deliveryDisplayOptions?.includeA4Pagination === true ||
    exceedsPixelBudget
  )) {
    return capturePortablePreviewImagePages(sourceRoot, theme, options);
  }
  if (exceedsPixelBudget) {
    throw new Error('Preview capture exceeds the safe canvas pixel budget.');
  }

  const { clone } = await preparePortablePreviewClone(sourceRoot, theme, {
    artifactMapEntries: options.artifactMapEntries,
    artifactMapTitle: options.artifactMapTitle,
    deliveryDisplayOptions: options.deliveryDisplayOptions,
    stripChromeOnly: true,
    htmlFrameStrategy: 'capture-image',
  });
  expandPortableScreenshotLayout(clone);
  normalizePortableScreenshotWidths(clone);
  restoreCapturedHtmlImageFrameClipping(clone);
  const background = getPreviewCaptureBackground(sourceRoot, theme);
  const captureHeight = estimatedCaptureHeight;
  const captureFrame = await createStaticHtmlCaptureFrame(
    buildPortablePreviewCaptureHtml(clone, captureWidth, captureContentWidth, theme, background),
    captureWidth,
    captureHeight,
  );
  const captureRoot = captureFrame.contentDocument?.querySelector<HTMLElement>(
    '[data-aad-portable-capture-root="true"]',
  );

  try {
    if (!captureRoot) throw new Error('Preview screenshot environment failed to initialize.');
    await inlineUnreadableRemoteStylesheets(captureRoot);
    await waitForElementAssets(captureRoot);
    await resizeStaticCaptureFrameToContent(captureFrame, captureRoot, {
      stableWidth: captureWidth,
    });
    const resizedCaptureHeight = Math.max(
      captureHeight,
      captureRoot.scrollHeight,
      captureRoot.offsetHeight,
      Math.ceil(captureRoot.getBoundingClientRect().height),
    );
    if (exceedsPreviewCapturePixelBudget({
      captureScale: options.captureScale,
      height: resizedCaptureHeight,
      width: captureWidth,
    })) {
      captureFrame.remove();
      if (options.imagePageCapture) {
        return capturePortablePreviewImagePages(sourceRoot, theme, options);
      }
      throw new Error('Preview capture exceeds the safe canvas pixel budget.');
    }
    const pageBreakHints = collectPortablePdfPageBreakHints(captureRoot);
    const capture = await captureHtmlFrameWithModernScreenshot(
      captureRoot,
      background,
      { crop: false, captureScale: options.captureScale },
    );
    return pageBreakHints.length ? { ...capture, pageBreakHints } : capture;
  } finally {
    captureFrame.remove();
  }
};
