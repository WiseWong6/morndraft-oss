import {
  PUBLIC_IMPORT_MAX_EXPANDED_SOURCE_LENGTH,
  PUBLIC_IMPORT_MAX_IMAGE_REPLACEMENTS,
} from './publicImportContract';

type PublicImageReferenceResolver = (reference: string) => string | null;

type PublicHtmlParserRuntime = typeof import('parse5');
type PublicHtmlEntityRuntime = typeof import('entities/decode');
type PublicHtmlAttributeNode = {
  name: string;
  namespace?: string;
  prefix?: string;
  value: string;
};
type PublicHtmlLocation = {
  endOffset: number;
  startOffset: number;
  endTag?: { endOffset: number; startOffset: number };
  startTag?: { endOffset: number; startOffset: number };
};
type PublicHtmlNode = {
  attrs?: PublicHtmlAttributeNode[];
  childNodes?: PublicHtmlNode[];
  content?: PublicHtmlNode;
  namespaceURI?: string;
  nodeName: string;
  sourceCodeLocation?: PublicHtmlLocation | null;
  tagName?: string;
};

type PublicHtmlReplacement = { end: number; start: number; value: string };
type PublicHtmlAttribute = { end: number; start: number };

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const MATHML_NAMESPACE = 'http://www.w3.org/1998/Math/MathML';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const MAX_PUBLIC_HTML_ATTRIBUTES_PER_TAG = 4_096;
const MAX_PUBLIC_HTML_IMAGE_ATTRIBUTE_LENGTH = 256 * 1024;
const MAX_PUBLIC_HTML_IMPORT_NODES = 65_536;
const MAX_PUBLIC_HTML_TAG_CANDIDATES = 16_384;
const MAX_PUBLIC_HTML_TOTAL_ATTRIBUTES = 16_384;

export class PublicHtmlImageReferenceBudgetError extends Error {}

const isPublicHtmlSpace = (character: string | undefined) => (
  character === ' ' || character === '\t' || character === '\n' || character === '\r' || character === '\f'
);

const isPublicHtmlAsciiLetter = (character: string | undefined) => {
  if (!character) return false;
  const codeUnit = character.charCodeAt(0);
  return (codeUnit >= 65 && codeUnit <= 90) || (codeUnit >= 97 && codeUnit <= 122);
};

