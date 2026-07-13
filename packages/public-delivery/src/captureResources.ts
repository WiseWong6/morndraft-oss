import { PublicDeliveryError } from './types';
import { findPortableCssImportOccurrences } from './portableCss';

const PUBLIC_CAPTURE_RESOURCE_TIMEOUT_MS = 10_000;
const PUBLIC_CAPTURE_MAX_REMOTE_RESOURCES = 100;
const PUBLIC_CAPTURE_MAX_RESOURCE_BYTES = 25 * 1024 * 1024;
const PUBLIC_CAPTURE_MAX_TOTAL_RESOURCE_BYTES = 50 * 1024 * 1024;

export const PUBLIC_CAPTURE_FAILED_RESOURCE_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=#morndraft-capture-resource-failed';

const RESOURCE_STYLE_PROPERTIES = [
  'background-image',
  'border-image-source',
  'clip-path',
  'content',
  'cursor',
  'fill',
  'filter',
  'list-style-image',
  'marker',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask-border-source',
  'mask-image',
  'offset-path',
  'shape-outside',
  'stroke',
  '-webkit-box-reflect',
  '-webkit-clip-path',
  '-webkit-mask-box-image-source',
  '-webkit-mask-image',
] as const;

const failResourceCapture = (cause?: unknown): never => {
  throw new PublicDeliveryError(
    'capture-failed',
    '预览包含浏览器无法安全读取的远程资源，未生成缺图的交付产物；请检查资源的 CORS 设置。',
    cause === undefined ? undefined : { cause },
  );
};

type PublicCssValue = { nextIndex: number; value: string };

const isPublicCssNameCharacter = (value: string) => /[\w-]/u.test(value);

const skipPublicCssTrivia = (cssText: string, startIndex: number) => {
  let index = startIndex;
  while (index < cssText.length) {
    if (/\s/u.test(cssText[index])) {
      index += 1;
      continue;
    }
    if (cssText[index] === '/' && cssText[index + 1] === '*') {
      const commentEnd = cssText.indexOf('*/', index + 2);
      if (commentEnd === -1) return cssText.length;
      index = commentEnd + 2;
      continue;
    }
    break;
  }
  return index;
};

const readPublicCssString = (cssText: string, startIndex: number): PublicCssValue | null => {
  const quote = cssText[startIndex];
  if (quote !== '"' && quote !== "'") return null;
  let index = startIndex + 1;
  while (index < cssText.length) {
    if (cssText[index] === '\\') {
      index += 2;
      continue;
    }
    if (cssText[index] === quote) {
      return {
        nextIndex: index + 1,
        value: cssText.slice(startIndex + 1, index),
      };
    }
    index += 1;
  }
  return null;
};

const readPublicCssUrl = (cssText: string, startIndex: number): PublicCssValue | null => {
  if (cssText.slice(startIndex, startIndex + 3).toLowerCase() !== 'url') return null;
  let index = startIndex + 3;
  if (cssText[index] !== '(') return null;
  index = skipPublicCssTrivia(cssText, index + 1);
  const quoted = readPublicCssString(cssText, index);
  if (quoted) {
    const closingIndex = skipPublicCssTrivia(cssText, quoted.nextIndex);
    if (cssText[closingIndex] !== ')') return null;
    return { nextIndex: closingIndex + 1, value: quoted.value.trim() };
  }

  const valueStart = index;
  while (index < cssText.length) {
    if (cssText[index] === '\\') {
      index += 2;
      continue;
    }
    if (cssText[index] === ')') {
      return {
        nextIndex: index + 1,
        value: cssText.slice(valueStart, index).trim(),
      };
    }
    index += 1;
  }
  return null;
};

