import {
  applyMermaidNodeTextContrast,
  getMermaidThemePalette,
} from '../../utils/mermaid-theme.js';
type PreviewTheme = 'dark' | 'light';
export type HtmlCapture = { blob: Blob; width: number; height: number };
type CaptureRect = { x: number; y: number; width: number; height: number };
type MermaidRenderStatus = { total: number; ready: number; error: number; pending: number };
type MermaidViewportPadding = { x: number; top: number; bottom: number };
type MermaidDisplayMetrics = { width: number; height: number };

export const WECHAT_ARTICLE_WIDTH = 677;
const PRESERVE_LAYOUT_ATTR = 'data-copy-preserve-layout';
export const STANDALONE_MERMAID_SIZE_ATTR = 'data-morndraft-preserve-mermaid-size';
const LUCIDE_ICON_VIEWBOX = '0 0 24 24';
const MERMAID_VIEWBOX_PADDING_X = 12;
const MERMAID_VIEWBOX_PADDING_TOP = 48;
const MERMAID_VIEWBOX_PADDING_BOTTOM = 24;
const MERMAID_IMAGE_PADDING = 24;
const MERMAID_IMAGE_SCALE = 2;
const MERMAID_IMAGE_MAX_EDGE = 4096;
export const MERMAID_IMAGE_BATCH_SIZE = 4;

const DEFAULT_MERMAID_VIEWPORT_PADDING: MermaidViewportPadding = { x: MERMAID_VIEWBOX_PADDING_X, top: MERMAID_VIEWBOX_PADDING_TOP, bottom: MERMAID_VIEWBOX_PADDING_BOTTOM };

const MERMAID_RENDERED_CONTENT_SELECTOR = [
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'foreignObject',
  'image',
  'use',
].join(',');

const SVG_HREF_ATTRS = new Set(['href', 'xlink:href']);
const SVG_TOKEN_ID_REFERENCE_ATTRS = new Set(['aria-labelledby', 'aria-describedby']);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const escapeHtmlAttribute = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });

