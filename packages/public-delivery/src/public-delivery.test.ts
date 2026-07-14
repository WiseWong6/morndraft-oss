import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import {
  PublicDeliveryError,
  buildOpaqueSandboxIframe,
  buildImagePdfBlob,
  buildPortableDocument,
  buildPublicPreviewPdf,
  buildPublicStandaloneHtml,
  calculateImagePdfPages,
  copyPublicPng,
  createImagePdfBlobBuilder,
  downloadPublicBlob,
  hasPublicDynamicCaptureMarkup,
  type PublicDeliveryInput,
  type PublicPngCapture,
} from './index';
import {
  appendReadableDocumentStyles,
  canvasToPngBlob,
  createPublicCaptureContextWithGuard,
  getPublicCapturableIframes,
  rewritePublicCaptureCssUrls,
  withPublicDeliveryTimeout,
} from './capture';
import {
  PUBLIC_CAPTURE_FAILED_RESOURCE_PLACEHOLDER,
  assertPublicCaptureResourcesEmbedded,
  assertPublicCaptureResourcesReadable,
  extractPublicCssImportUrls,
  extractPublicCssResourceUrls,
  extractPublicSrcsetUrls,
} from './captureResources';
import { absolutizePortableCssReferences } from './portableHtml';
import { extractPublicRawHtmlSource } from './rawHtml';
import { withStandaloneAssetTimeout } from './standalone';
import { createImagePdfLibraryLoader } from './imagePdf';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
  'base64',
);

const makeDocument = () => ({
  styleSheets: [],
}) as unknown as Document;

const makeRoot = (outerHTML = '<main data-preview><h1>Public artifact</h1></main>') => ({
  cloneNode: () => ({
    getAttribute: () => null,
    outerHTML,
    querySelectorAll: () => [],
    removeAttribute: () => undefined,
    setAttribute: () => undefined,
    tagName: 'MAIN',
  }),
  ownerDocument: makeDocument(),
}) as unknown as HTMLElement;

const makeInput = (overrides: Partial<PublicDeliveryInput> = {}): PublicDeliveryInput => ({
  previewRoot: makeRoot(),
  source: '# Public artifact',
  contentType: 'markdown',
  theme: 'light',
  title: 'MornDraft <Public>',
  ...overrides,
});

const extractPortableSrcdoc = (html: string) => {
  const encoded = html.match(/\ssrcdoc="([\s\S]*?)"><\/iframe>/u)?.[1];
  assert.ok(encoded, 'portable document iframe must contain srcdoc');
  return encoded
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
};

const makeCaptureResourceRoot = (
  urls: readonly string[],
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  options: {
    computedValues?: Readonly<Record<string, string>>;
    cssStyleSheetConstructor?: new () => CSSStyleSheet;
    elements?: readonly {
      attributes: Readonly<Record<string, string>>;
      currentSrc?: string;
      poster?: string;
      tagName: string;
    }[];
    mediaMatches?: (query: string) => boolean;
    documentStyleSheets?: readonly CSSStyleSheet[];
    stylesheetHrefs?: readonly string[];
    stylesheetLinks?: readonly {
      disabled?: boolean;
      href: string;
      media?: string;
      sheet?: CSSStyleSheet | null;
    }[];
    styleElements?: readonly {
      media?: string;
      sheet?: CSSStyleSheet | null;
      textContent: string;
    }[];
    styleTexts?: readonly string[];
  } = {},
) => {
  const images = urls.map(url => ({
    currentSrc: url,
    getAttribute: (name: string) => name === 'src' ? url : null,
    tagName: 'IMG',
  }));
  const elements = (options.elements ?? []).map(element => ({
    currentSrc: element.currentSrc ?? '',
    getAttribute: (name: string) => element.attributes[name] ?? null,
    poster: element.poster ?? '',
    tagName: element.tagName,
  }));
  const view = {
    CSSStyleSheet: options.cssStyleSheetConstructor,
    clearTimeout: () => undefined,
    fetch: fetchImpl,
    getComputedStyle: () => ({
      getPropertyValue: (property: string) => options.computedValues?.[property] ?? '',
    }),
    location: { origin: 'https://app.example' },
    matchMedia: (query: string) => ({
      matches: options.mediaMatches?.(query) ?? !/^\s*(?:only\s+)?print\b/iu.test(query),
    }),
    setTimeout: () => 1,
  };
  const links = [
    ...(options.stylesheetHrefs ?? []).map(href => ({
      disabled: false,
      href,
      media: undefined,
      sheet: null,
    })),
    ...(options.stylesheetLinks ?? []),
  ].map(link => ({
    disabled: link.disabled ?? false,
    getAttribute: (name: string) => {
      if (name === 'href') return link.href;
      if (name === 'media') return link.media ?? null;
      return null;
    },
    media: link.media ?? '',
    sheet: link.sheet ?? null,
  }));
  const styles = [
    ...(options.styleTexts ?? []).map(textContent => ({
      media: undefined,
      sheet: null,
      textContent,
    })),
    ...(options.styleElements ?? []),
  ].map(style => ({
    getAttribute: (name: string) => name === 'media' ? style.media ?? null : null,
    media: style.media ?? '',
    sheet: style.sheet ?? null,
    textContent: style.textContent,
  }));
  const ownerDocument = {
    baseURI: 'https://app.example/document',
    defaultView: view,
    querySelectorAll: (selector: string) => {
      if (selector === 'link[rel~="stylesheet"][href]') return links;
      if (selector === 'style') return styles;
      return [];
    },
    styleSheets: options.documentStyleSheets ?? [],
  };
  return {
    getAttribute: () => null,
    ownerDocument,
    querySelectorAll: (selector: string) => selector === '*' ? [...images, ...elements] : [],
    tagName: 'MAIN',
  } as unknown as HTMLElement;
};

const makeStreamingResponse = (
  chunks: readonly (number | Uint8Array)[],
  onBlob: () => void,
  onCancel?: () => void,
) => {
  let nextChunk = 0;
  return {
    blob: async () => {
      onBlob();
      throw new Error('response.blob() must not be used for capture preflight');
    },
    body: {
      getReader: () => ({
        cancel: async () => { onCancel?.(); },
        read: async () => {
          if (nextChunk >= chunks.length) return { done: true, value: undefined };
          const chunk = chunks[nextChunk];
          nextChunk += 1;
          return {
            done: false,
            value: typeof chunk === 'number' ? { byteLength: chunk } : chunk,
          };
        },
        releaseLock: () => undefined,
      }),
    },
    headers: new Headers(),
    ok: true,
    type: 'basic',
  } as unknown as Response;
};

