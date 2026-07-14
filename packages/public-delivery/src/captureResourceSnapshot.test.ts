import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import {
  applyPublicCaptureResourceSnapshot,
  createPublicCaptureResourceSnapshot,
  preparePublicRawHtmlCaptureResources,
} from './captureResources';
import { inspectPublicCaptureResource } from './captureResourceFormats';
import {
  findPublicSrcsetUrlOccurrences,
  scanPublicCssResources,
} from './captureResourceScanner';
import { PublicDeliveryError } from './types';

const ONE_PIXEL_PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
  'base64',
));
const ONE_PIXEL_GIF = Uint8Array.from(Buffer.from(
  'R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
  'base64',
));
const STATIC_JPEG = Uint8Array.from(Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwC5RRRXmn58f//Z',
  'base64',
));
const STATIC_WEBP = Uint8Array.from(Buffer.from(
  'UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAfQ45YUrf+BiOh/AAA=',
  'base64',
));
const STATIC_AVIF = Uint8Array.from(Buffer.from(
  'AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAAKAAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAAgAAAAIAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAAMG1kYXQSAAoIGAA2iAhoNCAyGhTHh4ZlAgggnlAAAABIWtlc1exMlNWFNyg4',
  'base64',
));
const DECODER_INVALID_JPEG = Uint8Array.from([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x00, 0xff, 0xd9,
]);
const DECODER_INVALID_WOFF = (() => {
  const bytes = new Uint8Array(44);
  bytes.set(new TextEncoder().encode('wOFF'), 0);
  bytes.set([0, 0, 0, 44], 8);
  bytes.set([0, 1], 12);
  return bytes;
})();

const makeCaptureRoot = ({
  computedValues = {},
  elements,
  fetchImpl,
}: {
  computedValues?: Readonly<Record<string, string>>;
  elements: readonly { attributes: Readonly<Record<string, string>>; currentSrc?: string; tagName: string }[];
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}) => {
  const domElements = elements.map(element => ({
    currentSrc: element.currentSrc ?? '',
    getAttribute: (name: string) => element.attributes[name] ?? null,
    tagName: element.tagName,
  }));
  const view = {
    clearTimeout: () => undefined,
    fetch: fetchImpl,
    getComputedStyle: () => ({
      getPropertyValue: (property: string) => computedValues[property] ?? '',
    }),
    location: { href: 'https://app.example/document', origin: 'https://app.example' },
    setTimeout: () => 1,
  };
  const ownerDocument = {
    baseURI: 'https://app.example/document',
    defaultView: view,
    querySelectorAll: () => [],
    styleSheets: [],
  };
  return {
    getAttribute: () => null,
    ownerDocument,
    querySelectorAll: (selector: string) => selector === '*' ? domElements : [],
    tagName: 'MAIN',
  } as unknown as HTMLElement;
};

test('capture CSS scanner decodes escaped url/image-set names and ignores inert text', () => {
  const css = [
    '.hero{background:u\\72l("https://assets.example/a\\29.png")}',
    '.retina{background-image:image\\2d set("https://assets.example/b.png" 1x,u\\72l(https://assets.example/c.png) 2x)}',
    '.label::after{content:"url(https://ignored.example/string.png)"}',
    '/* u\\72l(https://ignored.example/comment.png) */',
  ].join('');
  const scan = scanPublicCssResources(css);
  assert.equal(scan.malformed, false);
  assert.deepEqual(scan.occurrences.map(occurrence => [occurrence.kind, occurrence.value]), [
    ['url', 'https://assets.example/a).png'],
    ['image-set-string', 'https://assets.example/b.png'],
    ['url', 'https://assets.example/c.png'],
  ]);
  const imports = scanPublicCssResources([
    '@\\69mport "https://assets.example/escaped.css" layer(theme) screen;',
    '@im/**/port/**/u\\72l(https://assets.example/commented.css) supports(display:grid);',
  ].join(''));
  assert.equal(imports.malformed, false);
  assert.deepEqual(imports.imports.map(occurrence => [occurrence.value, occurrence.condition.trim()]), [
    ['https://assets.example/escaped.css', 'layer(theme) screen'],
    ['https://assets.example/commented.css', 'supports(display:grid)'],
  ]);
  assert.equal(imports.occurrences.length, 0, 'import URLs must not be downgraded to pixel assets');
  assert.equal(scanPublicCssResources('.x{background:u\\72l("unterminated)}').malformed, true);

  const nested = scanPublicCssResources([
    '.nested{background:image-set(',
    '"https://assets.example/outer.png" 1x,',
    'image-set("https://assets.example/inner.png" 1x,',
    'url("https://assets.example/deep.png") 2x) 2x,',
    '"https://assets.example/last.png" 3x)}',
  ].join(''));
  assert.equal(nested.malformed, false);
  assert.deepEqual(nested.occurrences.map(occurrence => occurrence.value), [
    'https://assets.example/outer.png',
    'https://assets.example/inner.png',
    'https://assets.example/deep.png',
    'https://assets.example/last.png',
  ]);
});

