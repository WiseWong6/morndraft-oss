import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPublicClipboardImageMarkdown,
  getFirstPublicClipboardEventImageFile,
  getFirstPublicClipboardImageFile,
  insertPublicClipboardImageMarkdown,
  isSafePublicClipboardImageDataUrl,
  isSupportedPublicClipboardImageFile,
  resolvePublicClipboardImageMarkdown,
  sanitizePublicClipboardImageAlt,
} from './publicClipboardImage';

const createFile = (name: string, type: string, bytes = new Uint8Array([1, 2, 3])) => (
  new File([bytes], name, { type })
);

const createItem = (file: File | null, kind = 'file', type = file?.type ?? '') => ({
  getAsFile: () => file,
  kind,
  type,
}) as DataTransferItem;

const createTransfer = ({
  files = [],
  items = [],
}: {
  files?: File[];
  items?: DataTransferItem[];
}) => ({ files, items }) as unknown as Pick<DataTransfer, 'files' | 'items'>;

test('clipboard selection returns the first supported bitmap item and rejects SVG', () => {
  const svg = createFile('unsafe.svg', 'image/svg+xml');
  const png = createFile('first.png', 'image/png');
  const jpeg = createFile('second.jpg', 'image/jpeg');
  const transfer = createTransfer({
    files: [svg, png, jpeg],
    items: [createItem(null, 'string', 'text/plain'), createItem(svg), createItem(png), createItem(jpeg)],
  });

  assert.equal(getFirstPublicClipboardImageFile(transfer), png);
  assert.equal(getFirstPublicClipboardEventImageFile({ clipboardData: transfer as DataTransfer }), png);
  assert.equal(getFirstPublicClipboardImageFile(createTransfer({ files: [svg], items: [createItem(svg)] })), null);
});

test('clipboard selection falls back to files when item access is protected or throws', () => {
  const webp = createFile('fallback.webp', 'image/webp');
  const protectedItem = createItem(null);
  const throwingItem = {
    getAsFile: () => { throw new Error('protected'); },
    kind: 'file',
    type: 'image/webp',
  } as unknown as DataTransferItem;

  assert.equal(getFirstPublicClipboardImageFile(createTransfer({ files: [webp], items: [protectedItem] })), webp);
  assert.equal(getFirstPublicClipboardImageFile(createTransfer({ files: [webp], items: [throwingItem] })), webp);
});

test('supported clipboard bitmap types are explicit and extension fallback stays fail closed', () => {
  for (const [name, type] of [
    ['a.png', 'image/png'],
    ['a.jpeg', 'image/jpeg'],
    ['a.webp', 'image/webp'],
    ['a.avif', 'image/avif'],
    ['a.gif', 'image/gif'],
    ['fallback.jpg', 'application/octet-stream'],
    ['fallback.PNG', ''],
  ]) {
    assert.equal(isSupportedPublicClipboardImageFile(createFile(name, type)), true, `${name} should be supported`);
  }
  for (const [name, type] of [
    ['vector.svg', 'image/svg+xml'],
    ['spoofed.svg', 'image/png'],
    ['spoofed.png', 'image/svg+xml'],
    ['photo.bmp', 'image/bmp'],
    ['fake.png', 'text/plain'],
  ]) {
    assert.equal(isSupportedPublicClipboardImageFile(createFile(name, type)), false, `${name} should be rejected`);
  }
});

test('Markdown image alt text cannot break its delimiter and stays bounded', () => {
  assert.equal(sanitizePublicClipboardImageAlt('  bad[]\\\r\nname.png  '), 'bad name.png');
  assert.equal(sanitizePublicClipboardImageAlt('[]\\\n'), 'image');
  assert.equal(Array.from(sanitizePublicClipboardImageAlt('图'.repeat(200))).length, 160);
});

test('Markdown image creation accepts only bounded base64 bitmap data URLs', () => {
  const dataUrl = 'data:image/png;base64,AQID';
  assert.equal(isSafePublicClipboardImageDataUrl(dataUrl), true);
  assert.equal(
    createPublicClipboardImageMarkdown({ dataUrl, fileName: 'bad[]\\\nname.png' }),
    '![bad name.png](data:image/png;base64,AQID)',
  );
  for (const unsafe of [
    'data:image/svg+xml;base64,AQID',
    'data:text/html;base64,AQID',
    'data:image/png;base64,AQID)\n[link](https://example.com',
    'data:image/png;base64,A QID',
    'https://example.com/image.png',
  ]) {
    assert.equal(isSafePublicClipboardImageDataUrl(unsafe), false);
    assert.equal(createPublicClipboardImageMarkdown({ dataUrl: unsafe, fileName: 'image.png' }), null);
  }
});

test('clipboard image resolution reuses the browser-local public image data resolver without fetch', async () => {
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  let fetchCalls = 0;
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: () => {
      fetchCalls += 1;
      throw new Error('clipboard image resolution must not fetch');
    },
  });
  try {
    const markdown = await resolvePublicClipboardImageMarkdown(createFile('local.png', 'image/png'));
    assert.match(markdown ?? '', /^!\[local\.png\]\(data:image\/png;base64,/u);
    assert.equal(fetchCalls, 0);
  } finally {
    if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch);
    else Reflect.deleteProperty(globalThis, 'fetch');
  }
});

test('clipboard image resolution rejects unsupported files before calling the resolver', async () => {
  let resolverCalls = 0;
  const markdown = await resolvePublicClipboardImageMarkdown(
    createFile('vector.svg', 'image/svg+xml'),
    async () => {
      resolverCalls += 1;
      return 'data:image/png;base64,AQID';
    },
  );
  assert.equal(markdown, null);
  assert.equal(resolverCalls, 0);
});

test('source range insertion replaces exactly the captured range and reports the inserted range', () => {
  const markdown = '![image](data:image/png;base64,AQID)';
  assert.deepEqual(insertPublicClipboardImageMarkdown('before selected after', { start: 7, end: 15 }, markdown), {
    insertedRange: { start: 7, end: 7 + markdown.length },
    ok: true,
    source: `before ${markdown} after`,
  });
  assert.deepEqual(insertPublicClipboardImageMarkdown('before', { start: 6, end: 6 }, markdown), {
    insertedRange: { start: 6, end: 6 + markdown.length },
    ok: true,
    source: `before${markdown}`,
  });
});

test('source range insertion fails closed for stale ranges and unsafe fragments', () => {
  const markdown = '![image](data:image/png;base64,AQID)';
  assert.deepEqual(insertPublicClipboardImageMarkdown('source', null, markdown), {
    ok: false,
    reason: 'invalid-range',
  });
  assert.deepEqual(insertPublicClipboardImageMarkdown('source', { start: Number.NaN, end: 1 }, markdown), {
    ok: false,
    reason: 'invalid-range',
  });
  assert.deepEqual(insertPublicClipboardImageMarkdown('source', { start: -1, end: 1 }, markdown), {
    ok: false,
    reason: 'range-out-of-bounds',
  });
  assert.deepEqual(insertPublicClipboardImageMarkdown('source', { start: 4, end: 3 }, markdown), {
    ok: false,
    reason: 'reversed-range',
  });
  assert.deepEqual(insertPublicClipboardImageMarkdown('source', { start: 0, end: 0 }, '![x](https://example.com/x)'), {
    ok: false,
    reason: 'unsafe-markdown',
  });
});