const parseSvgLength = (value: string | null) => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const isUsableSvgRect = (rect: CaptureRect | DOMRect | SVGRect | null | undefined): rect is CaptureRect =>
  Boolean(
    rect &&
      [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
      rect.width > 0 &&
      rect.height > 0,
  );

const rectToViewBox = (rect: CaptureRect) =>
  [rect.x, rect.y, rect.width, rect.height].map((value) => Number(value.toFixed(3))).join(' ');

const getPaddedMermaidRect = (
  rect: CaptureRect,
  padding: MermaidViewportPadding = DEFAULT_MERMAID_VIEWPORT_PADDING,
): CaptureRect => ({
  x: rect.x - padding.x,
  y: rect.y - padding.top,
  width: rect.width + padding.x * 2,
  height: rect.height + padding.top + padding.bottom,
});

const replaceSvgUrlReferences = (value: string, idMap: Map<string, string>) => {
  let nextValue = value;
  idMap.forEach((nextId, oldId) => {
    const escapedId = escapeRegExp(oldId);
    nextValue = nextValue.replace(
      new RegExp(`url\\(\\s*(['"]?)#${escapedId}\\1\\s*\\)`, 'g'),
      (_match, quote: string) => `url(${quote}#${nextId}${quote})`,
    );
  });
  return nextValue;
};

const replaceSvgCssIdSelectors = (value: string, idMap: Map<string, string>) => {
  let nextValue = value;
  idMap.forEach((nextId, oldId) => {
    nextValue = nextValue.replace(
      new RegExp(`#${escapeRegExp(oldId)}(?=[\\s.#:,>{}+~)\\[]|$)`, 'g'),
      `#${nextId}`,
    );
  });
  return nextValue;
};

const replaceSvgTokenIds = (value: string, idMap: Map<string, string>) =>
  value
    .split(/\s+/)
    .map((token) => idMap.get(token) ?? token)
    .join(' ');

const replaceSvgAttributeIdReferences = (
  name: string,
  value: string,
  idMap: Map<string, string>,
) => {
  if (SVG_TOKEN_ID_REFERENCE_ATTRS.has(name)) {
    return replaceSvgTokenIds(value, idMap);
  }

  if (SVG_HREF_ATTRS.has(name) && value.startsWith('#')) {
    const targetId = value.slice(1);
    return idMap.has(targetId) ? `#${idMap.get(targetId)}` : value;
  }

  return replaceSvgUrlReferences(value, idMap);
};

const stabilizeStandaloneSvgIds = (svgElement: SVGSVGElement, idPrefix: string) => {
  const elements = [svgElement, ...Array.from(svgElement.querySelectorAll<SVGElement>('[id]'))];
  const idMap = new Map<string, string>();
  const seenIds = new Map<string, number>();
  const idAssignments: Array<{ element: SVGElement; nextId: string }> = [];

  elements.forEach((element) => {
    if (!element.id) return;
    const oldId = element.id;
    const count = seenIds.get(oldId) ?? 0;
    const baseId = `${idPrefix}${oldId}`;
    const nextId = count === 0 ? baseId : `${baseId}-${count + 1}`;
    seenIds.set(oldId, count + 1);
    idAssignments.push({ element, nextId });
    if (!idMap.has(oldId)) {
      idMap.set(oldId, nextId);
    }
  });

  if (idAssignments.length === 0) return;

  idAssignments.forEach(({ element, nextId }) => {
    element.id = nextId;
  });

  [svgElement, ...Array.from(svgElement.querySelectorAll<SVGElement>('*'))].forEach((element) => {
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name === 'id') return;
      const nextValue = replaceSvgAttributeIdReferences(attr.name, attr.value, idMap);
      if (nextValue !== attr.value) {
        element.setAttribute(attr.name, nextValue);
      }
    });
  });

  svgElement.querySelectorAll('style').forEach((styleElement) => {
    if (!styleElement.textContent) return;
    styleElement.textContent = replaceSvgCssIdSelectors(
      replaceSvgUrlReferences(styleElement.textContent, idMap),
      idMap,
    );
  });
};

const getSvgLogicalRect = (svgEl: Element) => {
  const viewBox = svgEl.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/\s+|,/).filter(Boolean).map(Number.parseFloat);
    if (parts.length >= 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3],
      };
    }
  }

  return {
    x: 0,
    y: 0,
    width: parseSvgLength(svgEl.getAttribute('width')) || WECHAT_ARTICLE_WIDTH,
    height: parseSvgLength(svgEl.getAttribute('height')) || 480,
  };
};

const applyMermaidSvgViewport = (
  svgElement: SVGSVGElement,
  contentRect: CaptureRect,
  padding?: MermaidViewportPadding,
) => {
  const viewportRect = getPaddedMermaidRect(contentRect, padding);
  svgElement.setAttribute('viewBox', rectToViewBox(viewportRect));
  svgElement.setAttribute('width', '100%');
  svgElement.removeAttribute('height');
  svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svgElement.style.removeProperty('max-width');
  svgElement.style.setProperty('width', '100%');
  svgElement.style.setProperty('height', 'auto');
  svgElement.style.setProperty('display', 'block');
};

export const isMermaidSvg = (svg: SVGElement): svg is SVGSVGElement => {
  if (svg.tagName.toLowerCase() !== 'svg') return false;
  if (svg.closest('[data-copy-remove="true"]')) return false;
  if (svg.id.startsWith('mermaid-')) return true;

  const viewBox = svg.getAttribute('viewBox')?.trim();
  return Boolean(viewBox && viewBox !== LUCIDE_ICON_VIEWBOX && svg.closest('.mermaid-container'));
};