test('capture srcset scanner preserves the data URL comma and every candidate boundary', () => {
  const srcset = `data:image/png;base64,${Buffer.from(ONE_PIXEL_PNG).toString('base64')} 1x, /retina.png 2x`;
  assert.deepEqual(findPublicSrcsetUrlOccurrences(srcset).map(occurrence => occurrence.value), [
    `data:image/png;base64,${Buffer.from(ONE_PIXEL_PNG).toString('base64')}`,
    '/retina.png',
  ]);
});

test('capture CSS scanner stays linear on a 2 MiB adversarial source', () => {
  const unit = '.x{content:"url(https://ignored.example/a.png)"}/* image-set( */';
  const css = unit.repeat(Math.ceil((2 * 1024 * 1024) / unit.length)).slice(0, 2 * 1024 * 1024);
  const startedAt = performance.now();
  const scan = scanPublicCssResources(css);
  const elapsed = performance.now() - startedAt;
  assert.equal(scan.occurrences.length, 0);
  assert.equal(scan.malformed, false);
  assert.ok(elapsed < 1_500, `2 MiB CSS scan took ${elapsed.toFixed(1)}ms`);
});

test('capture CSS scanner stays linear on 2 MiB of nested image-set functions', () => {
  const targetBytes = 2 * 1024 * 1024;
  const prefix = 'image-set(';
  const depth = Math.floor((targetBytes - 3) / (prefix.length + 1));
  const css = `${prefix.repeat(depth)}"x"${')'.repeat(depth)}`;
  const startedAt = performance.now();
  const scan = scanPublicCssResources(css);
  const elapsed = performance.now() - startedAt;
  assert.equal(scan.malformed, false);
  assert.deepEqual(scan.occurrences.map(occurrence => occurrence.value), ['x']);
  assert.ok(elapsed < 1_500, `2 MiB nested image-set scan took ${elapsed.toFixed(1)}ms`);
});

test('capture format sniffer derives type from bytes and rejects animated or unknown payloads', () => {
  assert.equal(inspectPublicCaptureResource(ONE_PIXEL_PNG, 'image/gif').format?.name, 'png');
  assert.equal(inspectPublicCaptureResource(ONE_PIXEL_GIF).format?.name, 'gif');
  assert.equal(inspectPublicCaptureResource(STATIC_JPEG).format?.name, 'jpeg');

  const trailer = ONE_PIXEL_GIF.lastIndexOf(0x3b);
  const imageStart = ONE_PIXEL_GIF.indexOf(0x2c);
  const animatedGif = new Uint8Array(ONE_PIXEL_GIF.length + trailer - imageStart);
  animatedGif.set(ONE_PIXEL_GIF.subarray(0, trailer), 0);
  animatedGif.set(ONE_PIXEL_GIF.subarray(imageStart, trailer), trailer);
  animatedGif.set(ONE_PIXEL_GIF.subarray(trailer), trailer + trailer - imageStart);
  assert.equal(inspectPublicCaptureResource(animatedGif).reason, 'animated');

  const idat = Buffer.from(ONE_PIXEL_PNG).indexOf('IDAT', 0, 'ascii') - 4;
  const animationChunk = Uint8Array.from([
    0, 0, 0, 8, 0x61, 0x63, 0x54, 0x4c,
    0, 0, 0, 2, 0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const apng = new Uint8Array(ONE_PIXEL_PNG.length + animationChunk.length);
  apng.set(ONE_PIXEL_PNG.subarray(0, idat), 0);
  apng.set(animationChunk, idat);
  apng.set(ONE_PIXEL_PNG.subarray(idat), idat + animationChunk.length);
  assert.equal(inspectPublicCaptureResource(apng).reason, 'animated');

  assert.equal(inspectPublicCaptureResource(STATIC_WEBP).format?.name, 'webp');
  const animatedWebp = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x20, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x58, 0x0a, 0, 0, 0, 0x02, 0, 0, 0, 0, 0, 0, 0, 0,
    0x56, 0x50, 0x38, 0x20, 0x01, 0, 0, 0, 0, 0, 0,
  ]);
  assert.equal(inspectPublicCaptureResource(animatedWebp).reason, 'animated');
  const webpContainerWithoutPixels = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x12, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x58, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  assert.equal(inspectPublicCaptureResource(webpContainerWithoutPixels).reason, 'invalid');

  const animatedAvif = STATIC_AVIF.slice();
  animatedAvif.set([0x61, 0x76, 0x69, 0x73], 8);
  assert.equal(inspectPublicCaptureResource(STATIC_AVIF).format?.name, 'avif');
  assert.equal(inspectPublicCaptureResource(animatedAvif).reason, 'animated');
  assert.equal(
    inspectPublicCaptureResource(DECODER_INVALID_JPEG).format?.name,
    'jpeg',
    'container validation deliberately leaves full codec validation to browser Image.decode()',
  );
  assert.equal(
    inspectPublicCaptureResource(DECODER_INVALID_WOFF).format?.name,
    'woff',
    'container validation deliberately leaves full font validation to browser FontFace.load()',
  );

  assert.equal(inspectPublicCaptureResource(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])).reason, 'invalid');
  assert.equal(inspectPublicCaptureResource(Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x0a, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x20, 0x01, 0, 0, 0, 0, 0,
  ])).reason, 'invalid');
  assert.equal(inspectPublicCaptureResource(Uint8Array.from([
    0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70,
    0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0,
    0x61, 0x76, 0x69, 0x66, 0x6d, 0x69, 0x66, 0x31,
  ])).reason, 'invalid');
  assert.equal(inspectPublicCaptureResource(new TextEncoder().encode('wOFFfake')).reason, 'invalid');

  const malformedGif = ONE_PIXEL_GIF.slice(0, ONE_PIXEL_GIF.length - 1);
  assert.equal(inspectPublicCaptureResource(malformedGif).reason, 'invalid');

  assert.equal(inspectPublicCaptureResource(new TextEncoder().encode('<svg/>')).reason, 'svg');
  assert.equal(inspectPublicCaptureResource(Uint8Array.from([1, 2, 3])).reason, 'unknown');
});