const assertPublicHtmlImageReferenceBudget = (source: string) => {
  let tagCandidates = 0;
  let totalAttributes = 0;
  let attributesInTag = 0;
  let inStartTag = false;
  let quote: '"' | "'" | null = null;
  let phase: 'tag-name' | 'before-attribute' | 'attribute-name' | 'after-attribute-name' | 'before-value' | 'unquoted-value' = 'tag-name';
  const countAttribute = () => {
    attributesInTag += 1;
    totalAttributes += 1;
    if (attributesInTag > MAX_PUBLIC_HTML_ATTRIBUTES_PER_TAG) {
      throw new PublicHtmlImageReferenceBudgetError(
        `HTML start tag exceeds the ${MAX_PUBLIC_HTML_ATTRIBUTES_PER_TAG}-attribute safety limit.`,
      );
    }
    if (totalAttributes > MAX_PUBLIC_HTML_TOTAL_ATTRIBUTES) {
      throw new PublicHtmlImageReferenceBudgetError(
        `HTML source exceeds the ${MAX_PUBLIC_HTML_TOTAL_ATTRIBUTES}-attribute safety limit.`,
      );
    }
  };
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    const character = source[cursor];
    if (character === '<') {
      tagCandidates += 1;
      if (tagCandidates > MAX_PUBLIC_HTML_TAG_CANDIDATES) {
        throw new PublicHtmlImageReferenceBudgetError(
          `HTML source exceeds the ${MAX_PUBLIC_HTML_TAG_CANDIDATES}-tag-candidate safety limit.`,
        );
      }
    }
    if (!inStartTag) {
      if (character === '<' && isPublicHtmlAsciiLetter(source[cursor + 1])) {
        inStartTag = true;
        attributesInTag = 0;
        phase = 'tag-name';
      } else if (
        character === '<' && source[cursor + 1] === '/' &&
        isPublicHtmlAsciiLetter(source[cursor + 2])
      ) {
        inStartTag = true;
        attributesInTag = 0;
        phase = 'tag-name';
        cursor += 1;
      }
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = null;
        phase = 'before-attribute';
      }
      continue;
    }
    if (phase === 'tag-name') {
      if (character === '>') inStartTag = false;
      else if (character === '/') phase = 'before-attribute';
      else if (isPublicHtmlSpace(character)) phase = 'before-attribute';
      continue;
    }
    if (phase === 'before-attribute') {
      if (isPublicHtmlSpace(character)) continue;
      if (character === '>' || (character === '/' && source[cursor + 1] === '>')) {
        inStartTag = false;
        continue;
      }
      countAttribute();
      phase = character === '=' ? 'before-value' : 'attribute-name';
      continue;
    }
    if (phase === 'attribute-name') {
      if (character === '=') phase = 'before-value';
      else if (character === '>') inStartTag = false;
      else if (character === '/') phase = 'before-attribute';
      else if (isPublicHtmlSpace(character)) phase = 'after-attribute-name';
      continue;
    }
    if (phase === 'after-attribute-name') {
      if (isPublicHtmlSpace(character)) continue;
      if (character === '=') {
        phase = 'before-value';
      } else if (character === '>' || (character === '/' && source[cursor + 1] === '>')) {
        inStartTag = false;
      } else {
        countAttribute();
        phase = 'attribute-name';
      }
      continue;
    }
    if (phase === 'before-value') {
      if (isPublicHtmlSpace(character)) continue;
      if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        inStartTag = false;
      } else {
        phase = 'unquoted-value';
      }
      continue;
    }
    if (character === '>') inStartTag = false;
    else if (isPublicHtmlSpace(character)) phase = 'before-attribute';
  }
};

let publicHtmlParserRuntime: Promise<PublicHtmlParserRuntime> | undefined;
let publicHtmlEntityRuntime: Promise<PublicHtmlEntityRuntime> | undefined;
const loadPublicHtmlParserRuntime = () => {
  publicHtmlParserRuntime ??= import('parse5');
  return publicHtmlParserRuntime;
};
const loadPublicHtmlEntityRuntime = () => {
  publicHtmlEntityRuntime ??= import('entities/decode');
  return publicHtmlEntityRuntime;
};

const toAsciiLowerCase = (value: string) => {
  let folded = '';
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    folded += String.fromCharCode(codeUnit >= 65 && codeUnit <= 90 ? codeUnit + 32 : codeUnit);
  }
  return folded;
};

const readPublicHtmlStartTagAttributes = (
  source: string,
  start: number,
  limit: number,
) => {
  const attributes = new Map<string, PublicHtmlAttribute>();
  let cursor = start + 1;
  while (
    cursor < limit && !isPublicHtmlSpace(source[cursor]) &&
    source[cursor] !== '/' && source[cursor] !== '>'
  ) cursor += 1;
  while (cursor < limit) {
    while (cursor < limit && isPublicHtmlSpace(source[cursor])) cursor += 1;
    if (source[cursor] === '>' || (source[cursor] === '/' && source[cursor + 1] === '>')) break;
    const attributeNameStart = cursor;
    while (
      cursor < limit && !isPublicHtmlSpace(source[cursor]) &&
      source[cursor] !== '=' && source[cursor] !== '/' && source[cursor] !== '>'
    ) cursor += 1;
    if (cursor === attributeNameStart) {
      cursor += 1;
      continue;
    }
    const attributeName = toAsciiLowerCase(source.slice(attributeNameStart, cursor));
    const isFirstAttribute = !attributes.has(attributeName);
    while (cursor < limit && isPublicHtmlSpace(source[cursor])) cursor += 1;
    if (source[cursor] !== '=') {
      if (isFirstAttribute) attributes.set(attributeName, { end: cursor, start: cursor });
      continue;
    }
    cursor += 1;
    while (cursor < limit && isPublicHtmlSpace(source[cursor])) cursor += 1;

    let valueStart = cursor;
    let valueEnd = cursor;
    const quote = source[cursor] === '"' || source[cursor] === "'" ? source[cursor] : null;
    if (quote) {
      valueStart = ++cursor;
      while (cursor < limit && source[cursor] !== quote) cursor += 1;
      valueEnd = cursor;
      if (cursor < limit) cursor += 1;
    } else {
      while (cursor < limit && !isPublicHtmlSpace(source[cursor]) && source[cursor] !== '>') cursor += 1;
      valueEnd = cursor;
    }
    if (isFirstAttribute) attributes.set(attributeName, { end: valueEnd, start: valueStart });
  }
  return attributes;
};

