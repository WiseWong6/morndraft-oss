const PUBLIC_DYNAMIC_ELEMENTS = new Set([
  'audio', 'canvas', 'details', 'dialog', 'embed', 'iframe', 'input',
  'object', 'script', 'select', 'textarea', 'video',
]);

const PUBLIC_DYNAMIC_URL_ATTRIBUTES = new Set([
  'action', 'formaction', 'href', 'src', 'xlink:href',
]);

const findTagEnd = (html: string, start: number) => {
  let quote = '';
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '>') return index;
  }
  return html.length;
};

const hasDynamicAttribute = (attributes: string) => {
  let index = 0;
  while (index < attributes.length) {
    while (/\s|\//u.test(attributes[index] ?? '')) index += 1;
    const nameStart = index;
    while (index < attributes.length && !/[\s=/>]/u.test(attributes[index])) index += 1;
    if (index === nameStart) {
      index += 1;
      continue;
    }
    const name = attributes.slice(nameStart, index).toLowerCase();
    while (/\s/u.test(attributes[index] ?? '')) index += 1;
    let value = '';
    if (attributes[index] === '=') {
      index += 1;
      while (/\s/u.test(attributes[index] ?? '')) index += 1;
      const quote = attributes[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        const valueStart = index;
        while (index < attributes.length && attributes[index] !== quote) index += 1;
        value = attributes.slice(valueStart, index);
        if (attributes[index] === quote) index += 1;
      } else {
        const valueStart = index;
        while (index < attributes.length && !/[\s>]/u.test(attributes[index])) index += 1;
        value = attributes.slice(valueStart, index);
      }
    }
    if (name === 'contenteditable' || /^on[a-z][\w:-]*$/u.test(name)) return true;
    const normalizedUrlValue = Array.from(value, character => (
      (character.codePointAt(0) ?? 0) <= 0x20 ? '' : character
    )).join('');
    if (
      PUBLIC_DYNAMIC_URL_ATTRIBUTES.has(name)
      && /^(?:javascript|vbscript):/iu.test(normalizedUrlValue)
    ) return true;
  }
  return false;
};

/**
 * Detect markup whose live sandbox can diverge from a deterministic bitmap.
 * This scanner follows HTML comment and style raw-text boundaries so examples
 * and CSS comments that merely contain "<script>" are not treated as nodes.
 */
export const hasPublicDynamicCaptureMarkup = (html: string) => {
  const lowerHtml = html.toLowerCase();
  let index = 0;
  while (index < html.length) {
    const tagStart = html.indexOf('<', index);
    if (tagStart === -1) return false;
    if (html.startsWith('<!--', tagStart)) {
      const commentEnd = html.indexOf('-->', tagStart + 4);
      if (commentEnd === -1) return false;
      index = commentEnd + 3;
      continue;
    }
    if (html[tagStart + 1] === '!' || html[tagStart + 1] === '?') {
      index = findTagEnd(html, tagStart + 2) + 1;
      continue;
    }
    const opening = html.slice(tagStart).match(/^<\s*(\/?)\s*([a-z][\w:-]*)/iu);
    if (!opening) {
      index = tagStart + 1;
      continue;
    }
    const closing = opening[1] === '/';
    const name = opening[2].toLowerCase();
    const attributesStart = tagStart + opening[0].length;
    const tagEnd = findTagEnd(html, attributesStart);
    if (!closing && PUBLIC_DYNAMIC_ELEMENTS.has(name)) return true;
    if (!closing && hasDynamicAttribute(html.slice(attributesStart, tagEnd))) return true;
    if (!closing && name === 'style') {
      const styleEnd = lowerHtml.indexOf('</style', Math.min(tagEnd + 1, html.length));
      if (styleEnd === -1) return false;
      index = styleEnd;
      continue;
    }
    index = Math.min(tagEnd + 1, html.length);
  }
  return false;
};