export const normalizeMermaidSvg = (svg: string, theme: PreviewTheme = 'light') => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  let svgEl: Element = doc.documentElement;

  if (svgEl.tagName.toLowerCase() !== 'svg') {
    const template = document.createElement('template');
    template.innerHTML = svg.trim();
    const htmlSvg = template.content.querySelector('svg');
    if (htmlSvg?.namespaceURI !== 'http://www.w3.org/2000/svg') {
      return applyMermaidNodeTextContrast(svg, theme);
    }
    svgEl = htmlSvg;
  }

  const svgElement = svgEl as unknown as SVGSVGElement;
  applyMermaidSvgViewport(svgElement, getSvgLogicalRect(svgElement));

  if (!svgElement.getAttribute('xmlns')) {
    svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  return applyMermaidNodeTextContrast(new XMLSerializer().serializeToString(svgElement), theme);
};

const getSvgElementForCapture = (source: string | SVGSVGElement) => {
  if (typeof source !== 'string') {
    return source.cloneNode(true) as SVGSVGElement;
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(source, 'image/svg+xml');
  const parsedSvg = parsed.documentElement;
  if (parsedSvg.tagName.toLowerCase() === 'svg') {
    return parsedSvg as unknown as SVGSVGElement;
  }

  const template = document.createElement('template');
  template.innerHTML = source.trim();
  const htmlSvg = template.content.querySelector('svg');
  if (htmlSvg?.namespaceURI === 'http://www.w3.org/2000/svg') {
    return htmlSvg.cloneNode(true) as SVGSVGElement;
  }

  throw new Error('Invalid SVG content');
};

export const svgToPngCapture = (
  svgSource: string | SVGSVGElement,
  theme: PreviewTheme = 'light',
  trimRect: CaptureRect | null = null,
  captureScale: number = MERMAID_IMAGE_SCALE,
): Promise<HtmlCapture> => {
  return new Promise((resolve, reject) => {
    let svgElement: SVGSVGElement;
    try {
      svgElement = getSvgElementForCapture(svgSource);
      svgElement = getSvgElementForCapture(normalizeMermaidSvg(svgElement.outerHTML, theme));
    } catch (err) {
      reject(err instanceof Error ? err : new Error('Invalid SVG content'));
      return;
    }

    if (svgElement.tagName.toLowerCase() !== 'svg') {
      reject(new Error('Invalid SVG content'));
      return;
    }

    const baseRect = trimRect ?? getSvgLogicalRect(svgElement);
    const logicalWidth = Math.ceil(baseRect.width + MERMAID_IMAGE_PADDING * 2);
    const logicalHeight = Math.ceil(baseRect.height + MERMAID_IMAGE_PADDING * 2);
    const renderScale = Math.max(
      1,
      Math.min(
        Math.max(0.5, Math.min(4, Number.isFinite(captureScale) ? captureScale : MERMAID_IMAGE_SCALE)),
        MERMAID_IMAGE_MAX_EDGE / logicalWidth,
        MERMAID_IMAGE_MAX_EDGE / logicalHeight,
      ),
    );
    const renderWidth = Math.max(1, Math.ceil(logicalWidth * renderScale));
    const renderHeight = Math.max(1, Math.ceil(logicalHeight * renderScale));

    svgElement.setAttribute(
      'viewBox',
      [
        baseRect.x - MERMAID_IMAGE_PADDING,
        baseRect.y - MERMAID_IMAGE_PADDING,
        logicalWidth,
        logicalHeight,
      ].join(' '),
    );
    svgElement.setAttribute('width', String(renderWidth));
    svgElement.setAttribute('height', String(renderHeight));
    svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svgElement.style.removeProperty('max-width');
    svgElement.style.removeProperty('width');
    svgElement.style.removeProperty('height');
    if (!svgElement.getAttribute('xmlns')) {
      svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    const serializer = new XMLSerializer();
    const newSvgString = serializer.serializeToString(svgElement);

    const img = new Image();
    const svg64 = btoa(unescape(encodeURIComponent(newSvgString)));
    const image64 = `data:image/svg+xml;base64,${svg64}`;
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Timed out while rendering SVG image'));
    }, 5000);

    img.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      const canvas = document.createElement('canvas');
      canvas.width = renderWidth;
      canvas.height = renderHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.fillStyle = getMermaidThemePalette(theme).background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve({
            blob,
            width: logicalWidth,
            height: logicalHeight,
          });
        }
        else reject(new Error('Failed to create blob'));
      }, 'image/png');
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      reject(new Error('Failed to load SVG image'));
    };
    img.src = image64;
  });
};

