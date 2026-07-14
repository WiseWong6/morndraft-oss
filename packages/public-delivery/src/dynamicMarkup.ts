const PUBLIC_DYNAMIC_ELEMENTS = new Set([
  'audio', 'canvas', 'details', 'dialog', 'embed', 'iframe', 'input',
  'object', 'script', 'select', 'textarea', 'video',
]);

const PUBLIC_DYNAMIC_URL_ATTRIBUTES = new Set([
  'action', 'formaction', 'href', 'src', 'xlink:href',
]);

const isHtmlWhitespace = (character: string | undefined) => (
  character === ' '
  || character === '\t'
  || character === '\n'
  || character === '\f'
  || character === '\r'
);

const isAsciiLetter = (character: string | undefined) => {
  const code = character?.charCodeAt(0) ?? 0;
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
};

const isTagNameCharacter = (character: string | undefined) => {
  const code = character?.charCodeAt(0) ?? 0;
  return isAsciiLetter(character)
    || (code >= 48 && code <= 57)
    || character === '_'
    || character === ':'
    || character === '-';
};

const toAsciiLowerCodeUnit = (code: number) => (
  code >= 0x41 && code <= 0x5a ? code + 0x20 : code
);

const startsWithAsciiCaseInsensitive = (value: string, candidate: string, start: number) => {
  if (start < 0 || start + candidate.length > value.length) return false;
  for (let offset = 0; offset < candidate.length; offset += 1) {
    if (toAsciiLowerCodeUnit(value.charCodeAt(start + offset)) !== candidate.charCodeAt(offset)) {
      return false;
    }
  }
  return true;
};

const readTagOpening = (html: string, tagStart: number) => {
  let index = tagStart + 1;
  while (isHtmlWhitespace(html[index])) index += 1;
  const closing = html[index] === '/';
  if (closing) index += 1;
  while (isHtmlWhitespace(html[index])) index += 1;
  if (!isAsciiLetter(html[index])) return null;
  const nameStart = index;
  index += 1;
  while (isTagNameCharacter(html[index])) index += 1;
  return {
    attributesStart: index,
    closing,
    name: html.slice(nameStart, index).toLowerCase(),
  };
};

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

const findBogusCommentEnd = (html: string, start: number) => {
  const end = html.indexOf('>', start);
  return end === -1 ? html.length : end + 1;
};

type HtmlCommentState =
  | 'comment'
  | 'end'
  | 'end-bang'
  | 'end-dash'
  | 'less-than'
  | 'less-than-bang'
  | 'less-than-bang-dash'
  | 'less-than-bang-dash-dash'
  | 'start'
  | 'start-dash';

const findHtmlCommentEnd = (html: string, start: number) => {
  let index = start;
  let state: HtmlCommentState = 'start';
  while (index < html.length) {
    const character = html[index];
    if (state === 'start') {
      if (character === '>') return index + 1;
      state = character === '-' ? 'start-dash' : 'comment';
      index += 1;
      continue;
    }
    if (state === 'start-dash') {
      if (character === '>') return index + 1;
      state = character === '-' ? 'end' : 'comment';
      index += 1;
      continue;
    }
    if (state === 'comment') {
      state = character === '<'
        ? 'less-than'
        : character === '-'
          ? 'end-dash'
          : 'comment';
      index += 1;
      continue;
    }
    if (state === 'less-than') {
      if (character === '!') {
        state = 'less-than-bang';
        index += 1;
      } else if (character === '<') {
        index += 1;
      } else {
        state = 'comment';
      }
      continue;
    }
    if (state === 'less-than-bang') {
      if (character === '-') {
        state = 'less-than-bang-dash';
        index += 1;
      } else {
        state = 'comment';
      }
      continue;
    }
    if (state === 'less-than-bang-dash') {
      if (character === '-') {
        state = 'less-than-bang-dash-dash';
        index += 1;
      } else {
        state = 'end-dash';
      }
      continue;
    }
    if (state === 'less-than-bang-dash-dash') {
      state = 'end';
      continue;
    }
    if (state === 'end-dash') {
      if (character === '-') {
        state = 'end';
        index += 1;
      } else {
        state = 'comment';
      }
      continue;
    }
    if (state === 'end') {
      if (character === '>') return index + 1;
      if (character === '-') {
        index += 1;
      } else if (character === '!') {
        state = 'end-bang';
        index += 1;
      } else {
        state = 'comment';
      }
      continue;
    }
    if (character === '>') return index + 1;
    if (character === '-') {
      state = 'end-dash';
      index += 1;
    } else {
      state = 'comment';
    }
  }
  return -1;
};

const findRawTextEndTag = (html: string, tagName: string, start: number) => {
  let searchFrom = start;
  while (searchFrom < html.length) {
    const candidate = html.indexOf('<', searchFrom);
    if (candidate === -1) return -1;
    const nameStart = candidate + 2;
    if (
      html[candidate + 1] === '/'
      && startsWithAsciiCaseInsensitive(html, tagName, nameStart)
    ) {
      const boundary = html[nameStart + tagName.length];
      if (isHtmlWhitespace(boundary) || boundary === '/' || boundary === '>') return candidate;
    }
    searchFrom = candidate + 1;
  }
  return -1;
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
  let index = 0;
  while (index < html.length) {
    const tagStart = html.indexOf('<', index);
    if (tagStart === -1) return false;
    if (html.startsWith('<!--', tagStart)) {
      const commentEnd = findHtmlCommentEnd(html, tagStart + 4);
      if (commentEnd === -1) return false;
      index = commentEnd;
      continue;
    }
    if (html[tagStart + 1] === '!' || html[tagStart + 1] === '?') {
      index = findBogusCommentEnd(html, tagStart + 2);
      continue;
    }
    const opening = readTagOpening(html, tagStart);
    if (!opening) {
      index = tagStart + 1;
      continue;
    }
    const tagEnd = findTagEnd(html, opening.attributesStart);
    if (!opening.closing && PUBLIC_DYNAMIC_ELEMENTS.has(opening.name)) return true;
    if (!opening.closing && hasDynamicAttribute(html.slice(opening.attributesStart, tagEnd))) return true;
    if (!opening.closing && opening.name === 'style') {
      const styleEnd = findRawTextEndTag(html, 'style', Math.min(tagEnd + 1, html.length));
      if (styleEnd === -1) return false;
      index = styleEnd;
      continue;
    }
    index = Math.min(tagEnd + 1, html.length);
  }
  return false;
};