export const extractPublicCssResourceUrls = (cssText: string) => {
  const urls: string[] = [];
  let index = 0;
  while (index < cssText.length) {
    const nextMeaningfulIndex = skipPublicCssTrivia(cssText, index);
    if (nextMeaningfulIndex !== index) {
      index = nextMeaningfulIndex;
      continue;
    }
    const beginsString = cssText[index] === '"' || cssText[index] === "'";
    const stringValue = beginsString ? readPublicCssString(cssText, index) : null;
    if (beginsString) {
      if (!stringValue) break;
      index = stringValue.nextIndex;
      continue;
    }
    const previous = index > 0 ? cssText[index - 1] : '';
    const urlValue = !isPublicCssNameCharacter(previous)
      ? readPublicCssUrl(cssText, index)
      : null;
    if (urlValue) {
      if (urlValue.value) urls.push(urlValue.value);
      index = urlValue.nextIndex;
      continue;
    }
    index += 1;
  }
  return urls;
};

export const extractPublicCssImportUrls = (cssText: string) => {
  const urls: string[] = [];
  let index = 0;
  while (index < cssText.length) {
    const nextMeaningfulIndex = skipPublicCssTrivia(cssText, index);
    if (nextMeaningfulIndex !== index) {
      index = nextMeaningfulIndex;
      continue;
    }
    const beginsString = cssText[index] === '"' || cssText[index] === "'";
    const stringValue = beginsString ? readPublicCssString(cssText, index) : null;
    if (beginsString) {
      if (!stringValue) break;
      index = stringValue.nextIndex;
      continue;
    }
    const previous = index > 0 ? cssText[index - 1] : '';
    const nestedUrl = !isPublicCssNameCharacter(previous)
      ? readPublicCssUrl(cssText, index)
      : null;
    if (nestedUrl) {
      index = nestedUrl.nextIndex;
      continue;
    }
    const importEnd = index + '@import'.length;
    const isImport = cssText.slice(index, importEnd).toLowerCase() === '@import'
      && !isPublicCssNameCharacter(cssText[importEnd] ?? '');
    if (!isImport) {
      index += 1;
      continue;
    }

    const valueStart = skipPublicCssTrivia(cssText, importEnd);
    const importedValue = readPublicCssString(cssText, valueStart)
      ?? readPublicCssUrl(cssText, valueStart);
    if (importedValue?.value) urls.push(importedValue.value);
    index = importedValue?.nextIndex ?? Math.max(valueStart, importEnd + 1);
  }
  return urls;
};

export const extractPublicSrcsetUrls = (srcset: string) => {
  const urls: string[] = [];
  let position = 0;
  while (position < srcset.length) {
    while (position < srcset.length && /[\s,]/u.test(srcset[position])) position += 1;
    if (position >= srcset.length) break;

    const urlStart = position;
    while (position < srcset.length && !/\s/u.test(srcset[position])) position += 1;
    let url = srcset.slice(urlStart, position);
    let endedWithSeparator = false;
    while (url.endsWith(',')) {
      endedWithSeparator = true;
      url = url.slice(0, -1);
    }
    if (url) urls.push(url);
    if (endedWithSeparator) continue;

    let parentheses = 0;
    while (position < srcset.length) {
      const character = srcset[position];
      if (character === '(') parentheses += 1;
      else if (character === ')' && parentheses > 0) parentheses -= 1;
      else if (character === ',' && parentheses === 0) {
        position += 1;
        break;
      }
      position += 1;
    }
  }
  return urls;
};