export const createResponsiveImageHtml = (
  src: string,
  alt: string,
  dimensions?: { width: number; height: number },
) => {
  const sourceWidth = dimensions ? Math.max(1, Math.round(dimensions.width)) : null;
  const sourceHeight = dimensions ? Math.max(1, Math.round(dimensions.height)) : null;
  const displayWidth = sourceWidth ? Math.min(sourceWidth, WECHAT_ARTICLE_WIDTH) : null;
  const displayHeight =
    sourceWidth && sourceHeight && displayWidth
      ? Math.max(1, Math.round((sourceHeight * displayWidth) / sourceWidth))
      : null;
  const sizeAttributes =
    displayWidth && displayHeight ? ` width="${displayWidth}" height="${displayHeight}"` : '';
  const widthStyle = displayWidth ? `width:${displayWidth}px;` : 'width:auto;';

  return `<img ${PRESERVE_LAYOUT_ATTR}="true" src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}"${sizeAttributes} style="display:block;${widthStyle}max-width:100%;height:auto;margin:16px auto;border:0;vertical-align:top;" />`;
};

export const replaceMermaidBlocksWithImages = async (
  root: HTMLElement,
  theme: PreviewTheme,
  sourceRoot: HTMLElement = root,
) => {
  const mermaidBlocks = Array.from(
    root.querySelectorAll<HTMLElement>('[data-copy-role="mermaid-block"]'),
  );
  const sourceBlocks = Array.from(
    sourceRoot.querySelectorAll<HTMLElement>('[data-copy-role="mermaid-block"]'),
  );
  if (mermaidBlocks.length === 0) return false;
  let convertedCount = 0;

  for (let batchStart = 0; batchStart < mermaidBlocks.length; batchStart += MERMAID_IMAGE_BATCH_SIZE) {
    const batch = mermaidBlocks.slice(batchStart, batchStart + MERMAID_IMAGE_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (block, batchIndex) => {
        const blockIndex = batchStart + batchIndex;
        const sourceSvg = sourceBlocks[blockIndex]
          ? Array.from(sourceBlocks[blockIndex].querySelectorAll<SVGElement>('svg')).find(isMermaidSvg)
          : null;
        const svg = sourceSvg ?? Array.from(block.querySelectorAll<SVGElement>('svg')).find(isMermaidSvg);
        if (!svg) return;
        const trimRect =
          sourceSvg instanceof SVGSVGElement ? getRenderedMermaidTrimRect(sourceSvg) : null;
        const capture = await svgToPngCapture(svg, theme, trimRect);
        const imageUrl = await blobToDataUrl(capture.blob);
        const imageWrapper = document.createElement('div');
        imageWrapper.innerHTML = createResponsiveImageHtml(imageUrl, '', capture);
        const replacement = imageWrapper.firstElementChild;
        const body = block.querySelector<HTMLElement>(':scope > .aad-collapsible-body');
        const bodyInner = block.querySelector<HTMLElement>(':scope > .aad-collapsible-body .aad-collapsible-body-inner');
        const replaceTarget =
          bodyInner ??
          (block.parentElement?.tagName.toLowerCase() === 'pre' ? block.parentElement : block);

        if (replacement) {
          if (body) {
            body.style.setProperty('display', 'block');
            body.style.setProperty('grid-template-rows', 'none');
            body.style.setProperty('height', 'auto');
            body.style.setProperty('min-height', '0');
            body.style.setProperty('overflow', 'visible');
            body.style.setProperty('opacity', '1');
            body.style.setProperty('visibility', 'visible');
          }
          if (bodyInner) {
            bodyInner.style.setProperty('display', 'block');
            bodyInner.style.setProperty('height', 'auto');
            bodyInner.style.setProperty('min-height', '0');
            bodyInner.style.setProperty('overflow', 'visible');
            bodyInner.replaceChildren(replacement);
          } else if (replaceTarget === block || replaceTarget.tagName.toLowerCase() === 'pre') {
            replaceTarget.replaceWith(replacement);
          } else {
            replaceTarget.replaceChildren(replacement);
          }
        }
      }),
    );

    convertedCount += results.filter((r) => r.status === 'fulfilled').length;
  }

  if (convertedCount === 0 && mermaidBlocks.length > 0) {
    throw new Error(`Failed to convert all ${mermaidBlocks.length} Mermaid diagram(s) to image for rich copy`);
  }

  return convertedCount > 0;
};