const makeMediaParsingStyleSheetConstructor = (onReplace?: (cssText: string) => void) => (
  class FakeConstructableStyleSheet {
    cssRules: CSSRule[] = [];

    async replace(cssText: string) {
      onReplace?.(cssText);
      const mediaText = /@media\s+([^{]+)/iu.exec(cssText)?.[1]?.trim();
      const assetUrl = /url\(\s*["']?([^"')\s]+)["']?\s*\)/iu.exec(cssText)?.[1];
      if (!mediaText || !assetUrl) throw new SyntaxError('Unsupported CSS fixture.');
      const declarationText = `background:url("${assetUrl}")`;
      this.cssRules = [{
        cssRules: [{
          cssRules: [],
          cssText: `.asset{${declarationText}}`,
          style: { cssText: declarationText },
        }],
        cssText,
        media: { mediaText },
      } as unknown as CSSRule];
      return this;
    }
  } as unknown as new () => CSSStyleSheet
);

const makeImportIgnoringStyleSheetConstructor = () => (
  class FakeConstructableStyleSheet {
    cssRules: CSSRule[] = [];

    async replace() {
      return this;
    }
  } as unknown as new () => CSSStyleSheet
);

test('opaque sandbox iframe escapes hostile title and srcdoc without permitting policy overrides', () => {
  const frame = buildOpaqueSandboxIframe({
    attributes: { 'data-frame': 'public', referrerpolicy: 'no-referrer' },
    srcdoc: '<!doctype html><script>run()</script></iframe><img src=x onerror=run()>',
    title: 'Artifact"><script>escape()</script>',
  });

  assert.match(frame, /^<iframe\b/u);
  assert.match(frame, /sandbox="allow-scripts"/u);
  assert.doesNotMatch(frame, /sandbox="[^"]*allow-same-origin/iu);
  assert.match(frame, /title="Artifact&quot;&gt;&lt;script&gt;escape\(\)&lt;\/script&gt;"/u);
  assert.match(frame, /srcdoc="&lt;!doctype html&gt;&lt;script&gt;run\(\)&lt;\/script&gt;&lt;\/iframe&gt;/u);
  assert.equal((frame.match(/<iframe\b/gu) ?? []).length, 1);
  assert.equal((frame.match(/<\/iframe>/gu) ?? []).length, 1);
  assert.throws(
    () => buildOpaqueSandboxIframe({
      sandbox: 'allow-scripts allow-same-origin',
      srcdoc: '<main>unsafe</main>',
      title: 'unsafe',
    } as unknown as Parameters<typeof buildOpaqueSandboxIframe>[0]),
    /sandbox 策略不可覆盖/u,
  );
  for (const attribute of ['allow', 'allowfullscreen', 'class', 'sandbox', 'src']) {
    assert.throws(
      () => buildOpaqueSandboxIframe({
        attributes: { [attribute]: 'allow-scripts allow-same-origin' },
        srcdoc: '<main>unsafe</main>',
        title: 'unsafe',
      }),
      new RegExp(`不允许使用 ${attribute} 属性`, 'u'),
    );
  }
});

test('portable document escapes title and language while preserving trusted head and body markup', () => {
  const html = buildPortableDocument({
    body: '<main data-trusted-body>Body</main>',
    headAfterTitle: '<style data-trusted-head>body{margin:0}</style>\n',
    language: 'zh-CN"><script>lang()</script>',
    title: '</title><script>title()</script>',
  });

  assert.match(html, /<html lang="zh-CN&quot;&gt;&lt;script&gt;lang\(\)&lt;\/script&gt;">/u);
  assert.match(html, /<title>&lt;\/title&gt;&lt;script&gt;title\(\)&lt;\/script&gt;<\/title>/u);
  assert.match(html, /<style data-trusted-head>body\{margin:0\}<\/style>/u);
  assert.match(html, /<main data-trusted-body>Body<\/main>/u);
  assert.equal((html.match(/<title>/gu) ?? []).length, 1);
});

test('buildPublicStandaloneHtml serializes the rendered public preview and escapes title markup', async () => {
  const html = await buildPublicStandaloneHtml(makeInput());

  assert.match(html, /data-morndraft-public-standalone="document"/);
  assert.match(html, /sandbox="allow-scripts"/u);
  assert.doesNotMatch(html, /sandbox="[^"]*allow-same-origin/iu);
  assert.match(html, /&lt;h1&gt;Public artifact&lt;\/h1&gt;/u);
  assert.match(html, /<title>MornDraft &lt;Public&gt;<\/title>/);
  assert.match(html, /style-src &#39;unsafe-inline&#39; data: https: http:/u);
  assert.match(html, /media-src &#39;self&#39; data: blob: https: http:/u);
  assert.doesNotMatch(html, /data-public-final-editable/u);
  assert.doesNotMatch(html, /watermark|hosted[- ]?link|\/api\//i);
});

test('buildPublicStandaloneHtml confines mutation-XSS payloads to an opaque child frame', async () => {
  const payload = '<form><math><mtext></form><form><mglyph><style></math><img src=x onerror="top.__MXSS__=45">';
  const html = await buildPublicStandaloneHtml(makeInput({ previewRoot: makeRoot(payload) }));
  const topLevelBody = html.match(/<body>([\s\S]*)<\/body>\s*<\/html>$/u)?.[1] ?? '';

  assert.match(topLevelBody, /^\s*<iframe\b/u);
  assert.match(topLevelBody, /sandbox="allow-scripts"/u);
  assert.doesNotMatch(topLevelBody, /<form|<math|<img/iu);
  assert.match(topLevelBody, /&lt;form&gt;&lt;math&gt;/u);
  assert.doesNotMatch(html, /sandbox="[^"]*allow-same-origin/iu);
});

test('buildPublicStandaloneHtml keeps raw HTML inside an allow-scripts opaque sandbox', async () => {
  const html = await buildPublicStandaloneHtml(makeInput({
    contentType: 'html',
    source: '```html\n<!doctype html><html><body><script>window.rawRuns = true</script><h1>Raw</h1></body></html>\n```',
  }));

  assert.match(html, /sandbox="allow-scripts"/);
  assert.doesNotMatch(html, /sandbox="[^"]*allow-same-origin/);
  assert.match(html, /srcdoc="&lt;!doctype html&gt;/);
  assert.match(html, /&lt;script&gt;window\.rawRuns = true&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<body>\s*<!doctype html>/);
});

test('raw HTML extraction follows the Final first-token info-string contract', () => {
  const html = '<!doctype html><html><body><h1>Info string</h1></body></html>';

  assert.equal(
    extractPublicRawHtmlSource(`\`\`\`html preview linenums\n${html}\n\`\`\``),
    html,
  );
  assert.equal(
    extractPublicRawHtmlSource(`~~~~html-preview standalone\r\n${html}\r\n~~~~`),
    html,
  );
});

test('raw HTML extraction requires a supported first token and a matching closed fence', () => {
  const unsupported = '```html-preview-extra preview\n<main>unsupported</main>\n```';
  const unclosed = '```html preview\n<main>unclosed</main>';
  const mismatched = '````html preview\n<main>mismatched</main>\n```';

  assert.equal(extractPublicRawHtmlSource(unsupported), unsupported);
  assert.equal(extractPublicRawHtmlSource(unclosed), unclosed);
  assert.equal(extractPublicRawHtmlSource(mismatched), mismatched);
});

test('raw HTML extraction handles long indentation without regular-expression backtracking', () => {
  const indentation = '\t'.repeat(100_000);
  const html = '<main>Static</main>';
  assert.equal(
    extractPublicRawHtmlSource(`${indentation}\`\`\`html\n${html}\n\`\`\`${indentation}`),
    html,
  );
});

test('buildPublicStandaloneHtml strips supported HTML fence info strings before sandboxing', async () => {
  const html = await buildPublicStandaloneHtml(makeInput({
    contentType: 'html',
    source: '```html preview linenums\n<!doctype html><html><body><h1>Info string</h1></body></html>\n```',
  }));

  assert.match(html, /data-morndraft-public-standalone="raw-html"/u);
  assert.match(html, /srcdoc="&lt;!doctype html&gt;/u);
  assert.match(html, /&lt;h1&gt;Info string&lt;\/h1&gt;/u);
  assert.doesNotMatch(html, /```html preview/u);
});

test('image capture fails closed for dynamic HTML that cannot match the sandboxed Final', () => {
  assert.equal(hasPublicDynamicCaptureMarkup('<main><h1>Static</h1></main>'), false);
  assert.equal(hasPublicDynamicCaptureMarkup('<!-- example: <script>ignored()</script> -->'), false);
  assert.equal(hasPublicDynamicCaptureMarkup('<!-- note --!><script>window.__ran=1</script>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<!--><script>window.__ran=1</script>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<!---><script>window.__ran=1</script>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<!-----><script>window.__ran=1</script>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<!------><script>window.__ran=1</script>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<!-----!><script>window.__ran=1</script>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<!--<!--><script>window.__ran=1</script>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<!--<!---><script>window.__ran=1</script>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<!-- --- <script>ignored()</script> -->'), false);
  assert.equal(hasPublicDynamicCaptureMarkup('<!-- nested <! example <script>ignored()</script> -->'), false);
  assert.equal(hasPublicDynamicCaptureMarkup('<style>/* <script>ignored()</script> */</style><main>Static</main>'), false);
  assert.equal(hasPublicDynamicCaptureMarkup('<style>.note::before{content:"</stylex><script>ignored()</script>"}</style><main>Static</main>'), false);
  assert.equal(hasPublicDynamicCaptureMarkup('<style>.note{color:red}</style><script>window.__ran=1</script>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<script>document.body.append("dynamic")</script>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<svg onload="draw()"></svg>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<canvas></canvas>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<details><summary>Toggle</summary>State</details>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<input value="initial">'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<p contenteditable>Mutable</p>'), true);
  assert.equal(hasPublicDynamicCaptureMarkup('<a href="javascript:run()">run</a>'), true);
});

test('dynamic HTML scanning handles long tag spacing without regular-expression backtracking', () => {
  const spacing = ' '.repeat(100_000);
  assert.equal(hasPublicDynamicCaptureMarkup(`<${spacing}main>Static</main>`), false);
  assert.equal(hasPublicDynamicCaptureMarkup(`<${spacing}script>run()</script>`), true);
});

test('capture pairs only non-excluded source iframes with the cloned delivery tree', () => {
  const excludedContainer = {};
  const excludedFrame = { closest: () => excludedContainer };
  const includedFrame = { closest: () => null };
  const root = {
    querySelectorAll: () => [excludedFrame, includedFrame],
  } as unknown as ParentNode;

  assert.deepEqual(getPublicCapturableIframes(root), [includedFrame]);
});

test('capture resource parser finds quoted and unquoted CSS URLs without treating visible links as assets', () => {
  assert.deepEqual(
    extractPublicCssResourceUrls(`
      background: url("https://assets.example/a.png");
      mask-image: url(data:image/svg+xml;base64,AAAA);
      border-image: url('../frame.svg') 1;
      content: "url(https://no-cors.example/string-only.png)";
      /* cursor: url(https://no-cors.example/comment-only.cur); */
    `),
    ['https://assets.example/a.png', 'data:image/svg+xml;base64,AAAA', '../frame.svg'],
  );
  assert.deepEqual(
    extractPublicCssImportUrls(`
      @import "base.css";
      @import url('./print.css') print;
      @import url(https://assets.example/theme.css) layer(theme);
      .example { content: '@import "string-only.css"'; }
      .data { background: url(data:text/plain,@import-not-a-rule); }
      /* @import "comment-only.css"; */
    `),
    ['base.css', './print.css', 'https://assets.example/theme.css'],
  );
  assert.deepEqual(
    extractPublicSrcsetUrls(
      'data:image/png;base64,AAAA 1x, https://assets.example/retina.png 2x, /wide.png 1200w',
    ),
    ['data:image/png;base64,AAAA', 'https://assets.example/retina.png', '/wide.png'],
  );
});

test('capture engine uses a detectable failed-resource sentinel instead of a transparent success', () => {
  assert.match(PUBLIC_CAPTURE_FAILED_RESOURCE_PLACEHOLDER, /^data:image\/gif;base64,/u);
  assert.match(PUBLIC_CAPTURE_FAILED_RESOURCE_PLACEHOLDER, /morndraft-capture-resource-failed/u);
});

test('capture preflight streams an unknown-length response and aborts before one resource exceeds its limit', async () => {
  let blobCalls = 0;
  let cancelCalls = 0;
  const signals: AbortSignal[] = [];
  const root = makeCaptureResourceRoot(
    ['https://assets.example/oversized.png'],
    async (_input, init) => {
      signals.push(init?.signal as AbortSignal);
      return makeStreamingResponse(
        [25 * 1024 * 1024 + 1],
        () => { blobCalls += 1; },
        () => { cancelCalls += 1; },
      );
    },
  );

  await assert.rejects(
    assertPublicCaptureResourcesReadable(root),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  assert.equal(blobCalls, 0);
  assert.equal(cancelCalls, 1);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].aborted, true);
});

test('capture preflight shares a streaming byte budget and aborts every worker at the total limit', async () => {
  let blobCalls = 0;
  const signals: AbortSignal[] = [];
  const root = makeCaptureResourceRoot(
    [
      'https://assets.example/a.png',
      'https://assets.example/b.png',
      'https://assets.example/c.png',
    ],
    async (_input, init) => {
      signals.push(init?.signal as AbortSignal);
      return makeStreamingResponse([20 * 1024 * 1024], () => { blobCalls += 1; });
    },
  );

  await assert.rejects(
    assertPublicCaptureResourcesReadable(root),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  assert.equal(blobCalls, 0);
  assert.equal(signals.length, 3);
  assert.equal(new Set(signals).size, 1);
  assert.equal(signals.every(signal => signal.aborted), true);
});

test('capture preflight follows CORS-readable stylesheet imports recursively', async () => {
  const requests: string[] = [];
  const encoder = new TextEncoder();
  const root = makeCaptureResourceRoot(
    [],
    async (input) => {
      const url = String(input);
      requests.push(url);
      if (url === 'https://assets.example/theme.css') {
        return makeStreamingResponse(
          [encoder.encode('@import "./nested.css" screen;\n.preview { color: black; }')],
          () => assert.fail('stylesheet preflight must stream instead of blob()'),
        );
      }
      if (url === 'https://assets.example/nested.css') {
        return makeStreamingResponse(
          [encoder.encode('.nested { color: inherit; }')],
          () => assert.fail('stylesheet preflight must stream instead of blob()'),
        );
      }
      throw new Error(`unexpected request: ${url}`);
    },
    { stylesheetHrefs: ['https://assets.example/theme.css'] },
  );

  await assertPublicCaptureResourcesReadable(root);
  assert.deepEqual(requests, [
    'https://assets.example/theme.css',
    'https://assets.example/nested.css',
  ]);
});

test('capture preflight skips inactive fetched imports after layer and supports prefixes', async () => {
  const requests: string[] = [];
  const encoder = new TextEncoder();
  const root = makeCaptureResourceRoot(
    [],
    async input => {
      const url = String(input);
      requests.push(url);
      if (url === 'https://assets.example/theme.css') {
        return makeStreamingResponse(
          [encoder.encode([
            "@import './print.css' print;",
            "@import './layered-print.css' layer(foo) supports(display:grid) print;",
            "@import './screen.css' screen;",
            "@import './unconditional.css';",
            "@import './malformed.css' supports(display:grid;",
          ].join('\n'))],
          () => assert.fail('stylesheet preflight must stream instead of blob()'),
        );
      }
      if (
        url === 'https://assets.example/screen.css'
        || url === 'https://assets.example/unconditional.css'
        || url === 'https://assets.example/malformed.css'
      ) {
        return makeStreamingResponse(
          [],
          () => assert.fail('stylesheet preflight must stream instead of blob()'),
        );
      }
      throw new Error(`inactive import must not be requested: ${url}`);
    },
    {
      cssStyleSheetConstructor: makeImportIgnoringStyleSheetConstructor(),
      stylesheetHrefs: ['https://assets.example/theme.css'],
    },
  );

  await assertPublicCaptureResourcesReadable(root);
  assert.deepEqual(requests, [
    'https://assets.example/theme.css',
    'https://assets.example/screen.css',
    'https://assets.example/unconditional.css',
    'https://assets.example/malformed.css',
  ]);
});

test('capture preflight conservatively follows fetched imports without CSSOM', async () => {
  const requests: string[] = [];
  const encoder = new TextEncoder();
  const root = makeCaptureResourceRoot(
    [],
    async input => {
      const url = String(input);
      requests.push(url);
      if (url === 'https://assets.example/theme.css') {
        return makeStreamingResponse(
          [encoder.encode("@import './print.css' print;")],
          () => assert.fail('stylesheet preflight must stream instead of blob()'),
        );
      }
      if (url === 'https://assets.example/print.css') {
        return makeStreamingResponse(
          [],
          () => assert.fail('stylesheet preflight must stream instead of blob()'),
        );
      }
      throw new Error(`unexpected request: ${url}`);
    },
    { stylesheetHrefs: ['https://assets.example/theme.css'] },
  );

  await assertPublicCaptureResourcesReadable(root);
  assert.deepEqual(requests, [
    'https://assets.example/theme.css',
    'https://assets.example/print.css',
  ]);
});

test('capture preflight fails closed when a linked or imported stylesheet has no CORS access', async () => {
  const encoder = new TextEncoder();
  const directRoot = makeCaptureResourceRoot(
    [],
    async () => { throw new TypeError('Failed to fetch'); },
    { stylesheetHrefs: ['https://no-cors.example/theme.css'] },
  );
  await assert.rejects(
    assertPublicCaptureResourcesReadable(directRoot),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );

  const importedRoot = makeCaptureResourceRoot(
    [],
    async (input) => {
      const url = String(input);
      if (url === 'https://assets.example/theme.css') {
        return makeStreamingResponse(
          [encoder.encode('@import "https://no-cors.example/nested.css";')],
          () => assert.fail('stylesheet preflight must stream instead of blob()'),
        );
      }
      throw new TypeError('Failed to fetch');
    },
    { stylesheetHrefs: ['https://assets.example/theme.css'] },
  );
  await assert.rejects(
    assertPublicCaptureResourcesReadable(importedRoot),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
});

test('capture preflight ignores inactive stylesheet resources but still blocks active screen CSS', async () => {
  const inactiveRequests: string[] = [];
  const disabledSheet = {
    cssRules: [],
    disabled: true,
    href: 'https://no-cors.example/disabled.css',
    media: { mediaText: 'screen' },
    ownerNode: null,
  } as unknown as CSSStyleSheet;
  const printSheet = {
    cssRules: [],
    disabled: false,
    href: 'https://no-cors.example/print-sheet.css',
    media: { mediaText: 'print' },
    ownerNode: null,
  } as unknown as CSSStyleSheet;
  const inactiveRoot = makeCaptureResourceRoot(
    [],
    async input => {
      inactiveRequests.push(String(input));
      throw new TypeError('Inactive stylesheets must not be fetched.');
    },
    {
      documentStyleSheets: [disabledSheet, printSheet],
      stylesheetLinks: [{
        href: 'https://no-cors.example/print-link.css',
        media: 'print',
      }],
      styleElements: [{
        media: 'print',
        textContent: '@import "https://no-cors.example/print-import.css";'
          + '.print{background:url("https://no-cors.example/print.png")}',
      }],
    },
  );

  await assertPublicCaptureResourcesReadable(inactiveRoot);
  assert.deepEqual(inactiveRequests, []);

  const activeRequests: string[] = [];
  const activeRoot = makeCaptureResourceRoot(
    [],
    async input => {
      activeRequests.push(String(input));
      throw new TypeError('Failed to fetch');
    },
    {
      stylesheetLinks: [{
        href: 'https://no-cors.example/screen.css',
        media: 'screen',
      }],
    },
  );
  await assert.rejects(
    assertPublicCaptureResourcesReadable(activeRoot),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  assert.deepEqual(activeRequests, ['https://no-cors.example/screen.css']);
});

test('capture preflight respects nested CSSOM media groups', async () => {
  const printAsset = 'https://no-cors.example/nested-print.png';
  const printRule = {
    cssRules: [{ cssText: `.print{background:url("${printAsset}")}` }],
    cssText: `@media print{.print{background:url("${printAsset}")}}`,
    media: { mediaText: 'print' },
  };
  const printInsideSupports = {
    cssRules: [printRule],
    cssText: `@supports(display:grid){${printRule.cssText}}`,
  };
  const printDocumentSheet = {
    cssRules: [printInsideSupports],
    disabled: false,
    href: null,
    media: { mediaText: 'screen' },
    ownerNode: null,
  } as unknown as CSSStyleSheet;
  const inactiveRequests: string[] = [];
  const inactiveRoot = makeCaptureResourceRoot(
    [],
    async input => {
      inactiveRequests.push(String(input));
      throw new TypeError('Inactive nested media resources must not be fetched.');
    },
    {
      documentStyleSheets: [printDocumentSheet],
      styleElements: [{
        media: 'screen',
        sheet: printDocumentSheet,
        textContent: printInsideSupports.cssText,
      }],
    },
  );

  await assertPublicCaptureResourcesReadable(inactiveRoot);
  assert.deepEqual(inactiveRequests, []);

  const screenAsset = 'https://no-cors.example/nested-screen.png';
  const activeRequests: string[] = [];
  const activeRoot = makeCaptureResourceRoot(
    [],
    async input => {
      activeRequests.push(String(input));
      throw new TypeError('Failed to fetch');
    },
    {
      documentStyleSheets: [{
        cssRules: [{
          cssRules: [{ cssText: `.screen{background:url("${screenAsset}")}` }],
          cssText: `@media screen{.screen{background:url("${screenAsset}")}}`,
          media: { mediaText: 'screen' },
        }],
        disabled: false,
        href: null,
        media: { mediaText: 'screen' },
        ownerNode: null,
      } as unknown as CSSStyleSheet],
    },
  );

  await assert.rejects(
    assertPublicCaptureResourcesReadable(activeRoot),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  assert.deepEqual(activeRequests, [screenAsset]);
});

test('capture preflight parses fetched CSS against active media and fails closed without CSSOM', async () => {
  const encoder = new TextEncoder();
  const StyleSheetConstructor = makeMediaParsingStyleSheetConstructor();
  const printStylesheet = 'https://assets.example/external-print.css';
  const printAsset = 'https://no-cors.example/external-print.png';
  const printRequests: string[] = [];
  const printRoot = makeCaptureResourceRoot(
    [],
    async input => {
      const url = String(input);
      printRequests.push(url);
      if (url === printStylesheet) {
        return makeStreamingResponse(
          [encoder.encode(`@media print{.asset{background:url("${printAsset}")}}`)],
          () => assert.fail('stylesheet preflight must stream instead of blob()'),
        );
      }
      throw new TypeError('Inactive print assets must not be fetched.');
    },
    {
      cssStyleSheetConstructor: StyleSheetConstructor,
      stylesheetHrefs: [printStylesheet],
    },
  );

  await assertPublicCaptureResourcesReadable(printRoot);
  assert.deepEqual(printRequests, [printStylesheet]);

  const screenStylesheet = 'https://assets.example/external-screen.css';
  const screenAsset = 'https://no-cors.example/external-screen.png';
  const screenRequests: string[] = [];
  const screenRoot = makeCaptureResourceRoot(
    [],
    async input => {
      const url = String(input);
      screenRequests.push(url);
      if (url === screenStylesheet) {
        return makeStreamingResponse(
          [encoder.encode(`@media screen{.asset{background:url("${screenAsset}")}}`)],
          () => assert.fail('stylesheet preflight must stream instead of blob()'),
        );
      }
      throw new TypeError('Failed to fetch');
    },
    {
      cssStyleSheetConstructor: StyleSheetConstructor,
      stylesheetHrefs: [screenStylesheet],
    },
  );

  await assert.rejects(
    assertPublicCaptureResourcesReadable(screenRoot),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  assert.deepEqual(screenRequests, [screenStylesheet, screenAsset]);

  const fallbackRequests: string[] = [];
  const fallbackRoot = makeCaptureResourceRoot(
    [],
    async input => {
      const url = String(input);
      fallbackRequests.push(url);
      if (url === printStylesheet) {
        return makeStreamingResponse(
          [encoder.encode(`@media print{.asset{background:url("${printAsset}")}}`)],
          () => assert.fail('stylesheet preflight must stream instead of blob()'),
        );
      }
      throw new TypeError('Failed to fetch');
    },
    { stylesheetHrefs: [printStylesheet] },
  );

  await assert.rejects(
    assertPublicCaptureResourcesReadable(fallbackRoot),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  assert.deepEqual(fallbackRequests, [printStylesheet, printAsset]);
});

test('capture preflight caches fetched CSS but parses it once per document media context', async () => {
  const encoder = new TextEncoder();
  const stylesheetUrl = 'https://assets.example/shared-context.css';
  const assetUrl = 'https://no-cors.example/shared-context.png';
  const cssText = `@media (min-width: 600px){.asset{background:url("${assetUrl}")}}`;
  const requests: string[] = [];
  let parseCalls = 0;
  const StyleSheetConstructor = makeMediaParsingStyleSheetConstructor(() => { parseCalls += 1; });
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    if (url === stylesheetUrl) {
      return makeStreamingResponse(
        [encoder.encode(cssText)],
        () => assert.fail('stylesheet preflight must stream instead of blob()'),
      );
    }
    throw new TypeError('Failed to fetch');
  };
  const root = makeCaptureResourceRoot([], fetchImpl, {
    cssStyleSheetConstructor: StyleSheetConstructor,
    mediaMatches: () => false,
    stylesheetHrefs: [stylesheetUrl],
  });
  const nestedRoot = makeCaptureResourceRoot([], fetchImpl, {
    cssStyleSheetConstructor: StyleSheetConstructor,
    mediaMatches: () => true,
    stylesheetHrefs: [stylesheetUrl],
  });
  const nestedDocument = nestedRoot.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(nestedDocument, 'documentElement', { value: nestedRoot });
  const queryRoot = root.querySelectorAll.bind(root);
  Object.defineProperty(root, 'querySelectorAll', {
    value: (selector: string) => selector === 'iframe'
      ? [{ contentDocument: nestedDocument }]
      : queryRoot(selector),
  });

  await assert.rejects(
    assertPublicCaptureResourcesReadable(root),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  assert.equal(parseCalls, 2);
  assert.deepEqual(requests, [stylesheetUrl, assetUrl]);
});

test('capture preflight does not fetch URL-like text inside CSS strings or comments', async () => {
  const requests: string[] = [];
  const root = makeCaptureResourceRoot(
    [],
    async input => {
      requests.push(String(input));
      throw new TypeError('CSS text that is not a resource must not be fetched.');
    },
    {
      styleTexts: [
        '.example{content:"url(https://no-cors.example/string-only.png)"}'
          + '/* @import "https://no-cors.example/comment-only.css"; */',
      ],
    },
  );

  await assertPublicCaptureResourcesReadable(root);
  assert.deepEqual(requests, []);
});

test('capture preflight covers URL-bearing SVG paint, filter, clipping, and cursor properties', async () => {
  const requests: string[] = [];
  const root = makeCaptureResourceRoot(
    [],
    async (input) => {
      requests.push(String(input));
      return makeStreamingResponse([], () => assert.fail('resource preflight must stream instead of blob()'));
    },
    {
      computedValues: {
        'clip-path': 'url("https://assets.example/clip.svg#shape")',
        cursor: 'url(https://assets.example/cursor.cur), auto',
        fill: 'url(https://assets.example/paint.svg#fill)',
        filter: 'url(https://assets.example/filter.svg#blur)',
        stroke: 'url(https://assets.example/paint.svg#stroke)',
      },
    },
  );

  await assertPublicCaptureResourcesReadable(root);
  assert.deepEqual(requests.sort(), [
    'https://assets.example/clip.svg',
    'https://assets.example/cursor.cur',
    'https://assets.example/filter.svg',
    'https://assets.example/paint.svg',
  ]);
});

test('capture preflight fails closed for no-CORS poster, source, srcset, and feImage resources', async () => {
  const cases = [
    {
      expected: 'https://no-cors.example/poster.png',
      element: { attributes: { poster: 'https://no-cors.example/poster.png' }, tagName: 'VIDEO' },
    },
    {
      expected: 'https://no-cors.example/movie.mp4',
      element: { attributes: { src: 'https://no-cors.example/movie.mp4' }, tagName: 'SOURCE' },
    },
    {
      expected: 'https://no-cors.example/retina.png',
      element: {
        attributes: {
          srcset: 'data:image/png;base64,AAAA 1x, https://no-cors.example/retina.png 2x',
        },
        tagName: 'SOURCE',
      },
    },
    {
      expected: 'https://no-cors.example/texture.png',
      element: {
        attributes: { 'xlink:href': 'https://no-cors.example/texture.png' },
        tagName: 'feImage',
      },
    },
  ] as const;

  for (const fixture of cases) {
    const requested: string[] = [];
    const root = makeCaptureResourceRoot(
      [],
      async (input) => {
        requested.push(String(input));
        throw new TypeError('Failed to fetch');
      },
      { elements: [fixture.element] },
    );
    await assert.rejects(
      assertPublicCaptureResourcesReadable(root),
      (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
      fixture.expected,
    );
    assert.deepEqual(requested, [fixture.expected]);
  }
});

test('capture postflight checks every srcset candidate instead of trusting a leading data URL', () => {
  const makeSvg = (srcset: string) => ({
    outerHTML: '<svg></svg>',
    querySelectorAll: (selector: string) => selector === 'source[srcset]'
      ? [{ getAttribute: (name: string) => name === 'srcset' ? srcset : null }]
      : [],
  }) as unknown as SVGElement;

  assert.doesNotThrow(() => assertPublicCaptureResourcesEmbedded(makeSvg(
    'data:image/png;base64,AAAA 1x, blob:https://app.example/local 2x',
  )));
  assert.throws(
    () => assertPublicCaptureResourcesEmbedded(makeSvg(
      'data:image/png;base64,AAAA 1x, https://no-cors.example/retina.png 2x',
    )),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
});

test('capture engine owns library cleanup, strict frame readiness, and one operation-wide pixel budget', async () => {
  const source = await readFile(new URL('capture.ts', import.meta.url), 'utf8');

  assert.match(source, /createContext\(captureTarget,[\s\S]*?autoDestruct: false/u);
  assert.match(source, /createPublicCaptureContextWithGuard\([\s\S]*?\(\) => createContext\(captureTarget/u);
  assert.match(
    source,
    /const context = await createPublicCaptureContextWithGuard[\s\S]*?try \{\s*throwIfCaptureAborted\(signal\);[\s\S]*?domToCanvas\(context\)/u,
  );
  assert.match(source, /finally \{[\s\S]*?destroyContext\(context\)/u);
  assert.match(source, /\.html2canvas-container[\s\S]*?__SANDBOX__/u);
  assert.match(source, /quarantineLateNodes/u);
  assert.match(source, /validateCaptureOperationSize\(\[\.\.\.preparedFrames, finalSize\]\)/u);
  assert.match(
    source,
    /capturePreparedStaticHtmlDocument[\s\S]*?captureRegularElementToCanvas\(prepared\.captureRoot/u,
  );
  assert.doesNotMatch(source, /fallbackId/u);
  assert.match(source, /Public raw HTML Final[\s\S]*?backgroundColor: '#ffffff'/u);
});

test('capture CSSOM injection preserves sheet order, disabled state, media, and relative URL origins', () => {
  const appended: Array<{
    href?: string;
    media?: string;
    rel?: string;
    tagName?: string;
    textContent?: string;
  }> = [];
  const doc = {
    baseURI: 'https://app.example/workspace/document',
    createElement: (tagName: string) => ({
      href: '',
      media: '',
      rel: '',
      tagName,
      textContent: '',
    }),
    styleSheets: [
      {
        cssRules: [
          { cssText: '@import "./tokens.css" screen;' },
          { cssText: '@font-face { src: url("../fonts/noto.woff2") format("woff2"); }' },
          { cssText: '.hero { background-image: url(/images/hero.png); filter: url("#local-filter"); }' },
        ],
        disabled: false,
        href: 'https://cdn.example/assets/css/app.css',
        media: { mediaText: 'screen and (min-width: 1px)' },
      },
      {
        get cssRules(): never {
          throw new DOMException('Stylesheet rules are not readable.', 'SecurityError');
        },
        disabled: false,
        href: 'https://cdn.example/print.css',
        media: { mediaText: 'print' },
      },
      {
        cssRules: [{ cssText: '.disabled { background: url("./must-not-load.png"); }' }],
        disabled: true,
        href: 'https://cdn.example/disabled.css',
        media: { mediaText: 'screen' },
      },
      {
        cssRules: [{ cssText: '.inline { mask-image: url("./mask.svg"); }' }],
        disabled: false,
        href: null,
        media: { mediaText: '' },
      },
    ],
  } as unknown as Document;
  const target = {
    appendChild: (node: { textContent?: string }) => { appended.push(node); },
  } as unknown as ShadowRoot;

  appendReadableDocumentStyles(doc, target);

  assert.equal(appended.length, 3);
  assert.deepEqual(
    appended.map(node => ({ tagName: node.tagName, media: node.media })),
    [
      { tagName: 'style', media: 'screen and (min-width: 1px)' },
      { tagName: 'link', media: 'print' },
      { tagName: 'style', media: '' },
    ],
  );
  const screenCss = appended[0].textContent ?? '';
  assert.match(screenCss, /@import "https:\/\/cdn\.example\/assets\/css\/tokens\.css" screen;/u);
  assert.match(screenCss, /url\("https:\/\/cdn\.example\/assets\/fonts\/noto\.woff2"\)/u);
  assert.match(screenCss, /url\("https:\/\/cdn\.example\/images\/hero\.png"\)/u);
  assert.match(screenCss, /filter: url\("#local-filter"\)/u);
  assert.equal(appended[1].rel, 'stylesheet');
  assert.equal(appended[1].href, 'https://cdn.example/print.css');
  assert.match(
    appended[2].textContent ?? '',
    /url\("https:\/\/app\.example\/workspace\/mask\.svg"\)/u,
  );
  assert.doesNotMatch(appended.map(node => node.textContent ?? '').join('\n'), /must-not-load/u);
});

test('capture CSS URL rewriting preserves embedded assets and text that only looks like a URL', () => {
  const cssText = rewritePublicCaptureCssUrls(
    '.sample{content:"url(../not-an-asset.png)";background:url(data:image/svg+xml;base64,AAAA);cursor:url("../cursor.cur"),auto}',
    'https://cdn.example/css/app.css',
  );

  assert.match(cssText, /content:"url\(\.\.\/not-an-asset\.png\)"/u);
  assert.match(cssText, /background:url\(data:image\/svg\+xml;base64,AAAA\)/u);
  assert.match(cssText, /cursor:url\("https:\/\/cdn\.example\/cursor\.cur"\),auto/u);
});

test('portable and capture CSS rewriting preserve escaped URL parentheses', () => {
  const css = String.raw`.report{background:url(report\(1\).png)}.hex{mask:url(report\28 1\29 .png)}`;
  const expected = '.report{background:url("https://example.com/base/report(1).png")}.hex{mask:url("https://example.com/base/report(1).png")}';

  assert.equal(absolutizePortableCssReferences(css, 'https://example.com/base/app.css'), expected);
  assert.equal(rewritePublicCaptureCssUrls(css, 'https://example.com/base/app.css'), expected);
});

test('buildPublicStandaloneHtml cannot be broken out of its top-level style element', async () => {
  const root = makeRoot();
  Object.defineProperty(root.ownerDocument, 'styleSheets', {
    configurable: true,
    value: [{
      cssRules: [{ cssText: 'x{content:"</style><script>top.pwned=1</script>"}' }],
      href: null,
    }],
  });
  const html = await buildPublicStandaloneHtml(makeInput({ previewRoot: root }));
  const renderedDocument = extractPortableSrcdoc(html);

  assert.doesNotMatch(html, /<\/style><script>top\.pwned/);
  assert.match(renderedDocument, /<\\\/style><script>top\.pwned/);
});

test('standalone HTML embeds bundled same-origin fonts but preserves author-owned remote URLs', async () => {
  const root = makeRoot();
  const ownerDocument = root.ownerDocument as Document & {
    baseURI: string;
    documentElement: { lang: string };
    defaultView: Window;
  };
  Object.defineProperties(ownerDocument, {
    baseURI: { configurable: true, value: 'https://oss.local/' },
    documentElement: { configurable: true, value: { lang: 'en' } },
    defaultView: {
      configurable: true,
      value: {
        btoa: globalThis.btoa,
        fetch: async (href: string) => {
          assert.equal(href, 'https://oss.local/fonts/public.woff2');
          return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x32]), {
            headers: { 'content-type': 'font/woff2' },
          });
        },
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
      },
    },
    styleSheets: {
      configurable: true,
      value: [{
        cssRules: [{
          cssText: '@font-face{font-family:Public;src:url("/fonts/public.woff2")} .remote{background:url("https://cdn.example/author.png")}',
        }],
        href: 'https://oss.local/assets/app.css',
      }],
    },
  });

  const html = await buildPublicStandaloneHtml(makeInput({ previewRoot: root, theme: 'dark' }));

  assert.match(html, /<html lang="en"/u);
  assert.match(html, /data:font\/woff2;base64,d09GMg==/u);
  assert.doesNotMatch(html, /https:\/\/oss\.local\/fonts\/public\.woff2/u);
  assert.match(html, /https:\/\/cdn\.example\/author\.png/u);
  assert.match(html, /--md-public-paper:#22221d/u);
  assert.match(html, /--md-public-border:rgba\(255, 255, 255, \.16\)/u);
});

test('standalone HTML recursively embeds local CSS imports and preserves stylesheet state', async () => {
  const root = makeRoot();
  const ownerDocument = root.ownerDocument as Document & {
    baseURI: string;
    documentElement: { lang: string };
    defaultView: Window;
  };
  const requests: string[] = [];
  Object.defineProperties(ownerDocument, {
    baseURI: { configurable: true, value: 'https://oss.local/app/' },
    documentElement: { configurable: true, value: { lang: 'zh-CN' } },
    defaultView: {
      configurable: true,
      value: {
        btoa: globalThis.btoa,
        fetch: async (href: string) => {
          requests.push(href);
          if (href === 'https://oss.local/styles/nested.css') {
            return new Response('.nested{background:url("../images/nested.png")}', {
              headers: { 'content-type': 'text/css' },
            });
          }
          if (href === 'https://oss.local/images/nested.png') {
            return new Response(ONE_PIXEL_PNG, {
              headers: { 'content-type': 'image/png' },
            });
          }
          throw new Error(`unexpected portable request: ${href}`);
        },
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
      },
    },
    styleSheets: {
      configurable: true,
      value: [
        {
          cssRules: [{
            cssText: [
              '@import url("./nested.css") screen;',
              '.local{color:green}',
              '.local::after{content:"url(./not-an-asset.png)"}',
              '/* @import "./not-a-stylesheet.css"; url(./not-an-asset-either.png) */',
            ].join(' '),
          }],
          disabled: false,
          href: 'https://oss.local/styles/app.css',
          media: { mediaText: 'screen and (min-width: 1px)' },
        },
        {
          cssRules: [{ cssText: '.must-not-inline{color:red}' }],
          disabled: false,
          href: 'https://cdn.example/author.css',
          media: { mediaText: 'print' },
        },
        {
          cssRules: [{ cssText: '.disabled-style{display:block}' }],
          disabled: true,
          href: null,
          media: { mediaText: '' },
        },
      ],
    },
  });

  const html = await buildPublicStandaloneHtml(makeInput({ previewRoot: root }));
  const renderedDocument = extractPortableSrcdoc(html);
  const importMatch = renderedDocument.match(/@import url\("data:text\/css;charset=utf-8;base64,([^"]+)"\) screen;/u);
  assert.ok(importMatch);
  const nestedCss = Buffer.from(importMatch[1], 'base64').toString('utf8');

  assert.deepEqual(requests, [
    'https://oss.local/styles/nested.css',
    'https://oss.local/images/nested.png',
  ]);
  assert.match(nestedCss, /data:image\/png;base64,/u);
  assert.doesNotMatch(nestedCss, /nested\.png/u);
  assert.match(renderedDocument, /<style media="screen and \(min-width: 1px\)">/u);
  assert.match(renderedDocument, /content:"url\(\.\/not-an-asset\.png\)"/u);
  assert.match(renderedDocument, /@import "\.\/not-a-stylesheet\.css"/u);
  assert.match(renderedDocument, /<link rel="stylesheet" href="https:\/\/cdn\.example\/author\.css" media="print">/u);
  assert.doesNotMatch(renderedDocument, /must-not-inline|disabled-style/u);
});

test('portable CSS URL rewriting ignores strings and comments while resolving real references', () => {
  const cssText = [
    '.real{background:url("./real.png")}',
    '.text::after{content:"url(./visible-text.png)"}',
    '/* @import "./comment.css"; url(./comment.png) */',
    '@import "./theme.css" screen;',
  ].join(' ');
  const rewritten = absolutizePortableCssReferences(cssText, 'https://app.example/styles/app.css');

  assert.match(rewritten, /url\("https:\/\/app\.example\/styles\/real\.png"\)/u);
  assert.match(rewritten, /content:"url\(\.\/visible-text\.png\)"/u);
  assert.match(rewritten, /\/\* @import "\.\/comment\.css"; url\(\.\/comment\.png\) \*\//u);
  assert.match(rewritten, /@import url\("https:\/\/app\.example\/styles\/theme\.css"\) screen;/u);
});

test('buildPublicStandaloneHtml awaits the canonical renderer before serializing', async () => {
  let rendered = false;
  let currentChecks = 0;
  await buildPublicStandaloneHtml(makeInput({
    ensureRendered: async () => {
      rendered = true;
    },
    assertCurrent: () => { currentChecks += 1; },
  }));
  assert.equal(rendered, true);
  assert.equal(currentChecks, 2);
});

test('standalone delivery fails before returning an artifact from a stale document', async () => {
  let currentChecks = 0;
  await assert.rejects(
    buildPublicStandaloneHtml(makeInput({
      assertCurrent: () => {
        currentChecks += 1;
        if (currentChecks > 1) throw new Error('stale document');
      },
    })),
    /stale document/u,
  );
});

test('standalone asset timeout aborts a hanging browser-local resource read', async () => {
  let observedAbort = false;
  await assert.rejects(
    withStandaloneAssetTimeout((signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        observedAbort = true;
        reject(signal.reason);
      }, { once: true });
    }), undefined, 5),
    (error: unknown) => error instanceof PublicDeliveryError
      && error.code === 'download-unavailable'
      && /超时/u.test(error.message),
  );
  assert.equal(observedAbort, true);
});

test('standalone asset timeout rejects before an operation that ignores its signal resolves', async () => {
  let lateResolved = false;
  const pending = withStandaloneAssetTimeout(async () => new Promise<string>((resolve) => {
    setTimeout(() => {
      lateResolved = true;
      resolve('late-success');
    }, 35);
  }), undefined, 5);

  await assert.rejects(
    pending,
    (error: unknown) => error instanceof PublicDeliveryError
      && error.code === 'download-unavailable'
      && /\u8d85\u65f6/u.test(error.message),
  );
  assert.equal(lateResolved, false);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(lateResolved, true);
});

test('standalone caller abort rejects before an operation that ignores its signal resolves', async () => {
  const controller = new AbortController();
  let lateResolved = false;
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const pending = withStandaloneAssetTimeout(async () => new Promise<string>((resolve) => {
    markStarted?.();
    setTimeout(() => {
      lateResolved = true;
      resolve('late-success');
    }, 35);
  }), controller.signal, 100);

  await started;
  controller.abort(new Error('stale standalone document'));
  await assert.rejects(pending, /stale standalone document/u);
  assert.equal(lateResolved, false);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(lateResolved, true);
});

test('buildPublicPreviewPdf creates a valid A4 image PDF without a service request', async () => {
  const capture: PublicPngCapture = {
    blob: new Blob([ONE_PIXEL_PNG], { type: 'image/png' }),
    width: 677,
    height: 1200,
    scale: 2,
  };
  const pdfBlob = await buildPublicPreviewPdf(capture);
  const pdf = await PDFDocument.load(await pdfBlob.arrayBuffer());

  assert.equal(pdfBlob.type, 'application/pdf');
  assert.equal(pdf.getPageCount(), 2);
  const firstPage = pdf.getPage(0);
  assert.ok(Math.abs(firstPage.getWidth() - 595.28) < 0.01);
  assert.ok(Math.abs(firstPage.getHeight() - 841.89) < 0.01);
});

test('shared image PDF engine preserves segment-aware page breaks and pre-paginated page boxes', async () => {
  const layout = calculateImagePdfPages({
    imageWidth: 1000,
    imageHeight: 3200,
    pageBreakHints: [
      { y: 0, height: 900 },
      { y: 900, height: 500 },
      { y: 1400, height: 900 },
      { y: 2300, height: 700 },
    ],
  });
  assert.deepEqual(
    layout.pages.map(page => [page.sourceY, page.sourceHeight]),
    [[0, 1400], [1400, 900], [2300, 900]],
  );

  const pageBlob = new Blob([ONE_PIXEL_PNG], { type: 'image/png' });
  const pdfBlob = await buildImagePdfBlob({
    blob: pageBlob,
    width: 1,
    height: 1,
    pdfPages: [{
      blob: pageBlob,
      width: 1123,
      height: 794,
      orientation: 'landscape',
      pageWidthPt: 841.89,
      pageHeightPt: 595.28,
    }],
  });
  const pdf = await PDFDocument.load(await pdfBlob.arrayBuffer());
  const page = pdf.getPage(0);
  assert.equal(Number(page.getWidth().toFixed(2)), 841.89);
  assert.equal(Number(page.getHeight().toFixed(2)), 595.28);
});

test('canvasToPngBlob releases every scale-2 canvas backing store after encoding', async () => {
  const canvases = Array.from({ length: 10 }, () => ({
    height: 4_000,
    width: 2_000,
    toBlob(callback: BlobCallback) {
      callback(new Blob([ONE_PIXEL_PNG], { type: 'image/png' }));
    },
  }) as unknown as HTMLCanvasElement);

  for (const canvas of canvases) {
    const blob = await canvasToPngBlob(canvas);
    assert.equal(blob.type, 'image/png');
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
  }
});

test('canvasToPngBlob also releases a canvas when encoding fails', async () => {
  const canvas = {
    height: 4_000,
    width: 2_000,
    toBlob() {
      throw new Error('tainted');
    },
  } as unknown as HTMLCanvasElement;

  await assert.rejects(
    () => canvasToPngBlob(canvas),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
});

test('canvasToPngBlob times out a missing browser callback and releases the backing store', async () => {
  const canvas = {
    height: 4_000,
    width: 2_000,
    toBlob() {
      // Model a browser encoder that never invokes its callback.
    },
  } as unknown as HTMLCanvasElement;

  await assert.rejects(
    () => canvasToPngBlob(canvas, { timeoutMs: 1 }),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
});

test('canvasToPngBlob aborts a stale encode, ignores a late callback, and releases the canvas', async () => {
  let callback: BlobCallback | undefined;
  const canvas = {
    height: 4_000,
    width: 2_000,
    toBlob(nextCallback: BlobCallback) {
      callback = nextCallback;
    },
  } as unknown as HTMLCanvasElement;
  const controller = new AbortController();
  const pending = canvasToPngBlob(canvas, {
    signal: controller.signal,
    timeoutMs: 100,
  });

  controller.abort(new Error('stale document'));
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
  callback?.(new Blob([ONE_PIXEL_PNG], { type: 'image/png' }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
});

test('delivery timeout releases a canvas that resolves after the caller already failed', async () => {
  let resolveCanvas: ((canvas: HTMLCanvasElement) => void) | undefined;
  const canvas = { width: 2000, height: 4000 } as HTMLCanvasElement;
  const pending = new Promise<HTMLCanvasElement>(resolve => { resolveCanvas = resolve; });
  await assert.rejects(
    withPublicDeliveryTimeout(pending, 1, 'timed out', lateCanvas => {
      lateCanvas.width = 0;
      lateCanvas.height = 0;
    }),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  resolveCanvas?.(canvas);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
});

test('capture context initialization aborts promptly and destroys a late context exactly once', async () => {
  const controller = new AbortController();
  const context = { id: 'late-context' };
  const destroyed: Array<typeof context> = [];
  let resolveContext: ((value: typeof context) => void) | undefined;
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const pending = createPublicCaptureContextWithGuard(
    () => new Promise<typeof context>((resolve) => {
      resolveContext = resolve;
      markStarted?.();
    }),
    value => destroyed.push(value),
    { signal: controller.signal, timeoutMs: 1_000 },
  );
  await started;

  controller.abort(new Error('stale capture context'));
  let promptTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      assert.rejects(
        pending,
        (error: unknown) => error instanceof PublicDeliveryError
          && error.code === 'capture-failed'
          && error.cause instanceof Error
          && error.cause.message === 'stale capture context',
      ),
      new Promise<never>((_, reject) => {
        promptTimeout = setTimeout(
          () => reject(new Error('capture context abort did not settle promptly')),
          50,
        );
      }),
    ]);
  } finally {
    if (promptTimeout) clearTimeout(promptTimeout);
  }
  assert.deepEqual(destroyed, []);

  resolveContext?.(context);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(destroyed, [context]);
});

test('PDF runtime times out a hanging library import, clears its cache, and retries', async () => {
  let imports = 0;
  const loader = createImagePdfLibraryLoader(async () => {
    imports += 1;
    if (imports === 1) return new Promise<never>(() => undefined);
    return import('pdf-lib');
  });

  await assert.rejects(
    loader({ timeoutMs: 1 }),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  const library = await loader({ timeoutMs: 100 });

  assert.equal(imports, 2);
  assert.equal(library.PDFDocument, PDFDocument);
});

test('PDF runtime rejects an already-aborted signal even when pdf-lib is cached', async () => {
  const loader = createImagePdfLibraryLoader(() => import('pdf-lib'));
  await loader({ timeoutMs: 100 });
  const controller = new AbortController();
  controller.abort(new Error('stale document'));

  await assert.rejects(
    loader({ signal: controller.signal, timeoutMs: 100 }),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
});

test('image PDF build aborts a cached-engine task while its image bytes are still pending', async () => {
  await buildImagePdfBlob({
    blob: new Blob([ONE_PIXEL_PNG], { type: 'image/png' }),
    height: 1,
    width: 1,
  });
  let resolveBytes: ((value: ArrayBuffer) => void) | undefined;
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  const delayedBlob = new Blob([ONE_PIXEL_PNG], { type: 'image/png' });
  Object.defineProperty(delayedBlob, 'arrayBuffer', {
    configurable: true,
    value: () => {
      markStarted?.();
      return new Promise<ArrayBuffer>(resolve => { resolveBytes = resolve; });
    },
  });
  const controller = new AbortController();
  const pending = buildImagePdfBlob({
    blob: delayedBlob,
    height: 1,
    width: 1,
  }, {
    signal: controller.signal,
    timeoutMs: 1_000,
  });

  await started;
  controller.abort(new Error('stale document'));
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  resolveBytes?.(Uint8Array.from(ONE_PIXEL_PNG).buffer);
  await new Promise(resolve => setTimeout(resolve, 0));
});

test('image PDF build aborts while a cached PDF engine is saving the file', async () => {
  let markSaveStarted: (() => void) | undefined;
  let resolveSave: ((value: Uint8Array) => void) | undefined;
  const saveStarted = new Promise<void>(resolve => { markSaveStarted = resolve; });
  const page = {
    drawImage: () => undefined,
    pushOperators: () => undefined,
    setArtBox: () => undefined,
    setBleedBox: () => undefined,
    setCropBox: () => undefined,
    setMediaBox: () => undefined,
    setTrimBox: () => undefined,
  };
  const pdfDocument = {
    addPage: () => page,
    embedPng: async () => ({ height: 1, width: 1 }),
    save: () => {
      markSaveStarted?.();
      return new Promise<Uint8Array>(resolve => { resolveSave = resolve; });
    },
  };
  const buildWithFakeCachedLibrary = createImagePdfBlobBuilder(async () => ({
    PDFDocument: { create: async () => pdfDocument },
    clip: () => ({}),
    endPath: () => ({}),
    popGraphicsState: () => ({}),
    pushGraphicsState: () => ({}),
    rectangle: () => ({}),
  }) as unknown as typeof import('pdf-lib'));
  const controller = new AbortController();
  const pending = buildWithFakeCachedLibrary({
    blob: new Blob([ONE_PIXEL_PNG], { type: 'image/png' }),
    height: 1,
    width: 1,
  }, {
    signal: controller.signal,
    timeoutMs: 1_000,
  });

  await saveStarted;
  controller.abort(new Error('stale document'));
  await assert.rejects(
    pending,
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  resolveSave?.(new Uint8Array());
  await new Promise(resolve => setTimeout(resolve, 0));
});

test('downloadPublicBlob removes its anchor and revokes the Blob URL after a Safari-safe bounded delay', () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  const previousRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  const previousSetTimeout = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');
  let appended = false;
  let clicked = false;
  let removed = false;
  let revokedUrl = '';
  let scheduledDelay = Number.POSITIVE_INFINITY;
  const anchor = {
    download: '',
    hidden: false,
    href: '',
    click: () => { clicked = true; },
    remove: () => { removed = true; },
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: { appendChild: () => { appended = true; } },
      createElement: () => anchor,
    },
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => 'blob:public-download',
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (url: string) => { revokedUrl = url; },
  });
  Object.defineProperty(globalThis, 'setTimeout', {
    configurable: true,
    value: (callback: () => void, delay: number) => {
      scheduledDelay = delay;
      callback();
      return 1;
    },
  });

  try {
    downloadPublicBlob(new Blob(['png'], { type: 'image/png' }), 'morndraft.png');
    assert.equal(appended, true);
    assert.equal(clicked, true);
    assert.equal(removed, true);
    assert.equal(anchor.download, 'morndraft.png');
    assert.ok(scheduledDelay >= 1_000 && scheduledDelay <= 5_000);
    assert.equal(revokedUrl, 'blob:public-download');
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete (globalThis as { document?: unknown }).document;
    if (previousCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', previousCreateObjectUrl);
    else delete (URL as { createObjectURL?: unknown }).createObjectURL;
    if (previousRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', previousRevokeObjectUrl);
    else delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
    if (previousSetTimeout) Object.defineProperty(globalThis, 'setTimeout', previousSetTimeout);
  }
});

test('downloadPublicBlob cleans up every resource created before a startup failure', () => {
  const failureStages = ['create-url', 'create-anchor', 'append-anchor', 'click-anchor'] as const;

  for (const failureStage of failureStages) {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const previousCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const previousRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    let removeCalls = 0;
    let revokeCalls = 0;
    const anchor = {
      download: '',
      hidden: false,
      href: '',
      click: () => {
        if (failureStage === 'click-anchor') throw new Error('click failed');
      },
      remove: () => { removeCalls += 1; },
    };
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        body: {
          appendChild: () => {
            if (failureStage === 'append-anchor') throw new Error('append failed');
          },
        },
        createElement: () => {
          if (failureStage === 'create-anchor') throw new Error('anchor failed');
          return anchor;
        },
      },
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => {
        if (failureStage === 'create-url') throw new Error('URL failed');
        return 'blob:public-download';
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: () => { revokeCalls += 1; },
    });

    try {
      assert.throws(
        () => downloadPublicBlob(new Blob(['png'], { type: 'image/png' }), 'morndraft.png'),
        (error: unknown) => error instanceof PublicDeliveryError && error.code === 'download-unavailable',
        failureStage,
      );
      assert.equal(revokeCalls, failureStage === 'create-url' ? 0 : 1, `${failureStage}: revoke`);
      assert.equal(
        removeCalls,
        failureStage === 'append-anchor' || failureStage === 'click-anchor' ? 1 : 0,
        `${failureStage}: remove`,
      );
    } finally {
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
      else delete (globalThis as { document?: unknown }).document;
      if (previousCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', previousCreateObjectUrl);
      else delete (URL as { createObjectURL?: unknown }).createObjectURL;
      if (previousRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', previousRevokeObjectUrl);
      else delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
  }
});

test('copyPublicPng reports a download fallback when clipboard image APIs are unavailable', async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousClipboardItem = Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'ClipboardItem', { configurable: true, value: undefined });

  try {
    await assert.rejects(
      () => copyPublicPng(new Blob([ONE_PIXEL_PNG], { type: 'image/png' })),
      (error: unknown) => error instanceof PublicDeliveryError &&
        error.code === 'clipboard-unavailable' &&
        /下载 PNG/.test(error.message),
    );
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
    if (previousClipboardItem) Object.defineProperty(globalThis, 'ClipboardItem', previousClipboardItem);
    else delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
  }
});

test('copyPublicPng begins clipboard write before the asynchronous PNG payload settles', async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousClipboardItem = Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem');
  let clipboardWriteStarted = false;
  let clipboardPayload: unknown;
  class ClipboardItemMock {
    constructor(payload: Record<string, unknown>) {
      clipboardPayload = payload['image/png'];
    }
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { write: async () => { clipboardWriteStarted = true; } } },
  });
  Object.defineProperty(globalThis, 'ClipboardItem', { configurable: true, value: ClipboardItemMock });

  try {
    const operation = copyPublicPng(new Blob([ONE_PIXEL_PNG], { type: 'image/png' }));
    assert.equal(clipboardWriteStarted, true);
    assert.ok(clipboardPayload instanceof Promise);
    await operation;
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
    if (previousClipboardItem) Object.defineProperty(globalThis, 'ClipboardItem', previousClipboardItem);
    else delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
  }
});

test('copyPublicPng never relabels a non-PNG payload as PNG', async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousClipboardItem = Object.getOwnPropertyDescriptor(globalThis, 'ClipboardItem');
  class ClipboardItemMock {}
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { write: async () => undefined } },
  });
  Object.defineProperty(globalThis, 'ClipboardItem', { configurable: true, value: ClipboardItemMock });

  try {
    await assert.rejects(
      () => copyPublicPng(new Blob(['not-a-png'], { type: 'image/webp' })),
      (error: unknown) => error instanceof PublicDeliveryError && error.code === 'invalid-png',
    );
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete (globalThis as { navigator?: unknown }).navigator;
    if (previousClipboardItem) Object.defineProperty(globalThis, 'ClipboardItem', previousClipboardItem);
    else delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
  }
});

test('the public package source stays free of private delivery surfaces', async () => {
  const files = [
    'browserActions.ts',
    'capture.ts',
    'captureResources.ts',
    'imagePdf.ts',
    'index.ts',
    'pdf.ts',
    'rawHtml.ts',
    'standalone.ts',
    'theme.ts',
    'types.ts',
  ];
  const source = (await Promise.all(files.map(file => readFile(new URL(file, import.meta.url), 'utf8')))).join('\n');
  const forbidden = [
    'AppImpl',
    'DraftSidebar',
    '/api/',
    'billing',
    'entitlement',
    'moderation',
    'quota',
    'telemetry',
    'hosted-link',
    'watermark',
  ];
  forbidden.forEach(marker => assert.equal(source.includes(marker), false, `unexpected private marker: ${marker}`));
  const standaloneSource = await readFile(new URL('standalone.ts', import.meta.url), 'utf8');
  assert.match(standaloneSource, /querySelectorAll\('script,base,meta,title,object,embed'\)/);
  assert.match(standaloneSource, /element\.setAttribute\('sandbox', isMermaid \? '' : 'allow-scripts'\)/);
  assert.match(standaloneSource, /body: frame/u);
  assert.doesNotMatch(standaloneSource, /allow-same-origin/u);
});