test('capture snapshot fetches a remote resource once, ignores MIME spoofing, and reuses frozen bytes', async () => {
  const remote = 'https://assets.example/photo.bin';
  const encoded = `data:image/png;base64,${Buffer.from(ONE_PIXEL_PNG).toString('base64')}`;
  let fetchCalls = 0;
  const root = makeCaptureRoot({
    elements: [{
      attributes: { src: remote, srcset: `${encoded} 1x, ${remote} 2x` },
      currentSrc: remote,
      tagName: 'IMG',
    }],
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response(ONE_PIXEL_PNG, { headers: { 'content-type': 'image/gif' } });
    },
  });
  const snapshot = await createPublicCaptureResourceSnapshot(root);
  try {
    assert.equal(fetchCalls, 1);
    const frozen = snapshot.resolve(remote, root.ownerDocument.baseURI);
    assert.match(frozen, /^blob:/u);
    assert.equal(await snapshot.fetchFrozenImage(remote), frozen);
    assert.match(snapshot.rewriteCss(`.x{background:u\\72l("${remote}")}`, root.ownerDocument.baseURI), /url\("blob:/u);
    const rewrittenSrcset = snapshot.rewriteSrcset(
      `${encoded} 1x, ${remote} 2x`,
      root.ownerDocument.baseURI,
    );
    assert.doesNotMatch(rewrittenSrcset, /data:image|assets\.example/u);
    assert.equal(fetchCalls, 1, 'snapshot consumers must not refetch the original URL');
  } finally {
    snapshot.cleanup();
    snapshot.cleanup();
  }
});

test('redirect aliases reuse identical asset bytes and reject final-URL byte changes', async () => {
  const requested = 'https://assets.example/start.png';
  const final = 'https://cdn.example/final.png';
  const makeRedirectRoot = (changed: boolean) => makeCaptureRoot({
    elements: [
      { attributes: { src: requested }, currentSrc: requested, tagName: 'IMG' },
      { attributes: { src: final }, currentSrc: final, tagName: 'IMG' },
    ],
    fetchImpl: async input => {
      const href = String(input);
      const response = new Response(href === final && changed ? ONE_PIXEL_GIF : ONE_PIXEL_PNG);
      Object.defineProperty(response, 'url', { configurable: true, value: final });
      return response;
    },
  });

  const stableRoot = makeRedirectRoot(false);
  const stableSnapshot = await createPublicCaptureResourceSnapshot(stableRoot);
  try {
    assert.equal(
      stableSnapshot.resolve(requested, stableRoot.ownerDocument.baseURI),
      stableSnapshot.resolve(final, stableRoot.ownerDocument.baseURI),
      'one response URL must resolve to one operation-owned byte snapshot',
    );
  } finally {
    stableSnapshot.cleanup();
  }

  await assert.rejects(
    createPublicCaptureResourceSnapshot(makeRedirectRoot(true)),
    PublicDeliveryError,
  );
});

test('capture snapshot rejects animated data, author blob URLs, and unknown remote bytes', async () => {
  const idat = Buffer.from(ONE_PIXEL_PNG).indexOf('IDAT', 0, 'ascii') - 4;
  const animationChunk = Uint8Array.from([
    0, 0, 0, 8, 0x61, 0x63, 0x54, 0x4c,
    0, 0, 0, 2, 0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const apng = new Uint8Array(ONE_PIXEL_PNG.length + animationChunk.length);
  apng.set(ONE_PIXEL_PNG.subarray(0, idat), 0);
  apng.set(animationChunk, idat);
  apng.set(ONE_PIXEL_PNG.subarray(idat), idat + animationChunk.length);
  const animatedData = `data:image/png;base64,${Buffer.from(apng).toString('base64')}`;
  const cases = [
    {
      root: makeCaptureRoot({
        elements: [{ attributes: { src: animatedData }, currentSrc: animatedData, tagName: 'IMG' }],
        fetchImpl: async () => assert.fail('data URL must not call fetch'),
      }),
    },
    {
      root: makeCaptureRoot({
        elements: [{ attributes: { src: 'blob:https://app.example/opaque' }, tagName: 'IMG' }],
        fetchImpl: async () => assert.fail('author blob must fail before fetch'),
      }),
    },
    {
      root: makeCaptureRoot({
        elements: [{ attributes: { src: 'https://assets.example/unknown.bin' }, tagName: 'IMG' }],
        fetchImpl: async () => new Response(Uint8Array.from([1, 2, 3])),
      }),
    },
  ];
  for (const fixture of cases) {
    await assert.rejects(
      createPublicCaptureResourceSnapshot(fixture.root),
      (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
    );
  }
});

test('capture snapshot fails closed when one href is both stylesheet and pixel asset', async () => {
  const shared = 'https://assets.example/shared';
  let fetchCalls = 0;
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async () => {
      fetchCalls += 1;
      return new Response('.x{color:red}', { headers: { 'content-type': 'text/css' } });
    },
  });
  const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });
  await assert.rejects(
    preparePublicRawHtmlCaptureResources(
      ownerDocument,
      `<link rel="stylesheet" href="${shared}"><img src="${shared}">`,
    ),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  assert.equal(fetchCalls, 1, 'role conflicts must never refetch the same href under another interpretation');
});

test('external stylesheets require CSS MIME and fatal UTF-8 decoding before they are rewrapped', async () => {
  const cases = [
    {
      body: '.x{color:red}',
      contentType: 'text/plain',
      name: 'strict MIME mismatch',
    },
    {
      body: '.x{color:red}',
      contentType: 'text/css; charset=utf-16le',
      name: 'unsupported declared charset',
    },
    {
      body: Uint8Array.from([0x2e, 0x78, 0x7b, 0xff, 0x7d]),
      contentType: 'text/css; charset=utf-8',
      name: 'invalid UTF-8 bytes',
    },
  ] as const;
  for (const fixtureCase of cases) {
    const stylesheet = `https://assets.example/${encodeURIComponent(fixtureCase.name)}.css`;
    let fetchCalls = 0;
    const fixture = makeCaptureRoot({
      elements: [],
      fetchImpl: async () => {
        fetchCalls += 1;
        return new Response(fixtureCase.body, {
          headers: { 'content-type': fixtureCase.contentType },
        });
      },
    });
    const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
    Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });
    await assert.rejects(
      preparePublicRawHtmlCaptureResources(
        ownerDocument,
        `<link rel="stylesheet" href="${stylesheet}">`,
      ),
      (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
      fixtureCase.name,
    );
    assert.equal(fetchCalls, 1, fixtureCase.name);
  }

  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async () => assert.fail('data stylesheet must not call fetch'),
  });
  const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });
  for (const href of [
    'data:text/plain,.x%7Bcolor:red%7D',
    'data:text/css;charset=utf-16le,.x%7Bcolor:red%7D',
    'data:text/css;base64,/w==',
  ]) {
    await assert.rejects(
      preparePublicRawHtmlCaptureResources(
        ownerDocument,
        `<link rel="stylesheet" href="${href}">`,
      ),
      PublicDeliveryError,
    );
  }
});

