import { PublicDeliveryError } from './types';
import {
  findPublicSrcsetUrlOccurrences,
  scanPublicCssResources,
} from './captureResourceScanner';
import {
  inspectPublicCaptureResource,
  type PublicCaptureResourceFormat,
} from './captureResourceFormats';
import { hasPublicDynamicCaptureCss } from './dynamicMarkup';

const PUBLIC_CAPTURE_RESOURCE_TIMEOUT_MS = 10_000;
const PUBLIC_CAPTURE_MAX_REMOTE_RESOURCES = 100;
const PUBLIC_CAPTURE_MAX_RESOURCE_BYTES = 25 * 1024 * 1024;
const PUBLIC_CAPTURE_MAX_TOTAL_RESOURCE_BYTES = 50 * 1024 * 1024;

const assertCaptureStylesheetContentType = (contentType: string) => {
  const parameters = contentType.split(';');
  if (parameters.shift()?.trim().toLowerCase() !== 'text/css') failResourceCapture();
  for (const parameter of parameters) {
    const separator = parameter.indexOf('=');
    const name = (separator < 0 ? parameter : parameter.slice(0, separator)).trim().toLowerCase();
    if (name !== 'charset') continue;
    if (separator < 0) failResourceCapture();
    let charset = parameter.slice(separator + 1).trim();
    if (
      charset.length >= 2
      && ((charset[0] === '"' && charset.at(-1) === '"')
        || (charset[0] === "'" && charset.at(-1) === "'"))
    ) charset = charset.slice(1, -1).trim();
    const normalized = charset.toLowerCase();
    if (normalized !== 'utf-8' && normalized !== 'utf8') failResourceCapture();
  }
};

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

const failDynamicCaptureStylesheet = (): never => {
  throw new PublicDeliveryError(
    'capture-failed',
    '当前 HTML 包含脚本或动态媒体，浏览器无法安全生成与 Final 一致的图片；请下载 HTML 交付。',
  );
};

export const extractPublicCssResourceUrls = (cssText: string) => {
  const result = scanPublicCssResources(cssText);
  if (result.malformed) failResourceCapture();
  return result.occurrences.map(occurrence => occurrence.value).filter(Boolean);
};

export const extractPublicCssImportUrls = (cssText: string) => {
  const scan = scanPublicCssResources(cssText);
  if (scan.malformed) failResourceCapture();
  return scan.imports.map(occurrence => occurrence.value);
};

const extractPublicCssAssetUrls = (cssText: string) => {
  const scan = scanPublicCssResources(cssText);
  if (scan.malformed) failResourceCapture();
  // scanPublicCssResources consumes complete @import rules and never exposes
  // their URL again as a pixel/font occurrence.
  return scan.occurrences.map(occurrence => occurrence.value).filter(Boolean);
};

export const extractPublicSrcsetUrls = (srcset: string) => (
  findPublicSrcsetUrlOccurrences(srcset).map(occurrence => occurrence.value)
);