export const getMermaidSvgs = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<SVGElement>('[data-copy-role="mermaid-block"] svg')).filter(
    isMermaidSvg,
  );

export const getMermaidRenderStatus = (
  root: HTMLElement,
  expectedTheme?: PreviewTheme,
): MermaidRenderStatus => {
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>('[data-copy-role="mermaid-block"]'),
  );
  let ready = 0;
  let error = 0;

  blocks.forEach((block) => {
    if (block.dataset.mermaidReady === 'error') {
      error++;
      return;
    }

    const hasExpectedTheme = !expectedTheme || block.dataset.mermaidTheme === expectedTheme;
    const svg = Array.from(block.querySelectorAll<SVGElement>('svg')).find(isMermaidSvg);
    if (svg && hasExpectedTheme) {
      ready++;
    }
  });

  return {
    total: blocks.length,
    ready,
    error,
    pending: Math.max(0, blocks.length - ready - error),
  };
};

export const getMermaidCompleteCount = (status: MermaidRenderStatus) => status.ready + status.error;

const unionCaptureRects = (first: CaptureRect | null, second: CaptureRect): CaptureRect => {
  if (!first) return second;

  const left = Math.min(first.x, second.x);
  const top = Math.min(first.y, second.y);
  const right = Math.max(first.x + first.width, second.x + second.width);
  const bottom = Math.max(first.y + first.height, second.y + second.height);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
};