const isEmbeddedCaptureResource = (value: string) => {
  const normalized = value.trim().replace(/^['"]|['"]$/gu, '');
  return !normalized || normalized.startsWith('#') || /^(?:data|blob|about):/iu.test(normalized);
};

const normalizeFetchableResource = (value: string, baseUrl: string) => {
  if (isEmbeddedCaptureResource(value)) return null;
  try {
    const url = new URL(value, baseUrl);
    if (!/^https?:$/u.test(url.protocol)) failResourceCapture();
    url.hash = '';
    return url.href;
  } catch (error) {
    if (error instanceof PublicDeliveryError) throw error;
    return failResourceCapture(error);
  }
};

const collectElementResourceUrls = (root: HTMLElement) => {
  const values = new Set<string>();
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  const view = root.ownerDocument.defaultView;

  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'img' || tagName === 'input') {
      const image = element as HTMLImageElement;
      const src = image.currentSrc || image.getAttribute('src') || '';
      if (src) values.add(src);
      for (const candidate of extractPublicSrcsetUrls(image.getAttribute('srcset') ?? '')) {
        values.add(candidate);
      }
    } else if (tagName === 'video') {
      const poster = (element as HTMLVideoElement).poster || element.getAttribute('poster') || '';
      if (poster) values.add(poster);
    } else if (tagName === 'source') {
      const src = element.getAttribute('src') || '';
      if (src) values.add(src);
      for (const candidate of extractPublicSrcsetUrls(element.getAttribute('srcset') ?? '')) {
        values.add(candidate);
      }
    } else if (tagName === 'image' || tagName === 'use' || tagName === 'feimage') {
      const href = element.getAttribute('href') || element.getAttribute('xlink:href') || '';
      if (href) values.add(href);
    }

    if (!view) continue;
    for (const pseudo of [null, '::before', '::after'] as const) {
      let style: CSSStyleDeclaration;
      try {
        style = view.getComputedStyle(element, pseudo);
      } catch {
        continue;
      }
      for (const property of RESOURCE_STYLE_PROPERTIES) {
        for (const url of extractPublicCssResourceUrls(style.getPropertyValue(property))) values.add(url);
      }
    }
  }
  return values;
};

type PublicStylesheetReference = { baseUrl: string; value: string };

type PublicStylesheetElement = Element & {
  disabled?: boolean;
  media?: string;
  sheet?: CSSStyleSheet | null;
};

const isScreenMediaActive = (doc: Document, mediaText: string) => {
  const normalized = mediaText.trim();
  if (!normalized) return true;
  const view = doc.defaultView;
  if (view?.matchMedia) {
    try {
      return view.matchMedia(normalized).matches;
    } catch {
      // Fall back to media-type detection for incomplete DOM implementations.
    }
  }
  return normalized.split(',').some(query => {
    const value = query.trim().toLowerCase();
    if (!value || value === 'all' || value.startsWith('screen') || value.startsWith('only screen')) {
      return true;
    }
    if (value.startsWith('print') || value.startsWith('only print') || value.startsWith('not screen')) {
      return false;
    }
    return !value.startsWith('not all');
  });
};

const readPublicCssIdentifier = (cssText: string, startIndex: number) => {
  const match = /^-?[_a-z][\w-]*/iu.exec(cssText.slice(startIndex));
  return match ? { nextIndex: startIndex + match[0].length, value: match[0].toLowerCase() } : null;
};

