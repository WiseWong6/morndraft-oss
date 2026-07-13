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
const SAFE_FRAGMENT_URL = /^url\(\s*['"]?#[A-Za-z_][A-Za-z0-9_.:-]*['"]?\s*\)$/iu;
const URL_ATTRIBUTES = new Set(['clip-path', 'fill', 'filter', 'marker-end', 'marker-mid', 'marker-start', 'mask', 'stroke']);
export const PUBLIC_MERMAID_MAX_SVG_LENGTH = 2_000_000;
const MAX_SANDBOX_PAYLOAD_LENGTH = 3_000_000;

const isSafeCss = (value: string) => {
  if (/expression\s*\(|javascript\s*:|@import\b|behavior\s*:|-moz-binding\s*:/iu.test(value)) return false;
  return (value.match(/url\([^)]*\)/giu) ?? []).every((candidate) => SAFE_FRAGMENT_URL.test(candidate));
};

const isSafeValue = (name: string, value: string) => {
  if (name.startsWith('on')) return false;
  if (name === 'href') return SAFE_FRAGMENT.test(value);
  if (name === 'style') return isSafeCss(value);
  if (URL_ATTRIBUTES.has(name) && /url\s*\(/iu.test(value)) return SAFE_FRAGMENT_URL.test(value);
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
      if ((!ALLOWED_ATTRIBUTES.has(name) && !name.startsWith('data-')) || !isSafeValue(name, value)) {
        throw new Error(`Mermaid SVG contains a forbidden ${name} attribute.`);
      }
    }
  }
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
    if (tag === 'style' && !isSafeCss(element.textContent ?? '')) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      if ((!ALLOWED_ATTRIBUTES.has(name) && !name.startsWith('data-')) || !isSafeValue(name, attribute.value)) element.removeAttribute(attribute.name);
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