test('frozen external stylesheets still reject time-varying CSS after their bytes are fetched', async () => {
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async () => assert.fail('data stylesheet must not call fetch'),
  });
  const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });
  for (const stylesheet of [
    'data:text/css,.x%7Banimation:pulse%201s%7D',
    'data:text/css,%40starting-style%7B.x%7Bopacity%3A0%7D%7D.x%7Btransition%3Aopacity%202s%7D',
  ]) {
    await assert.rejects(
      preparePublicRawHtmlCaptureResources(
        ownerDocument,
        `<link rel="stylesheet" href="${stylesheet}">`,
      ),
      (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
      stylesheet,
    );
  }
});

test('capture snapshot recursively rejects animated resources inside an open shadow root', async () => {
  const idat = Buffer.from(ONE_PIXEL_PNG).indexOf('IDAT', 0, 'ascii') - 4;
  const animationChunk = Uint8Array.from([
    0, 0, 0, 8, 0x61, 0x63, 0x54, 0x4c,
    0, 0, 0, 2, 0, 0, 0, 0,
    0, 0, 0, 0,
  ]);
  const apng = new Uint8Array(ONE_PIXEL_PNG.length + animationChunk.length);
  apng.set(ONE_PIXEL_PNG.subarray(0, idat), 0);
  apng.set(animationChunk, idat);
  apng.set(ONE_PIXEL_PNG.subarray(idat), idat + animationChunk.length);
  const animatedData = `data:image/png;base64,${Buffer.from(apng).toString('base64')}`;
  const view = {
    clearTimeout: () => undefined,
    fetch: async () => assert.fail('data URL must not call fetch'),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    location: { href: 'https://app.example/document', origin: 'https://app.example' },
    setTimeout: () => 1,
  };
  const ownerDocument = {
    baseURI: 'https://app.example/document',
    defaultView: view,
    querySelectorAll: () => [],
    styleSheets: [],
  } as unknown as Document;
  const image = {
    children: [],
    currentSrc: animatedData,
    getAttribute: (name: string) => name === 'src' ? animatedData : null,
    hasAttribute: () => false,
    ownerDocument,
    shadowRoot: null,
    tagName: 'IMG',
  } as unknown as HTMLElement;
  const shadowRoot = {
    adoptedStyleSheets: [],
    children: [image],
    querySelectorAll: () => [],
  } as unknown as ShadowRoot;
  const host = {
    children: [],
    getAttribute: () => null,
    hasAttribute: () => false,
    ownerDocument,
    shadowRoot,
    tagName: 'PUBLIC-CARD',
  } as unknown as HTMLElement;
  const root = {
    children: [host],
    getAttribute: () => null,
    hasAttribute: () => false,
    ownerDocument,
    querySelectorAll: () => [],
    shadowRoot: null,
    tagName: 'MAIN',
  } as unknown as HTMLElement;
  await assert.rejects(
    createPublicCaptureResourceSnapshot(root),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
});

test('raw HTML freezes decoded carriers before srcdoc and never refetches captured bytes', async () => {
  const remote = 'https://assets.example/pixel.png';
  let fetchCalls = 0;
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async input => {
      fetchCalls += 1;
      assert.equal(String(input), remote);
      return new Response(ONE_PIXEL_PNG, { headers: { 'content-type': 'text/plain' } });
    },
  });
  const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });
  const prepared = await preparePublicRawHtmlCaptureResources(
    ownerDocument,
    `<base href="https://assets.example/"><picture><source srcset="pixel.png 1x"><img src="pix&#x65;l.png" style="background:u\\72l('pixel.png')"></picture>`,
  );
  try {
    assert.equal(fetchCalls, 1);
    assert.doesNotMatch(prepared.html, /assets\.example|pixel\.png|data:image/iu);
    assert.match(prepared.html, /blob:/u);
  } finally {
    prepared.snapshot.cleanup();
  }
});

