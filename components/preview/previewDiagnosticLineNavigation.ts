const PREVIEW_SOURCE_RANGE_SELECTOR = '[data-source-start-line][data-source-end-line]';
const PREVIEW_DIAGNOSTIC_HIGHLIGHT_CLASS = 'aad-preview-diagnostic-line-highlight';
const PREVIEW_DIAGNOSTIC_HIGHLIGHT_DURATION_MS = 1800;
const PREVIEW_PROGRAMMATIC_SELECTION_SUPPRESS_MS = 700;

type PreviewSelectionWindow = Window & {
  __morndraftPreviewProgrammaticSelectionUntil?: number;
};

export const markPreviewProgrammaticTextSelection = () => {
  const win = window as PreviewSelectionWindow;
  win.__morndraftPreviewProgrammaticSelectionUntil =
    window.performance.now() + PREVIEW_PROGRAMMATIC_SELECTION_SUPPRESS_MS;
};

export const isPreviewProgrammaticTextSelectionActive = () => {
  const win = window as PreviewSelectionWindow;
  const until = win.__morndraftPreviewProgrammaticSelectionUntil ?? 0;
  return until > window.performance.now();
};

const readPositiveIntegerAttribute = (element: HTMLElement, name: string) => {
  const value = Number(element.getAttribute(name));
  return Number.isFinite(value) && value > 0 ? value : null;
};

const getElementDepth = (element: HTMLElement) => {
  let depth = 0;
  let current: HTMLElement | null = element;
  while (current?.parentElement) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
};

type PreviewSourceLineTargetOptions = {
  preferDiagnosticHeader?: boolean;
};

const isVisibleElement = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
};

const getPreferredSourceLineElement = (
  element: HTMLElement,
  options: PreviewSourceLineTargetOptions = {},
) => {
  if (element.classList.contains('aad-preview-source-anchor')) {
    let sibling = element.nextElementSibling;
    while (sibling) {
      if (sibling instanceof HTMLElement) {
        if (isVisibleElement(sibling)) {
          return sibling;
        }
      }
      sibling = sibling.nextElementSibling;
    }
  }
  if (!options.preferDiagnosticHeader) return element;
  const visibleHeader = Array.from(element.querySelectorAll<HTMLElement>('.aad-block-header'))
    .find((candidate) => {
      const style = window.getComputedStyle(candidate);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });
  return visibleHeader ?? element;
};

