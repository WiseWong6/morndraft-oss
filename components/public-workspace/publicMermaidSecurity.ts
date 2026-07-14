import {
  isPublicCssFragmentReference,
  scanPublicCssResources,
} from '@morndraft/public-delivery';
import type { PublicWorkspaceTheme } from './types';

const ALLOWED_TAGS = new Set([
  'circle', 'clippath', 'defs', 'desc', 'ellipse', 'g', 'line', 'lineargradient',
  'marker', 'mask', 'path', 'pattern', 'polygon', 'polyline', 'radialgradient', 'rect',
  'stop', 'style', 'svg', 'text', 'title', 'tspan', 'use',
]);
const ALLOWED_ATTRIBUTES = new Set([
  'alignment-baseline', 'aria-describedby', 'aria-hidden', 'aria-label', 'aria-labelledby',
  'aria-roledescription', 'class', 'clip-path', 'clip-rule', 'clippathunits', 'color',
  'cx', 'cy', 'd', 'direction', 'dominant-baseline', 'dx', 'dy', 'fill', 'fill-opacity',
  'fill-rule', 'filter', 'font-family', 'font-size', 'font-style', 'font-weight',
  'gradienttransform', 'gradientunits', 'height', 'href', 'id', 'lang', 'marker-end',
  'marker-mid', 'marker-start', 'markerheight', 'markerunits', 'markerwidth', 'mask',
  'offset', 'opacity', 'orient', 'overflow', 'patterncontentunits', 'patterntransform',
  'patternunits', 'points', 'preserveaspectratio', 'r', 'refx', 'refy', 'role', 'rx',
  'ry', 'spreadmethod', 'stop-color', 'stop-opacity', 'stroke', 'stroke-dasharray',
  'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stroke-opacity', 'stroke-width', 'style', 'tabindex', 'text-anchor', 'transform',
  'vector-effect', 'version', 'viewbox', 'width', 'x', 'x1', 'x2', 'xmlns', 'y', 'y1', 'y2',
]);
const SAFE_FRAGMENT = /^#[A-Za-z_][A-Za-z0-9_.:-]*$/u;
const URL_ATTRIBUTES = new Set(['clip-path', 'fill', 'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'stroke']);
export const PUBLIC_MERMAID_MAX_SVG_LENGTH = 2_000_000;
const MAX_SANDBOX_PAYLOAD_LENGTH = 3_000_000;

const isCssWhitespace = (value: string) => value === ' ' || value === '\n' || value === '\r' || value === '\t' || value === '\f';
const isCssIdentifierCharacter = (value: string) => {
  const code = value.charCodeAt(0);
  return (code >= 0x30 && code <= 0x39)
    || (code >= 0x41 && code <= 0x5a)
    || (code >= 0x61 && code <= 0x7a)
    || value === '-' || value === '_' || code >= 0x80;
};
const toAsciiLower = (value: string) => {
  let normalized = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    normalized += code >= 0x41 && code <= 0x5a ? String.fromCharCode(code + 0x20) : value[index];
  }
  return normalized;
};
const skipCssComment = (css: string, start: number) => {
  const end = css.indexOf('*/', start + 2);
  return end < 0 ? css.length : end + 2;
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
  let hex = '';
  while (index < css.length && hex.length < 6 && /[0-9a-f]/iu.test(css[index])) {
    hex += css[index];
    index += 1;
  }
  if (hex) {
    if (css[index] === '\r' && css[index + 1] === '\n') index += 2;
    else if (index < css.length && isCssWhitespace(css[index])) index += 1;
    const codePoint = Number.parseInt(hex, 16);
    const validCodePoint = codePoint !== 0
      && codePoint <= 0x10ffff
      && !(codePoint >= 0xd800 && codePoint <= 0xdfff);
    return {
      next: index,
      value: String.fromCodePoint(validCodePoint ? codePoint : 0xfffd),
    };
  }
  if (index >= css.length) return { next: index, value: '' };
  if (css[index] === '\n' || css[index] === '\r' || css[index] === '\f') {
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
    if (!isCssIdentifierCharacter(css[index])) break;
    value += css[index];
    index += 1;
  }
  return { next: index, value: toAsciiLower(value) };
};
const skipCssIgnorable = (css: string, start: number) => {
  let index = start;
  while (index < css.length) {
    if (isCssWhitespace(css[index])) index += 1;
    else if (css.startsWith('/*', index)) index = skipCssComment(css, index);
    else break;
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
const isKeyframesRule = (name: string) => (
  name === 'keyframes'
  || isVendorPrefixedCssName(name, 'keyframes', false)
);

const skipCssAtRule = (css: string, start: number) => {
  let index = start;
  while (index < css.length) {
    if (css.startsWith('/*', index)) {
      index = skipCssComment(css, index);
      continue;
    }
    if (css[index] === '"' || css[index] === "'") {
      index = skipCssString(css, index);
      continue;
    }
    if (css[index] === ';') return index + 1;
    if (css[index] !== '{') {
      index += 1;
      continue;
    }
    let depth = 1;
    index += 1;
    while (index < css.length && depth > 0) {
      if (css.startsWith('/*', index)) index = skipCssComment(css, index);
      else if (css[index] === '"' || css[index] === "'") index = skipCssString(css, index);
      else {
        if (css[index] === '{') depth += 1;
        else if (css[index] === '}') depth -= 1;
        index += 1;
      }
    }
    return index;
  }
  return index;
};

const skipCssDeclaration = (css: string, start: number) => {
  let index = start;
  let parentheses = 0;
  while (index < css.length) {
    if (css.startsWith('/*', index)) {
      index = skipCssComment(css, index);
      continue;
    }
    if (css[index] === '"' || css[index] === "'") {
      index = skipCssString(css, index);
      continue;
    }
    if (css[index] === '(' || css[index] === '[') parentheses += 1;
    else if ((css[index] === ')' || css[index] === ']') && parentheses > 0) parentheses -= 1;
    else if (parentheses === 0 && css[index] === ';') return index + 1;
    else if (parentheses === 0 && css[index] === '}') return index;
    index += 1;
  }
  return index;
};

/**
 * Mermaid includes animation keyframes in every generated flowchart and can
 * activate them through user-authored edge/class styles. Remove both the
 * definitions and every animation declaration with a monotonic CSS scan so
 * the live scriptless renderer and its capture source are provably static.
 */
export const staticizePublicMermaidCss = (css: string, allowRootDeclarations = false) => {
  let copyStart = 0;
  let index = 0;
  let declarationBoundary = allowRootDeclarations;
  let output = '';
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
      if (isKeyframesRule(rule.value)) {
        output += css.slice(copyStart, index);
        index = skipCssAtRule(css, rule.next);
        copyStart = index;
        declarationBoundary = false;
        continue;
      }
      index = Math.max(rule.next, index + 1);
      declarationBoundary = false;
      continue;
    }
    if (css[index] === '\\' || isCssIdentifierCharacter(css[index])) {
      const propertyStart = index;
      const property = readCssIdentifier(css, index);
      const separator = skipCssIgnorable(css, property.next);
      if (declarationBoundary && css[separator] === ':' && isAnimationProperty(property.value)) {
        output += css.slice(copyStart, propertyStart);
        index = skipCssDeclaration(css, separator + 1);
        copyStart = index;
        declarationBoundary = true;
        continue;
      }
      index = Math.max(property.next, index + 1);
      declarationBoundary = false;
      continue;
    }
    if (css[index] === '{' || css[index] === ';') declarationBoundary = true;
    else if (!isCssWhitespace(css[index])) declarationBoundary = false;
    index += 1;
  }
  return output + css.slice(copyStart);
};

const isSafeCss = (value: string) => {
  if (/expression\s*\(|javascript\s*:|@import\b|behavior\s*:|-moz-binding\s*:/iu.test(value)) return false;
  const scan = scanPublicCssResources(value);
  return !scan.malformed && scan.imports.length === 0 && scan.occurrences.every(occurrence => (
    occurrence.kind === 'url' && isPublicCssFragmentReference(occurrence.value)
  ));
};

const isSafeValue = (name: string, value: string) => {
  if (name.startsWith('on')) return false;
  if (name === 'href') return SAFE_FRAGMENT.test(value);
  if (name === 'style') return isSafeCss(value);
  if (URL_ATTRIBUTES.has(name)) return isSafeCss(value);
  return !/(?:javascript|data|vbscript)\s*:/iu.test(value);
};

const validateSvgText = (svg: string) => {
  if (!/^\s*<svg(?:\s|>)/iu.test(svg) || !/<\/svg>\s*$/iu.test(svg)) throw new Error('Mermaid returned a non-SVG document.');
  if (/<!--|<!\[CDATA\[|<\?/iu.test(svg)) throw new Error('Mermaid SVG contains unsupported markup.');
  for (const match of svg.matchAll(/<\/?([A-Za-z][\w:-]*)(?:\s[^<>]*?)?\/?>/gu)) {
    const tag = match[1].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) throw new Error(`Mermaid SVG contains a forbidden ${tag} element.`);
    if (match[0].startsWith('</')) continue;
    const attributes = match[0].replace(/^<[A-Za-z][\w:-]*/u, '').replace(/\/?>$/u, '');
    for (const attribute of attributes.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu)) {
      const name = attribute[1].toLowerCase();
      if (!name || name === '/') continue;
      const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
      if (name === 'style' && staticizePublicMermaidCss(value, true) !== value) {
        throw new Error('Mermaid SVG contains dynamic CSS.');
      }
      if ((!ALLOWED_ATTRIBUTES.has(name) && !name.startsWith('data-')) || !isSafeValue(name, value)) {
        throw new Error(`Mermaid SVG contains a forbidden ${name} attribute.`);
      }
    }
  }
  if (staticizePublicMermaidCss(svg) !== svg) throw new Error('Mermaid SVG contains dynamic CSS.');
  if (!isSafeCss(svg)) throw new Error('Mermaid SVG contains an unsafe CSS reference.');
  return svg;
};

export const sanitizePublicMermaidSvg = (svg: string) => {
  if (typeof svg !== 'string') throw new TypeError('Mermaid SVG must be a string.');
  if (svg.length > PUBLIC_MERMAID_MAX_SVG_LENGTH) throw new Error('Mermaid SVG exceeds the render budget.');
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return validateSvgText(svg);
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = document.documentElement;
  if (root.localName.toLowerCase() !== 'svg' || document.querySelector('parsererror')) throw new Error('Mermaid returned invalid SVG.');
  for (const element of [root, ...document.querySelectorAll('*')]) {
    const tag = element.localName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      element.remove();
      continue;
    }
    if (tag === 'style') {
      const staticCss = staticizePublicMermaidCss(element.textContent ?? '');
      if (!isSafeCss(staticCss)) {
        element.remove();
        continue;
      }
      element.textContent = staticCss;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = name === 'style'
        ? staticizePublicMermaidCss(attribute.value, true)
        : attribute.value;
      if ((!ALLOWED_ATTRIBUTES.has(name) && !name.startsWith('data-')) || !isSafeValue(name, value)) {
        element.removeAttribute(attribute.name);
      } else if (value !== attribute.value) {
        element.setAttribute(attribute.name, value);
      }
    }
  }
  return new XMLSerializer().serializeToString(root);
};

export const extractPublicMermaidSandboxSvg = (rendered: string) => {
  if (/^\s*<svg(?:\s|>)/iu.test(rendered)) return rendered;
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') throw new Error('Mermaid extraction requires a browser DOM.');
  const wrapper = new DOMParser().parseFromString(rendered, 'text/html');
  const source = wrapper.querySelector('iframe')?.getAttribute('src') ?? '';
  const prefix = 'data:text/html;charset=UTF-8;base64,';
  if (!source.startsWith(prefix)) throw new Error('Mermaid sandbox returned an invalid document.');
  const encoded = source.slice(prefix.length);
  if (encoded.length > MAX_SANDBOX_PAYLOAD_LENGTH) throw new Error('Mermaid sandbox output exceeds the render budget.');
  let decoded = '';
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)));
  } catch {
    throw new Error('Mermaid sandbox returned an invalid payload.');
  }
  const sandboxDocument = new DOMParser().parseFromString(decoded, 'text/html');
  const svg = sandboxDocument.querySelector('svg');
  if (!svg) throw new Error('Mermaid sandbox returned no SVG.');
  return new XMLSerializer().serializeToString(svg);
};

export const createPublicMermaidSandboxDocument = (svg: string, theme: PublicWorkspaceTheme) => `<!doctype html>
<html style="color-scheme:${theme}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'">
<meta name="referrer" content="no-referrer">
<style>html,body{margin:0;min-height:100%;background:transparent}body{box-sizing:border-box;padding:12px;overflow:auto}svg{display:block;max-width:100%;height:auto;margin:0 auto}</style>
</head><body>${sanitizePublicMermaidSvg(svg)}</body></html>`;

export const getPublicMermaidConfig = (theme: PublicWorkspaceTheme) => ({
  startOnLoad: false,
  // Mermaid's sandbox mode creates its own scripted srcdoc iframe and emits a
  // CSP console error before we can extract the SVG. Strict mode returns an
  // inert SVG string; we then apply our own allowlist sanitizer and render it
  // inside the final scriptless, opaque-origin iframe below.
  securityLevel: 'strict' as const,
  suppressErrorRendering: true,
  theme: theme === 'dark' ? 'dark' as const : 'default' as const,
  flowchart: { htmlLabels: false },
});