const skipPublicCssFunction = (cssText: string, startIndex: number, name: string) => {
  if (cssText.slice(startIndex, startIndex + name.length).toLowerCase() !== name) return null;
  let index = startIndex + name.length;
  if (cssText[index] !== '(') return null;
  let depth = 1;
  index += 1;
  while (index < cssText.length) {
    const character = cssText[index];
    if (character === '"' || character === "'") {
      const value = readPublicCssString(cssText, index);
      if (!value) return null;
      index = value.nextIndex;
      continue;
    }
    if (character === '/' && cssText[index + 1] === '*') {
      const commentEnd = cssText.indexOf('*/', index + 2);
      if (commentEnd === -1) return null;
      index = commentEnd + 2;
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
    index += 1;
  }
  return null;
};

const hasBalancedPublicCssStructure = (cssText: string) => {
  let depth = 0;
  let index = 0;
  while (index < cssText.length) {
    const character = cssText[index];
    if (character === '"' || character === "'") {
      const value = readPublicCssString(cssText, index);
      if (!value) return false;
      index = value.nextIndex;
      continue;
    }
    if (character === '/' && cssText[index + 1] === '*') {
      const commentEnd = cssText.indexOf('*/', index + 2);
      if (commentEnd === -1) return false;
      index = commentEnd + 2;
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') {
      if (depth === 0) return false;
      depth -= 1;
    } else if (character === '{' || character === '}' || character === ';' || character === '@') {
      return false;
    }
    index += 1;
  }
  return depth === 0;
};

const hasClearlyParsedMediaQuery = (mediaText: string) => {
  if (!hasBalancedPublicCssStructure(mediaText)) return false;
  let index = skipPublicCssTrivia(mediaText, 0);
  if (index >= mediaText.length) return false;
  if (mediaText[index] === '(') return skipPublicCssFunction(mediaText, index, '') !== null;
  const firstIdentifier = readPublicCssIdentifier(mediaText, index);
  if (!firstIdentifier) return false;
  if (firstIdentifier.value !== 'not' && firstIdentifier.value !== 'only') return true;
  index = skipPublicCssTrivia(mediaText, firstIdentifier.nextIndex);
  return mediaText[index] === '('
    ? skipPublicCssFunction(mediaText, index, '') !== null
    : readPublicCssIdentifier(mediaText, index) !== null;
};

const getPublicCssImportMedia = (condition: string) => {
  let index = skipPublicCssTrivia(condition, 0);
  const layer = readPublicCssIdentifier(condition, index);
  if (layer?.value === 'layer') {
    const functionalEnd = skipPublicCssFunction(condition, index, 'layer');
    if (condition[layer.nextIndex] === '(' && functionalEnd === null) return null;
    index = skipPublicCssTrivia(condition, functionalEnd ?? layer.nextIndex);
  }
  const supports = readPublicCssIdentifier(condition, index);
  const supportsEnd = skipPublicCssFunction(condition, index, 'supports');
  if (supports?.value === 'supports' && condition[supports.nextIndex] === '(' && supportsEnd === null) {
    return null;
  }
  if (supportsEnd !== null) index = skipPublicCssTrivia(condition, supportsEnd);
  const mediaText = condition.slice(index).trim();
  if (!mediaText) return '';
  return hasClearlyParsedMediaQuery(mediaText) ? mediaText : null;
};

const shouldPreflightFetchedImport = (
  doc: Document,
  condition: string,
  cssomParsed: boolean,
) => {
  if (!cssomParsed) return true;
  const mediaText = getPublicCssImportMedia(condition);
  return mediaText === null || mediaText === '' || isScreenMediaActive(doc, mediaText);
};

const getStylesheetElementMedia = (element: PublicStylesheetElement) => (
  element.getAttribute('media') ?? (typeof element.media === 'string' ? element.media : '')
);

const getStylesheetMedia = (sheet: CSSStyleSheet) => {
  try {
    return sheet.media?.mediaText ?? '';
  } catch {
    return '';
  }
};

const isStylesheetActive = (doc: Document, sheet: CSSStyleSheet) => {
  if (sheet.disabled || !isScreenMediaActive(doc, getStylesheetMedia(sheet))) return false;
  const owner = sheet.ownerNode as PublicStylesheetElement | null;
  if (!owner || typeof owner.getAttribute !== 'function') return true;
  return !owner.disabled && isScreenMediaActive(doc, getStylesheetElementMedia(owner));
};

const isStylesheetElementActive = (doc: Document, element: PublicStylesheetElement) => {
  if (element.disabled || !isScreenMediaActive(doc, getStylesheetElementMedia(element))) return false;
  return !element.sheet || isStylesheetActive(doc, element.sheet);
};

const getRuleMediaText = (rule: CSSRule) => {
  const media = (rule as CSSRule & { media?: { mediaText?: unknown } }).media;
  return typeof media?.mediaText === 'string' ? media.mediaText : '';
};

const getRuleDeclarationText = (rule: CSSRule) => {
  const style = (rule as CSSRule & { style?: { cssText?: unknown } }).style;
  return typeof style?.cssText === 'string' ? style.cssText : '';
};

const collectRuleImportUrls = (
  doc: Document,
  rules: CSSRuleList | readonly CSSRule[],
  baseUrl: string,
  stylesheetReferences: PublicStylesheetReference[],
  assetReferences: PublicStylesheetReference[],
) => {
  for (const rule of Array.from(rules)) {
    const mediaText = getRuleMediaText(rule);
    if (mediaText && !isScreenMediaActive(doc, mediaText)) continue;
    const href = 'href' in rule && typeof rule.href === 'string' ? rule.href : '';
    if (href) stylesheetReferences.push({ baseUrl, value: href });
    const declarationText = getRuleDeclarationText(rule);
    for (const value of extractPublicCssResourceUrls(declarationText)) {
      assetReferences.push({ baseUrl, value });
    }
    if ('cssRules' in rule) {
      const nestedRules = (rule as CSSGroupingRule).cssRules;
      if (nestedRules) {
        collectRuleImportUrls(
          doc,
          nestedRules,
          baseUrl,
          stylesheetReferences,
          assetReferences,
        );
      }
      continue;
    }
    for (const value of extractPublicCssImportUrls(rule.cssText)) {
      stylesheetReferences.push({ baseUrl, value });
    }
    if (!declarationText) {
      for (const value of extractPublicCssResourceUrls(rule.cssText)) {
        assetReferences.push({ baseUrl, value });
      }
    }
  }
};

type PublicCssStyleSheetConstructor = new () => CSSStyleSheet;

const parseFetchedStylesheetReferences = async (
  doc: Document,
  cssText: string,
  baseUrl: string,
) => {
  const view = doc.defaultView as (Window & {
    CSSStyleSheet?: PublicCssStyleSheetConstructor;
  }) | null;
  const StyleSheetConstructor = view?.CSSStyleSheet;
  if (typeof StyleSheetConstructor !== 'function') return null;
  try {
    const sheet = new StyleSheetConstructor();
    if (typeof sheet.replace !== 'function') return null;
    await sheet.replace(cssText);
    const stylesheetReferences: PublicStylesheetReference[] = [];
    const assetReferences: PublicStylesheetReference[] = [];
    collectRuleImportUrls(
      doc,
      sheet.cssRules,
      baseUrl,
      stylesheetReferences,
      assetReferences,
    );
    return { assetReferences, stylesheetReferences };
  } catch {
    // Constructable stylesheets are unavailable in some browsers and reject
    // some otherwise tolerated author CSS. Falling back must remain fail-closed.
    return null;
  }
};

const collectDocumentStylesheetReferences = (doc: Document) => {
  const stylesheetReferences: PublicStylesheetReference[] = [];
  const assetReferences: PublicStylesheetReference[] = [];
  for (const link of Array.from(doc.querySelectorAll?.('link[rel~="stylesheet"][href]') ?? [])) {
    if (!isStylesheetElementActive(doc, link as PublicStylesheetElement)) continue;
    const value = link.getAttribute('href') ?? '';
    if (value) stylesheetReferences.push({ baseUrl: doc.baseURI, value });
  }
  for (const style of Array.from(doc.querySelectorAll?.('style') ?? [])) {
    const stylesheetElement = style as PublicStylesheetElement;
    if (!isStylesheetElementActive(doc, stylesheetElement)) continue;
    if (stylesheetElement.sheet) {
      try {
        collectRuleImportUrls(
          doc,
          stylesheetElement.sheet.cssRules,
          stylesheetElement.sheet.href || doc.baseURI,
          stylesheetReferences,
          assetReferences,
        );
        continue;
      } catch {
        // Invalid/incomplete DOM implementations fall back to conservative raw
        // scanning below instead of silently omitting author resources.
      }
    }
    const cssText = style.textContent ?? '';
    for (const value of extractPublicCssImportUrls(cssText)) {
      stylesheetReferences.push({ baseUrl: doc.baseURI, value });
    }
    for (const value of extractPublicCssResourceUrls(cssText)) {
      assetReferences.push({ baseUrl: doc.baseURI, value });
    }
  }
  for (const sheet of Array.from(doc.styleSheets ?? [])) {
    if (!isStylesheetActive(doc, sheet)) continue;
    const baseUrl = sheet.href || doc.baseURI;
    if (sheet.href) stylesheetReferences.push({ baseUrl: doc.baseURI, value: sheet.href });
    try {
      collectRuleImportUrls(doc, sheet.cssRules, baseUrl, stylesheetReferences, assetReferences);
    } catch {
      // Cross-origin cssRules are deliberately unreadable. Fetching sheet.href
      // below with mode:cors is the fail-closed readability check.
    }
  }
  return { assetReferences, stylesheetReferences };
};

const collectAccessibleCaptureRoots = (root: HTMLElement) => {
  const roots: HTMLElement[] = [];
  const seenDocuments = new Set<Document>();
  const visit = (candidate: HTMLElement) => {
    const doc = candidate.ownerDocument;
    if (seenDocuments.has(doc)) return;
    seenDocuments.add(doc);
    roots.push(candidate);
    for (const frame of Array.from(candidate.querySelectorAll('iframe'))) {
      try {
        const nestedRoot = frame.contentDocument?.documentElement;
        if (nestedRoot) visit(nestedRoot);
      } catch {
        // Opaque/cross-origin author frames are handled by the static srcdoc
        // capture path; only documents the browser lets us read are scanned.
      }
    }
  };
  visit(root);
  return roots;
};

const fetchCaptureResource = async (
  view: Window,
  href: string,
  controller: AbortController,
  byteBudget: { consumedBytes: number },
  collectText = false,
) => {
  const resourceUrl = new URL(href);
  const currentOrigin = view.location?.origin;
  const response = await view.fetch(href, {
    cache: 'force-cache',
    credentials: currentOrigin && resourceUrl.origin === currentOrigin ? 'same-origin' : 'omit',
    mode: 'cors',
    signal: controller.signal,
  });
  if (!response.ok || response.type === 'opaque') failResourceCapture();
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  const abortForSizeLimit = (): never => {
    const error = new PublicDeliveryError(
      'capture-failed',
      '预览远程资源体积超过浏览器本地交付的安全上限，未生成交付产物。',
    );
    if (!controller.signal.aborted) controller.abort(error);
    throw error;
  };
  if (Number.isFinite(declaredSize) && declaredSize > 0) {
    if (
      declaredSize > PUBLIC_CAPTURE_MAX_RESOURCE_BYTES ||
      byteBudget.consumedBytes + declaredSize > PUBLIC_CAPTURE_MAX_TOTAL_RESOURCE_BYTES
    ) {
      abortForSizeLimit();
    }
  }

  const reader = response.body?.getReader();
  if (!reader) failResourceCapture();
  const decoder = collectText ? new TextDecoder() : null;
  const textChunks: string[] = [];
  let resourceBytes = 0;
  let completed = false;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        completed = true;
        break;
      }
      const chunkBytes = chunk.value.byteLength;
      resourceBytes += chunkBytes;
      byteBudget.consumedBytes += chunkBytes;
      if (
        resourceBytes > PUBLIC_CAPTURE_MAX_RESOURCE_BYTES ||
        byteBudget.consumedBytes > PUBLIC_CAPTURE_MAX_TOTAL_RESOURCE_BYTES
      ) {
        abortForSizeLimit();
      }
      if (decoder) textChunks.push(decoder.decode(chunk.value, { stream: true }));
    }
    if (decoder) textChunks.push(decoder.decode());
  } finally {
    if (!completed) {
      try {
        await reader.cancel(controller.signal.reason);
      } catch {
        // The shared AbortController may already have cancelled this stream.
      }
    }
    reader.releaseLock();
  }
  return collectText ? textChunks.join('') : undefined;
};

