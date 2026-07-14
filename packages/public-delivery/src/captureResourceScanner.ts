export type PublicCssResourceOccurrence = Readonly<{
  end: number;
  kind: 'image-set-string' | 'url';
  start: number;
  value: string;
}>;

export type PublicCssImportOccurrence = Readonly<{
  condition: string;
  end: number;
  start: number;
  value: string;
}>;

export type PublicCssResourceScan = Readonly<{
  imports: readonly PublicCssImportOccurrence[];
  malformed: boolean;
  occurrences: readonly PublicCssResourceOccurrence[];
}>;

export type PublicSrcsetUrlOccurrence = Readonly<{
  end: number;
  start: number;
  value: string;
}>;

const isCssWhitespace = (value: string | undefined) => (
  value === ' '
  || value === '\n'
  || value === '\r'
  || value === '\t'
  || value === '\f'
);

const isCssHexDigit = (value: string | undefined) => (
  value !== undefined && (
    (value >= '0' && value <= '9')
    || (value >= 'A' && value <= 'F')
    || (value >= 'a' && value <= 'f')
  )
);

const isCssIdentifierCharacter = (value: string | undefined) => {
  if (!value) return false;
  const code = value.charCodeAt(0);
  return (code >= 0x30 && code <= 0x39)
    || (code >= 0x41 && code <= 0x5a)
    || (code >= 0x61 && code <= 0x7a)
    || code >= 0x80
    || value === '-'
    || value === '_';
};

const toAsciiLower = (value: string) => {
  let normalized = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    normalized += code >= 0x41 && code <= 0x5a
      ? String.fromCharCode(code + 0x20)
      : value[index];
  }
  return normalized;
};

const skipCssComment = (css: string, start: number) => {
  const end = css.indexOf('*/', start + 2);
  return end < 0 ? css.length : end + 2;
};

