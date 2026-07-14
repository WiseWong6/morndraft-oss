import {
  findPortableCssImportOccurrences,
  findPortableCssUrlOccurrences,
} from './portableCss';

const URL_ATTRIBUTES = [
  'action',
  'cite',
  'data',
  'formaction',
  'href',
  'longdesc',
  'poster',
  'src',
  'xlink:href',
] as const;

const escapeCssUrl = (value: string) => value.replace(/["\\\n\r]/gu, character => `\\${character}`);

const resolvePortableReference = (value: string, baseUrl: string) => {
  const normalized = value.trim();
  if (!normalized || normalized.startsWith('#')) return value;
  try {
    return new URL(normalized, baseUrl).href;
  } catch {
    return value;
  }
};

const rewriteCssImportsAbsolute = (cssText: string, baseUrl: string) => {
  const parts: string[] = [];
  let cursor = 0;
  for (const occurrence of findPortableCssImportOccurrences(cssText)) {
    parts.push(cssText.slice(cursor, occurrence.start));
    cursor = occurrence.end;
    const resolved = resolvePortableReference(occurrence.value, baseUrl);
    parts.push(`@import url("${escapeCssUrl(resolved)}")${occurrence.condition};`);
  }
  parts.push(cssText.slice(cursor));
  return parts.join('');
};

export const absolutizePortableCssReferences = (cssText: string, baseUrl: string) => {
  const imported = rewriteCssImportsAbsolute(cssText, baseUrl);
  const parts: string[] = [];
  let cursor = 0;
  for (const occurrence of findPortableCssUrlOccurrences(imported)) {
    parts.push(imported.slice(cursor, occurrence.start));
    cursor = occurrence.end;
    const resolved = resolvePortableReference(occurrence.value, baseUrl);
    parts.push(`url("${escapeCssUrl(resolved)}")`);
  }
  parts.push(imported.slice(cursor));
  return parts.join('');
};

const absolutizePortableSrcset = (srcset: string, baseUrl: string) => {
  const candidates: string[] = [];
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
    const descriptorStart = position;
    if (!endedWithSeparator) {
      let parentheses = 0;
      while (position < srcset.length) {
        const character = srcset[position];
        if (character === '(') parentheses += 1;
        else if (character === ')' && parentheses > 0) parentheses -= 1;
        else if (character === ',' && parentheses === 0) break;
        position += 1;
      }
    }
    const descriptor = srcset.slice(descriptorStart, position).trim();
    if (url) {
      const resolved = resolvePortableReference(url, baseUrl);
      candidates.push(descriptor ? `${resolved} ${descriptor}` : resolved);
    }
    if (srcset[position] === ',') position += 1;
  }
  return candidates.join(', ');
};

type PortableElementTreeRoot = Element | DocumentFragment;

const rewritePortableElementTree = (
  root: PortableElementTreeRoot,
  baseUrl: string,
  ownerDocument: Document,
) => {
  const elements: Element[] = [
    ...('tagName' in root ? [root as Element] : []),
    ...Array.from(root.querySelectorAll('*')),
  ];
  for (const element of elements) {
    for (const attribute of URL_ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value !== null) element.setAttribute(attribute, resolvePortableReference(value, baseUrl));
    }
    const srcset = element.getAttribute('srcset');
    if (srcset !== null) element.setAttribute('srcset', absolutizePortableSrcset(srcset, baseUrl));
    const style = element.getAttribute('style');
    if (style !== null) element.setAttribute('style', absolutizePortableCssReferences(style, baseUrl));
    if (element.tagName.toLowerCase() === 'style' && element.textContent) {
      element.textContent = absolutizePortableCssReferences(element.textContent, baseUrl);
    }
    const srcdoc = element.getAttribute('srcdoc');
    if (srcdoc !== null) element.setAttribute('srcdoc', absolutizePortableHtml(srcdoc, baseUrl, ownerDocument));

    // querySelectorAll() intentionally does not cross an HTMLTemplateElement's
    // inert DocumentFragment boundary. Recurse explicitly so content cloned by
    // an authored runtime keeps the original document's portable URLs.
    if (element.tagName.toLowerCase() === 'template') {
      const content = (element as HTMLTemplateElement).content;
      if (content) rewritePortableElementTree(content, baseUrl, ownerDocument);
    }
  }
};

export const absolutizePortableHtml = (
  html: string,
  baseUrl: string,
  ownerDocument: Document,
) => {
  const Parser = ownerDocument.defaultView?.DOMParser;
  if (!Parser) return html;
  const parsed = new Parser().parseFromString(html, 'text/html');
  const authoredBase = parsed.querySelector('base[href]')?.getAttribute('href');
  const effectiveBase = authoredBase ? resolvePortableReference(authoredBase, baseUrl) : baseUrl;
  rewritePortableElementTree(parsed.documentElement, effectiveBase, ownerDocument);
  parsed.querySelectorAll('base').forEach(element => element.remove());
  const doctype = parsed.doctype ? '<!doctype html>' : '';
  return `${doctype}${parsed.documentElement.outerHTML}`;
};

export const absolutizePortableElementUrls = (
  root: Element,
  baseUrl: string,
  ownerDocument: Document,
) => rewritePortableElementTree(root, baseUrl, ownerDocument);