test('raw HTML freezes escaped and comment-split imports and neutralizes proactive link fetches', async () => {
  const stylesheet = 'https://assets.example/imported.css';
  const requests: string[] = [];
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async input => {
      requests.push(String(input));
      assert.equal(String(input), stylesheet);
      return new Response('.imported{color:green}', { headers: { 'content-type': 'text/css' } });
    },
  });
  const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });
  const prepared = await preparePublicRawHtmlCaptureResources(
    ownerDocument,
    [
      `<link rel="preload prefetch" href="https://evil.example/preload.png" imagesrcset="https://evil.example/retina.png 2x">`,
      `<style>@\\69mport/**/url("${stylesheet}") layer(theme) screen;.safe{color:red}</style>`,
    ].join(''),
  );
  try {
    assert.deepEqual(requests, [stylesheet]);
    assert.doesNotMatch(prepared.html, /evil\.example|assets\.example/iu);
    assert.match(prepared.html, /@import url\("blob:/u);
    assert.match(prepared.html, /rel=""/u);
  } finally {
    prepared.snapshot.cleanup();
  }
});

test('raw HTML freezes alternate stylesheets without activating their named style set', async () => {
  const stylesheet = 'https://assets.example/alternate.css';
  const requests: string[] = [];
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async input => {
      requests.push(String(input));
      return new Response('body{background:rgb(255,0,0)}', {
        headers: { 'content-type': 'text/css' },
      });
    },
  });
  const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });
  const prepared = await preparePublicRawHtmlCaptureResources(
    ownerDocument,
    `<link rel="alternate stylesheet" title="red" href="${stylesheet}"><main>Static</main>`,
  );
  try {
    assert.deepEqual(requests, [stylesheet]);
    assert.match(prepared.html, /rel="alternate stylesheet"/u);
    assert.doesNotMatch(prepared.html, /rel="stylesheet"/u);
    assert.match(prepared.html, /href="blob:/u);
    assert.doesNotMatch(prepared.html, /assets\.example/iu);
  } finally {
    prepared.snapshot.cleanup();
  }
});

