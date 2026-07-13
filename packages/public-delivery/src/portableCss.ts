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
    value = cssText.slice(valueStart, Math.max(valueStart, quotedEnd - 1));
    index = quotedEnd;
    while (/\s/u.test(cssText[index] ?? '')) index += 1;
  } else {
    const valueStart = index;
    while (index < cssText.length && cssText[index] !== ')') index += 1;
    value = cssText.slice(valueStart, index).trim();
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
  const occurrences: PortableCssImportOccurrence[] = [];
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
    if (cssText.slice(index, index + 7).toLowerCase() !== '@import' || /[-\w]/u.test(cssText[index + 7] ?? '')) {
      index += 1;
      continue;
    }
    const start = index;
    index += 7;
    while (/\s/u.test(cssText[index] ?? '')) index += 1;
    let value = '';
    const urlOccurrence = readUrlFunction(cssText, index);
    if (urlOccurrence) {
      value = urlOccurrence.value;
      index = urlOccurrence.end;
    } else if (cssText[index] === '"' || cssText[index] === "'") {
      const quote = cssText[index];
      const valueStart = index + 1;
      const quotedEnd = skipQuotedValue(cssText, index);
      if (quotedEnd === cssText.length && cssText[cssText.length - 1] !== quote) continue;
      value = cssText.slice(valueStart, Math.max(valueStart, quotedEnd - 1));
      index = quotedEnd;
    } else {
      continue;
    }
    const conditionStart = index;
    let parentheses = 0;
    while (index < cssText.length) {
      if (cssText[index] === '"' || cssText[index] === "'") {
        index = skipQuotedValue(cssText, index);
        continue;
      }
      if (cssText[index] === '(') parentheses += 1;
      else if (cssText[index] === ')' && parentheses > 0) parentheses -= 1;
      else if (cssText[index] === ';' && parentheses === 0) break;
      index += 1;
    }
    if (cssText[index] !== ';') continue;
    occurrences.push({
      start,
      end: index + 1,
      value,
      condition: cssText.slice(conditionStart, index),
    });
    index += 1;
  }
  return occurrences;
};