/**
 * Screenshot libraries commonly replace unreadable cross-origin assets with a
 * transparent pixel. Preflight every resource that can contribute pixels so a
 * successful capture can never silently mean "successful but missing images".
 */
export const assertPublicCaptureResourcesReadable = async (
  root: HTMLElement,
  externalSignal?: AbortSignal,
) => {
  const view = root.ownerDocument.defaultView;
  if (!view) failResourceCapture();
  if (externalSignal?.aborted) failResourceCapture(externalSignal.reason);

  const captureRoots = collectAccessibleCaptureRoots(root);
  const stylesheetCollections = captureRoots.map(captureRoot => ({
    doc: captureRoot.ownerDocument,
    ...collectDocumentStylesheetReferences(captureRoot.ownerDocument),
  }));
  const urls = [
    ...captureRoots.flatMap(captureRoot => (
      Array.from(collectElementResourceUrls(captureRoot), value => (
        normalizeFetchableResource(value, captureRoot.ownerDocument.baseURI)
      )).filter((value): value is string => Boolean(value))
    )),
    ...stylesheetCollections.flatMap(collection => (
      collection.assetReferences.map(reference => (
        normalizeFetchableResource(reference.value, reference.baseUrl)
      )).filter((value): value is string => Boolean(value))
    )),
  ];
  const assetUrls = new Set(urls);
  const knownUrls = new Set(assetUrls);
  const stylesheetTasks: Array<{ doc: Document; href: string }> = [];
  const scheduledStylesheets = new Map<Document, Set<string>>();
  const assertResourceCount = () => {
    if (knownUrls.size > PUBLIC_CAPTURE_MAX_REMOTE_RESOURCES) failResourceCapture();
  };
  const scheduleStylesheet = (doc: Document, href: string) => {
    knownUrls.add(href);
    assertResourceCount();
    let scheduledForDocument = scheduledStylesheets.get(doc);
    if (!scheduledForDocument) {
      scheduledForDocument = new Set<string>();
      scheduledStylesheets.set(doc, scheduledForDocument);
    }
    if (scheduledForDocument.has(href)) return;
    scheduledForDocument.add(href);
    stylesheetTasks.push({ doc, href });
  };
  const scheduleAsset = (href: string) => {
    knownUrls.add(href);
    assertResourceCount();
    assetUrls.add(href);
  };
  for (const collection of stylesheetCollections) {
    for (const reference of collection.stylesheetReferences) {
      const href = normalizeFetchableResource(reference.value, reference.baseUrl);
      if (href) scheduleStylesheet(collection.doc, href);
    }
  }
  assertResourceCount();
  if (knownUrls.size === 0) return;

  const controller = new AbortController();
  const abort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener('abort', abort, { once: true });
  const timeoutId = view.setTimeout(() => controller.abort(), PUBLIC_CAPTURE_RESOURCE_TIMEOUT_MS);
  try {
    // A small worker pool avoids turning a document with many images into an
    // unbounded burst of browser requests.
    const fetchedStylesheets = new Set<string>();
    const stylesheetTextCache = new Map<string, string>();
    let nextStylesheetIndex = 0;
    const byteBudget = { consumedBytes: 0 };
    while (nextStylesheetIndex < stylesheetTasks.length) {
      const task = stylesheetTasks[nextStylesheetIndex];
      nextStylesheetIndex += 1;
      const stylesheetUrl = task.href;
      fetchedStylesheets.add(stylesheetUrl);
      let cssText = stylesheetTextCache.get(stylesheetUrl);
      if (!stylesheetTextCache.has(stylesheetUrl)) {
        cssText = (await fetchCaptureResource(
          view,
          stylesheetUrl,
          controller,
          byteBudget,
          true,
        )) ?? '';
        stylesheetTextCache.set(stylesheetUrl, cssText);
      }

      const parsedReferences = await parseFetchedStylesheetReferences(
        task.doc,
        cssText ?? '',
        stylesheetUrl,
      );
      // Constructable CSSStyleSheet deliberately ignores @import. Parse those
      // occurrences from the fetched source, but only filter an explicit,
      // inactive media condition when CSSOM parsing succeeded for this realm.
      // Without CSSOM, keep fail-closed behavior and preflight every import.
      const importOccurrences = findPortableCssImportOccurrences(cssText ?? '');
      const parsedImportCounts = new Map<string, number>();
      for (const occurrence of importOccurrences) {
        parsedImportCounts.set(occurrence.value, (parsedImportCounts.get(occurrence.value) ?? 0) + 1);
        if (!shouldPreflightFetchedImport(task.doc, occurrence.condition, parsedReferences !== null)) {
          continue;
        }
        const importedUrl = normalizeFetchableResource(occurrence.value, stylesheetUrl);
        if (importedUrl) scheduleStylesheet(task.doc, importedUrl);
      }
      for (const importedValue of extractPublicCssImportUrls(cssText ?? '')) {
        const parsedCount = parsedImportCounts.get(importedValue) ?? 0;
        if (parsedCount > 0) {
          parsedImportCounts.set(importedValue, parsedCount - 1);
          continue;
        }
        const importedUrl = normalizeFetchableResource(importedValue, stylesheetUrl);
        if (importedUrl) scheduleStylesheet(task.doc, importedUrl);
      }
      for (const reference of parsedReferences?.stylesheetReferences ?? []) {
        const importedUrl = normalizeFetchableResource(reference.value, reference.baseUrl);
        if (importedUrl) scheduleStylesheet(task.doc, importedUrl);
      }
      const assetReferences = parsedReferences?.assetReferences
        ?? extractPublicCssResourceUrls(cssText ?? '').map(value => ({
          baseUrl: stylesheetUrl,
          value,
        }));
      for (const reference of assetReferences) {
        const assetUrl = normalizeFetchableResource(reference.value, reference.baseUrl);
        if (assetUrl) scheduleAsset(assetUrl);
      }
    }

    const remainingUrls = [...assetUrls].filter(url => !fetchedStylesheets.has(url));
    let nextAssetIndex = 0;
    const workers = Array.from({ length: Math.min(6, remainingUrls.length) }, async () => {
      while (nextAssetIndex < remainingUrls.length) {
        const index = nextAssetIndex;
        nextAssetIndex += 1;
        await fetchCaptureResource(view, remainingUrls[index], controller, byteBudget);
      }
    });
    await Promise.all(workers);
  } catch (error) {
    if (!controller.signal.aborted) controller.abort(error);
    if (controller.signal.reason instanceof PublicDeliveryError) throw controller.signal.reason;
    if (error instanceof PublicDeliveryError) throw error;
    failResourceCapture(error);
  } finally {
    view.clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abort);
  }
};