const decodePublicHtmlAttributeWithOffsets = (raw: string, runtime: PublicHtmlEntityRuntime) => {
  // An HTML character reference never expands beyond its raw UTF-16 length,
  // so fixed-width maps avoid the much larger boxed-number arrays on a
  // near-limit srcset while preserving exact raw replacement boundaries.
  const rawEnds = new Uint32Array(raw.length);
  const rawStarts = new Uint32Array(raw.length);
  const valueParts: string[] = [];
  let decodedLength = 0;
  let entityStart = 0;
  const append = (text: string, start: number, end: number) => {
    valueParts.push(text);
    for (let index = 0; index < text.length; index += 1) {
      rawStarts[decodedLength] = start;
      rawEnds[decodedLength] = end;
      decodedLength += 1;
    }
  };
  const appendLiteral = (start: number, end: number) => {
    valueParts.push(raw.slice(start, end));
    for (let index = start; index < end; index += 1) {
      rawStarts[decodedLength] = index;
      rawEnds[decodedLength] = index + 1;
      decodedLength += 1;
    }
  };
  const decoder = new runtime.EntityDecoder(runtime.htmlDecodeTree, (codePoint, consumed) => {
    append(String.fromCodePoint(codePoint), entityStart, entityStart + consumed);
  });
  let lastIndex = 0;
  let searchFrom = 0;
  while ((entityStart = raw.indexOf('&', searchFrom)) >= 0) {
    appendLiteral(lastIndex, entityStart);
    decoder.startEntity(runtime.DecodingMode.Attribute);
    let consumed = decoder.write(raw, entityStart + 1);
    if (consumed < 0) consumed = decoder.end();
    lastIndex = entityStart + consumed;
    searchFrom = consumed === 0 ? entityStart + 1 : lastIndex;
    if (lastIndex >= raw.length) break;
  }
  appendLiteral(lastIndex, raw.length);
  return {
    rawEnds: rawEnds.subarray(0, decodedLength),
    rawStarts: rawStarts.subarray(0, decodedLength),
    value: valueParts.join(''),
  };
};

const hasValidPublicSrcsetDescriptors = (value: string) => {
  const descriptors = value.trim().split(/[\t\n\f\r ]+/u).filter(Boolean);
  let density = false;
  let height = false;
  let width = false;
  for (const descriptor of descriptors) {
    const suffix = descriptor.at(-1)?.toLowerCase();
    const number = descriptor.slice(0, -1);
    if (suffix === 'w' || suffix === 'h') {
      if (!/^\d+$/u.test(number) || Number(number) <= 0) return false;
      if (suffix === 'w') {
        if (width || density) return false;
        width = true;
      } else {
        if (height || density) return false;
        height = true;
      }
      continue;
    }
    if (suffix === 'x') {
      if (
        density || width || height ||
        !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(number) ||
        !Number.isFinite(Number(number)) || Number(number) <= 0
      ) return false;
      density = true;
      continue;
    }
    return false;
  }
  return !height || width;
};