const skipCssComments = (css: string, start: number) => {
  let index = start;
  while (css.startsWith('/*', index)) index = skipCssComment(css, index);
  return index;
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

const readCssEscape = (css: string, start: number) => {
  let index = start + 1;
  if (index >= css.length) return { malformed: true, next: index, value: '' };
  if (isCssHexDigit(css[index])) {
    const hexStart = index;
    while (index < css.length && index - hexStart < 6 && isCssHexDigit(css[index])) index += 1;
    const codePoint = Number.parseInt(css.slice(hexStart, index), 16);
    if (css[index] === '\r' && css[index + 1] === '\n') index += 2;
    else if (isCssWhitespace(css[index])) index += 1;
    const validCodePoint = codePoint !== 0
      && codePoint <= 0x10ffff
      && !(codePoint >= 0xd800 && codePoint <= 0xdfff);
    return {
      malformed: false,
      next: index,
      value: String.fromCodePoint(validCodePoint ? codePoint : 0xfffd),
    };
  }
  if (css[index] === '\r' && css[index + 1] === '\n') {
    return { malformed: false, next: index + 2, value: '' };
  }
  if (css[index] === '\n' || css[index] === '\r' || css[index] === '\f') {
    return { malformed: false, next: index + 1, value: '' };
  }
  return { malformed: false, next: index + 1, value: css[index] };
};

const readCssIdentifier = (css: string, start: number) => {
  let index = start;
  let malformed = false;
  let value = '';
  while (index < css.length) {
    if (css.startsWith('/*', index)) {
      const next = skipCssComment(css, index);
      if (next === css.length && !css.endsWith('*/')) malformed = true;
      index = next;
      continue;
    }
    if (css[index] === '\\') {
      const escaped = readCssEscape(css, index);
      malformed ||= escaped.malformed;
      value += escaped.value;
      index = escaped.next;
      continue;
    }
    if (!isCssIdentifierCharacter(css[index])) break;
    value += css[index];
    index += 1;
  }
  return { malformed, next: index, value: toAsciiLower(value) };
};

const readCssString = (css: string, start: number) => {
  const quote = css[start];
  let index = start + 1;
  let value = '';
  while (index < css.length) {
    if (css[index] === quote) {
      return { end: index + 1, malformed: false, value };
    }
    if (css[index] === '\\') {
      const escaped = readCssEscape(css, index);
      if (escaped.malformed) return { end: escaped.next, malformed: true, value };
      value += escaped.value;
      index = escaped.next;
      continue;
    }
    if (css[index] === '\n' || css[index] === '\r' || css[index] === '\f') {
      return { end: index, malformed: true, value };
    }
    value += css[index];
    index += 1;
  }
  return { end: index, malformed: true, value };
};

const readCssUrlFunction = (
  css: string,
  identifierStart: number,
  identifierEnd: number,
): { end: number; malformed: boolean; occurrence?: PublicCssResourceOccurrence } => {
  const open = skipCssComments(css, identifierEnd);
  if (css[open] !== '(') return { end: Math.max(open, identifierEnd), malformed: false };
  let index = skipCssIgnorable(css, open + 1);
  if (css[index] === '"' || css[index] === "'") {
    const string = readCssString(css, index);
    if (string.malformed) return { end: string.end, malformed: true };
    index = skipCssIgnorable(css, string.end);
    if (css[index] !== ')') return { end: Math.max(index, string.end), malformed: true };
    return {
      end: index + 1,
      malformed: false,
      occurrence: {
        end: index + 1,
        kind: 'url',
        start: identifierStart,
        value: string.value.trim(),
      },
    };
  }

  let value = '';
  while (index < css.length) {
    if (css[index] === ')') {
      return {
        end: index + 1,
        malformed: false,
        occurrence: {
          end: index + 1,
          kind: 'url',
          start: identifierStart,
          value: value.trim(),
        },
      };
    }
    if (isCssWhitespace(css[index]) || css.startsWith('/*', index)) {
      index = skipCssIgnorable(css, index);
      if (css[index] !== ')') return { end: index, malformed: true };
      continue;
    }
    if (css[index] === '\\') {
      const escaped = readCssEscape(css, index);
      if (escaped.malformed) return { end: escaped.next, malformed: true };
      value += escaped.value;
      index = escaped.next;
      continue;
    }
    const code = css.charCodeAt(index);
    if (
      css[index] === '"'
      || css[index] === "'"
      || css[index] === '('
      || code <= 0x08
      || code === 0x0b
      || (code >= 0x0e && code <= 0x1f)
      || code === 0x7f
    ) return { end: index + 1, malformed: true };
    value += css[index];
    index += 1;
  }
  return { end: index, malformed: true };
};

const readCssImport = (
  css: string,
  start: number,
): { end: number; importOccurrence?: PublicCssImportOccurrence; malformed: boolean } => {
  let identifierIndex = start + 1;
  let identifierMalformed = false;
  let identifierValue = '';
  while (identifierIndex < css.length) {
    if (css.startsWith('/*', identifierIndex)) {
      // Browsers accept comments both inside an escaped at-keyword and as the
      // delimiter before its prelude. Once the complete import name has been
      // decoded, leave the comment for skipCssIgnorable instead of merging the
      // following url token into an artificial "importurl" identifier.
      if (toAsciiLower(identifierValue) === 'import') break;
      const next = skipCssComment(css, identifierIndex);
      identifierMalformed ||= next === css.length && !css.endsWith('*/');
      identifierIndex = next;
      continue;
    }
    if (css[identifierIndex] === '\\') {
      const escaped = readCssEscape(css, identifierIndex);
      identifierMalformed ||= escaped.malformed;
      identifierValue += escaped.value;
      identifierIndex = escaped.next;
      continue;
    }
    if (!isCssIdentifierCharacter(css[identifierIndex])) break;
    identifierValue += css[identifierIndex];
    identifierIndex += 1;
  }
  const identifier = {
    malformed: identifierMalformed,
    next: identifierIndex,
    value: toAsciiLower(identifierValue),
  };
  if (identifier.malformed || identifier.value !== 'import') {
    return { end: Math.max(identifier.next, start + 1), malformed: identifier.malformed };
  }
  let index = skipCssIgnorable(css, identifier.next);
  let value = '';
  if (css[index] === '"' || css[index] === "'") {
    const string = readCssString(css, index);
    if (string.malformed) return { end: string.end, malformed: true };
    value = string.value.trim();
    index = string.end;
  } else {
    const urlIdentifier = readCssIdentifier(css, index);
    if (urlIdentifier.malformed || urlIdentifier.value !== 'url') {
      return { end: Math.max(urlIdentifier.next, index + 1), malformed: true };
    }
    const url = readCssUrlFunction(css, index, urlIdentifier.next);
    if (url.malformed || !url.occurrence) {
      return { end: Math.max(url.end, index + 1), malformed: true };
    }
    value = url.occurrence.value;
    index = url.occurrence.end;
  }
  if (!value) return { end: index, malformed: true };
  const conditionStart = index;
  let parentheses = 0;
  while (index < css.length) {
    if (css.startsWith('/*', index)) {
      const next = skipCssComment(css, index);
      if (next === css.length && !css.endsWith('*/')) return { end: next, malformed: true };
      index = next;
      continue;
    }
    if (css[index] === '"' || css[index] === "'") {
      const string = readCssString(css, index);
      if (string.malformed) return { end: string.end, malformed: true };
      index = string.end;
      continue;
    }
    if (css[index] === '(') parentheses += 1;
    else if (css[index] === ')') {
      if (parentheses === 0) return { end: index + 1, malformed: true };
      parentheses -= 1;
    } else if ((css[index] === '{' || css[index] === '}') && parentheses === 0) {
      return { end: index + 1, malformed: true };
    } else if (css[index] === ';' && parentheses === 0) {
      return {
        end: index + 1,
        importOccurrence: {
          condition: css.slice(conditionStart, index),
          end: index + 1,
          start,
          value,
        },
        malformed: false,
      };
    }
    index += 1;
  }
  return { end: index, malformed: true };
};

/**
 * Monotonic CSS resource scan. It decodes CSS escapes in function names and
 * values, ignores comments and inert strings, and treats malformed url() or
 * image-set() syntax as unsafe instead of guessing a resource boundary.
 */
export const scanPublicCssResources = (css: string): PublicCssResourceScan => {
  const occurrences: PublicCssResourceOccurrence[] = [];
  const imports: PublicCssImportOccurrence[] = [];
  const functionStack: Array<{ candidateStart: boolean; imageSet: boolean }> = [];
  let malformed = false;
  let index = 0;
  const currentFunction = () => functionStack[functionStack.length - 1];
  const consumeImageSetCandidate = () => {
    const current = currentFunction();
    if (current?.imageSet) current.candidateStart = false;
  };
  while (index < css.length) {
    if (css.startsWith('/*', index)) {
      const next = skipCssComment(css, index);
      malformed ||= next === css.length && !css.endsWith('*/');
      index = next;
      continue;
    }
    if (css[index] === '"' || css[index] === "'") {
      const string = readCssString(css, index);
      malformed ||= string.malformed;
      const current = currentFunction();
      if (current?.imageSet && current.candidateStart && string.value.trim()) {
        occurrences.push({
          end: string.end,
          kind: 'image-set-string',
          start: index,
          value: string.value.trim(),
        });
      }
      consumeImageSetCandidate();
      index = Math.max(string.end, index + 1);
      continue;
    }
    if (css[index] === '@') {
      consumeImageSetCandidate();
      const result = readCssImport(css, index);
      malformed ||= result.malformed;
      if (result.importOccurrence) {
        imports.push(result.importOccurrence);
        index = result.end;
        continue;
      }
      index = Math.max(result.end, index + 1);
      continue;
    }
    if (css[index] !== '\\' && !isCssIdentifierCharacter(css[index])) {
      if (css[index] === '(') {
        consumeImageSetCandidate();
        functionStack.push({ candidateStart: false, imageSet: false });
      } else if (css[index] === ')') {
        functionStack.pop();
      } else if (css[index] === ',' && currentFunction()?.imageSet) {
        currentFunction().candidateStart = true;
      } else if (!isCssWhitespace(css[index])) {
        consumeImageSetCandidate();
      }
      index += 1;
      continue;
    }
    const identifierStart = index;
    const identifier = readCssIdentifier(css, index);
    malformed ||= identifier.malformed;
    const open = skipCssComments(css, identifier.next);
    if (identifier.value === 'url' && css[open] === '(') {
      consumeImageSetCandidate();
      const result = readCssUrlFunction(css, identifierStart, identifier.next);
      malformed ||= result.malformed;
      if (result.occurrence) {
        occurrences.push(result.occurrence);
        index = result.occurrence.end;
        continue;
      }
      index = Math.max(result.end, open + 1);
      continue;
    }
    if (css[open] === '(') {
      consumeImageSetCandidate();
      functionStack.push({
        candidateStart: true,
        imageSet: identifier.value === 'image-set' || identifier.value === '-webkit-image-set',
      });
      index = open + 1;
      continue;
    }
    consumeImageSetCandidate();
    index = Math.max(identifier.next, index + 1);
  }
  malformed ||= functionStack.some(context => context.imageSet);
  return { imports, malformed, occurrences };
};

export const findPublicCssImportOccurrences = (css: string) => scanPublicCssResources(css).imports;

export const findPublicSrcsetUrlOccurrences = (srcset: string) => {
  const occurrences: PublicSrcsetUrlOccurrence[] = [];
  let position = 0;
  while (position < srcset.length) {
    while (position < srcset.length && /[\s,]/u.test(srcset[position])) position += 1;
    if (position >= srcset.length) break;
    const start = position;
    while (position < srcset.length && !/\s/u.test(srcset[position])) position += 1;
    let end = position;
    let endedWithSeparator = false;
    while (end > start && srcset[end - 1] === ',') {
      endedWithSeparator = true;
      end -= 1;
    }
    if (end > start) occurrences.push({ end, start, value: srcset.slice(start, end) });
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
  return occurrences;
};

export const isPublicCssFragmentReference = (value: string) => (
  /^#[A-Za-z_][A-Za-z0-9_.:-]*$/u.test(value.trim())
);
