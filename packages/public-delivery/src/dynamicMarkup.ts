const PUBLIC_DYNAMIC_ELEMENTS = new Set([
  'audio', 'canvas', 'details', 'dialog', 'embed', 'iframe', 'input',
  'marquee', 'object', 'progress', 'script', 'select', 'textarea', 'video',
]);

const PUBLIC_DYNAMIC_URL_ATTRIBUTES = new Set([
  'action', 'formaction', 'href', 'src', 'xlink:href',
]);

const PUBLIC_DYNAMIC_STATE_ATTRIBUTES = new Set([
  'command', 'commandfor', 'popover', 'popovertarget', 'popovertargetaction',
]);

const PUBLIC_SVG_DYNAMIC_ELEMENTS = new Set([
  'animate', 'animatemotion', 'animatetransform', 'discard', 'set',
]);

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export const PUBLIC_DYNAMIC_CAPTURE_HTML_MAX_BYTES = 2 * 1024 * 1024;

type ParsedAttribute = {
  name: string;
  namespace?: string;
  prefix?: string;
  value: string;
};

type ParsedNode = {
  attrs?: ParsedAttribute[];
  childNodes?: ParsedNode[];
  content?: ParsedNode;
  namespaceURI?: string;
  nodeName: string;
  tagName?: string;
  value?: string;
};

type Parse5Module = typeof import('parse5');

let parse5ModulePromise: Promise<Parse5Module> | undefined;

const loadParse5 = () => {
  parse5ModulePromise ??= import('parse5');
  return parse5ModulePromise;
};

const toAsciiLower = (value: string) => {
  let normalized = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    normalized += String.fromCharCode(code >= 0x41 && code <= 0x5a ? code + 0x20 : code);
  }
  return normalized;
};

const isCssWhitespace = (character: string | undefined) => (
  character === ' '
  || character === '\t'
  || character === '\n'
  || character === '\f'
  || character === '\r'
);

const isCssHexDigit = (character: string | undefined) => (
  character !== undefined && (
    (character >= '0' && character <= '9')
    || (character >= 'A' && character <= 'F')
    || (character >= 'a' && character <= 'f')
  )
);

const isCssIdentifierCodePoint = (character: string | undefined) => {
  if (!character) return false;
  const code = character.charCodeAt(0);
  return (
    (code >= 0x30 && code <= 0x39)
    || (code >= 0x41 && code <= 0x5a)
    || (code >= 0x61 && code <= 0x7a)
    || code >= 0x80
    || character === '-'
    || character === '_'
  );
};

const skipCssComment = (css: string, start: number) => {
  const end = css.indexOf('*/', start + 2);
  return end === -1 ? css.length : end + 2;
};

const skipCssString = (css: string, start: number) => {
  const quote = css[start];
  let index = start + 1;
  while (index < css.length) {
    if (css[index] === quote) return index + 1;
    if (css[index] !== '\\') {
      index += 1;
      continue;
    }
    index += 1;
    if (css[index] === '\r' && css[index + 1] === '\n') index += 2;
    else if (index < css.length) index += 1;
  }
  return css.length;
};

const readCssEscape = (css: string, start: number) => {
  let index = start + 1;
  if (index >= css.length) return { next: index, value: '\uFFFD' };
  if (isCssHexDigit(css[index])) {
    const hexStart = index;
    while (index < css.length && index - hexStart < 6 && isCssHexDigit(css[index])) index += 1;
    const parsed = Number.parseInt(css.slice(hexStart, index), 16);
    if (css[index] === '\r' && css[index + 1] === '\n') index += 2;
    else if (isCssWhitespace(css[index])) index += 1;
    const validCodePoint = parsed !== 0 && parsed <= 0x10ffff && !(parsed >= 0xd800 && parsed <= 0xdfff);
    return {
      next: index,
      value: String.fromCodePoint(validCodePoint ? parsed : 0xfffd),
    };
  }
  if (css[index] === '\r' && css[index + 1] === '\n') return { next: index + 2, value: '' };
  if (css[index] === '\n' || css[index] === '\f' || css[index] === '\r') {
    return {
      next: css[index] === '\r' && css[index + 1] === '\n' ? index + 2 : index + 1,
      value: '',
    };
  }
  return { next: index + 1, value: css[index] };
};

const readCssIdentifier = (css: string, start: number) => {
  let index = start;
  let value = '';
  while (index < css.length) {
    if (css.startsWith('/*', index)) {
      index = skipCssComment(css, index);
      continue;
    }
    if (css[index] === '\\') {
      const escaped = readCssEscape(css, index);
      value += escaped.value;
      index = escaped.next;
      continue;
    }
    if (!isCssIdentifierCodePoint(css[index])) break;
    value += css[index];
    index += 1;
  }
  return { next: index, value: toAsciiLower(value) };
};

const skipCssIgnorable = (css: string, start: number) => {
  let index = start;
  while (index < css.length) {
    if (isCssWhitespace(css[index])) {
      index += 1;
      continue;
    }
    if (css.startsWith('/*', index)) {
      index = skipCssComment(css, index);
      continue;
    }
    break;
  }
  return index;
};

const isVendorPrefixedCssName = (name: string, suffix: string, allowSubproperties: boolean) => {
  if (!name.startsWith('-') || name.startsWith('--')) return false;
  const marker = `-${suffix}`;
  const markerIndex = name.indexOf(marker, 2);
  if (markerIndex < 2) return false;
  const remainder = name.slice(markerIndex + marker.length);
  return remainder === '' || (allowSubproperties && remainder.startsWith('-'));
};

const isAnimationProperty = (name: string) => (
  name === 'animation'
  || name.startsWith('animation-')
  || isVendorPrefixedCssName(name, 'animation', true)
);