test('raw HTML capture rewrites 2 MiB of embedded CSS references in linear time', async () => {
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async () => assert.fail('fragment URLs must not call fetch'),
  });
  const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });
  const unit = '.x{background-image:url(#marker)}';
  const css = unit.repeat(Math.floor(((2 * 1024 * 1024) - 256) / unit.length));
  const startedAt = performance.now();
  const prepared = await preparePublicRawHtmlCaptureResources(
    ownerDocument,
    `<style>${css}</style><main id="marker">Static</main>`,
  );
  const elapsed = performance.now() - startedAt;
  try {
    assert.match(prepared.html, /url\(#marker\)/u);
    assert.ok(elapsed < 1_500, `2 MiB raw HTML resource rewrite took ${elapsed.toFixed(1)}ms`);
  } finally {
    prepared.snapshot.cleanup();
  }
});

test('capture rejects a 2 MiB stylesheet data URL within the linear-time budget', async () => {
  const stylesheet = 'https://assets.example/adversarial.css';
  const payload = 'A'.repeat(2 * 1024 * 1024);
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async input => {
      assert.equal(String(input), stylesheet);
      return new Response(`.x{background:url(data:image/png;base64,${payload})}`, {
        headers: { 'content-type': 'text/css' },
      });
    },
  });
  const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });
  const startedAt = performance.now();
  await assert.rejects(
    preparePublicRawHtmlCaptureResources(
      ownerDocument,
      `<link rel="stylesheet" href="${stylesheet}">`,
    ),
    (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
  );
  const elapsed = performance.now() - startedAt;
  assert.ok(elapsed < 1_500, `2 MiB data URL rejection took ${elapsed.toFixed(1)}ms`);
});

test('redirected stylesheets resolve imports and assets against the final response URL', async () => {
  const requestedStylesheet = 'https://assets.example/start.css';
  const finalStylesheet = 'https://cdn.example/theme/final.css';
  const finalImage = 'https://cdn.example/theme/pixel.png';
  const requests: string[] = [];
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async input => {
      const href = String(input);
      requests.push(href);
      if (href === requestedStylesheet) {
        const response = new Response('.card{background:url("./pixel.png")}', {
          headers: { 'content-type': 'text/css' },
        });
        Object.defineProperty(response, 'url', { configurable: true, value: finalStylesheet });
        return response;
      }
      assert.equal(href, finalImage);
      return new Response(ONE_PIXEL_PNG, { headers: { 'content-type': 'image/png' } });
    },
  });
  const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });
  const prepared = await preparePublicRawHtmlCaptureResources(
    ownerDocument,
    `<link rel="stylesheet" href="${requestedStylesheet}"><main class="card">redirected</main>`,
  );
  try {
    assert.deepEqual(requests, [requestedStylesheet, finalImage]);
    assert.doesNotMatch(prepared.html, /assets\.example|cdn\.example/iu);
  } finally {
    prepared.snapshot.cleanup();
  }
});

test('redirected stylesheet self-import never performs a second network read of the final URL', async () => {
  const requestedStylesheet = 'https://assets.example/start.css';
  const finalStylesheet = 'https://cdn.example/theme/final.css';
  const requests: string[] = [];
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async input => {
      const href = String(input);
      requests.push(href);
      if (href === requestedStylesheet) {
        const response = new Response('@import "./final.css";.card{color:red}', {
          headers: { 'content-type': 'text/css' },
        });
        Object.defineProperty(response, 'url', { configurable: true, value: finalStylesheet });
        return response;
      }
      assert.equal(href, finalStylesheet);
      return new Response('.card{color:blue}', { headers: { 'content-type': 'text/css' } });
    },
  });
  const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });

  await assert.rejects(
    preparePublicRawHtmlCaptureResources(
      ownerDocument,
      `<link rel="stylesheet" href="${requestedStylesheet}"><main class="card">redirected</main>`,
    ),
    PublicDeliveryError,
  );
  assert.deepEqual(requests, [requestedStylesheet]);
});

test('an asset redirect cannot reinterpret a stylesheet final URL as pixels', async () => {
  const requestedStylesheet = 'https://assets.example/start.css';
  const requestedImage = 'https://assets.example/start.png';
  const sharedFinalUrl = 'https://cdn.example/shared';
  const requests: string[] = [];
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async input => {
      const href = String(input);
      requests.push(href);
      const response = href === requestedStylesheet
        ? new Response('.card{color:red}', { headers: { 'content-type': 'text/css' } })
        : new Response(ONE_PIXEL_PNG, { headers: { 'content-type': 'image/png' } });
      Object.defineProperty(response, 'url', { configurable: true, value: sharedFinalUrl });
      return response;
    },
  });
  const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });
  await assert.rejects(
    preparePublicRawHtmlCaptureResources(
      ownerDocument,
      `<link rel="stylesheet" href="${requestedStylesheet}"><img src="${requestedImage}">`,
    ),
    PublicDeliveryError,
  );
  assert.deepEqual(requests, [requestedStylesheet, requestedImage]);
});