const getPublicHtmlSrcsetReplacements = (
  source: string,
  attribute: PublicHtmlAttribute,
  runtime: PublicHtmlEntityRuntime,
  resolveReference: PublicImageReferenceResolver,
) => {
  const decoded = decodePublicHtmlAttributeWithOffsets(source.slice(attribute.start, attribute.end), runtime);
  const replacements: PublicHtmlReplacement[] = [];
  let cursor = 0;
  while (cursor < decoded.value.length) {
    while (cursor < decoded.value.length && (isPublicHtmlSpace(decoded.value[cursor]) || decoded.value[cursor] === ',')) cursor += 1;
    const urlStart = cursor;
    while (cursor < decoded.value.length && !isPublicHtmlSpace(decoded.value[cursor])) cursor += 1;
    let urlEnd = cursor;
    while (urlEnd > urlStart && decoded.value[urlEnd - 1] === ',') urlEnd -= 1;
    let descriptorsValid = true;
    if (urlEnd === cursor) {
      const descriptorStart = cursor;
      let descriptorEnd = cursor;
      let parentheses = 0;
      while (cursor < decoded.value.length) {
        const character = decoded.value[cursor++];
        if (character === '(') parentheses += 1;
        else if (character === ')' && parentheses > 0) parentheses -= 1;
        else if (character === ',' && parentheses === 0) {
          descriptorEnd = cursor - 1;
          break;
        }
        descriptorEnd = cursor;
      }
      descriptorsValid = hasValidPublicSrcsetDescriptors(decoded.value.slice(descriptorStart, descriptorEnd));
    }
    const value = descriptorsValid && urlEnd > urlStart
      ? resolveReference(decoded.value.slice(urlStart, urlEnd))
      : null;
    if (value) {
      if (replacements.length >= PUBLIC_IMPORT_MAX_IMAGE_REPLACEMENTS) {
        throw new PublicHtmlImageReferenceBudgetError(
          `HTML source exceeds the ${PUBLIC_IMPORT_MAX_IMAGE_REPLACEMENTS}-image-reference safety limit.`,
        );
      }
      replacements.push({
        start: attribute.start + decoded.rawStarts[urlStart]!,
        end: attribute.start + decoded.rawEnds[urlEnd - 1]!,
        value,
      });
    }
  }
  return replacements;
};

const getPublicHtmlAttribute = (node: PublicHtmlNode, name: string) => node.attrs?.find(attribute => (
  name === 'xlink:href'
    ? attribute.prefix === 'xlink' && attribute.name === 'href'
    : !attribute.prefix && attribute.name === name
));

const getPublicHtmlRawAttribute = (
  rawAttributes: ReadonlyMap<string, PublicHtmlAttribute>,
  attribute: PublicHtmlAttributeNode | undefined,
) => {
  if (!attribute) return undefined;
  const rawName = attribute.prefix ? `${attribute.prefix}:${attribute.name}` : attribute.name;
  return rawAttributes.get(toAsciiLowerCase(rawName));
};