export const getRenderedMermaidTrimRect = (svg: SVGSVGElement): CaptureRect | null => {
  const svgBounds = svg.getBoundingClientRect();
  const logicalRect = getSvgLogicalRect(svg);
  if (!isUsableSvgRect(logicalRect) || svgBounds.width <= 0 || svgBounds.height <= 0) {
    return null;
  }

  let renderedBounds: CaptureRect | null = null;
  const elements = Array.from(
    svg.querySelectorAll<SVGGraphicsElement>(MERMAID_RENDERED_CONTENT_SELECTOR),
  );

  elements.forEach((element) => {
    if (element.closest('defs, clipPath, mask, marker, pattern, symbol')) return;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    renderedBounds = unionCaptureRects(renderedBounds, {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  });

  if (!renderedBounds) return null;

  const scaleX = logicalRect.width / svgBounds.width;
  const scaleY = logicalRect.height / svgBounds.height;
  return {
    x: logicalRect.x + (renderedBounds.x - svgBounds.x) * scaleX,
    y: logicalRect.y + (renderedBounds.y - svgBounds.y) * scaleY,
    width: renderedBounds.width * scaleX,
    height: renderedBounds.height * scaleY,
  };
};

const getStandaloneMermaidDisplayMetrics = (
  svg: SVGSVGElement | null | undefined,
): MermaidDisplayMetrics | null => {
  if (!svg) return null;

  const renderedRect = svg.getBoundingClientRect();
  if (renderedRect.width > 0 && renderedRect.height > 0) {
    return {
      width: Math.max(1, Math.ceil(renderedRect.width)),
      height: Math.max(1, Math.ceil(renderedRect.height)),
    };
  }

  const logicalRect = getSvgLogicalRect(svg);
  if (!isUsableSvgRect(logicalRect)) return null;

  return {
    width: Math.max(1, Math.ceil(logicalRect.width)),
    height: Math.max(1, Math.ceil(logicalRect.height)),
  };
};

const finalizeStandaloneMermaidSvg = (
  staticSvg: SVGSVGElement,
  idPrefix: string,
  displayMetrics: MermaidDisplayMetrics | null = null,
) => {
  const rect = getSvgLogicalRect(staticSvg);
  if (!isUsableSvgRect(rect)) return null;

  const width = Math.max(1, Math.ceil(rect.width));
  const height = Math.max(1, Math.ceil(rect.height));
  const displayWidth = displayMetrics?.width ?? width;
  const displayHeight = displayMetrics?.height ?? height;
  stabilizeStandaloneSvgIds(staticSvg, idPrefix);
  staticSvg.setAttribute(PRESERVE_LAYOUT_ATTR, 'true');
  staticSvg.setAttribute(STANDALONE_MERMAID_SIZE_ATTR, 'true');
  staticSvg.setAttribute('width', String(width));
  staticSvg.setAttribute('height', String(height));
  staticSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  staticSvg.style.removeProperty('max-width');
  staticSvg.style.setProperty('display', 'block');
  staticSvg.style.setProperty('width', '100%');
  staticSvg.style.setProperty('max-width', `${displayWidth}px`);
  staticSvg.style.setProperty('height', 'auto');
  staticSvg.style.setProperty('aspect-ratio', `${displayWidth} / ${displayHeight}`);
  staticSvg.style.setProperty('margin', '0 auto');

  return { svg: staticSvg, width: displayWidth, height: displayHeight };
};

const createStandaloneMermaidZoomButton = (
  action: 'in' | 'out' | 'reset',
  label: string,
  iconPath: string,
) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className =
    action === 'reset'
      ? 'aad-icon-button p-1 aad-standalone-mermaid-zoom-button'
      : 'aad-icon-button p-1 disabled:opacity-30 aad-standalone-mermaid-zoom-button';
  button.setAttribute('data-morndraft-standalone-mermaid-zoom-action', action);
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  button.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">${iconPath}</svg>`;
  return button;
};

const createStandaloneMermaidToolbar = () => {
  const toolbar = document.createElement('div');
  toolbar.className = 'aad-mermaid-toolbar';
  toolbar.setAttribute('data-morndraft-standalone-mermaid-toolbar', 'true');
  toolbar.append(
    createStandaloneMermaidZoomButton(
      'in',
      'Zoom in',
      '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path><path d="M11 8v6"></path><path d="M8 11h6"></path>',
    ),
    createStandaloneMermaidZoomButton(
      'out',
      'Zoom out',
      '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path><path d="M8 11h6"></path>',
    ),
    createStandaloneMermaidZoomButton(
      'reset',
      'Reset zoom',
      '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 3v6h6"></path>',
    ),
  );
  const value = document.createElement('span');
  value.className = 'aad-standalone-mermaid-zoom-value';
  value.setAttribute('data-morndraft-standalone-mermaid-zoom-value', 'true');
  value.textContent = '100%';
  toolbar.append(value);
  return toolbar;
};

const attachStandaloneMermaidToolbar = (block: HTMLElement) => {
  const header = block.querySelector<HTMLElement>(':scope > .aad-block-header');
  if (!header || header.querySelector('[data-morndraft-standalone-mermaid-toolbar]')) return;
  const target = header.querySelector<HTMLElement>('.aad-block-header-main') ?? header;
  target.append(createStandaloneMermaidToolbar());
};

const createStandaloneMermaidZoomFrame = (
  standalone: NonNullable<ReturnType<typeof finalizeStandaloneMermaidSvg>>,
) => {
  const viewport = document.createElement('div');
  viewport.className = 'aad-standalone-mermaid-viewport';
  viewport.setAttribute(PRESERVE_LAYOUT_ATTR, 'true');
  viewport.setAttribute('data-morndraft-standalone-mermaid-viewport', 'true');
  viewport.setAttribute('data-morndraft-standalone-mermaid-pannable', 'false');

  const spacer = document.createElement('div');
  spacer.className = 'aad-standalone-mermaid-spacer';
  spacer.setAttribute(PRESERVE_LAYOUT_ATTR, 'true');
  spacer.setAttribute('data-morndraft-standalone-mermaid-spacer', 'true');

  const stage = document.createElement('div');
  stage.className = 'aad-standalone-mermaid-stage';
  stage.setAttribute(PRESERVE_LAYOUT_ATTR, 'true');
  stage.setAttribute('data-morndraft-standalone-mermaid-stage', 'true');
  stage.style.width = `${standalone.width}px`;
  stage.style.height = `${standalone.height}px`;
  stage.append(standalone.svg);

  spacer.append(stage);
  viewport.append(spacer);
  return viewport;
};

const parseStandaloneMermaidSvgMarkup = (svgMarkup: string) => {
  const template = document.createElement('template');
  template.innerHTML = svgMarkup.trim();
  return template.content.querySelector<SVGSVGElement>('svg');
};

const createStandaloneMermaidSvg = (
  svg: SVGSVGElement,
  theme: PreviewTheme,
  idPrefix: string,
  displayMetrics: MermaidDisplayMetrics | null,
) => {
  const normalized = normalizeMermaidSvg(svg.outerHTML, theme);
  const staticSvg = parseStandaloneMermaidSvgMarkup(normalized);
  return staticSvg ? finalizeStandaloneMermaidSvg(staticSvg, idPrefix, displayMetrics) : null;
};

const createFallbackStandaloneMermaidSvg = (
  svg: SVGSVGElement,
  idPrefix: string,
  displayMetrics: MermaidDisplayMetrics | null,
) => finalizeStandaloneMermaidSvg(svg.cloneNode(true) as SVGSVGElement, idPrefix, displayMetrics);

export const flattenStandaloneMermaidBlocks = (
  sourceRoot: HTMLElement,
  clone: HTMLElement,
  theme: PreviewTheme,
) => {
  const blocks = Array.from(
    clone.querySelectorAll<HTMLElement>('[data-copy-role="mermaid-block"]'),
  );
  const liveBlocks = Array.from(
    sourceRoot.querySelectorAll<HTMLElement>('[data-copy-role="mermaid-block"]'),
  );

  blocks.forEach((block, index) => {
    const svg = Array.from(block.querySelectorAll<SVGElement>('svg')).find(isMermaidSvg);
    if (!svg) return;
    const idPrefix = `artifact-mermaid-${index + 1}-`;

    const liveBlock = liveBlocks[index];
    const liveSvg = liveBlock
      ? Array.from(liveBlock.querySelectorAll<SVGElement>('svg')).find(isMermaidSvg)
      : null;
    const displayMetrics = getStandaloneMermaidDisplayMetrics(liveSvg ?? svg);

    let standalone: ReturnType<typeof createStandaloneMermaidSvg> = null;
    try {
      standalone = createStandaloneMermaidSvg(svg, theme, idPrefix, displayMetrics);
    } catch {
      standalone = null;
    }

    if (!standalone) {
      try {
        standalone = createFallbackStandaloneMermaidSvg(svg, idPrefix, displayMetrics);
      } catch {
        standalone = null;
      }
    }

    if (!standalone) return;

    try {
      block.setAttribute('data-morndraft-standalone-mermaid-zoom', 'true');
      block.setAttribute('data-morndraft-standalone-mermaid-scale', '1');
      block.setAttribute('data-morndraft-standalone-mermaid-width', String(standalone.width));
      block.setAttribute('data-morndraft-standalone-mermaid-height', String(standalone.height));
      attachStandaloneMermaidToolbar(block);
      const replaceTarget = svg.closest('.mermaid-container') ?? svg.parentElement;
      replaceTarget?.replaceWith(createStandaloneMermaidZoomFrame(standalone));
    } catch {
      // Leave original svg if normalization fails.
    }
    Array.from(block.attributes).forEach((attr) => {
      if (attr.name.startsWith('data-copy-')) {
        block.removeAttribute(attr.name);
      }
    });
  });
};
