/* global DOMParser, XMLSerializer */

const ALLOWED_SVG_TAGS = new Set([
  'circle', 'clippath', 'defs', 'desc', 'ellipse', 'g', 'line', 'lineargradient',
  'marker', 'mask', 'metadata', 'path', 'pattern', 'polygon', 'polyline',
  'radialgradient', 'rect', 'stop', 'style', 'svg', 'switch', 'symbol', 'text',
  'title', 'tspan', 'use',
]);

const ALLOWED_SVG_ATTRIBUTES = new Set([
  'alignment-baseline', 'aria-describedby', 'aria-hidden', 'aria-label', 'aria-labelledby',
  'aria-roledescription', 'class', 'clip-path', 'clip-rule', 'clippathunits', 'color',
  'cx', 'cy', 'd', 'direction', 'dominant-baseline', 'dx', 'dy', 'fill', 'fill-opacity',
  'fill-rule', 'filter', 'font-family', 'font-size', 'font-style', 'font-weight',
  'gradienttransform', 'gradientunits', 'height', 'href', 'id', 'lang', 'marker-end',
  'marker-mid', 'marker-start', 'markerheight', 'markerunits', 'markerwidth', 'mask',
  'maskcontentunits', 'maskunits', 'offset', 'opacity', 'orient', 'overflow',
  'patterncontentunits', 'patterntransform', 'patternunits', 'points', 'preserveaspectratio',
  'r', 'refx', 'refy', 'role', 'rx', 'ry', 'spreadmethod', 'stop-color', 'stop-opacity',
  'stroke', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'style', 'tabindex',
  'text-anchor', 'transform', 'vector-effect', 'version', 'viewbox', 'width', 'x', 'x1',
  'x2', 'xlink:href', 'xmlns', 'xmlns:xlink', 'y', 'y1', 'y2',
]);

const SAFE_FRAGMENT_REFERENCE = /^#[A-Za-z_][A-Za-z0-9_.:-]*$/;
const SAFE_FRAGMENT_URL = /^url\(\s*['"]?#[A-Za-z_][A-Za-z0-9_.:-]*['"]?\s*\)$/i;
const URL_VALUE_ATTRIBUTE = new Set([
  'clip-path', 'fill', 'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'stroke',
]);

const isSafeCss = (value) => {
  if (/expression\s*\(|javascript\s*:|@import\b|behavior\s*:|-moz-binding\s*:/i.test(value)) return false;
  const urls = value.match(/url\([^)]*\)/gi) ?? [];
  return urls.every(candidate => SAFE_FRAGMENT_URL.test(candidate));
};

const isAllowedAttribute = (name) => (
  ALLOWED_SVG_ATTRIBUTES.has(name)
  || name.startsWith('data-')
);

const isSafeAttributeValue = (name, value) => {
  if (name.startsWith('on')) return false;
  if (name === 'href' || name === 'xlink:href') return SAFE_FRAGMENT_REFERENCE.test(value);
  if (name === 'style') return isSafeCss(value);
  if (URL_VALUE_ATTRIBUTE.has(name) && /url\s*\(/i.test(value)) return SAFE_FRAGMENT_URL.test(value);
  return !/javascript\s*:|data\s*:|vbscript\s*:/i.test(value);
};

const validateWithoutDom = (svg) => {
  if (!/^\s*<svg(?:\s|>)/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    throw new Error('Mermaid renderer returned a non-SVG document.');
  }
  if (/<!--|<!\[CDATA\[|<\?/i.test(svg)) {
    throw new Error('Mermaid SVG contains unsupported markup.');
  }

  const tagPattern = /<\/?([A-Za-z][\w:-]*)(?:\s[^<>]*?)?\/?>/g;
  for (const match of svg.matchAll(tagPattern)) {
    const tagName = match[1].toLowerCase();
    if (!ALLOWED_SVG_TAGS.has(tagName)) {
      throw new Error(`Mermaid SVG contains forbidden element: ${tagName}`);
    }
    if (match[0].startsWith('</')) continue;
    const attributeSource = match[0]
      .replace(/^<[A-Za-z][\w:-]*/, '')
      .replace(/\/?>$/, '');
    const attributePattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (const attribute of attributeSource.matchAll(attributePattern)) {
      const name = attribute[1].toLowerCase();
      if (!name || name === '/') continue;
      const value = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
      if (!isAllowedAttribute(name) || !isSafeAttributeValue(name, value)) {
        throw new Error(`Mermaid SVG contains forbidden attribute: ${name}`);
      }
    }
  }
  if (!isSafeCss(svg)) throw new Error('Mermaid SVG contains an unsafe CSS reference.');
  return svg;
};

export const sanitizeMermaidSvg = (svg) => {
  if (typeof svg !== 'string') throw new TypeError('Mermaid SVG must be a string.');
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return validateWithoutDom(svg);
  }

  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName?.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('Mermaid renderer returned invalid SVG.');
  }

  for (const element of [root, ...doc.querySelectorAll('*')]) {
    const tagName = element.localName.toLowerCase();
    if (!ALLOWED_SVG_TAGS.has(tagName)) {
      element.remove();
      continue;
    }
    if (tagName === 'style' && !isSafeCss(element.textContent ?? '')) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if (!isAllowedAttribute(name) || !isSafeAttributeValue(name, attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }

  return new XMLSerializer().serializeToString(root);
};