const getPublicHtmlImageReplacements = (
  source: string,
  node: PublicHtmlNode,
  parent: PublicHtmlNode | null,
  rawAttributes: ReadonlyMap<string, PublicHtmlAttribute>,
  runtime: PublicHtmlEntityRuntime,
  resolveReference: PublicImageReferenceResolver,
) => {
  const replacements: PublicHtmlReplacement[] = [];
  const tagName = node.tagName?.toLowerCase() ?? '';
  const addUrl = (name: string) => {
    const parsedAttribute = getPublicHtmlAttribute(node, name);
    const rawAttribute = getPublicHtmlRawAttribute(rawAttributes, parsedAttribute);
    if (rawAttribute && rawAttribute.end - rawAttribute.start > MAX_PUBLIC_HTML_IMAGE_ATTRIBUTE_LENGTH) {
      throw new PublicHtmlImageReferenceBudgetError(
        `HTML image attribute exceeds the ${MAX_PUBLIC_HTML_IMAGE_ATTRIBUTE_LENGTH}-character safety limit.`,
      );
    }
    const value = parsedAttribute && rawAttribute && rawAttribute.end > rawAttribute.start
      ? resolveReference(parsedAttribute.value)
      : null;
    if (rawAttribute && value) replacements.push({ start: rawAttribute.start, end: rawAttribute.end, value });
  };
  const addSrcset = () => {
    const rawAttribute = getPublicHtmlRawAttribute(rawAttributes, getPublicHtmlAttribute(node, 'srcset'));
    if (!rawAttribute) return;
    if (rawAttribute.end - rawAttribute.start > MAX_PUBLIC_HTML_IMAGE_ATTRIBUTE_LENGTH) {
      throw new PublicHtmlImageReferenceBudgetError(
        `HTML image attribute exceeds the ${MAX_PUBLIC_HTML_IMAGE_ATTRIBUTE_LENGTH}-character safety limit.`,
      );
    }
    replacements.push(...getPublicHtmlSrcsetReplacements(
      source,
      rawAttribute,
      runtime,
      resolveReference,
    ));
  };

  if (node.namespaceURI === HTML_NAMESPACE) {
    if (tagName === 'img') {
      addUrl('src');
      addSrcset();
    } else if (
      tagName === 'source' && parent?.namespaceURI === HTML_NAMESPACE &&
      parent.tagName?.toLowerCase() === 'picture'
    ) {
      addSrcset();
    } else if (tagName === 'video') {
      addUrl('poster');
    } else if (tagName === 'input' && getPublicHtmlAttribute(node, 'type')?.value.trim().toLowerCase() === 'image') {
      addUrl('src');
    }
  } else if (node.namespaceURI === SVG_NAMESPACE && (tagName === 'image' || tagName === 'feimage')) {
    if (getPublicHtmlAttribute(node, 'href')) addUrl('href');
    else addUrl('xlink:href');
  } else if (node.namespaceURI === MATHML_NAMESPACE && tagName === 'mglyph') {
    addUrl('src');
  }
  return replacements;
};