export const getPreviewSourceLineTargetElement = (
  scrollContainer: HTMLElement | null | undefined,
  sourceLine: number,
  options: PreviewSourceLineTargetOptions = {},
) => {
  if (!scrollContainer || !Number.isFinite(sourceLine) || sourceLine < 1) return null;
  const candidates = Array.from(scrollContainer.querySelectorAll<HTMLElement>(PREVIEW_SOURCE_RANGE_SELECTOR))
    .map((element) => {
      const startLine = readPositiveIntegerAttribute(element, 'data-source-start-line');
      const endLine = readPositiveIntegerAttribute(element, 'data-source-end-line');
      if (!startLine || !endLine || sourceLine < startLine || sourceLine > endLine) return null;
      const rect = element.getBoundingClientRect();
      return {
        element,
        lineSpan: endLine - startLine,
        area: Math.max(1, rect.width) * Math.max(1, rect.height),
        depth: getElementDepth(element),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (
    a.lineSpan - b.lineSpan ||
    a.area - b.area ||
    b.depth - a.depth
  ));
  return getPreferredSourceLineElement(candidates[0].element, options);
};

export const scrollPreviewSourceLineIntoView = (
  scrollContainer: HTMLElement | null | undefined,
  sourceLine: number,
) => {
  const target = getPreviewSourceLineTargetElement(scrollContainer, sourceLine);
  if (!scrollContainer || !target) return null;
  const stickyControls = scrollContainer.querySelector<HTMLElement>('.aad-preview-display-controls-bar');
  const stickyHeight = stickyControls ? stickyControls.getBoundingClientRect().height : 0;
  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const viewportHeight = Math.max(0, scrollContainer.clientHeight - stickyHeight);
  const targetTop = targetRect.top - containerRect.top;
  const centeredOffset = Math.max(0, (viewportHeight - targetRect.height) / 2);
  scrollContainer.scrollTo({
    top: Math.max(0, scrollContainer.scrollTop + targetTop - stickyHeight - centeredOffset),
    behavior: 'smooth',
  });
  return target;
};

export const highlightPreviewSourceLineTarget = (
  target: HTMLElement,
  durationMs = PREVIEW_DIAGNOSTIC_HIGHLIGHT_DURATION_MS,
) => {
  target.classList.add(PREVIEW_DIAGNOSTIC_HIGHLIGHT_CLASS);
  const timeout = window.setTimeout(() => {
    target.classList.remove(PREVIEW_DIAGNOSTIC_HIGHLIGHT_CLASS);
  }, durationMs);
  return () => {
    window.clearTimeout(timeout);
    target.classList.remove(PREVIEW_DIAGNOSTIC_HIGHLIGHT_CLASS);
  };
};

const createTextContentRange = (target: HTMLElement) => {
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const firstNode = walker.nextNode();
  if (!firstNode) return null;
  let lastNode = firstNode;
  let nextNode = walker.nextNode();
  while (nextNode) {
    lastNode = nextNode;
    nextNode = walker.nextNode();
  }
  const range = document.createRange();
  range.setStart(firstNode, 0);
  range.setEnd(lastNode, lastNode.nodeValue?.length ?? 0);
  return range;
};

const getSourceRangeElementForSelectionTarget = (target: HTMLElement) => {
  if (target.matches(PREVIEW_SOURCE_RANGE_SELECTOR)) return target;
  const previousElement = target.previousElementSibling;
  if (previousElement instanceof HTMLElement && previousElement.matches(PREVIEW_SOURCE_RANGE_SELECTOR)) {
    return previousElement;
  }
  const closestElement = target.closest<HTMLElement>(PREVIEW_SOURCE_RANGE_SELECTOR);
  return closestElement ?? null;
};

type SourceTextPosition = {
  node: Text;
  offset: number;
};

type PreviewSourceLineSelectionOptions = {
  searchRoot?: ParentNode;
  sourceLineText?: string;
  // Text the user actually selected (preferred over sourceLineText when present).
  selectionText?: string;
  // 0-based occurrence index to disambiguate repeated text. Only meaningful for
  // the primary (selectionText / sourceLineText) candidate; derived candidates
  // fall back to the first match.
  selectionOccurrenceIndex?: number;
};

const normalizeVisibleText = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeVisibleTextForMatch = (value: string) => normalizeVisibleText(value).toLocaleLowerCase();

// Find the (0-based) nth occurrence of needle in haystack, starting from a given
// offset. Returns the start index, or -1 if there is no nth occurrence.
export const findNthOccurrence = (
  haystack: string,
  needle: string,
  occurrenceIndex: number,
  fromIndex = 0,
): number => {
  if (!needle || occurrenceIndex < 0) return -1;
  let remaining = occurrenceIndex;
  let searchFrom = fromIndex;
  while (remaining >= 0) {
    const found = haystack.indexOf(needle, searchFrom);
    if (found < 0) return -1;
    if (remaining === 0) return found;
    remaining -= 1;
    searchFrom = found + needle.length;
  }
  return -1;
};

// Compute the 0-based occurrence index of a normalized line/candidate within the
// full source text, counting matches that appear at or before the target line.
// This lets the final side pick the same nth occurrence the source line refers
// to, disambiguating repeated text.
export const getSourceLineTextOccurrenceIndex = (
  fullSource: string,
  targetLine: number,
  candidate: string,
): number => {
  const normalizedCandidate = normalizeVisibleTextForMatch(candidate);
  if (!normalizedCandidate) return 0;
  if (!fullSource || !Number.isFinite(targetLine) || targetLine < 1) return 0;
  const lines = fullSource.split('\n');
  const upperBound = Math.min(lines.length, Math.trunc(targetLine));
  let occurrence = 0;
  for (let index = 0; index < upperBound; index += 1) {
    const normalizedLine = normalizeVisibleTextForMatch(lines[index]);
    if (!normalizedLine) continue;
    // Count how many times the candidate appears in this line. For the target
    // line itself, only count strictly preceding occurrences so that the target
    // line's own match is the one we return.
    const isTargetLine = index === upperBound - 1;
    let searchFrom = 0;
    while (searchFrom < normalizedLine.length) {
      const found = normalizedLine.indexOf(normalizedCandidate, searchFrom);
      if (found < 0) break;
      if (isTargetLine) return occurrence;
      occurrence += 1;
      searchFrom = found + normalizedCandidate.length;
    }
  }
  return 0;
};

const addCandidate = (candidates: string[], value: string | undefined | null) => {
  const normalized = normalizeVisibleText(value ?? '');
  if (normalized.length < 2 || candidates.includes(normalized)) return;
  candidates.push(normalized);
};

const stripHtmlTags = (value: string) => value.replace(/<[^>]+>/g, ' ');

const getTableTextCandidates = (line: string) => {
  if (!line.includes('|')) return [];
  const cells = line
    .split('|')
    .map((cell) => normalizeVisibleText(cell))
    .filter((cell) => cell && !/^:?-{3,}:?$/.test(cell));
  return cells.length > 0 ? [cells.join(' '), ...cells] : [];
};

const getSourceLineTextCandidates = (sourceLineText?: string) => {
  const trimmed = normalizeVisibleText(sourceLineText ?? '');
  if (!trimmed) return [];
  const candidates: string[] = [];
  const withoutQuote = trimmed.replace(/^>\s*/, '');
  const withoutHeading = trimmed.replace(/^#{1,6}\s+/, '');
  const withoutListMarker = trimmed.replace(/^(?:[-+*]|\d+[.)])\s+/, '');
  const fenceLanguage = trimmed.match(/^`{3,}\s*([A-Za-z0-9_-]+)/)?.[1];
  addCandidate(candidates, withoutQuote);
  addCandidate(candidates, withoutHeading);
  addCandidate(candidates, withoutListMarker);
  getTableTextCandidates(trimmed).forEach((candidate) => addCandidate(candidates, candidate));
  addCandidate(candidates, fenceLanguage);
  addCandidate(candidates, stripHtmlTags(trimmed));
  const labelMatches = trimmed.matchAll(/\[([^\]]+)\]|\(([^)]+)\)|"([^"]+)"|'([^']+)'/g);
  for (const match of labelMatches) {
    addCandidate(candidates, match[1] ?? match[2] ?? match[3] ?? match[4]);
  }
  addCandidate(candidates, trimmed);
  return candidates.sort((a, b) => normalizeVisibleTextForMatch(b).length - normalizeVisibleTextForMatch(a).length);
};

const isTextNodeVisible = (node: Text) => {
  const parent = node.parentElement;
  if (!parent || parent.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(parent);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
};

const createTextRangeForCandidate = (
  root: ParentNode,
  candidate: string,
  occurrenceIndex = 0,
) => {
  const normalizedCandidate = normalizeVisibleTextForMatch(candidate);
  if (!normalizedCandidate) return null;
  const positions: SourceTextPosition[] = [];
  let normalizedText = '';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node instanceof Text && node.nodeValue?.trim() && isTextNodeVisible(node)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  let textNode = walker.nextNode();
  let previousTableCell: Element | null = null;
  while (textNode) {
    const text = textNode.nodeValue ?? '';
    const currentTableCell = (textNode as Text).parentElement?.closest('td, th') ?? null;
    if (
      currentTableCell &&
      previousTableCell &&
      currentTableCell !== previousTableCell &&
      normalizedText &&
      !normalizedText.endsWith(' ')
    ) {
      normalizedText += ' ';
      positions.push({ node: textNode as Text, offset: 0 });
    }
    for (let offset = 0; offset < text.length; offset += 1) {
      const char = text[offset];
      if (/\s/.test(char)) {
        if (normalizedText && !normalizedText.endsWith(' ')) {
          normalizedText += ' ';
          positions.push({ node: textNode as Text, offset });
        }
        continue;
      }
      normalizedText += char.toLocaleLowerCase();
      positions.push({ node: textNode as Text, offset });
    }
    previousTableCell = currentTableCell;
    textNode = walker.nextNode();
  }
  const startIndex = findNthOccurrence(normalizedText, normalizedCandidate, Math.max(0, occurrenceIndex));
  if (startIndex < 0) return null;
  const endIndex = startIndex + normalizedCandidate.length - 1;
  const startPosition = positions[startIndex];
  const endPosition = positions[endIndex];
  if (!startPosition || !endPosition) return null;
  const range = document.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset + 1);
  return range;
};

const createSourceLineTextRange = (
  primaryTarget: HTMLElement,
  fallbackRoot: ParentNode,
  candidates: readonly string[],
  occurrenceIndex = 0,
) => {
  for (let index = 0; index < candidates.length; index += 1) {
    // Only the primary candidate (index 0) uses the disambiguating occurrence
    // index; derived/fallback candidates match the first occurrence.
    const primaryRange = createTextRangeForCandidate(primaryTarget, candidates[index], index === 0 ? occurrenceIndex : 0);
    if (primaryRange) return primaryRange;
  }
  if (fallbackRoot !== primaryTarget) {
    for (let index = 0; index < candidates.length; index += 1) {
      const fallbackRange = createTextRangeForCandidate(fallbackRoot, candidates[index], index === 0 ? occurrenceIndex : 0);
      if (fallbackRange) return fallbackRange;
    }
  }
  return null;
};

const isExpectedSourceLineSelection = (selection: Selection | null, candidates: readonly string[]) => {
  const selectedText = normalizeVisibleTextForMatch(selection?.toString() ?? '');
  if (!selectedText) return false;
  if (candidates.length === 0) return true;
  return candidates.some((candidate) => selectedText === normalizeVisibleTextForMatch(candidate));
};

export const selectPreviewSourceLineTarget = (
  target: HTMLElement,
  options: PreviewSourceLineSelectionOptions = {},
) => {
  const sourceRangeElement = getSourceRangeElementForSelectionTarget(target);
  const sourceStartLine = sourceRangeElement
    ? readPositiveIntegerAttribute(sourceRangeElement, 'data-source-start-line')
    : null;
  const sourceEndLine = sourceRangeElement
    ? readPositiveIntegerAttribute(sourceRangeElement, 'data-source-end-line')
    : null;
  const searchRoot = options.searchRoot ?? target.closest<HTMLElement>('.aad-preview-scroll-container') ?? document;
  // Prefer the user's actual selection text when available — it is more precise
  // than the whole source line. Fall back to source-line-derived candidates.
  const selectionTextCandidates = getSourceLineTextCandidates(options.selectionText);
  const sourceTextCandidates = getSourceLineTextCandidates(options.sourceLineText);
  const primaryCandidates = selectionTextCandidates.length > 0 ? selectionTextCandidates : sourceTextCandidates;
  const primaryOccurrenceIndex = Math.max(0, options.selectionOccurrenceIndex ?? 0);
  const resolveTarget = () => {
    if (document.contains(target)) return target;
    if (!sourceStartLine || !sourceEndLine) return null;
    const nextSourceRangeElement = searchRoot.querySelector<HTMLElement>(
      `[data-source-start-line="${sourceStartLine}"][data-source-end-line="${sourceEndLine}"]`,
    );
    return nextSourceRangeElement ? getPreferredSourceLineElement(nextSourceRangeElement) : null;
  };
  const applySelection = () => {
    const nextTarget = resolveTarget();
    if (!nextTarget) return false;
    const selection = window.getSelection();
    if (!selection) return false;
    let range = createSourceLineTextRange(nextTarget, searchRoot, primaryCandidates, primaryOccurrenceIndex);
    if (!range && sourceTextCandidates.length > 0 && selectionTextCandidates.length > 0) {
      // Selection text didn't match; try the source-line candidates as a fallback.
      range = createSourceLineTextRange(nextTarget, searchRoot, sourceTextCandidates, primaryOccurrenceIndex);
    }
    if (!range) {
      // No text match. If the target renders non-textual content (iframe/svg),
      // bail out instead of setting a meaningless empty selection — the caller
      // handles rendered blocks with block-level scroll + header highlight.
      if (nextTarget.querySelector('iframe, svg')) return false;
    }
    const resolvedRange = range ?? document.createRange();
    if (!resolvedRange.toString()) resolvedRange.selectNodeContents(nextTarget);
    selection.removeAllRanges();
    selection.addRange(resolvedRange);
    if (!selection.toString().trim()) {
      const textRange = createTextContentRange(nextTarget);
      if (textRange) {
        selection.removeAllRanges();
        selection.addRange(textRange);
      }
    }
    markPreviewProgrammaticTextSelection();
    document.dispatchEvent(new Event('selectionchange'));
    return isExpectedSourceLineSelection(selection, primaryCandidates);
  };
  const editableRoot = target.closest<HTMLElement>('[contenteditable="true"]');
  editableRoot?.focus({ preventScroll: true });
  const didSelect = applySelection();
  const restoreIfNeeded = () => {
    const selection = window.getSelection();
    if (isExpectedSourceLineSelection(selection, primaryCandidates)) return;
    applySelection();
  };
  // The restore windows must cover the async DOM rebuild that follows a
  // previewCode flush (Lexical full-document reset). The first rAF handles the
  // common single-commit case; the later timeouts cover slower multi-pass
  // rebuilds and match the PREVIEW_SCROLL_RECORD_FREEZE_MS timescale.
  window.requestAnimationFrame(restoreIfNeeded);
  window.setTimeout(restoreIfNeeded, 200);
  window.setTimeout(restoreIfNeeded, 400);
  return didSelect;
};

export const getPreviewDiagnosticLineTargetElement = (
  scrollContainer: HTMLElement | null | undefined,
  sourceLine: number,
) => getPreviewSourceLineTargetElement(scrollContainer, sourceLine, { preferDiagnosticHeader: true });

export const scrollPreviewDiagnosticLineIntoView = (
  scrollContainer: HTMLElement | null | undefined,
  sourceLine: number,
) => {
  const target = getPreviewDiagnosticLineTargetElement(scrollContainer, sourceLine);
  if (!scrollContainer || !target) return null;
  const stickyControls = scrollContainer.querySelector<HTMLElement>('.aad-preview-display-controls-bar');
  const stickyHeight = stickyControls ? stickyControls.getBoundingClientRect().height : 0;
  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const viewportHeight = Math.max(0, scrollContainer.clientHeight - stickyHeight);
  const targetTop = targetRect.top - containerRect.top;
  const centeredOffset = Math.max(0, (viewportHeight - targetRect.height) / 2);
  scrollContainer.scrollTo({
    top: Math.max(0, scrollContainer.scrollTop + targetTop - stickyHeight - centeredOffset),
    behavior: 'smooth',
  });
  return target;
};
export const highlightPreviewDiagnosticLineTarget = highlightPreviewSourceLineTarget;