test('raw HTML resolves against the first HTML document-tree base that actually has href', async () => {
  const expected = 'https://app.example/assets/pixel.png';
  const requests: string[] = [];
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async input => {
      requests.push(String(input));
      assert.equal(String(input), expected);
      return new Response(ONE_PIXEL_PNG);
    },
  });
  const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });
  const prepared = await preparePublicRawHtmlCaptureResources(ownerDocument, [
    '<template><base href="https://template.example/"></template>',
    '<svg><base href="https://svg.example/"></base></svg>',
    '<base target="_blank"><base href="/assets/">',
    '<img src="pixel.png">',
  ].join(''));
  try {
    assert.deepEqual(requests, [expected]);
    assert.doesNotMatch(prepared.html, /<img[^>]+pixel\.png/iu);
  } finally {
    prepared.snapshot.cleanup();
  }
});

test('snapshot construction revokes every Blob URL when recursive CSS freezing fails', async () => {
  const stylesheet = 'https://assets.example/cycle.css';
  const image = 'https://assets.example/pixel.png';
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async input => String(input) === stylesheet
      ? new Response(`@import url("${stylesheet}");`, {
        headers: { 'content-type': 'text/css; charset="UTF-8"' },
      })
      : new Response(ONE_PIXEL_PNG),
  });
  const ownerDocument = fixture.ownerDocument as Document & { documentElement: HTMLElement };
  Object.defineProperty(ownerDocument, 'documentElement', { configurable: true, value: fixture });
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const created: string[] = [];
  const revoked: string[] = [];
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => {
      const value = `blob:https://app.example/frozen-${created.length}`;
      created.push(value);
      return value;
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (value: string) => revoked.push(value),
  });
  try {
    await assert.rejects(
      preparePublicRawHtmlCaptureResources(
        ownerDocument,
        `<link rel="stylesheet" href="${stylesheet}"><img src="${image}">`,
      ),
      (error: unknown) => error instanceof PublicDeliveryError && error.code === 'capture-failed',
    );
    assert.ok(created.length > 0);
    assert.deepEqual(revoked, created);
  } finally {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreate });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevoke });
  }
});

test('capture includes and rewrites styles from the operation-owned parent shadow root', async () => {
  const remote = 'https://assets.example/shadow-background.png';
  let fetchCalls = 0;
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async input => {
      fetchCalls += 1;
      assert.equal(String(input), remote);
      return new Response(ONE_PIXEL_PNG);
    },
  });
  const ownerDocument = fixture.ownerDocument;
  const style = {
    baseURI: ownerDocument.baseURI,
    children: [],
    disabled: false,
    getAttribute: () => null,
    hasAttribute: () => false,
    ownerDocument,
    setAttribute: () => undefined,
    shadowRoot: null,
    sheet: null,
    tagName: 'STYLE',
    textContent: `.card{background:u\\72l("${remote}")}`,
  } as unknown as HTMLElement;
  const host = { ownerDocument } as HTMLElement;
  const shadow = {
    adoptedStyleSheets: [],
    host,
    nodeType: 11,
    querySelectorAll: (selector: string) => selector.includes('style') ? [style] : [],
  } as unknown as ShadowRoot;
  const target = {
    baseURI: ownerDocument.baseURI,
    children: [],
    getAttribute: () => null,
    getRootNode: () => shadow,
    hasAttribute: () => false,
    ownerDocument,
    querySelectorAll: () => [],
    shadowRoot: null,
    tagName: 'MAIN',
  } as unknown as HTMLElement;
  const snapshot = await createPublicCaptureResourceSnapshot(target);
  try {
    assert.equal(fetchCalls, 1);
    applyPublicCaptureResourceSnapshot(target, snapshot);
    assert.match(style.textContent ?? '', /blob:/u);
    assert.doesNotMatch(style.textContent ?? '', /assets\.example/u);
  } finally {
    snapshot.cleanup();
  }
});