const isEmbeddedCaptureResource = (value: string) => {
  const normalized = value.trim().replace(/^['"]|['"]$/gu, '');
  return !normalized || normalized.startsWith('#') || /^about:/iu.test(normalized);
};

const normalizeFetchableResource = (value: string, baseUrl: string) => {
  if (isEmbeddedCaptureResource(value)) return null;
  try {
    const normalized = value.trim().replace(/^['"]|['"]$/gu, '');
    const url = new URL(normalized, baseUrl);
    if (url.protocol === 'blob:') failResourceCapture();
    if (!/^(?:data|https?):$/u.test(url.protocol)) failResourceCapture();
    url.hash = '';
    return url.href;
  } catch (error) {
    if (error instanceof PublicDeliveryError) throw error;
    return failResourceCapture(error);
  }
};

const getHexValue = (character: string | undefined) => {
  if (character === undefined) return -1;
  const code = character.charCodeAt(0);
  if (code >= 0x30 && code <= 0x39) return code - 0x30;
  if (code >= 0x41 && code <= 0x46) return code - 0x41 + 10;
  if (code >= 0x61 && code <= 0x66) return code - 0x61 + 10;
  return -1;
};

const getPercentDecodedByte = (value: string, index: number) => {
  const high = getHexValue(value[index + 1]);
  const low = getHexValue(value[index + 2]);
  if (high < 0 || low < 0) failResourceCapture();
  return (high << 4) | low;
};

const isBase64WhitespaceByte = (byte: number) => (
  byte === 0x09 || byte === 0x0a || byte === 0x0c || byte === 0x0d || byte === 0x20
);

const getBase64Sextet = (byte: number) => {
  if (byte >= 0x41 && byte <= 0x5a) return byte - 0x41;
  if (byte >= 0x61 && byte <= 0x7a) return byte - 0x61 + 26;
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30 + 52;
  if (byte === 0x2b) return 62;
  if (byte === 0x2f) return 63;
  return -1;
};

const scanBase64DataUrlBody = (value: string, maximumBytes: number) => {
  const maximumEncodedCharacters = Math.ceil(maximumBytes / 3) * 4;
  let characterCount = 0;
  let paddingCount = 0;
  let sawPadding = false;
  for (let index = 0; index < value.length;) {
    let byte: number;
    if (value[index] === '%') {
      byte = getPercentDecodedByte(value, index);
      index += 3;
    } else {
      byte = value.charCodeAt(index);
      // Any non-ASCII code point would survive UTF-8 decoding as a character
      // outside the forgiving-base64 alphabet, so reject it without allocating
      // an intermediate UTF-8 buffer.
      if (byte > 0x7f) failResourceCapture();
      index += 1;
    }
    if (isBase64WhitespaceByte(byte)) continue;
    if (byte === 0x3d) {
      sawPadding = true;
      paddingCount += 1;
      if (paddingCount > 2) failResourceCapture();
    } else {
      if (sawPadding || getBase64Sextet(byte) < 0) failResourceCapture();
    }
    characterCount += 1;
    // Padding can reduce a four-character quantum by up to two bytes, so only
    // reject while scanning once even a padded final quantum cannot fit. The
    // exact decoded size is checked below after padding has been validated.
    if (characterCount > maximumEncodedCharacters) failResourceCapture();
  }
  if (characterCount % 4 === 1) failResourceCapture();
  if (paddingCount > 0 && characterCount % 4 !== 0) failResourceCapture();
  const byteLength = paddingCount > 0
    ? (characterCount / 4) * 3 - paddingCount
    : Math.floor(characterCount * 3 / 4);
  if (byteLength > maximumBytes) failResourceCapture();
  return { byteLength };
};

const decodeBase64DataUrlBody = (value: string, maximumBytes: number) => {
  const { byteLength } = scanBase64DataUrlBody(value, maximumBytes);
  const bytes = new Uint8Array(byteLength);
  let accumulator = 0;
  let bits = 0;
  let outputIndex = 0;
  for (let index = 0; index < value.length;) {
    let byte: number;
    if (value[index] === '%') {
      byte = getPercentDecodedByte(value, index);
      index += 3;
    } else {
      byte = value.charCodeAt(index);
      index += 1;
    }
    if (isBase64WhitespaceByte(byte)) continue;
    if (byte === 0x3d) break;
    accumulator = (accumulator << 6) | getBase64Sextet(byte);
    bits += 6;
    if (bits < 8) continue;
    bits -= 8;
    if (outputIndex < bytes.length) {
      bytes[outputIndex] = (accumulator >> bits) & 0xff;
      outputIndex += 1;
    }
  }
  if (outputIndex !== bytes.length) failResourceCapture();
  return bytes;
};

const getUtf8Descriptor = (value: string, index: number) => {
  const first = value.charCodeAt(index);
  // Low three bits are encoded byte length; the remaining bits are consumed
  // UTF-16 code units. Keeping this numeric avoids an object/array allocation
  // for every character in multi-megabyte non-base64 data URLs.
  if (first <= 0x7f) return (1 << 3) | 1;
  if (first <= 0x7ff) return (1 << 3) | 2;
  if (first >= 0xd800 && first <= 0xdbff) {
    const second = value.charCodeAt(index + 1);
    if (second >= 0xdc00 && second <= 0xdfff) return (2 << 3) | 4;
    return (1 << 3) | 3;
  }
  return (1 << 3) | 3;
};

const writeUtf8Sequence = (
  bytes: Uint8Array,
  outputIndex: number,
  value: string,
  index: number,
  descriptor: number,
) => {
  const byteLength = descriptor & 0x7;
  const first = value.charCodeAt(index);
  if (byteLength === 1) {
    bytes[outputIndex] = first;
  } else if (byteLength === 2) {
    bytes[outputIndex] = 0xc0 | (first >> 6);
    bytes[outputIndex + 1] = 0x80 | (first & 0x3f);
  } else if (byteLength === 4) {
    const second = value.charCodeAt(index + 1);
    const codePoint = 0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00);
    bytes[outputIndex] = 0xf0 | (codePoint >> 18);
    bytes[outputIndex + 1] = 0x80 | ((codePoint >> 12) & 0x3f);
    bytes[outputIndex + 2] = 0x80 | ((codePoint >> 6) & 0x3f);
    bytes[outputIndex + 3] = 0x80 | (codePoint & 0x3f);
  } else if (first >= 0xd800 && first <= 0xdfff) {
    bytes[outputIndex] = 0xef;
    bytes[outputIndex + 1] = 0xbf;
    bytes[outputIndex + 2] = 0xbd;
  } else {
    bytes[outputIndex] = 0xe0 | (first >> 12);
    bytes[outputIndex + 1] = 0x80 | ((first >> 6) & 0x3f);
    bytes[outputIndex + 2] = 0x80 | (first & 0x3f);
  }
};

const decodePercentDataUrlBody = (value: string, maximumBytes: number) => {
  let byteLength = 0;
  for (let index = 0; index < value.length;) {
    if (value[index] === '%') {
      getPercentDecodedByte(value, index);
      byteLength += 1;
      index += 3;
    } else {
      const descriptor = getUtf8Descriptor(value, index);
      byteLength += descriptor & 0x7;
      index += descriptor >> 3;
    }
    if (byteLength > maximumBytes) failResourceCapture();
  }
  const bytes = new Uint8Array(byteLength);
  let outputIndex = 0;
  for (let index = 0; index < value.length;) {
    if (value[index] === '%') {
      bytes[outputIndex] = getPercentDecodedByte(value, index);
      outputIndex += 1;
      index += 3;
      continue;
    }
    const descriptor = getUtf8Descriptor(value, index);
    writeUtf8Sequence(bytes, outputIndex, value, index, descriptor);
    outputIndex += descriptor & 0x7;
    index += descriptor >> 3;
  }
  return bytes;
};

const decodeCaptureDataUrl = (href: string, maximumBytes: number) => {
  const comma = href.indexOf(',');
  if (!href.startsWith('data:') || comma < 0) failResourceCapture();
  const metadata = href.slice(5, comma);
  const encodedBody = href.slice(comma + 1);
  const base64 = /(?:^|;)\s*base64\s*$/iu.test(metadata);
  const bytes = base64
    ? decodeBase64DataUrlBody(encodedBody, maximumBytes)
    : decodePercentDataUrlBody(encodedBody, maximumBytes);
  return {
    bytes,
    contentType: metadata.split(';', 1)[0]?.trim() ?? '',
    contentTypeMetadata: metadata,
  };
};

const PUBLIC_CAPTURE_CSS_ATTRIBUTES = new Set([
  'background',
  'clip-path',
  'cursor',
  'fill',
  'filter',
  'marker',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'mask-image',
  'stroke',
  'style',
]);

const getPublicCaptureTreeElements = (root: HTMLElement) => {
  const elements: HTMLElement[] = [];
  const pending: Element[] = [root];
  while (pending.length > 0) {
    const element = pending.pop();
    if (!element) continue;
    elements.push(element as HTMLElement);
    const lightChildren = element.children
      ? Array.from(element.children)
      : Array.from(element.querySelectorAll?.('*') ?? []);
    for (let index = lightChildren.length - 1; index >= 0; index -= 1) pending.push(lightChildren[index]);
    const shadowChildren = Array.from(element.shadowRoot?.children ?? []);
    for (let index = shadowChildren.length - 1; index >= 0; index -= 1) pending.push(shadowChildren[index]);
  }
  return elements;
};

const getPublicCaptureDirectResourceAttributes = (element: Element) => {
  const tagName = element.tagName.toLowerCase();
  const attributes: string[] = [];
  if (tagName === 'img' || tagName === 'source') attributes.push('src', 'srcset');
  else if (tagName === 'input' && (element.getAttribute('type') ?? '').toLowerCase() === 'image') {
    attributes.push('src');
  } else if (tagName === 'video') attributes.push('poster');
  else if (tagName === 'image' || tagName === 'use' || tagName === 'feimage') {
    attributes.push('href', 'xlink:href');
  } else if (tagName === 'mglyph') attributes.push('src');
  if (element.hasAttribute?.('background')) attributes.push('background');
  return attributes;
};

const collectElementResourceUrls = (root: HTMLElement) => {
  const values = new Set<string>();
  const elements = getPublicCaptureTreeElements(root);
  const view = root.ownerDocument.defaultView;

  for (const element of elements) {
    for (const attributeName of getPublicCaptureDirectResourceAttributes(element)) {
      const attributeValue = element.getAttribute(attributeName) ?? '';
      const rawValue = attributeName === 'src' && element.tagName.toLowerCase() === 'img'
        ? (element as HTMLImageElement).currentSrc || attributeValue
        : attributeValue;
      if (attributeName === 'srcset') {
        for (const candidate of extractPublicSrcsetUrls(rawValue)) values.add(candidate);
      } else if (attributeName === 'background') {
        for (const candidate of extractPublicCssResourceUrls(`url("${rawValue.replace(/["\\]/gu, '\\$&')}")`)) {
          values.add(candidate);
        }
      } else if (rawValue) {
        values.add(rawValue);
      }
      if (
        attributeName === 'src'
        && element.tagName.toLowerCase() === 'img'
        && attributeValue
        && attributeValue !== rawValue
      ) values.add(attributeValue);
    }
    for (const attributeName of PUBLIC_CAPTURE_CSS_ATTRIBUTES) {
      if (attributeName === 'background') continue;
      const cssValue = element.getAttribute(attributeName);
      if (!cssValue) continue;
      for (const url of extractPublicCssResourceUrls(cssValue)) values.add(url);
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
  void doc;
  for (const rule of Array.from(rules)) {
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
    const value = link.getAttribute('href') ?? '';
    if (value) stylesheetReferences.push({ baseUrl: doc.baseURI, value });
  }
  for (const style of Array.from(doc.querySelectorAll?.('style') ?? [])) {
    const stylesheetElement = style as PublicStylesheetElement;
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
    for (const value of extractPublicCssAssetUrls(cssText)) {
      assetReferences.push({ baseUrl: doc.baseURI, value });
    }
  }
  for (const sheet of Array.from(doc.styleSheets ?? [])) {
    const baseUrl = sheet.href || doc.baseURI;
    if (sheet.href) stylesheetReferences.push({ baseUrl: doc.baseURI, value: sheet.href });
    try {
      collectRuleImportUrls(doc, sheet.cssRules, baseUrl, stylesheetReferences, assetReferences);
    } catch {
      // Cross-origin cssRules are deliberately unreadable. Fetching sheet.href
      // below with mode:cors is the fail-closed readability check.
    }
  }
  for (const sheet of Array.from(doc.adoptedStyleSheets ?? [])) {
    const baseUrl = sheet.href || doc.baseURI;
    if (sheet.href) stylesheetReferences.push({ baseUrl: doc.baseURI, value: sheet.href });
    try {
      collectRuleImportUrls(doc, sheet.cssRules, baseUrl, stylesheetReferences, assetReferences);
    } catch {
      if (sheet.href) stylesheetReferences.push({ baseUrl: doc.baseURI, value: sheet.href });
      else failResourceCapture();
    }
  }
  return { assetReferences, stylesheetReferences };
};

const collectShadowStylesheetReferences = (root: HTMLElement) => {
  const stylesheetReferences: PublicStylesheetReference[] = [];
  const assetReferences: PublicStylesheetReference[] = [];
  const shadows = new Set<ShadowRoot>();
  let ownerNode: Node | undefined = root;
  while (ownerNode?.getRootNode) {
    const ownerRoot = ownerNode.getRootNode();
    if (!ownerRoot || ownerRoot.nodeType !== 11 || !('host' in ownerRoot)) break;
    const ownerShadow = ownerRoot as ShadowRoot;
    shadows.add(ownerShadow);
    ownerNode = ownerShadow.host;
  }
  for (const host of getPublicCaptureTreeElements(root)) {
    const shadow = host.shadowRoot;
    if (shadow) shadows.add(shadow);
  }
  for (const shadow of shadows) {
    const doc = shadow.host?.ownerDocument ?? root.ownerDocument;
    for (const link of Array.from(shadow.querySelectorAll('link[rel~="stylesheet"][href]'))) {
      const value = link.getAttribute('href') ?? '';
      if (value) stylesheetReferences.push({ baseUrl: doc.baseURI, value });
    }
    for (const style of Array.from(shadow.querySelectorAll('style'))) {
      const stylesheetElement = style as PublicStylesheetElement;
      const baseUrl = stylesheetElement.sheet?.href || doc.baseURI;
      try {
        if (stylesheetElement.sheet) {
          collectRuleImportUrls(
            doc,
            stylesheetElement.sheet.cssRules,
            baseUrl,
            stylesheetReferences,
            assetReferences,
          );
          continue;
        }
      } catch {
        // Fall through to the conservative source scanner.
      }
      const cssText = style.textContent ?? '';
      for (const value of extractPublicCssImportUrls(cssText)) {
        stylesheetReferences.push({ baseUrl, value });
      }
      for (const value of extractPublicCssAssetUrls(cssText)) {
        assetReferences.push({ baseUrl, value });
      }
    }
    for (const sheet of Array.from(shadow.adoptedStyleSheets ?? [])) {
      const baseUrl = sheet.href || doc.baseURI;
      if (sheet.href) stylesheetReferences.push({ baseUrl: doc.baseURI, value: sheet.href });
      try {
        collectRuleImportUrls(doc, sheet.cssRules, baseUrl, stylesheetReferences, assetReferences);
      } catch {
        if (sheet.href) stylesheetReferences.push({ baseUrl: doc.baseURI, value: sheet.href });
        else failResourceCapture();
      }
    }
  }
  return { assetReferences, stylesheetReferences };
};

const collectAccessibleCaptureRoots = (root: HTMLElement, includeIframes = true) => {
  const roots: HTMLElement[] = [];
  const seenDocuments = new Set<Document>();
  const visit = (candidate: HTMLElement) => {
    const doc = candidate.ownerDocument;
    if (seenDocuments.has(doc)) return;
    seenDocuments.add(doc);
    roots.push(candidate);
    if (!includeIframes) return;
    const frames = new Set<HTMLIFrameElement>([
      ...getPublicCaptureTreeElements(candidate).filter(element => (
        element.tagName.toLowerCase() === 'iframe'
      )) as HTMLIFrameElement[],
      ...Array.from(candidate.querySelectorAll?.('iframe') ?? []),
    ]);
    for (const frame of frames) {
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
  options: { collectBytes?: boolean; collectText?: boolean } = {},
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
  const contentType = response.headers.get('content-type') ?? '';
  if (options.collectText) assertCaptureStylesheetContentType(contentType);
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
  const collectBytes = Boolean(options.collectBytes || options.collectText);
  const decoder = options.collectText ? new TextDecoder('utf-8', { fatal: true }) : null;
  const byteChunks: Uint8Array[] = [];
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
      if (collectBytes) {
        if (!(chunk.value instanceof Uint8Array)) failResourceCapture();
        byteChunks.push(chunk.value);
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
  let bytes: Uint8Array | undefined;
  if (collectBytes) {
    bytes = new Uint8Array(resourceBytes);
    let offset = 0;
    for (const chunk of byteChunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  return {
    bytes,
    contentType,
    text: decoder ? textChunks.join('') : undefined,
    url: response.url || href,
  };
};

const readCaptureResource = async (
  view: Window,
  href: string,
  controller: AbortController,
  byteBudget: { consumedBytes: number },
  options: { collectBytes?: boolean; collectText?: boolean } = {},
) => {
  if (!href.startsWith('data:')) {
    return fetchCaptureResource(view, href, controller, byteBudget, options);
  }
  const remainingBudget = Math.min(
    PUBLIC_CAPTURE_MAX_RESOURCE_BYTES,
    PUBLIC_CAPTURE_MAX_TOTAL_RESOURCE_BYTES - byteBudget.consumedBytes,
  );
  if (remainingBudget < 0) failResourceCapture();
  const decoded = decodeCaptureDataUrl(href, remainingBudget);
  if (options.collectText) assertCaptureStylesheetContentType(decoded.contentTypeMetadata);
  if (
    decoded.bytes.byteLength > PUBLIC_CAPTURE_MAX_RESOURCE_BYTES
    || byteBudget.consumedBytes + decoded.bytes.byteLength > PUBLIC_CAPTURE_MAX_TOTAL_RESOURCE_BYTES
  ) {
    const error = new PublicDeliveryError(
      'capture-failed',
      '预览远程资源体积超过浏览器本地交付的安全上限，未生成交付产物。',
    );
    if (!controller.signal.aborted) controller.abort(error);
    throw error;
  }
  byteBudget.consumedBytes += decoded.bytes.byteLength;
  return {
    bytes: options.collectBytes || options.collectText ? decoded.bytes : undefined,
    contentType: decoded.contentType,
    text: options.collectText
      ? new TextDecoder('utf-8', { fatal: true }).decode(decoded.bytes)
      : undefined,
    url: href,
  };
};

type PublicCaptureImageConstructor = new () => HTMLImageElement;
type PublicCaptureFontFaceConstructor = new (
  family: string,
  source: ArrayBuffer,
) => FontFace;

let publicCaptureFontValidationSequence = 0;

const awaitPublicCaptureDecode = async <Result>(
  pending: Promise<Result>,
  signal: AbortSignal,
) => {
  if (signal.aborted) throw signal.reason ?? new Error('Capture resource decode aborted.');
  let removeAbortListener = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('Capture resource decode aborted.'));
    signal.addEventListener('abort', abort, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', abort);
  });
  try {
    return await Promise.race([pending, aborted]);
  } finally {
    removeAbortListener();
  }
};

/**
 * Byte sniffing prevents MIME spoofing and known animation containers, but it
 * cannot prove that a codec/font parser will accept the complete payload. Run
 * the exact frozen bytes through the browser before capture so CSS backgrounds
 * and @font-face cannot silently degrade after the delivery gate succeeds.
 */
const validatePublicCaptureResourceDecode = async (
  view: Window,
  bytes: Uint8Array,
  format: PublicCaptureResourceFormat,
  signal: AbortSignal,
) => {
  const browserView = view as Window & {
    FontFace?: PublicCaptureFontFaceConstructor;
    Image?: PublicCaptureImageConstructor;
    URL?: typeof URL;
  };
  const isRealBrowserRealm = typeof browserView.document?.createElement === 'function';
  const payload = bytes.slice().buffer;
  if (format.kind === 'font') {
    const FontFaceConstructor = browserView.FontFace;
    if (typeof FontFaceConstructor !== 'function') {
      if (isRealBrowserRealm) failResourceCapture();
      return;
    }
    const family = `MorndraftCaptureValidation${publicCaptureFontValidationSequence}`;
    publicCaptureFontValidationSequence += 1;
    try {
      const font = new FontFaceConstructor(family, payload);
      const loaded = await awaitPublicCaptureDecode(font.load(), signal);
      if (loaded.status !== 'loaded') failResourceCapture();
      return;
    } catch (error) {
      if (error instanceof PublicDeliveryError) throw error;
      failResourceCapture(error);
    }
  }

  const ImageConstructor = browserView.Image;
  if (typeof ImageConstructor !== 'function') {
    if (isRealBrowserRealm) failResourceCapture();
    return;
  }
  const urlApi = browserView.URL ?? globalThis.URL;
  if (typeof urlApi?.createObjectURL !== 'function' || typeof urlApi?.revokeObjectURL !== 'function') {
    failResourceCapture();
  }
  const objectUrl = urlApi.createObjectURL(new Blob([payload], { type: format.contentType }));
  const image = new ImageConstructor();
  try {
    image.src = objectUrl;
    if (typeof image.decode === 'function') {
      await awaitPublicCaptureDecode(image.decode(), signal);
    } else {
      await awaitPublicCaptureDecode(new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Capture image decode failed.'));
      }), signal);
    }
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) failResourceCapture();
  } catch (error) {
    if (error instanceof PublicDeliveryError) throw error;
    failResourceCapture(error);
  } finally {
    image.removeAttribute('src');
    urlApi.revokeObjectURL(objectUrl);
  }
};

type PublicFrozenCaptureResource = Readonly<{
  contentType: string;
  objectUrl: string;
}>;

export type PublicCaptureResourceSnapshot = Readonly<{
  cleanup(): void;
  fetchFrozenImage(url: string): Promise<string | false>;
  resolve(value: string, baseUrl: string): string;
  rewriteCss(cssText: string, baseUrl: string): string;
  rewriteSrcset(srcset: string, baseUrl: string): string;
}>;

const escapeFrozenCssUrl = (value: string) => value.replace(/["\\\n\r]/gu, character => `\\${character}`);

const replaceResourceOccurrences = (
  value: string,
  replacements: readonly { end: number; start: number; value: string }[],
) => {
  if (replacements.length === 0) return value;
  const parts: string[] = [];
  let cursor = 0;
  for (const replacement of replacements) {
    if (
      replacement.start < cursor
      || replacement.end < replacement.start
      || replacement.end > value.length
    ) failResourceCapture();
    parts.push(value.slice(cursor, replacement.start), replacement.value);
    cursor = replacement.end;
  }
  parts.push(value.slice(cursor));
  return parts.join('');
};

const createFrozenCaptureSnapshot = (
  view: Window,
  resources: ReadonlyMap<string, { bytes: Uint8Array; contentType: string }>,
  stylesheetTexts: ReadonlyMap<string, string>,
  stylesheetBaseUrls: ReadonlyMap<string, string> = new Map(),
): PublicCaptureResourceSnapshot => {
  const urlApi = globalThis.URL;
  if (typeof urlApi?.createObjectURL !== 'function' || typeof urlApi?.revokeObjectURL !== 'function') {
    failResourceCapture();
  }
  const frozen = new Map<string, PublicFrozenCaptureResource>();
  const ownedUrls: string[] = [];
  const ownedUrlSet = new Set<string>();
  let cleaned = false;
  const cleanupOwnedUrls = () => {
    if (cleaned) return;
    cleaned = true;
    for (const objectUrl of ownedUrls) urlApi.revokeObjectURL(objectUrl);
    ownedUrls.length = 0;
    ownedUrlSet.clear();
    frozen.clear();
  };
  const createFrozenUrl = (bytes: Uint8Array | string, contentType: string) => {
    const blob = new Blob([
      typeof bytes === 'string' ? bytes : bytes.slice().buffer,
    ], { type: contentType });
    const objectUrl = urlApi.createObjectURL(blob);
    ownedUrls.push(objectUrl);
    ownedUrlSet.add(objectUrl);
    return objectUrl;
  };
  try {
    const frozenByResource = new Map<
      { bytes: Uint8Array; contentType: string },
      PublicFrozenCaptureResource
    >();
    for (const [href, resource] of resources) {
      let frozenResource = frozenByResource.get(resource);
      if (!frozenResource) {
        frozenResource = {
          contentType: resource.contentType,
          objectUrl: createFrozenUrl(resource.bytes, resource.contentType),
        };
        frozenByResource.set(resource, frozenResource);
      }
      frozen.set(href, frozenResource);
    }

  const stylesheetStack = new Set<string>();
  const freezeStylesheet = (href: string): PublicFrozenCaptureResource => {
    const existing = frozen.get(href);
    if (existing) return existing;
    const cssText = stylesheetTexts.get(href);
    if (cssText === undefined || stylesheetStack.has(href)) failResourceCapture();
    const stylesheetBaseUrl = stylesheetBaseUrls.get(href) ?? href;
    stylesheetStack.add(href);
    try {
      const scan = scanPublicCssResources(cssText);
      if (scan.malformed) failResourceCapture();
      const importOccurrences = scan.imports;
      const replacements: Array<{ end: number; start: number; value: string }> = [];
      for (const occurrence of importOccurrences) {
        const importedHref = normalizeFetchableResource(occurrence.value, stylesheetBaseUrl);
        if (!importedHref || !stylesheetTexts.has(importedHref)) {
          replacements.push({ end: occurrence.end, start: occurrence.start, value: '' });
          continue;
        }
        const imported = freezeStylesheet(importedHref);
        replacements.push({
          end: occurrence.end,
          start: occurrence.start,
          value: `@import url("${escapeFrozenCssUrl(imported.objectUrl)}")${occurrence.condition};`,
        });
      }
      for (const occurrence of scan.occurrences) {
        const resourceHref = normalizeFetchableResource(occurrence.value, stylesheetBaseUrl);
        const resource = resourceHref ? frozen.get(resourceHref) : undefined;
        if (!resource) {
          if (isEmbeddedCaptureResource(occurrence.value)) continue;
          failResourceCapture();
        }
        replacements.push({
          end: occurrence.end,
          start: occurrence.start,
          value: occurrence.kind === 'url'
            ? `url("${escapeFrozenCssUrl(resource.objectUrl)}")`
            : `"${escapeFrozenCssUrl(resource.objectUrl)}"`,
        });
      }
      replacements.sort((left, right) => left.start - right.start || left.end - right.end);
      const rewritten = replaceResourceOccurrences(cssText, replacements);
      const resource = {
        contentType: 'text/css;charset=utf-8',
        objectUrl: createFrozenUrl(rewritten, 'text/css;charset=utf-8'),
      };
      frozen.set(href, resource);
      return resource;
    } finally {
      stylesheetStack.delete(href);
    }
  };
    for (const href of stylesheetTexts.keys()) freezeStylesheet(href);

  const resolve = (value: string, baseUrl: string) => {
    const normalized = value.trim().replace(/^['"]|['"]$/gu, '');
    if (isEmbeddedCaptureResource(normalized)) return value;
    try {
      const parsed = new URL(normalized, baseUrl);
      const hash = parsed.hash;
      parsed.hash = '';
      if (parsed.protocol === 'blob:') {
        if (!ownedUrlSet.has(parsed.href)) failResourceCapture();
        return `${parsed.href}${hash}`;
      }
      const resource = frozen.get(parsed.href);
      if (!resource) failResourceCapture();
      return `${resource.objectUrl}${hash}`;
    } catch (error) {
      if (error instanceof PublicDeliveryError) throw error;
      failResourceCapture(error);
    }
  };
  const rewriteCss = (cssText: string, baseUrl: string) => {
    const scan = scanPublicCssResources(cssText);
    if (scan.malformed) failResourceCapture();
    const importOccurrences = scan.imports;
    const replacements = importOccurrences.map(occurrence => {
      const resolved = resolve(occurrence.value, baseUrl);
      if (resolved === occurrence.value) {
        return { end: occurrence.end, start: occurrence.start, value: '' };
      }
      return {
        end: occurrence.end,
        start: occurrence.start,
        value: `@import url("${escapeFrozenCssUrl(resolved)}")${occurrence.condition};`,
      };
    });
    for (const occurrence of scan.occurrences) {
      const resolved = resolve(occurrence.value, baseUrl);
      if (resolved === occurrence.value) continue;
      replacements.push({
        end: occurrence.end,
        start: occurrence.start,
        value: occurrence.kind === 'url'
          ? `url("${escapeFrozenCssUrl(resolved)}")`
          : `"${escapeFrozenCssUrl(resolved)}"`,
      });
    }
    replacements.sort((left, right) => left.start - right.start || left.end - right.end);
    return replaceResourceOccurrences(cssText, replacements);
  };
  const rewriteSrcset = (srcset: string, baseUrl: string) => replaceResourceOccurrences(
    srcset,
    findPublicSrcsetUrlOccurrences(srcset).map(occurrence => ({
      end: occurrence.end,
      start: occurrence.start,
      value: resolve(occurrence.value, baseUrl),
    })),
  );
    return {
    cleanup: cleanupOwnedUrls,
    fetchFrozenImage: async url => {
      try {
        const parsed = new URL(url, view.location?.href);
        const hash = parsed.hash;
        parsed.hash = '';
        if (parsed.protocol === 'blob:' && ownedUrlSet.has(parsed.href)) {
          return `${parsed.href}${hash}`;
        }
        const resource = frozen.get(parsed.href);
        return resource ? `${resource.objectUrl}${hash}` : false;
      } catch {
        return false;
      }
    },
    resolve,
    rewriteCss,
    rewriteSrcset,
    };
  } catch (error) {
    cleanupOwnedUrls();
    throw error;
  }
};

/**
 * Screenshot libraries commonly replace unreadable cross-origin assets with a
 * transparent pixel. Preflight every resource that can contribute pixels so a
 * successful capture can never silently mean "successful but missing images".
 */
type PublicCaptureReferenceCollection = Readonly<{
  assetReferences: readonly PublicStylesheetReference[];
  doc: Document;
  stylesheetReferences: readonly PublicStylesheetReference[];
}>;

const createPublicCaptureResourceSnapshotInternal = async (
  root: HTMLElement,
  externalSignal?: AbortSignal,
  explicitCollections?: readonly PublicCaptureReferenceCollection[],
  options: { includeIframes?: boolean } = {},
): Promise<PublicCaptureResourceSnapshot> => {
  const view = root.ownerDocument.defaultView;
  if (!view) failResourceCapture();
  if (externalSignal?.aborted) failResourceCapture(externalSignal.reason);

  const captureRoots = explicitCollections
    ? []
    : collectAccessibleCaptureRoots(root, options.includeIframes !== false);
  const stylesheetCollections = explicitCollections ?? captureRoots.map(captureRoot => {
    const documentReferences = collectDocumentStylesheetReferences(captureRoot.ownerDocument);
    const shadowReferences = collectShadowStylesheetReferences(captureRoot);
    return {
      assetReferences: [...documentReferences.assetReferences, ...shadowReferences.assetReferences],
      doc: captureRoot.ownerDocument,
      stylesheetReferences: [
        ...documentReferences.stylesheetReferences,
        ...shadowReferences.stylesheetReferences,
      ],
    };
  });
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
  if (knownUrls.size === 0) return createFrozenCaptureSnapshot(view, new Map(), new Map());

  const controller = new AbortController();
  const abort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener('abort', abort, { once: true });
  const timeoutId = view.setTimeout(() => controller.abort(), PUBLIC_CAPTURE_RESOURCE_TIMEOUT_MS);
  const stylesheetTextCache = new Map<string, string>();
  const stylesheetBaseUrlCache = new Map<string, string>();
  const frozenResources = new Map<string, { bytes: Uint8Array; contentType: string }>();
  try {
    // A small worker pool avoids turning a document with many images into an
    // unbounded burst of browser requests.
    const fetchedStylesheets = new Set<string>();
    const fetchedStylesheetFinalUrls = new Set<string>();
    const frozenAssetFinalUrls = new Map<string, { bytes: Uint8Array; contentType: string }>();
    let nextStylesheetIndex = 0;
    const byteBudget = { consumedBytes: 0 };
    while (nextStylesheetIndex < stylesheetTasks.length) {
      const task = stylesheetTasks[nextStylesheetIndex];
      nextStylesheetIndex += 1;
      const stylesheetUrl = task.href;
      fetchedStylesheets.add(stylesheetUrl);
      let cssText = stylesheetTextCache.get(stylesheetUrl);
      if (!stylesheetTextCache.has(stylesheetUrl)) {
        const stylesheetResource = await readCaptureResource(
          view,
          stylesheetUrl,
          controller,
          byteBudget,
          { collectText: true },
        );
        cssText = stylesheetResource.text ?? '';
        if (hasPublicDynamicCaptureCss(cssText, false)) failDynamicCaptureStylesheet();
        const existingFinalText = stylesheetTextCache.get(stylesheetResource.url);
        if (
          stylesheetTextCache.has(stylesheetResource.url)
          && existingFinalText !== cssText
        ) failResourceCapture();
        stylesheetTextCache.set(stylesheetUrl, cssText);
        stylesheetBaseUrlCache.set(stylesheetUrl, stylesheetResource.url);
        // Treat the response URL as an alias for the exact bytes already read.
        // A redirected sheet can import its own final URL; fetching that URL a
        // second time would let changed bytes enter the snapshot (TOCTOU).
        stylesheetTextCache.set(stylesheetResource.url, cssText);
        stylesheetBaseUrlCache.set(stylesheetResource.url, stylesheetResource.url);
        fetchedStylesheetFinalUrls.add(stylesheetResource.url);
      }

      const stylesheetBaseUrl = stylesheetBaseUrlCache.get(stylesheetUrl) ?? stylesheetUrl;

      const parsedReferences = await parseFetchedStylesheetReferences(
        task.doc,
        cssText ?? '',
        stylesheetBaseUrl,
      );
      // Constructable CSSStyleSheet deliberately ignores @import. Parse those
      // occurrences from the fetched source, but only filter an explicit,
      // inactive media condition when CSSOM parsing succeeded for this realm.
      // Without CSSOM, keep fail-closed behavior and preflight every import.
      const sourceScan = scanPublicCssResources(cssText ?? '');
      if (sourceScan.malformed) failResourceCapture();
      for (const occurrence of sourceScan.imports) {
        const importedUrl = normalizeFetchableResource(occurrence.value, stylesheetBaseUrl);
        if (importedUrl) scheduleStylesheet(task.doc, importedUrl);
      }
      for (const reference of parsedReferences?.stylesheetReferences ?? []) {
        const importedUrl = normalizeFetchableResource(reference.value, reference.baseUrl);
        if (importedUrl) scheduleStylesheet(task.doc, importedUrl);
      }
      const assetReferences = parsedReferences?.assetReferences
        ?? sourceScan.occurrences.map(occurrence => ({
          baseUrl: stylesheetBaseUrl,
          value: occurrence.value,
        }));
      for (const reference of assetReferences) {
        const assetUrl = normalizeFetchableResource(reference.value, reference.baseUrl);
        if (assetUrl) scheduleAsset(assetUrl);
      }
    }

    for (const href of assetUrls) {
      // One URL cannot safely be interpreted both as executable stylesheet text
      // and as a pixel/font asset. Treating the fetched CSS bytes as an image
      // would bypass magic sniffing; fetching it again would reintroduce TOCTOU.
      if (fetchedStylesheets.has(href) || fetchedStylesheetFinalUrls.has(href)) failResourceCapture();
    }
    const remainingUrls = [...assetUrls];
    let nextAssetIndex = 0;
    const workers = Array.from({ length: Math.min(6, remainingUrls.length) }, async () => {
      while (nextAssetIndex < remainingUrls.length) {
        const index = nextAssetIndex;
        nextAssetIndex += 1;
        const href = remainingUrls[index];
        if (frozenResources.has(href)) continue;
        const resource = await readCaptureResource(
          view,
          href,
          controller,
          byteBudget,
          { collectBytes: true },
        );
        if (!resource.bytes) failResourceCapture();
        if (
          fetchedStylesheets.has(resource.url)
          || fetchedStylesheetFinalUrls.has(resource.url)
        ) failResourceCapture();
        const inspection = inspectPublicCaptureResource(resource.bytes, resource.contentType);
        if (!inspection.format) failResourceCapture();
        await validatePublicCaptureResourceDecode(
          view,
          resource.bytes,
          inspection.format,
          controller.signal,
        );
        const candidate = {
          bytes: resource.bytes,
          contentType: inspection.format.contentType,
        };
        const existingFinalResource = frozenAssetFinalUrls.get(resource.url);
        if (existingFinalResource) {
          if (
            existingFinalResource.contentType !== candidate.contentType
            || existingFinalResource.bytes.byteLength !== candidate.bytes.byteLength
            || existingFinalResource.bytes.some((byte, byteIndex) => byte !== candidate.bytes[byteIndex])
          ) failResourceCapture();
          frozenResources.set(href, existingFinalResource);
          frozenResources.set(resource.url, existingFinalResource);
          continue;
        }
        frozenAssetFinalUrls.set(resource.url, candidate);
        frozenResources.set(href, candidate);
        frozenResources.set(resource.url, candidate);
      }
    });
    await Promise.all(workers);
    return createFrozenCaptureSnapshot(
      view,
      frozenResources,
      stylesheetTextCache,
      stylesheetBaseUrlCache,
    );
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

export const createPublicCaptureResourceSnapshot = (
  root: HTMLElement,
  externalSignal?: AbortSignal,
  options: { includeIframes?: boolean } = {},
) => createPublicCaptureResourceSnapshotInternal(root, externalSignal, undefined, options);

export const createPublicCaptureResourceSnapshotFromReferences = (
  ownerDocument: Document,
  references: Readonly<{
    assetReferences: readonly PublicStylesheetReference[];
    stylesheetReferences: readonly PublicStylesheetReference[];
  }>,
  externalSignal?: AbortSignal,
) => {
  const root = ownerDocument.documentElement ?? ownerDocument.body;
  if (!root) failResourceCapture();
  return createPublicCaptureResourceSnapshotInternal(root, externalSignal, [{
    ...references,
    doc: ownerDocument,
  }]);
};

export const applyPublicCaptureResourceSnapshot = (
  root: HTMLElement,
  snapshot: PublicCaptureResourceSnapshot,
  options: { includeIframes?: boolean; materializeDocumentAdoptedStyles?: boolean } = {},
) => {
  const seenDocuments = new Set<Document>();
  const materializedShadows = new Set<ShadowRoot>();
  const materializedDocuments = new Set<Document>();
  const getFrozenAdoptedCss = (sheet: CSSStyleSheet, baseUrl: string) => {
    try {
      return snapshot.rewriteCss(
        Array.from(sheet.cssRules, rule => rule.cssText).join('\n'),
        sheet.href || baseUrl,
      );
    } catch (error) {
      if (error instanceof PublicDeliveryError) throw error;
      failResourceCapture(error);
    }
  };
  const materializeDocumentAdoptedStyles = (doc: Document) => {
    if (materializedDocuments.has(doc)) return;
    materializedDocuments.add(doc);
    const adoptedSheets = Array.from(doc.adoptedStyleSheets ?? []);
    if (adoptedSheets.length === 0) return;
    if (!doc.head) failResourceCapture();
    for (const sheet of adoptedSheets) {
      const style = doc.createElement('style');
      style.textContent = getFrozenAdoptedCss(sheet, doc.baseURI);
      doc.head.appendChild(style);
    }
    try {
      doc.adoptedStyleSheets = [];
    } catch (error) {
      failResourceCapture(error);
    }
  };
  const materializeAdoptedStyles = (shadow: ShadowRoot) => {
    if (materializedShadows.has(shadow)) return;
    materializedShadows.add(shadow);
    const adoptedSheets = Array.from(shadow.adoptedStyleSheets ?? []);
    if (adoptedSheets.length === 0) return;
    for (const sheet of adoptedSheets) {
      const style = shadow.host.ownerDocument.createElement('style');
      style.textContent = getFrozenAdoptedCss(sheet, shadow.host.ownerDocument.baseURI);
      shadow.appendChild(style);
    }
    try {
      shadow.adoptedStyleSheets = [];
    } catch (error) {
      failResourceCapture(error);
    }
  };
  const rewriteElement = (element: HTMLElement) => {
    const baseUrl = element.baseURI || element.ownerDocument.baseURI;
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'iframe' && options.includeIframes === false) {
      element.removeAttribute('src');
      element.removeAttribute('srcdoc');
    }
    if (
      tagName === 'link'
      && !/(?:^|\s)stylesheet(?:\s|$)/iu.test(element.getAttribute('rel') ?? '')
    ) {
      element.removeAttribute('href');
      element.removeAttribute('imagesrcset');
    }
    for (const attributeName of getPublicCaptureDirectResourceAttributes(element)) {
      const value = element.getAttribute(attributeName);
      if (!value) continue;
      element.setAttribute(
        attributeName,
        attributeName === 'srcset'
          ? snapshot.rewriteSrcset(value, baseUrl)
          : snapshot.resolve(value, baseUrl),
      );
    }
    for (const attributeName of PUBLIC_CAPTURE_CSS_ATTRIBUTES) {
      if (attributeName === 'background') continue;
      const value = element.getAttribute(attributeName);
      if (!value) continue;
      element.setAttribute(attributeName, snapshot.rewriteCss(value, baseUrl));
    }
    if (tagName === 'style') {
      element.textContent = snapshot.rewriteCss(element.textContent ?? '', baseUrl);
    }
    if (
      tagName === 'link'
      && /(?:^|\s)stylesheet(?:\s|$)/iu.test(element.getAttribute('rel') ?? '')
    ) {
      const href = element.getAttribute('href');
      if (href) element.setAttribute('href', snapshot.resolve(href, baseUrl));
    }
  };
  const rewriteTree = (treeRoot: HTMLElement, materializeDocumentStyles: boolean) => {
    if (seenDocuments.has(treeRoot.ownerDocument)) return;
    seenDocuments.add(treeRoot.ownerDocument);
    if (materializeDocumentStyles) materializeDocumentAdoptedStyles(treeRoot.ownerDocument);
    if (options.includeIframes === false) return;
    for (const element of getPublicCaptureTreeElements(treeRoot)) {
      if (element.shadowRoot) materializeAdoptedStyles(element.shadowRoot);
    }
    for (const element of getPublicCaptureTreeElements(treeRoot)) rewriteElement(element);

    let ownerNode: Node | undefined = treeRoot;
    const ownerShadows = new Set<ShadowRoot>();
    while (ownerNode?.getRootNode) {
      const ownerRoot = ownerNode.getRootNode();
      if (!ownerRoot || ownerRoot.nodeType !== 11 || !('host' in ownerRoot)) break;
      const ownerShadow = ownerRoot as ShadowRoot;
      ownerShadows.add(ownerShadow);
      ownerNode = ownerShadow.host;
    }
    for (const shadow of ownerShadows) {
      materializeAdoptedStyles(shadow);
      for (const element of Array.from(shadow.querySelectorAll<HTMLElement>('style,link[rel~="stylesheet"]'))) {
        rewriteElement(element);
      }
    }

    for (const element of getPublicCaptureTreeElements(treeRoot)) {
      if (element.tagName.toLowerCase() !== 'iframe') continue;
      try {
        const nestedRoot = (element as HTMLIFrameElement).contentDocument?.documentElement;
        if (!nestedRoot) failResourceCapture();
        rewriteTree(nestedRoot, true);
      } catch (error) {
        if (error instanceof PublicDeliveryError) throw error;
        failResourceCapture(error);
      }
    }
  };
  rewriteTree(root, options.materializeDocumentAdoptedStyles === true);
};

type PublicParsedCaptureAttribute = {
  name: string;
  prefix?: string;
  value: string;
};

type PublicParsedCaptureNode = {
  attrs?: PublicParsedCaptureAttribute[];
  childNodes?: PublicParsedCaptureNode[];
  content?: PublicParsedCaptureNode;
  namespaceURI?: string;
  nodeName: string;
  tagName?: string;
  value?: string;
};

const getPublicParsedAttributeName = (attribute: PublicParsedCaptureAttribute) => (
  attribute.prefix ? `${attribute.prefix.toLowerCase()}:${attribute.name.toLowerCase()}` : attribute.name.toLowerCase()
);

const getPublicParsedNodes = (root: PublicParsedCaptureNode) => {
  const nodes: PublicParsedCaptureNode[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    nodes.push(node);
    if (node.content) pending.push(node.content);
    const children = node.childNodes ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
  }
  return nodes;
};

const getPublicParsedDocumentTreeNodes = (root: PublicParsedCaptureNode) => {
  const nodes: PublicParsedCaptureNode[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    nodes.push(node);
    const children = node.childNodes ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
  }
  return nodes;
};

const getPublicParsedText = (node: PublicParsedCaptureNode) => (
  (node.childNodes ?? []).map(child => child.value ?? '').join('')
);

const setPublicParsedText = (node: PublicParsedCaptureNode, value: string) => {
  const textNodes = (node.childNodes ?? []).filter(child => child.nodeName === '#text');
  if (textNodes.length === 0) return;
  textNodes[0].value = value;
  for (let index = 1; index < textNodes.length; index += 1) textNodes[index].value = '';
};

const isPublicParsedSrcsetAttribute = (tagName: string, attributeName: string) => (
  attributeName === 'srcset' && (tagName === 'img' || tagName === 'source')
);

const isPublicParsedDirectResourceAttribute = (
  tagName: string,
  attributeName: string,
  attributes: readonly PublicParsedCaptureAttribute[],
) => {
  if (attributeName === 'background') return true;
  if (tagName === 'img' || tagName === 'source') return attributeName === 'src';
  if (tagName === 'video') return attributeName === 'poster';
  if (tagName === 'mglyph') return attributeName === 'src';
  if (tagName === 'image' || tagName === 'use' || tagName === 'feimage') {
    return attributeName === 'href' || attributeName === 'xlink:href';
  }
  if (tagName !== 'input' || attributeName !== 'src') return false;
  return attributes.some(attribute => (
    getPublicParsedAttributeName(attribute) === 'type' && attribute.value.toLowerCase() === 'image'
  ));
};

const hasPublicParsedRelToken = (attributes: readonly PublicParsedCaptureAttribute[], expected: string) => {
  const rel = attributes.find(attribute => getPublicParsedAttributeName(attribute) === 'rel')?.value ?? '';
  return rel.split(/[\t\n\f\r ]+/u).some(token => token.toLowerCase() === expected);
};

const neutralizePublicParsedNonStylesheetLink = (
  attributes: readonly PublicParsedCaptureAttribute[],
) => {
  const isStylesheet = hasPublicParsedRelToken(attributes, 'stylesheet');
  for (const attribute of attributes) {
    const attributeName = getPublicParsedAttributeName(attribute);
    // Keep the complete rel token set for stylesheets. In particular,
    // `alternate stylesheet` must remain disabled until the author selects its
    // named style set; canonicalizing it to `stylesheet` changes capture pixels.
    if (attributeName === 'rel' && !isStylesheet) attribute.value = '';
    if (attributeName === 'imagesrcset' || (!isStylesheet && attributeName === 'href')) {
      attribute.value = '';
    }
  }
};

/**
 * Parse and freeze raw HTML resources before the capture iframe is inserted.
 * The returned source contains only operation-owned Blob URLs, so the browser
 * never gets an opportunity to race a second request to an author URL.
 */
export const preparePublicRawHtmlCaptureResources = async (
  ownerDocument: Document,
  html: string,
  externalSignal?: AbortSignal,
) => {
  let snapshot: PublicCaptureResourceSnapshot | undefined;
  try {
    const { parse, serialize } = await import('parse5');
    const parsed = parse(html, { scriptingEnabled: true }) as PublicParsedCaptureNode;
    const nodes = getPublicParsedNodes(parsed);
    let baseUrl = ownerDocument.baseURI;
    const baseNode = getPublicParsedDocumentTreeNodes(parsed).find(node => (
      node.namespaceURI === 'http://www.w3.org/1999/xhtml'
      && node.tagName?.toLowerCase() === 'base'
      && node.attrs?.some(attribute => getPublicParsedAttributeName(attribute) === 'href')
    ));
    const baseAttribute = baseNode?.attrs?.find(attribute => getPublicParsedAttributeName(attribute) === 'href');
    const baseHref = baseAttribute?.value;
    if (baseHref) {
      try {
        const resolvedBase = new URL(baseHref, ownerDocument.baseURI);
        if (!/^(?:https?):$/u.test(resolvedBase.protocol)) failResourceCapture();
        baseUrl = resolvedBase.href;
      } catch (error) {
        if (error instanceof PublicDeliveryError) throw error;
        failResourceCapture(error);
      }
    }
    if (baseAttribute) baseAttribute.value = ownerDocument.baseURI;

    const assetReferences: PublicStylesheetReference[] = [];
    const stylesheetReferences: PublicStylesheetReference[] = [];
    for (const node of nodes) {
      const tagName = node.tagName?.toLowerCase() ?? '';
      const attributes = node.attrs ?? [];
      if (tagName === 'link') neutralizePublicParsedNonStylesheetLink(attributes);
      for (const attribute of attributes) {
        const attributeName = getPublicParsedAttributeName(attribute);
        if (isPublicParsedSrcsetAttribute(tagName, attributeName)) {
          for (const value of extractPublicSrcsetUrls(attribute.value)) {
            assetReferences.push({ baseUrl, value });
          }
        } else if (isPublicParsedDirectResourceAttribute(tagName, attributeName, attributes)) {
          assetReferences.push({ baseUrl, value: attribute.value });
        } else if (PUBLIC_CAPTURE_CSS_ATTRIBUTES.has(attributeName) && attributeName !== 'background') {
          for (const value of extractPublicCssAssetUrls(attribute.value)) {
            assetReferences.push({ baseUrl, value });
          }
          for (const value of extractPublicCssImportUrls(attribute.value)) {
            stylesheetReferences.push({ baseUrl, value });
          }
        }
      }
      if (tagName === 'link' && hasPublicParsedRelToken(attributes, 'stylesheet')) {
        const href = attributes.find(attribute => getPublicParsedAttributeName(attribute) === 'href')?.value;
        if (href) stylesheetReferences.push({ baseUrl, value: href });
      }
      if (tagName === 'style') {
        const cssText = getPublicParsedText(node);
        for (const value of extractPublicCssAssetUrls(cssText)) assetReferences.push({ baseUrl, value });
        for (const value of extractPublicCssImportUrls(cssText)) {
          stylesheetReferences.push({ baseUrl, value });
        }
      }
    }

    snapshot = await createPublicCaptureResourceSnapshotFromReferences(
      ownerDocument,
      { assetReferences, stylesheetReferences },
      externalSignal,
    );
    for (const node of nodes) {
      const tagName = node.tagName?.toLowerCase() ?? '';
      const attributes = node.attrs ?? [];
      for (const attribute of attributes) {
        const attributeName = getPublicParsedAttributeName(attribute);
        if (isPublicParsedSrcsetAttribute(tagName, attributeName)) {
          attribute.value = snapshot.rewriteSrcset(attribute.value, baseUrl);
        } else if (isPublicParsedDirectResourceAttribute(tagName, attributeName, attributes)) {
          attribute.value = snapshot.resolve(attribute.value, baseUrl);
        } else if (PUBLIC_CAPTURE_CSS_ATTRIBUTES.has(attributeName) && attributeName !== 'background') {
          attribute.value = snapshot.rewriteCss(attribute.value, baseUrl);
        } else if (
          tagName === 'link'
          && attributeName === 'href'
          && hasPublicParsedRelToken(attributes, 'stylesheet')
        ) {
          attribute.value = snapshot.resolve(attribute.value, baseUrl);
        }
      }
      if (tagName === 'style') {
        setPublicParsedText(node, snapshot.rewriteCss(getPublicParsedText(node), baseUrl));
      }
    }
    return {
      html: serialize(parsed as never),
      snapshot,
    };
  } catch (error) {
    snapshot?.cleanup();
    if (error instanceof PublicDeliveryError) throw error;
    failResourceCapture(error);
  }
};

export const assertPublicCaptureResourcesReadable = async (
  root: HTMLElement,
  externalSignal?: AbortSignal,
) => {
  const snapshot = await createPublicCaptureResourceSnapshot(root, externalSignal);
  snapshot.cleanup();
};

const hasNonEmbeddedCssResource = (cssText: string) => (
  extractPublicCssResourceUrls(cssText).some(value => {
    const normalized = value.trim().replace(/^['"]|['"]$/gu, '');
    return Boolean(normalized)
      && !normalized.startsWith('#')
      && !/^(?:about|blob|data):/iu.test(normalized);
  })
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
      if (candidates.some(candidate => {
        const normalized = candidate.trim().replace(/^['"]|['"]$/gu, '');
        return Boolean(normalized)
          && !normalized.startsWith('#')
          && !/^(?:about|blob|data):/iu.test(normalized);
      })) {
        failResourceCapture();
      }
    }
  }
};
