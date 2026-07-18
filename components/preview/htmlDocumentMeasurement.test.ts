import assert from 'node:assert/strict';
import test from 'node:test';

import {
  measureHtmlDocumentContentHeight,
  resolveHtmlDocumentMeasuredHeight,
} from './htmlDocumentMeasurement';

const makeRect = ({
  bottom,
  height,
  left = 0,
  right,
  top,
  width = 390,
}: {
  bottom: number;
  height?: number;
  left?: number;
  right?: number;
  top: number;
  width?: number;
}) => ({
  bottom,
  height: height ?? bottom - top,
  left,
  right: right ?? left + width,
  top,
  width,
} as DOMRect);

type MockMeasuredElement = {
  __style?: Partial<CSSStyleDeclaration>;
  getBoundingClientRect: () => DOMRect;
  parentElement?: MockMeasuredElement | null;
  tagName: string;
};

const makeElement = (
  rect: DOMRect,
  options: {
    parentElement?: MockMeasuredElement | null;
    style?: Partial<CSSStyleDeclaration>;
    tagName?: string;
  } = {},
): MockMeasuredElement => ({
  __style: options.style,
  getBoundingClientRect: () => rect,
  parentElement: options.parentElement,
  tagName: options.tagName ?? 'DIV',
});

const makeMeasuredDocument = ({
  bodyPaddingBottom = '0px',
  bodyRect,
  elements,
  htmlRect,
  scrollHeight,
  textRects = [],
  viewportHeight,
}: {
  bodyPaddingBottom?: string;
  bodyRect: DOMRect;
  elements: MockMeasuredElement[];
  htmlRect: DOMRect;
  scrollHeight: number;
  textRects?: DOMRect[];
  viewportHeight: number;
}) => {
  const textNodes = textRects.map((rects) => ({
    __rects: [rects],
    textContent: 'Measured text',
  }));
  let walkerIndex = -1;

  const body = {
    __style: { paddingBottom: bodyPaddingBottom },
    clientHeight: viewportHeight,
    getBoundingClientRect: () => bodyRect,
    querySelectorAll: () => elements,
    scrollHeight,
  };
  elements.forEach((element) => {
    if (element.parentElement === undefined) element.parentElement = body as unknown as MockMeasuredElement;
  });

  return {
    body,
    createRange: () => {
      let selectedNode: { __rects?: DOMRect[] } | null = null;
      return {
        detach: () => undefined,
        getClientRects: () => selectedNode?.__rects ?? [],
        selectNodeContents: (node: { __rects?: DOMRect[] }) => {
          selectedNode = node;
        },
      };
    },
    createTreeWalker: () => ({
      currentNode: null as null | { __rects: DOMRect[]; textContent: string },
      nextNode() {
        walkerIndex += 1;
        if (walkerIndex >= textNodes.length) return false;
        this.currentNode = textNodes[walkerIndex] ?? null;
        return Boolean(this.currentNode);
      },
    }),
    defaultView: {
      getComputedStyle: (element: { __style?: Partial<CSSStyleDeclaration> }) => ({
        overflow: 'visible',
        overflowX: 'visible',
        overflowY: 'visible',
        paddingBottom: '0px',
        ...element.__style,
      }),
      innerHeight: viewportHeight,
    },
    documentElement: {
      clientHeight: viewportHeight,
      getBoundingClientRect: () => htmlRect,
      scrollHeight,
    },
  } as unknown as Document;
};

test('measureHtmlDocumentContentHeight trims centered 100vh flex shell offset', () => {
  const phoneFrame = makeElement(makeRect({ bottom: 1012, top: 168 }), {
    style: { overflow: 'hidden', overflowX: 'hidden', overflowY: 'hidden' },
  });
  const clippedScrollContent = makeElement(makeRect({ bottom: 1305, top: 232 }), {
    parentElement: phoneFrame,
  });
  const doc = makeMeasuredDocument({
    bodyRect: makeRect({ bottom: 1180, top: 0 }),
    elements: [phoneFrame, clippedScrollContent],
    htmlRect: makeRect({ bottom: 1180, top: 0 }),
    scrollHeight: 1137,
    viewportHeight: 1180,
  });

  assert.equal(measureHtmlDocumentContentHeight(doc), 844);
});

test('resolveHtmlDocumentMeasuredHeight preserves scroll-driven tall documents', () => {
  assert.equal(resolveHtmlDocumentMeasuredHeight({
    contentExtent: 960,
    rectExtent: 1200,
    scrollExtent: 1200,
    viewportExtent: 400,
  }), 1200);
});

test('measureHtmlDocumentContentHeight preserves real bottom padding and margins', () => {
  const doc = makeMeasuredDocument({
    bodyPaddingBottom: '24px',
    bodyRect: makeRect({ bottom: 448, top: 0 }),
    elements: [makeElement(makeRect({ bottom: 424, top: 24 }))],
    htmlRect: makeRect({ bottom: 448, top: 0 }),
    scrollHeight: 448,
    viewportHeight: 800,
  });

  assert.equal(measureHtmlDocumentContentHeight(doc), 448);
});