test('capture collects document and shadow adopted stylesheets and materializes only frozen CSS', async () => {
  const remote = 'https://assets.example/adopted-background.png';
  const requests: string[] = [];
  const fixture = makeCaptureRoot({
    elements: [],
    fetchImpl: async input => {
      requests.push(String(input));
      return new Response(ONE_PIXEL_PNG);
    },
  });
  const adoptedRule = {
    cssText: `.adopted{background:url("${remote}")}`,
    style: { cssText: `background:url("${remote}")` },
  } as unknown as CSSRule;
  const adoptedSheet = {
    cssRules: [adoptedRule],
    disabled: false,
    href: null,
  } as unknown as CSSStyleSheet;
  const doc = fixture.ownerDocument as Document;
  Object.defineProperty(doc, 'adoptedStyleSheets', {
    configurable: true,
    value: [adoptedSheet],
    writable: true,
  });
  const shadow = {
    adoptedStyleSheets: [adoptedSheet],
    children: [],
    host: { ownerDocument: doc },
    nodeType: 11,
    querySelectorAll: () => [],
  } as unknown as ShadowRoot;
  const root = fixture as HTMLElement & { getRootNode(): Node };
  root.getRootNode = () => shadow;

  const snapshot = await createPublicCaptureResourceSnapshot(root);
  try {
    assert.deepEqual(requests, [remote], 'the same adopted resource must be fetched once');
    assert.match(snapshot.resolve(remote, doc.baseURI), /^blob:/u);
  } finally {
    snapshot.cleanup();
  }

  const createdStyles: Array<{ textContent: string }> = [];
  const makeStyle = () => ({
    children: [],
    getAttribute: () => null,
    hasAttribute: () => false,
    ownerDocument: operationDocument,
    setAttribute: () => undefined,
    shadowRoot: null,
    tagName: 'STYLE',
    textContent: '',
  });
  const operationDocument = {
    adoptedStyleSheets: [adoptedSheet],
    baseURI: 'https://app.example/operation',
    createElement: () => makeStyle(),
    head: { appendChild: (style: { textContent: string }) => createdStyles.push(style) },
  } as unknown as Document;
  const shadowStyles: Array<ReturnType<typeof makeStyle>> = [];
  const operationShadow = {
    adoptedStyleSheets: [adoptedSheet],
    appendChild: (style: ReturnType<typeof makeStyle>) => {
      shadowStyles.push(style);
      return style;
    },
    children: shadowStyles,
    host: { ownerDocument: operationDocument },
    querySelectorAll: (selector: string) => selector.includes('style') ? shadowStyles : [],
  } as unknown as ShadowRoot;
  const shadowHost = {
    children: [],
    getAttribute: () => null,
    hasAttribute: () => false,
    ownerDocument: operationDocument,
    shadowRoot: operationShadow,
    tagName: 'PUBLIC-CARD',
  } as unknown as HTMLElement;
  const operationRoot = {
    children: [shadowHost],
    getAttribute: () => null,
    hasAttribute: () => false,
    ownerDocument: operationDocument,
    shadowRoot: null,
    tagName: 'HTML',
  } as unknown as HTMLElement;
  applyPublicCaptureResourceSnapshot(operationRoot, {
    cleanup: () => undefined,
    fetchFrozenImage: async () => false,
    resolve: value => value,
    rewriteCss: value => value.replaceAll(remote, 'blob:https://app.example/frozen'),
    rewriteSrcset: value => value,
  }, { materializeDocumentAdoptedStyles: true });
  assert.deepEqual(operationDocument.adoptedStyleSheets, []);
  assert.deepEqual(operationShadow.adoptedStyleSheets, []);
  assert.equal(createdStyles.length, 1);
  assert.equal(shadowStyles.length, 1);
  assert.match(createdStyles[0].textContent, /blob:https:\/\/app\.example\/frozen/u);
  assert.match(shadowStyles[0].textContent, /blob:https:\/\/app\.example\/frozen/u);
});

test('capture rewrite descends into every collected same-origin iframe document', () => {
  const attributes = new Map([['src', 'https://assets.example/nested.png']]);
  const outerDocument = { baseURI: 'https://app.example/' } as Document;
  const nestedDocument = { baseURI: 'https://nested.example/' } as Document;
  const image = {
    baseURI: nestedDocument.baseURI,
    children: [],
    currentSrc: '',
    getAttribute: (name: string) => attributes.get(name) ?? null,
    hasAttribute: (name: string) => attributes.has(name),
    ownerDocument: nestedDocument,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    shadowRoot: null,
    tagName: 'IMG',
  } as unknown as HTMLElement;
  const nestedRoot = {
    baseURI: nestedDocument.baseURI,
    children: [image],
    getAttribute: () => null,
    hasAttribute: () => false,
    ownerDocument: nestedDocument,
    shadowRoot: null,
    tagName: 'HTML',
  } as unknown as HTMLElement;
  Object.defineProperty(nestedDocument, 'documentElement', { configurable: true, value: nestedRoot });
  const frame = {
    baseURI: outerDocument.baseURI,
    children: [],
    contentDocument: nestedDocument,
    getAttribute: () => null,
    hasAttribute: () => false,
    ownerDocument: outerDocument,
    shadowRoot: null,
    tagName: 'IFRAME',
  } as unknown as HTMLElement;
  const root = {
    baseURI: outerDocument.baseURI,
    children: [frame],
    getAttribute: () => null,
    hasAttribute: () => false,
    ownerDocument: outerDocument,
    shadowRoot: null,
    tagName: 'MAIN',
  } as unknown as HTMLElement;
  applyPublicCaptureResourceSnapshot(root, {
    cleanup: () => undefined,
    fetchFrozenImage: async () => false,
    resolve: value => `blob:frozen/${encodeURIComponent(value)}`,
    rewriteCss: value => value,
    rewriteSrcset: value => value,
  });
  assert.match(attributes.get('src') ?? '', /^blob:frozen/u);
});