const hasNonEmbeddedCssResource = (cssText: string) => (
  extractPublicCssResourceUrls(cssText).some(value => !isEmbeddedCaptureResource(value))
);

/**
 * modern-screenshot catches individual embedding failures internally. Inspect
 * the final foreignObject tree and turn its placeholder/fallback behavior into
 * a hard failure before rasterization.
 */
export const assertPublicCaptureResourcesEmbedded = (svg: SVGElement) => {
  if (svg.outerHTML.includes(PUBLIC_CAPTURE_FAILED_RESOURCE_PLACEHOLDER)) failResourceCapture();

  for (const node of Array.from(svg.querySelectorAll<HTMLElement>('[style], style'))) {
    const cssText = node.tagName.toLowerCase() === 'style'
      ? node.textContent ?? ''
      : node.getAttribute('style') ?? '';
    if (hasNonEmbeddedCssResource(cssText)) failResourceCapture();
  }

  const attributeSelectors = [
    ['img[src]', 'src'],
    ['img[srcset]', 'srcset'],
    ['image[href]', 'href'],
    ['image[xlink\\:href]', 'xlink:href'],
    ['feImage[href]', 'href'],
    ['feImage[xlink\\:href]', 'xlink:href'],
    ['input[type="image"][src]', 'src'],
    ['link[rel="stylesheet"][href]', 'href'],
    ['source[src]', 'src'],
    ['source[srcset]', 'srcset'],
    ['use[href]', 'href'],
    ['use[xlink\\:href]', 'xlink:href'],
    ['video[poster]', 'poster'],
  ] as const;
  for (const [selector, attribute] of attributeSelectors) {
    for (const node of Array.from(svg.querySelectorAll(selector))) {
      const value = node.getAttribute(attribute) ?? '';
      const candidates = attribute === 'srcset' ? extractPublicSrcsetUrls(value) : [value];
      if (candidates.some(candidate => candidate && !isEmbeddedCaptureResource(candidate))) {
        failResourceCapture();
      }
    }
  }
};
