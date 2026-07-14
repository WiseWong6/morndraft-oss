import { findPublicCssImportOccurrences } from './captureResourceScanner';

export type PortableCssUrlOccurrence = {
  end: number;
  start: number;
  value: string;
};

export type PortableCssImportOccurrence = PortableCssUrlOccurrence & {
  condition: string;
};

const skipQuotedValue = (cssText: string, start: number) => {
  const quote = cssText[start];
  let index = start + 1;
  while (index < cssText.length) {
    if (cssText[index] === '\\') index += 2;
    else if (cssText[index] === quote) return index + 1;
    else index += 1;
  }
  return cssText.length;
};

export const decodePortableCssEscapes = (value: string) => {
  let decoded = '';
  let index = 0;
  while (index < value.length) {
    if (value[index] !== '\\') {
      decoded += value[index];
      index += 1;
      continue;
    }
    index += 1;
    if (value[index] === '\r' && value[index + 1] === '\n') {
      index += 2;
      continue;
    }
    if (/[\n\r\f]/u.test(value[index] ?? '')) {
      index += 1;
      continue;
    }
    const hex = value.slice(index).match(/^[0-9a-f]{1,6}/iu)?.[0] ?? '';
    if (hex) {
      const codePoint = Number.parseInt(hex, 16);
      decoded += codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? '\uFFFD'
        : String.fromCodePoint(codePoint);
      index += hex.length;
      if (/\s/u.test(value[index] ?? '')) index += 1;
      continue;
    }
    if (index < value.length) decoded += value[index];
    index += 1;
  }
  return decoded;
};

const readUrlFunction = (
  cssText: string,
  start: number,
): PortableCssUrlOccurrence | null => {
  const previous = start > 0 ? cssText[start - 1] : '';
  if (/[-\w]/u.test(previous) || cssText.slice(start, start + 3).toLowerCase() !== 'url') return null;
  let index = start + 3;
  while (/\s/u.test(cssText[index] ?? '')) index += 1;
  if (cssText[index] !== '(') return null;
  index += 1;
  while (/\s/u.test(cssText[index] ?? '')) index += 1;
  let value = '';
  if (cssText[index] === '"' || cssText[index] === "'") {
    const quote = cssText[index];
    const valueStart = index + 1;
    const quotedEnd = skipQuotedValue(cssText, index);
    if (quotedEnd === cssText.length && cssText[cssText.length - 1] !== quote) return null;
    value = decodePortableCssEscapes(cssText.slice(valueStart, Math.max(valueStart, quotedEnd - 1)));
    index = quotedEnd;
    while (/\s/u.test(cssText[index] ?? '')) index += 1;
  } else {
    const valueStart = index;
    while (index < cssText.length && cssText[index] !== ')') {
      index += cssText[index] === '\\' ? 2 : 1;
    }
    value = decodePortableCssEscapes(cssText.slice(valueStart, index).trim());
  }
  if (cssText[index] !== ')') return null;
  return { start, end: index + 1, value };
};

export const findPortableCssUrlOccurrences = (cssText: string) => {
  const occurrences: PortableCssUrlOccurrence[] = [];
  let index = 0;
  while (index < cssText.length) {
    const character = cssText[index];
    if (character === '"' || character === "'") {
      index = skipQuotedValue(cssText, index);
      continue;
    }
    if (character === '/' && cssText[index + 1] === '*') {
      const end = cssText.indexOf('*/', index + 2);
      index = end === -1 ? cssText.length : end + 2;
      continue;
    }
    const occurrence = readUrlFunction(cssText, index);
    if (occurrence) {
      occurrences.push(occurrence);
      index = occurrence.end;
      continue;
    }
    index += 1;
  }
  return occurrences;
};

export const findPortableCssImportOccurrences = (cssText: string) => {
  return findPublicCssImportOccurrences(cssText) as readonly PortableCssImportOccurrence[];
};