export const replacePublicHtmlImageReferences = async (
  source: string,
  resolveReference: PublicImageReferenceResolver,
) => {
  assertPublicHtmlImageReferenceBudget(source);
  const [parser, entityRuntime] = await Promise.all([
    loadPublicHtmlParserRuntime(),
    loadPublicHtmlEntityRuntime(),
  ]);
  const document = parser.parse(source, {
    scriptingEnabled: true,
    sourceCodeLocationInfo: true,
  }) as PublicHtmlNode;
  const replacements: PublicHtmlReplacement[] = [];
  const replacementKeys = new Set<string>();
  const pending: Array<{
    allowSelectSupplement: boolean;
    containerEnd: number;
    node: PublicHtmlNode;
    offset: number;
    parent: PublicHtmlNode | null;
    source: string;
  }> = [
    { allowSelectSupplement: true, containerEnd: source.length, node: document, offset: 0, parent: null, source },
  ];
  let visitedNodes = 0;
  while (pending.length > 0) {
    const { allowSelectSupplement, containerEnd, node, offset, parent, source: nodeSource } = pending.pop()!;
    visitedNodes += 1;
    if (visitedNodes > MAX_PUBLIC_HTML_IMPORT_NODES) {
      throw new PublicHtmlImageReferenceBudgetError(
        `HTML source exceeds the ${MAX_PUBLIC_HTML_IMPORT_NODES}-node safety limit.`,
      );
    }
    const startTag = node.sourceCodeLocation?.startTag;
    if (node.tagName && startTag) {
      const rawAttributes = readPublicHtmlStartTagAttributes(nodeSource, startTag.startOffset, startTag.endOffset);
      const nodeReplacements = getPublicHtmlImageReplacements(
        nodeSource,
        node,
        parent,
        rawAttributes,
        entityRuntime,
        resolveReference,
      );
      for (const replacement of nodeReplacements) {
        const adjusted = {
          ...replacement,
          end: replacement.end + offset,
          start: replacement.start + offset,
        };
        const key = `${adjusted.start}:${adjusted.end}`;
        if (replacementKeys.has(key)) continue;
        if (replacements.length >= PUBLIC_IMPORT_MAX_IMAGE_REPLACEMENTS) {
          throw new PublicHtmlImageReferenceBudgetError(
            `HTML source exceeds the ${PUBLIC_IMPORT_MAX_IMAGE_REPLACEMENTS}-image-reference safety limit.`,
          );
        }
        replacementKeys.add(key);
        replacements.push(adjusted);
      }

      // Chromium's customizable-select parser now retains ordinary element
      // children (including images), while parse5 7.3 still applies the older
      // "in select" insertion mode and discards them. Reparse only the
      // tree-builder-confirmed select body in an ordinary HTML fragment so the
      // imported source follows the browser without raw-tag scanning.
      const location = node.sourceCodeLocation;
      const tagName = node.tagName.toLowerCase();
      const selectBodyEnd = Math.min(containerEnd, location?.endTag?.startOffset ?? containerEnd);
      if (
        allowSelectSupplement && node.namespaceURI === HTML_NAMESPACE && tagName === 'select' &&
        selectBodyEnd !== undefined && selectBodyEnd >= startTag.endOffset && selectBodyEnd <= nodeSource.length
      ) {
        const fragmentStart = startTag.endOffset;
        const fragmentSource = nodeSource.slice(fragmentStart, selectBodyEnd);
        const fragment = parser.parseFragment(fragmentSource, {
          scriptingEnabled: true,
          sourceCodeLocationInfo: true,
        }) as PublicHtmlNode;
        pending.push({
          allowSelectSupplement: false,
          containerEnd: fragmentSource.length,
          node: fragment,
          offset: offset + fragmentStart,
          parent: null,
          source: fragmentSource,
        });
      }
    }
    const location = node.sourceCodeLocation;
    const startTagEnd = location?.startTag?.endOffset ?? location?.startOffset ?? 0;
    const isHtmlTemplate = node.namespaceURI === HTML_NAMESPACE && node.tagName?.toLowerCase() === 'template';
    const nodeBodyEnd = Math.min(
      containerEnd,
      location?.endTag?.startOffset ?? (
        !isHtmlTemplate && location && location.endOffset > startTagEnd ? location.endOffset : containerEnd
      ),
    );
    if (node.content) {
      pending.push({ allowSelectSupplement, containerEnd: nodeBodyEnd, node: node.content, offset, parent: node, source: nodeSource });
    }
    const children = node.childNodes ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push({
        allowSelectSupplement,
        containerEnd: nodeBodyEnd,
        node: children[index]!,
        offset,
        parent: node,
        source: nodeSource,
      });
    }
  }

  if (replacements.length === 0) return source;
  replacements.sort((left, right) => left.start - right.start || left.end - right.end);
  let expandedLength = source.length;
  let budgetCursor = 0;
  for (const replacement of replacements) {
    if (replacement.start < budgetCursor) continue;
    expandedLength += replacement.value.length - (replacement.end - replacement.start);
    if (expandedLength > PUBLIC_IMPORT_MAX_EXPANDED_SOURCE_LENGTH) {
      throw new PublicHtmlImageReferenceBudgetError(
        `Imported Source would exceed the ${PUBLIC_IMPORT_MAX_EXPANDED_SOURCE_LENGTH}-character expansion limit.`,
      );
    }
    budgetCursor = replacement.end;
  }
  const chunks: string[] = [];
  let sourceCursor = 0;
  for (const replacement of replacements) {
    if (replacement.start < sourceCursor) continue;
    chunks.push(source.slice(sourceCursor, replacement.start), replacement.value);
    sourceCursor = replacement.end;
  }
  chunks.push(source.slice(sourceCursor));
  return chunks.join('');
};