const isDynamicAtRule = (name: string) => (
  name === 'keyframes'
  || name === 'starting-style'
  || isVendorPrefixedCssName(name, 'keyframes', false)
);

/**
 * Scan CSS tokens without regular-expression lookarounds or backtracking.
 * Comments are removed as CSS syntax requires, while quoted strings stay inert.
 */
const hasDynamicCss = (css: string, allowRootDeclarations: boolean) => {
  let index = 0;
  let declarationBoundary = allowRootDeclarations;
  while (index < css.length) {
    if (css.startsWith('/*', index)) {
      index = skipCssComment(css, index);
      continue;
    }
    if (css[index] === '"' || css[index] === "'") {
      index = skipCssString(css, index);
      declarationBoundary = false;
      continue;
    }
    if (css[index] === '@') {
      const ruleStart = skipCssIgnorable(css, index + 1);
      const rule = readCssIdentifier(css, ruleStart);
      if (isDynamicAtRule(rule.value)) return true;
      index = Math.max(rule.next, index + 1);
      declarationBoundary = false;
      continue;
    }
    if (css[index] === '\\' || isCssIdentifierCodePoint(css[index])) {
      const property = readCssIdentifier(css, index);
      const separator = skipCssIgnorable(css, property.next);
      if (
        declarationBoundary
        && css[separator] === ':'
        && isAnimationProperty(property.value)
      ) return true;
      index = Math.max(property.next, index + 1);
      declarationBoundary = false;
      continue;
    }
    if (css[index] === '{' || css[index] === ';') declarationBoundary = true;
    else if (!isCssWhitespace(css[index])) declarationBoundary = false;
    index += 1;
  }
  return false;
};

export const hasPublicDynamicCaptureCss = (css: string, allowRootDeclarations = false) => (
  hasDynamicCss(css, allowRootDeclarations)
);

const getUtf8ByteLengthAtMost = (value: string, maximum: number) => {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
    if (bytes > maximum) return bytes;
  }
  return bytes;
};

const normalizeExecutableUrl = (value: string) => {
  let normalized = '';
  for (const character of value) {
    if ((character.codePointAt(0) ?? 0) > 0x20) normalized += character;
  }
  return toAsciiLower(normalized);
};

const getAttributeName = (attribute: ParsedAttribute) => {
  const name = toAsciiLower(attribute.name);
  return attribute.prefix ? `${toAsciiLower(attribute.prefix)}:${name}` : name;
};

const hasDynamicAttribute = (attributes: readonly ParsedAttribute[]) => {
  for (const attribute of attributes) {
    const name = getAttributeName(attribute);
    const eventStart = name.charCodeAt(2);
    if (
      name === 'contenteditable'
      || PUBLIC_DYNAMIC_STATE_ATTRIBUTES.has(name)
      || (name.startsWith('on') && eventStart >= 0x61 && eventStart <= 0x7a)
    ) return true;
    if (name === 'style' && hasDynamicCss(attribute.value, true)) return true;
    if (
      PUBLIC_DYNAMIC_URL_ATTRIBUTES.has(name)
    ) {
      const normalizedUrl = normalizeExecutableUrl(attribute.value);
      if (normalizedUrl.startsWith('javascript:') || normalizedUrl.startsWith('vbscript:')) return true;
    }
  }
  return false;
};

const getTextContent = (node: ParsedNode) => {
  const pending: ParsedNode[] = [];
  const initialChildren = node.childNodes ?? [];
  for (let index = initialChildren.length - 1; index >= 0; index -= 1) {
    pending.push(initialChildren[index]);
  }
  let text = '';
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (typeof current.value === 'string') text += current.value;
    const children = current.childNodes ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index]);
    }
  }
  return text;
};

const hasDynamicTree = (document: ParsedNode) => {
  const pending: ParsedNode[] = [document];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) continue;
    if (node.tagName) {
      const tagName = toAsciiLower(node.tagName);
      const namespace = node.namespaceURI;
      const attributes = node.attrs ?? [];
      if (PUBLIC_DYNAMIC_ELEMENTS.has(tagName)) return true;
      // The live Final iframe permits scripts, while the capture iframe does
      // not. HTML noscript therefore changes from raw text into active markup
      // on the second browser parse and could reveal unfrozen author URLs.
      if (namespace === HTML_NAMESPACE && tagName === 'noscript') return true;
      if (namespace === SVG_NAMESPACE && PUBLIC_SVG_DYNAMIC_ELEMENTS.has(tagName)) return true;
      if (hasDynamicAttribute(attributes)) return true;
      if (
        namespace === HTML_NAMESPACE
        && tagName === 'meta'
        && attributes.some(attribute => (
          getAttributeName(attribute) === 'http-equiv'
          && normalizeExecutableUrl(attribute.value) === 'refresh'
        ))
      ) return true;
      if (tagName === 'style' && hasDynamicCss(getTextContent(node), false)) return true;
    }
    if (node.content) pending.push(node.content);
    const children = node.childNodes ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index]);
    }
  }
  return false;
};

/**
 * Parse the same complete document shape used by iframe srcdoc, then reject
 * markup whose live sandbox can change after the static capture snapshot.
 * Import and parser failures fail closed; parse5 stays outside the entry chunk.
 */
export const hasPublicDynamicCaptureMarkup = async (html: string) => {
  if (getUtf8ByteLengthAtMost(html, PUBLIC_DYNAMIC_CAPTURE_HTML_MAX_BYTES) > PUBLIC_DYNAMIC_CAPTURE_HTML_MAX_BYTES) {
    return true;
  }
  try {
    const { parse } = await loadParse5();
    const document = parse(html, { scriptingEnabled: true }) as ParsedNode;
    return hasDynamicTree(document);
  } catch {
    return true;
  }
};
