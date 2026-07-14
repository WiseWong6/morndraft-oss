import test from 'node:test';
import assert from 'node:assert/strict';
import { micromark } from 'micromark';
import {
  buildPublicImportedDocument,
  inspectPublicBatchImageReferenceWorkForTest,
  inspectPublicMarkdownImageReferenceWorkForTest,
  PUBLIC_IMPORT_LIMITS,
  PublicImportError,
} from './publicImport';
import {
  assertPublicImportImageDimensions,
  compressPublicImportImage,
  PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES,
  PUBLIC_IMPORT_MAX_ENCODE_PIXELS,
  PUBLIC_IMPORT_MAX_IMAGE_DIMENSION,
  PUBLIC_IMPORT_MAX_IMAGE_PIXELS,
  PublicImageCompressionError,
  readPublicImportImageDimensions,
  resetPublicImageCompressionStateForTest,
} from './publicImageCompression';
import { transformPublicMarkdownUrl } from './PublicEditableMarkdown';

const textFile = (name: string, source: string, type = 'text/plain') => new File([source], name, { type });

test('local import accepts one main document', async () => {
  const result = await buildPublicImportedDocument([
    textFile('artifact.json5', "{project:'MornDraft', ready:true,}", 'application/json'),
  ]);
  assert.equal(result.source, "{project:'MornDraft', ready:true,}");
  assert.equal(result.suggestedTitle, 'artifact');
});

test('local import rejects multiple main documents explicitly', async () => {
  await assert.rejects(
    buildPublicImportedDocument([textFile('one.md', '# One'), textFile('two.md', '# Two')]),
    (error: unknown) => error instanceof PublicImportError && error.code === 'multiple-documents',
  );
});

test('local import embeds image attachments as data URLs without a network call', async () => {
  const result = await buildPublicImportedDocument([
    textFile('artifact.md', '# Image\n\n![hero](./hero.png)'),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);
  assert.match(result.source, /!\[hero\]\(data:image\/png;base64,/u);
  assert.doesNotMatch(result.source, /\.\/hero\.png/u);
});

test('unreferenced Markdown images append without trimming the imported source', async () => {
  const original = '# Preserve leading and trailing whitespace  \n';
  const result = await buildPublicImportedDocument([
    textFile('artifact.md', original),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);
  assert.ok(result.source.startsWith(`${original}\n![hero.png](`));
});

test('local import rejects duplicate image basenames before ambiguous replacement', async () => {
  await assert.rejects(
    buildPublicImportedDocument([
      textFile('artifact.md', '![first](one/hero.png)\n![second](two/hero.png)'),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
      new File([new Uint8Array([137, 80, 78, 71])], 'HERO.PNG', { type: 'image/png' }),
    ]),
    (error: unknown) => error instanceof PublicImportError && error.code === 'duplicate-image-name',
  );
});

test('generic binary MIME uses a supported bitmap extension consistently', async () => {
  const result = await buildPublicImportedDocument([
    textFile('artifact.md', '# Image\n\n![hero](./photo.png)'),
    new File([new Uint8Array([137, 80, 78, 71])], 'photo.png', { type: 'application/octet-stream' }),
  ]);
  assert.match(result.source, /!\[hero\]\(data:image\/png;base64,/u);
});

test('bitmap dimensions are gated before any full-size canvas allocation', async () => {
  assert.doesNotThrow(() => assertPublicImportImageDimensions({ width: 4096, height: 4096 }, 'safe.png'));
  for (const dimensions of [
    { width: PUBLIC_IMPORT_MAX_IMAGE_DIMENSION + 1, height: 1 },
    { width: 8192, height: Math.floor(PUBLIC_IMPORT_MAX_IMAGE_PIXELS / 8192) + 1 },
  ]) {
    assert.throws(
      () => assertPublicImportImageDimensions(dimensions, 'oversized.png'),
      (error: unknown) => error instanceof PublicImageCompressionError && error.code === 'file-too-large',
    );
  }

  const png = new Uint8Array(24);
  png.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  png.set([73, 72, 68, 82], 12);
  const view = new DataView(png.buffer);
  view.setUint32(16, PUBLIC_IMPORT_MAX_IMAGE_DIMENSION + 1);
  view.setUint32(20, 1);
  const declared = await readPublicImportImageDimensions(
    new File([png], 'declared-huge.png', { type: 'image/png' }),
    'image/png',
  );
  assert.deepEqual(declared, { width: PUBLIC_IMPORT_MAX_IMAGE_DIMENSION + 1, height: 1 });
  assert.throws(
    () => assertPublicImportImageDimensions(declared!, 'declared-huge.png'),
    (error: unknown) => error instanceof PublicImageCompressionError && error.code === 'file-too-large',
  );
});

test('AVIF preflight considers every ispe box instead of trusting a small thumbnail first', async () => {
  const box = (type: string, payload: Uint8Array) => {
    const bytes = new Uint8Array(8 + payload.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, bytes.length);
    for (let index = 0; index < 4; index += 1) bytes[4 + index] = type.charCodeAt(index);
    bytes.set(payload, 8);
    return bytes;
  };
  const ispe = (width: number, height: number) => {
    const payload = new Uint8Array(12);
    const view = new DataView(payload.buffer);
    view.setUint32(4, width);
    view.setUint32(8, height);
    return box('ispe', payload);
  };
  const small = ispe(320, 180);
  const oversized = ispe(PUBLIC_IMPORT_MAX_IMAGE_DIMENSION + 1, 1);
  const container = box('ipco', new Uint8Array([...small, ...oversized]));
  const dimensions = await readPublicImportImageDimensions(
    new File([container], 'multi-item.avif', { type: 'image/avif' }),
    'image/avif',
  );
  assert.deepEqual(dimensions, { width: PUBLIC_IMPORT_MAX_IMAGE_DIMENSION + 1, height: 1 });
  assert.throws(
    () => assertPublicImportImageDimensions(dimensions!, 'multi-item.avif'),
    (error: unknown) => error instanceof PublicImageCompressionError && error.code === 'file-too-large',
  );

  const ipco = box('ipco', small);
  const iprp = box('iprp', ipco);
  const metaPayload = new Uint8Array(4 + iprp.length);
  metaPayload.set(iprp, 4);
  const meta = box('meta', metaPayload);
  const mdat = box('mdat', new Uint8Array(300 * 1024));
  const ordinaryLargeAvif = await readPublicImportImageDimensions(
    new File([meta, mdat], 'ordinary-large.avif', { type: 'image/avif' }),
    'image/avif',
  );
  assert.deepEqual(ordinaryLargeAvif, { width: 320, height: 180 });
});

test('AVIF preflight fails closed at a bounded box count without accumulating ispe arrays', async () => {
  const boxCount = 150_000;
  const bytes = new Uint8Array(8 + boxCount * 20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length);
  bytes.set([105, 112, 99, 111], 4); // ipco
  for (let index = 0, offset = 8; index < boxCount; index += 1, offset += 20) {
    view.setUint32(offset, 20);
    bytes.set([105, 115, 112, 101], offset + 4); // ispe
    view.setUint32(offset + 12, 320);
    view.setUint32(offset + 16, 180);
  }

  const startedAt = performance.now();
  const dimensions = await readPublicImportImageDimensions(
    new File([bytes], 'many-items.avif', { type: 'image/avif' }),
    'image/avif',
  );
  const elapsedMs = performance.now() - startedAt;
  assert.equal(dimensions, null, 'an unreasonable AVIF box count must fail closed');
  assert.ok(elapsedMs < 1_500, `bounded AVIF metadata scan exceeded 1.5s: ${elapsedMs.toFixed(0)}ms`);
});

test('GIF preflight rejects an oversized frame descriptor before browser decoding', async () => {
  const bytes = new Uint8Array(26);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('GIF89a'), 0);
  view.setUint16(6, 1, true);
  view.setUint16(8, 1, true);
  bytes[13] = 0x2c;
  view.setUint16(18, 16_385, true);
  view.setUint16(20, 1, true);
  bytes[23] = 2;
  bytes[24] = 0;
  bytes[25] = 0x3b;

  const file = new File([bytes], 'descriptor-bomb.gif', { type: 'image/gif' });
  assert.equal(await readPublicImportImageDimensions(file, 'image/gif'), null);

  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalCreateImageBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  let decodeCalls = 0;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async () => {
      decodeCalls += 1;
      throw new Error('must not decode');
    },
  });
  try {
    await assert.rejects(
      compressPublicImportImage(file),
      (error: unknown) => error instanceof PublicImageCompressionError && error.code === 'unsupported-file-type',
    );
    assert.equal(decodeCalls, 0, 'invalid GIF metadata must fail before createImageBitmap');
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (originalCreateImageBitmap) Object.defineProperty(globalThis, 'createImageBitmap', originalCreateImageBitmap);
    else Reflect.deleteProperty(globalThis, 'createImageBitmap');
  }
});

test('browser compression caps first canvas allocation and recovers after a stalled capability probe', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalCreateImageBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  const canvases: Array<{ width: number; height: number }> = [];
  const canvasAllocations: number[] = [];
  let probeMode: 'hang' | 'supported' = 'hang';
  let bitmapCloseCount = 0;
  const pixels = new Uint8Array(PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES + 1);
  pixels.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  pixels.set([73, 72, 68, 82], 12);
  const view = new DataView(pixels.buffer);
  view.setUint32(16, 8192);
  view.setUint32(20, 4096);
  const file = new File([pixels], 'large.png', { type: 'image/png' });

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: (tag: string) => {
        assert.equal(tag, 'canvas');
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => {
            canvasAllocations.push(canvas.width * canvas.height);
            return { clearRect: () => undefined, drawImage: () => undefined };
          },
          toBlob: (callback: (blob: Blob) => void, type: string) => {
            if (probeMode === 'supported') callback(new Blob([new Uint8Array(1024)], { type }));
          },
        };
        canvases.push(canvas);
        return canvas;
      },
    },
  });
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async () => ({
      width: 8192,
      height: 4096,
      close: () => { bitmapCloseCount += 1; },
    }),
  });
  resetPublicImageCompressionStateForTest();
  try {
    await assert.rejects(
      compressPublicImportImage(file),
      (error: unknown) => error instanceof PublicImageCompressionError && error.code === 'unsupported-file-type',
    );
    probeMode = 'supported';
    const compressed = await compressPublicImportImage(file);
    assert.ok(compressed.blob.size <= PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES);
    assert.ok(
      Math.max(...canvasAllocations) <= PUBLIC_IMPORT_MAX_ENCODE_PIXELS,
      'no encoding canvas may allocate the full 32 MP decoded bitmap',
    );
    assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
    assert.equal(bitmapCloseCount, 2);
  } finally {
    resetPublicImageCompressionStateForTest();
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (originalCreateImageBitmap) Object.defineProperty(globalThis, 'createImageBitmap', originalCreateImageBitmap);
    else Reflect.deleteProperty(globalThis, 'createImageBitmap');
  }
});

test('local import resolves nested and URL-encoded relative image paths without appending duplicates', async () => {
  for (const reference of [
    './assets/hero%20image.png',
    '../images/hero%20image.png',
    'assets/nested/hero%20image.png',
  ]) {
    const result = await buildPublicImportedDocument([
      textFile('artifact.md', `# Image\n\n![hero](${reference})`),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero image.png', { type: 'image/png' }),
    ]);
    assert.doesNotMatch(result.source, /hero%20image\.png/u);
    assert.equal(result.source.match(/data:image\/png;base64,/gu)?.length, 1);
    assert.equal(result.source.match(/!\[hero image\.png\]/gu)?.length ?? 0, 0);
  }
});

test('Markdown import does not treat image examples inside code as attached resources', async () => {
  const original = [
    '```md',
    '![fenced example](hero.png)',
    '```',
    '',
    '`![inline example](hero.png)`',
  ].join('\n');
  const result = await buildPublicImportedDocument([
    textFile('artifact.md', original),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);

  assert.ok(result.source.startsWith(original));
  assert.match(result.source, /!\[fenced example\]\(hero\.png\)/u);
  assert.match(result.source, /!\[inline example\]\(hero\.png\)/u);
  assert.equal(result.source.match(/data:image\/png;base64,/gu)?.length, 1);
  assert.equal(result.source.match(/!\[hero\.png\]\(/gu)?.length, 1);
});

test('Markdown import replaces rendered image references without rewriting code examples', async () => {
  const result = await buildPublicImportedDocument([
    textFile('artifact.md', [
      '![rendered](hero.png)',
      '',
      '```md',
      '![fenced example](hero.png)',
      '```',
      '',
      '`![inline example](hero.png)`',
    ].join('\n')),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);

  assert.match(result.source, /^!\[rendered\]\(data:image\/png;base64,/u);
  assert.match(result.source, /!\[fenced example\]\(hero\.png\)/u);
  assert.match(result.source, /!\[inline example\]\(hero\.png\)/u);
  assert.equal(result.source.match(/data:image\/png;base64,/gu)?.length, 1);
  assert.equal(result.source.match(/!\[hero\.png\]\(/gu)?.length ?? 0, 0);
});

test('Markdown import resolves reference images through their first live definition', async () => {
  const result = await buildPublicImportedDocument([
    textFile('artifact.md', [
      '![hero][asset]',
      '',
      '[asset]: ./hero.png "local title"',
    ].join('\n')),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);
  assert.match(result.source, /\[asset\]: data:image\/png;base64,/u);
  assert.doesNotMatch(result.source, /\.\/hero\.png/u);
  assert.equal(result.source.match(/data:image\/png;base64,/gu)?.length, 1);

  await assert.rejects(
    buildPublicImportedDocument([
      textFile('artifact.html', '<img src="remote.png" src="hero.png">', 'text/html'),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
    ]),
    (error: unknown) => error instanceof PublicImportError && error.code === 'unreferenced-image',
  );
});

test('Markdown reference images honor odd and even backslash escaping before the marker', async () => {
  const imageBytes = new Uint8Array([137, 80, 78, 71]);
  const escaped = await buildPublicImportedDocument([
    textFile('artifact.md', '\\![hero][asset]\n\n[asset]: hero.png'),
    new File([imageBytes], 'hero.png', { type: 'image/png' }),
  ]);
  assert.match(escaped.source, /^\\!\[hero\]\[asset\]/u);
  assert.match(escaped.source, /\[asset\]: hero\.png/u);
  assert.match(escaped.source, /!\[hero\.png\]\(data:image\/png;base64,/u);
  assert.equal(escaped.source.match(/data:image\/png;base64,/gu)?.length, 1);

  const live = await buildPublicImportedDocument([
    textFile('artifact.md', '\\\\![hero][asset]\n\n[asset]: hero.png'),
    new File([imageBytes], 'hero.png', { type: 'image/png' }),
  ]);
  assert.match(live.source, /^\\\\!\[hero\]\[asset\]/u);
  assert.match(live.source, /\[asset\]: data:image\/png;base64,/u);
  assert.equal(live.source.match(/data:image\/png;base64,/gu)?.length, 1);
});

test('Markdown inline image scanning is bounded and supports balanced destinations', async () => {
  const balanced = await buildPublicImportedDocument([
    textFile('artifact.md', '![hero](assets/group(one)/hero.png "local title")'),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);
  assert.match(balanced.source, /^!\[hero\]\(data:image\/png;base64,/u);
  assert.match(balanced.source, / "local title"\)$/u);

  const backtickCases = [
    {
      label: 'an escaped N+1 run cannot close an earlier N-run opener',
      source: '` before ![hero](hero.png) \\``',
      rendersImage: true,
    },
    {
      label: 'backslashes inside code do not escape a full raw closer',
      source: '` code \\\\` ![hero](hero.png)',
      rendersImage: true,
    },
    {
      label: 'an N+1 raw run cannot close an N-run opener',
      source: '` before ![hero](hero.png) ``',
      rendersImage: true,
    },
    {
      label: 'the tail of an escaped raw run may open a new code span',
      source: '\\``![hero](hero.png)`',
      rendersImage: false,
    },
  ] as const;
  for (const { label, source, rendersImage } of backtickCases) {
    assert.equal(micromark(source).includes('<img src='), rendersImage, `micromark premise failed: ${label}`);
    const imported = await buildPublicImportedDocument([
      textFile('backtick.md', source),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
    ]);
    assert.equal(imported.source.match(/data:image\/png;base64,/gu)?.length, 1, label);
    if (rendersImage) {
      assert.doesNotMatch(imported.source, /!\[hero\.png\]\(/u, `${label} must replace the live image in place`);
    } else {
      assert.ok(imported.source.startsWith(source), `${label} must keep the inert code span byte-exact`);
      assert.match(imported.source, /!\[hero\.png\]\(data:image\/png;base64,/u);
    }
  }

  const deeplyNestedImage = `![x](${'('.repeat(4100)}hero.png${')'.repeat(4100)})`;
  const escapedDeepImage = `\\${deeplyNestedImage}`;
  const liveDeepImageAfterEvenSlashes = `\\\\${deeplyNestedImage}`;
  assert.doesNotMatch(
    micromark(escapedDeepImage.replace(deeplyNestedImage, '![x](hero.png)')),
    /<img src=/u,
    'micromark premise failed: an odd backslash run escapes the image marker',
  );
  assert.equal(
    (await inspectPublicMarkdownImageReferenceWorkForTest(escapedDeepImage)).changed,
    false,
    'an escaped image marker must not activate the image delimiter budget',
  );
  assert.match(
    micromark(liveDeepImageAfterEvenSlashes.replace(deeplyNestedImage, '![x](hero.png)')),
    /<img src=/u,
    'micromark premise failed: an even backslash run keeps the image marker live',
  );
  await assert.rejects(
    inspectPublicMarkdownImageReferenceWorkForTest(liveDeepImageAfterEvenSlashes),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
    'an image marker after an even backslash run must retain the delimiter guard',
  );

  const brokenPriorParagraph = `![broken\n\n${'('.repeat(4100)}plain text${')'.repeat(4100)}`;
  assert.doesNotMatch(micromark(brokenPriorParagraph), /<img src=/u, 'micromark premise failed: broken prior paragraph');
  assert.equal(
    (await inspectPublicMarkdownImageReferenceWorkForTest(brokenPriorParagraph)).changed,
    false,
    'an unterminated label cannot leak delimiter state across tokenizer-defined inline blocks',
  );

  for (const [label, source] of [
    ['an abruptly closed four-dash comment', `x <!--> ${deeplyNestedImage} --> y`],
    ['an abruptly closed five-dash comment', `x <!---> ${deeplyNestedImage} --> y`],
    ['an invalid one-dash comment opener', `x <!-x> ${deeplyNestedImage} y`],
    ['an unclosed comment opener', `x <!-- ${deeplyNestedImage} y`],
    ['an unterminated outer image label', `![broken ${deeplyNestedImage}`],
  ] as const) {
    const shallowSource = source.replace(deeplyNestedImage, '![x](hero.png)');
    assert.match(micromark(shallowSource), /<img src=/u, `micromark premise failed: ${label}`);
    await assert.rejects(
      inspectPublicMarkdownImageReferenceWorkForTest(source),
      (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
      `${label} cannot hide a live deeply nested destination from the delimiter budget`,
    );
  }

  const inertInlineComment = `x <!-- ${deeplyNestedImage} --> y`;
  assert.doesNotMatch(micromark(inertInlineComment), /<img src=/u, 'micromark premise failed: valid inline comment');
  assert.equal(
    (await inspectPublicMarkdownImageReferenceWorkForTest(inertInlineComment)).changed,
    false,
    'a tokenizer-confirmed inline HTML comment must remain inert',
  );

  for (const [label, source] of [
    ['HTML flow nested in a blockquote', `> <span title="${deeplyNestedImage}">`],
    ['fenced code nested in a blockquote', `> \`\`\`text\n> ${deeplyNestedImage}\n> \`\`\``],
    ['indented code nested in a blockquote', `>     ${deeplyNestedImage}`],
  ] as const) {
    assert.doesNotMatch(micromark(source), /<img src=/u, `micromark premise failed: ${label}`);
    assert.equal(
      (await inspectPublicMarkdownImageReferenceWorkForTest(source)).changed,
      false,
      `${label} must use tokenizer-confirmed inert flow ranges`,
    );
  }

  for (const [label, liveSource, inertSource] of [
    [
      'inline HTML comment',
      `\\<!-- ${deeplyNestedImage} -->`,
      `\\\\<!-- ${deeplyNestedImage} -->`,
    ],
    [
      'inline HTML tag',
      `\\<span title="${deeplyNestedImage}">`,
      `\\\\<span title="${deeplyNestedImage}">`,
    ],
  ] as const) {
    const shallowLive = liveSource.replace(deeplyNestedImage, '![x](hero.png)');
    const shallowInert = inertSource.replace(deeplyNestedImage, '![x](hero.png)');
    assert.match(micromark(shallowLive), /<img src=/u, `micromark odd-backslash premise failed: ${label}`);
    assert.doesNotMatch(micromark(shallowInert), /<img src=/u, `micromark even-backslash premise failed: ${label}`);
    await assert.rejects(
      inspectPublicMarkdownImageReferenceWorkForTest(liveSource),
      (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
      `an escaped ${label} opener cannot hide a live deeply nested destination`,
    );
    assert.equal(
      (await inspectPublicMarkdownImageReferenceWorkForTest(inertSource)).changed,
      false,
      `an unescaped ${label} must remain inert after an even backslash run`,
    );
  }

  const inlineHtmlWrappers = [
    (payload: string) => `<!-- ${payload} -->`,
    (payload: string) => `<span title="${payload}">`,
    (payload: string) => `<?probe ${payload}?>`,
    (payload: string) => `<!PROBE ${payload}>`,
    (payload: string) => `<![CDATA[ ${payload}]]>`,
  ] as const;
  const inlineHtmlContainers = [
    (candidate: string) => candidate,
    (candidate: string) => `prefix ${candidate} suffix`,
    (candidate: string) => `*${candidate}*`,
    (candidate: string) => `> ${candidate}`,
    (candidate: string) => `- ${candidate}`,
  ] as const;
  let inlineHtmlSeed = 0x60c0ffee;
  const nextInlineHtmlVariant = (length: number) => {
    inlineHtmlSeed = (Math.imul(inlineHtmlSeed, 1_664_525) + 1_013_904_223) >>> 0;
    return inlineHtmlSeed % length;
  };
  for (let index = 0; index < 96; index += 1) {
    const wrapper = inlineHtmlWrappers[nextInlineHtmlVariant(inlineHtmlWrappers.length)]!;
    const container = inlineHtmlContainers[nextInlineHtmlVariant(inlineHtmlContainers.length)]!;
    const slashCount = nextInlineHtmlVariant(6);
    const buildVariant = (payload: string) => container(`${'\\'.repeat(slashCount)}${wrapper(payload)}`);
    const shallowVariant = buildVariant('![x](hero.png)');
    const deepVariant = buildVariant(deeplyNestedImage);
    const rendersImage = micromark(shallowVariant).includes('alt="x"');
    if (rendersImage) {
      await assert.rejects(
        inspectPublicMarkdownImageReferenceWorkForTest(deepVariant),
        (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
        `seeded inline-HTML variant ${index} cannot hide a live deeply nested destination`,
      );
    } else {
      assert.equal(
        (await inspectPublicMarkdownImageReferenceWorkForTest(deepVariant)).changed,
        false,
        `seeded inline-HTML variant ${index} must keep tokenizer-inert image syntax unchanged`,
      );
    }
  }

  for (const [label, source] of [
    ['a paragraph soft line break', '`before\n' + deeplyNestedImage + ' after`'],
    ['a paragraph CRLF soft line break', '`before\r\n' + deeplyNestedImage + ' after`'],
    ['explicit blockquote continuation prefixes', '> `before\n> ' + deeplyNestedImage + ' after`'],
    ['explicit list continuation indentation', '- `before\n  ' + deeplyNestedImage + ' after`'],
  ] as const) {
    assert.doesNotMatch(micromark(source), /<img src=/u, `micromark premise failed: ${label}`);
    const inspected = await inspectPublicMarkdownImageReferenceWorkForTest(source);
    assert.equal(inspected.changed, false, `${label} must remain an inert code span`);
  }

  for (const [label, source] of [
    [
      'an escaped raw-run tail cannot close a prior opener',
      '` code ' + deeplyNestedImage + ' \\``',
    ],
    [
      'a blank line terminates the block before a later matching run',
      '` before ' + deeplyNestedImage + '\n\n` after',
    ],
    [
      'a heading starts a new block before a later matching run',
      '` before ' + deeplyNestedImage + '\n# heading\n` after',
    ],
    [
      'a blockquote starts a new block before a later matching run',
      '` before ' + deeplyNestedImage + '\n> quote\n` after',
    ],
    [
      'a list item starts a new block before a later matching run',
      '` before ' + deeplyNestedImage + '\n- item\n` after',
    ],
  ] as const) {
    const shallowSource = source.replace(deeplyNestedImage, '![x](hero.png)');
    assert.match(micromark(shallowSource), /<img src=/u, `micromark premise failed: ${label}`);
    await assert.rejects(
      inspectPublicMarkdownImageReferenceWorkForTest(source),
      (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
      label,
    );
  }

  const sequentialSource = Array.from({ length: 5000 }, (_, index) => `![hero ${index}](hero.png)`).join('\n');
  const sequential = await buildPublicImportedDocument([
    textFile('many-images.md', sequentialSource),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);
  assert.equal(sequential.source.match(/data:image\/png;base64,/gu)?.length, 5000);
  assert.doesNotMatch(sequential.source, /!\[hero\.png\]\(/u);

  const maximumCrLfLines = `${'\r\n'.repeat(16_383)}![x](hero.png)`;
  assert.equal(
    (await inspectPublicMarkdownImageReferenceWorkForTest(maximumCrLfLines)).changed,
    true,
    'CRLF must count as one logical line at the documented safety boundary',
  );
  await assert.rejects(
    inspectPublicMarkdownImageReferenceWorkForTest(`\r\n${maximumCrLfLines}`),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
    'the first logical line beyond the safety boundary must fail before tokenizer allocation',
  );

  const size = 2 * 1024 * 1024;
  const hostile = '!['.repeat(size / 2);
  const startedAt = performance.now();
  await assert.rejects(
    inspectPublicMarkdownImageReferenceWorkForTest(hostile),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
  );
  const elapsedMs = performance.now() - startedAt;
  assert.ok(elapsedMs < 1_500, `hostile inline image scan exceeded 1.5s: ${elapsedMs}ms`);

  const candidateFloodUnit = '<i>![';
  const candidateFlood = candidateFloodUnit.repeat(Math.floor(size / candidateFloodUnit.length)) +
    'a'.repeat(size % candidateFloodUnit.length);
  assert.equal(candidateFlood.length, size, 'the inline-HTML candidate flood must remain exactly 2 MiB');
  const candidateFloodStartedAt = performance.now();
  await assert.rejects(
    inspectPublicMarkdownImageReferenceWorkForTest(candidateFlood),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
  );
  const candidateFloodElapsedMs = performance.now() - candidateFloodStartedAt;
  assert.ok(
    candidateFloodElapsedMs < 1_500,
    `2 MiB inline-HTML candidate flood exceeded 1.5s: ${candidateFloodElapsedMs}ms`,
  );

  const labelFloodTail = '\n![x](hero.png)';
  const labelFlood = `${'['.repeat(size - labelFloodTail.length)}${labelFloodTail}`;
  assert.equal(labelFlood.length, size, 'the live label-start flood must remain exactly 2 MiB');
  const labelFloodStartedAt = performance.now();
  await assert.rejects(
    inspectPublicMarkdownImageReferenceWorkForTest(labelFlood),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
  );
  const labelFloodElapsedMs = performance.now() - labelFloodStartedAt;
  assert.ok(
    labelFloodElapsedMs < 1_500,
    `2 MiB live label-start flood exceeded 1.5s: ${labelFloodElapsedMs}ms`,
  );

  const backtickFloodTail = '\n![x](hero.png)';
  const backtickFloodPrefixLength = size - backtickFloodTail.length;
  const backtickFlood = `${'` '.repeat(Math.floor(backtickFloodPrefixLength / 2))}` +
    `${'a'.repeat(backtickFloodPrefixLength % 2)}${backtickFloodTail}`;
  assert.equal(backtickFlood.length, size, 'the backtick-run flood must remain exactly 2 MiB');
  const backtickFloodStartedAt = performance.now();
  await assert.rejects(
    inspectPublicMarkdownImageReferenceWorkForTest(backtickFlood),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
  );
  const backtickFloodElapsedMs = performance.now() - backtickFloodStartedAt;
  assert.ok(
    backtickFloodElapsedMs < 1_500,
    `2 MiB backtick-run flood exceeded 1.5s: ${backtickFloodElapsedMs}ms`,
  );

  const emphasisFloodTail = '\n![x](hero.png)';
  const emphasisFloodPrefixLength = size - emphasisFloodTail.length;
  const emphasisFlood = `${'*a'.repeat(Math.floor(emphasisFloodPrefixLength / 2))}` +
    `${'a'.repeat(emphasisFloodPrefixLength % 2)}${emphasisFloodTail}`;
  assert.equal(emphasisFlood.length, size, 'the emphasis-run flood must remain exactly 2 MiB');
  const emphasisFloodStartedAt = performance.now();
  await assert.rejects(
    inspectPublicMarkdownImageReferenceWorkForTest(emphasisFlood),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
  );
  const emphasisFloodElapsedMs = performance.now() - emphasisFloodStartedAt;
  assert.ok(
    emphasisFloodElapsedMs < 1_500,
    `2 MiB emphasis-run flood exceeded 1.5s: ${emphasisFloodElapsedMs}ms`,
  );

  for (const [label, unit] of [
    ['character-reference', '&amp;'],
    ['escape', '\\*'],
    ['autolink', '<a@b.c>'],
    ['line', '\n'],
  ] as const) {
    const tail = '![x](hero.png)';
    const prefixLength = size - tail.length;
    const source = `${unit.repeat(Math.floor(prefixLength / unit.length))}` +
      `${'a'.repeat(prefixLength % unit.length)}${tail}`;
    assert.equal(source.length, size, `the ${label} flood must remain exactly 2 MiB`);
    const floodStartedAt = performance.now();
    await assert.rejects(
      inspectPublicMarkdownImageReferenceWorkForTest(source),
      (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
    );
    const floodElapsedMs = performance.now() - floodStartedAt;
    assert.ok(floodElapsedMs < 1_500, `2 MiB ${label} flood exceeded 1.5s: ${floodElapsedMs}ms`);
  }

  const overlapping = `![outer](${'![nested]('.repeat(Math.floor(size / 11))}`;
  const overlapStartedAt = performance.now();
  await assert.rejects(
    inspectPublicMarkdownImageReferenceWorkForTest(overlapping),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
  );
  const overlapElapsedMs = performance.now() - overlapStartedAt;
  assert.ok(overlapElapsedMs < 1_500, `overlapping inline image scan exceeded 1.5s: ${overlapElapsedMs}ms`);

  const deepTail = deeplyNestedImage + ' \\``';
  const escapedFalseCloser = '`' + 'a'.repeat(size - deepTail.length - 1) + deepTail;
  assert.equal(escapedFalseCloser.length, size, 'the escaped-run performance probe must remain exactly 2 MiB');
  const escapedFalseCloserStartedAt = performance.now();
  await assert.rejects(
    inspectPublicMarkdownImageReferenceWorkForTest(escapedFalseCloser),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
  );
  const escapedFalseCloserElapsedMs = performance.now() - escapedFalseCloserStartedAt;
  assert.ok(
    escapedFalseCloserElapsedMs < 1_500,
    `2 MiB escaped raw-run scan exceeded 1.5s: ${escapedFalseCloserElapsedMs}ms`,
  );

  const abruptCommentTail = ` <!--> ${deeplyNestedImage} -->`;
  const largeAbruptComment = `${'a'.repeat(size - abruptCommentTail.length)}${abruptCommentTail}`;
  assert.equal(largeAbruptComment.length, size, 'the abrupt-comment performance probe must remain exactly 2 MiB');
  const abruptCommentStartedAt = performance.now();
  await assert.rejects(
    inspectPublicMarkdownImageReferenceWorkForTest(largeAbruptComment),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
  );
  const abruptCommentElapsedMs = performance.now() - abruptCommentStartedAt;
  assert.ok(
    abruptCommentElapsedMs < 1_500,
    `2 MiB abrupt-comment scan exceeded 1.5s: ${abruptCommentElapsedMs}ms`,
  );

  const inlineTagPrefix = 'prefix <span title="';
  const inlineTagSuffix = '">';
  const inlineTagPayloadLength = size - inlineTagPrefix.length - inlineTagSuffix.length;
  const largeInlineTag = `${inlineTagPrefix}${'!['.repeat(Math.floor(inlineTagPayloadLength / 2))}` +
    `${'a'.repeat(inlineTagPayloadLength % 2)}${inlineTagSuffix}`;
  assert.equal(largeInlineTag.length, size, 'the inline-HTML performance probe must remain exactly 2 MiB');
  const inlineTagStartedAt = performance.now();
  assert.equal(
    (await inspectPublicMarkdownImageReferenceWorkForTest(largeInlineTag)).changed,
    false,
    'a tokenizer-confirmed long inline HTML tag must keep image-like attribute text inert',
  );
  const inlineTagElapsedMs = performance.now() - inlineTagStartedAt;
  assert.ok(
    inlineTagElapsedMs < 1_500,
    `2 MiB inline-HTML scan exceeded 1.5s: ${inlineTagElapsedMs}ms`,
  );

  const validPrefix = '![hero](hero.png)\n';
  const largeValidSource = `${validPrefix}${'a'.repeat(size - validPrefix.length)}`;
  const largeStartedAt = performance.now();
  const largeValid = await buildPublicImportedDocument([
    textFile('large-valid.md', largeValidSource),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);
  const largeElapsedMs = performance.now() - largeStartedAt;
  assert.match(largeValid.source, /^!\[hero\]\(data:image\/png;base64,/u);
  assert.ok(largeElapsedMs < 1_500, `2 MiB valid Markdown image scan exceeded 1.5s: ${largeElapsedMs}ms`);

  for (const [label, inertSource] of [
    ['fenced code', `\`\`\`text\n${'!['.repeat(Math.floor((size - 16) / 2))}\n\`\`\``],
    ['inline code', `\`${'!['.repeat(Math.floor((size - 2) / 2))}\``],
    ['HTML comment', `<!--${'!['.repeat(Math.floor((size - 7) / 2))}-->`],
    ['unclosed processing instruction', `<?fake>\n${'!['.repeat(Math.floor((size - 8) / 2))}`],
    ['script HTML block', `<script>\n${'!['.repeat(Math.floor((size - 19) / 2))}\n</script>`],
    ['complete-tag HTML block', `<custom-element>\n${'!['.repeat(Math.floor((size - 18) / 2))}`],
  ] as const) {
    const inertStartedAt = performance.now();
    const inspected = await inspectPublicMarkdownImageReferenceWorkForTest(inertSource);
    const inertElapsedMs = performance.now() - inertStartedAt;
    assert.equal(inspected.changed, false, `${label} must not be treated as live image syntax`);
    assert.ok(inertElapsedMs < 1_500, `2 MiB ${label} scan exceeded 1.5s: ${inertElapsedMs}ms`);
  }

  const interruptedTypeSeven = `paragraph\n<custom-element>\n${'!['.repeat(Math.floor((size - 27) / 2))}`;
  await assert.rejects(
    inspectPublicMarkdownImageReferenceWorkForTest(interruptedTypeSeven),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
    'a complete custom tag cannot interrupt a CommonMark paragraph or bypass the delimiter budget',
  );

  for (const [label, liveSource] of [
    ['unmatched backtick', `\`${'!['.repeat(Math.floor((size - 1) / 2))}`],
    ['escaped apparent code span', `\\\`${'!['.repeat(Math.floor((size - 3) / 2))}\``],
    ['closed declaration next line', `<!A>\n${'!['.repeat(Math.floor((size - 5) / 2))}`],
    ['closed processing instruction next line', `<?A?>\n${'!['.repeat(Math.floor((size - 7) / 2))}`],
    ['paragraph-continuation indent', `paragraph\n    ${'!['.repeat(Math.floor((size - 14) / 2))}`],
  ] as const) {
    const liveStartedAt = performance.now();
    await assert.rejects(
      inspectPublicMarkdownImageReferenceWorkForTest(liveSource),
      (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
      `${label} remains live CommonMark text and cannot bypass the delimiter budget`,
    );
    const liveElapsedMs = performance.now() - liveStartedAt;
    assert.ok(liveElapsedMs < 1_500, `2 MiB ${label} scan exceeded 1.5s: ${liveElapsedMs}ms`);
  }
});

test('batch image import scans the original document once before expanding data URLs', async () => {
  const fileNames = Array.from({ length: 9 }, (_, index) => `asset-${index}.png`);
  const source = fileNames.map((name, index) => `![asset ${index}](${name})`).join('\n');
  const replacementLength = Math.ceil(PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES * 4 / 3);
  const startedAt = performance.now();
  const inspected = await inspectPublicBatchImageReferenceWorkForTest(source, fileNames, replacementLength);
  const elapsedMs = performance.now() - startedAt;
  assert.equal(inspected.parseCalls, 1, 'all image basenames must share one Markdown parse');
  assert.equal(inspected.maxSourceLength, source.length, 'the parser must receive only the original document');
  assert.ok(inspected.outputLength > replacementLength * 9, 'the probe must exercise a near-limit expanded payload');
  assert.ok(elapsedMs < 1_500, `single-pass nine-image expansion exceeded 1.5s: ${elapsedMs.toFixed(0)}ms`);

  await assert.rejects(
    inspectPublicBatchImageReferenceWorkForTest(
      Array.from({ length: 13 }, (_, index) => `![copy ${index}](hero.png)`).join('\n'),
      ['hero.png'],
      replacementLength,
    ),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
    'reusing one near-limit data URL must not expand a small document beyond the Source budget',
  );

  const halfMiB = new Uint8Array(512 * 1024);
  await assert.rejects(
    buildPublicImportedDocument([
      textFile(
        'aggregate.md',
        Array.from({ length: 41 }, (_, index) => `![copy ${index}](hero.png)`).join('\n'),
      ),
      new File([halfMiB], 'hero.png', { type: 'image/png' }),
      ...Array.from({ length: 8 }, (_, index) => (
        new File([halfMiB], `unattached-${index}.png`, { type: 'image/png' })
      )),
    ]),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
    'referenced and appended data URLs must share one aggregate expanded-Source budget',
  );
});

test('Markdown image references use micromark HTML block termination instead of browser comment recovery', async () => {
  const source = [
    '<!-- ![hidden](hero.png) --!>',
    '![live](hero.png)',
  ].join('\n');
  const result = await buildPublicImportedDocument([
    textFile('artifact.md', source),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);
  assert.match(result.source, /!\[hidden\]\(hero\.png\)/u);
  assert.match(result.source, /!\[live\]\(hero\.png\)/u);
  assert.match(result.source, /!\[hero\.png\]\(data:image\/png;base64,/u);
  assert.equal(result.source.match(/data:image\/png;base64,/gu)?.length, 1);

  const closed = await buildPublicImportedDocument([
    textFile('artifact.md', '<!-- hidden -->\n![live](hero.png)'),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);
  assert.match(closed.source, /!\[live\]\(data:image\/png;base64,/u);
  assert.doesNotMatch(closed.source, /!\[hero\.png\]\(/u);
});

test('Markdown image import follows tokenizer-defined destinations and line endings exactly', async () => {
  const renderedSources = [
    '![alt][img]\n\n[img]:\n  hero.png',
    '> ![alt][img]\n>\n> [img]:\n>   hero.png',
    '![alt](hero.png (local title))',
    '![alt](\nhero.png\n"local title"\n)',
    '![alt](hero&#46;png)',
    '![alt][img]\n\n[img]: hero&#46;png',
  ];
  for (const source of renderedSources) {
    const result = await buildPublicImportedDocument([
      textFile('artifact.md', source),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
    ]);
    assert.equal(
      result.source.match(/data:image\/png;base64,/gu)?.length,
      1,
      `tokenizer-valid image must be replaced once: ${JSON.stringify(source)}`,
    );
    assert.doesNotMatch(result.source, /!\[hero\.png\]\(/u, `must not append a duplicate: ${JSON.stringify(source)}`);
  }

  for (const source of ['![alt](\n\nhero.png)', '![alt](hero.png\n\n)']) {
    const result = await buildPublicImportedDocument([
      textFile('artifact.md', source),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
    ]);
    assert.ok(result.source.startsWith(source), 'invalid blank-line syntax must remain literal');
    assert.match(result.source, /\n\n!\[hero\.png\]\(data:image\/png;base64,/u);
    assert.equal(result.source.match(/data:image\/png;base64,/gu)?.length, 1);
  }
});

test('Markdown image replacement agrees with micromark across deterministic syntax variants', async () => {
  const destinations = ['hero.png', '<hero.png>', 'hero&#46;png', 'hero\\.png'];
  const separators = [' ', '\t', '\n', '\n  ', '\n\n'];
  const titles = ['"title"', "'title'", '(title)', ''];
  let seed = 0x60c0ffee;
  const next = (length: number) => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed % length;
  };

  for (let index = 0; index < 128; index += 1) {
    const destination = destinations[next(destinations.length)]!;
    const separator = separators[next(separators.length)]!;
    const title = titles[next(titles.length)]!;
    const source = index % 2 === 0
      ? `![alt](${destination}${title ? `${separator}${title}` : ''})`
      : [
          '![alt][asset]',
          '',
          `${index % 4 === 1 ? '> ' : ''}[asset]:${separator}${destination}${title ? ` ${title}` : ''}`,
        ].join('\n');
    const rendersImage = micromark(source).includes('<img src=');
    const result = await buildPublicImportedDocument([
      textFile(`fuzz-${index}.md`, source),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
    ]);

    assert.equal(
      result.source.match(/data:image\/png;base64,/gu)?.length,
      1,
      `attachment must be embedded exactly once for variant ${index}: ${JSON.stringify(source)}`,
    );
    if (rendersImage) {
      assert.doesNotMatch(
        result.source,
        /!\[hero\.png\]\(/u,
        `micromark-rendered image must be replaced in place for variant ${index}`,
      );
    } else {
      assert.ok(result.source.startsWith(source), `non-image syntax must stay byte-exact for variant ${index}`);
      assert.match(result.source, /!\[hero\.png\]\(data:image\/png;base64,/u);
    }
  }
});

test('abrupt browser comment endings remain open Markdown HTML blocks under micromark', async () => {
  for (const prefix of ['<!-->', '<!--->']) {
    const result = await buildPublicImportedDocument([
      textFile('artifact.md', `${prefix}![live](hero.png)`),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
    ]);
    assert.match(result.source, /!\[live\]\(hero\.png\)/u);
    assert.match(result.source, /!\[hero\.png\]\(data:image\/png;base64,/u);
    assert.equal(result.source.match(/data:image\/png;base64,/gu)?.length, 1);
  }
});

test('comment-only Markdown reference images do not count as rendered attachments', async () => {
  const result = await buildPublicImportedDocument([
    textFile('artifact.md', '<!-- ![hidden][asset] -->\n\n[asset]: hero.png'),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);
  assert.match(result.source, /\[asset\]: hero\.png/u);
  assert.match(result.source, /!\[hero\.png\]\(data:image\/png;base64,/u);
  assert.equal(result.source.match(/data:image\/png;base64,/gu)?.length, 1);
});

test('HTML import resolves URL-encoded parent-relative image paths', async () => {
  const result = await buildPublicImportedDocument([
    textFile('page.html', '<main><img src="../images/hero%20image.png"></main>', 'text/html'),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero image.png', { type: 'image/png' }),
  ]);
  assert.match(result.source, /src="data:image\/png;base64,/u);
  assert.doesNotMatch(result.source, /hero%20image\.png/u);
});

test('HTML import resolves browser-decoded character references in image attributes', async () => {
  for (const source of [
    '<img src="hero&#46;png">',
    '<img src="hero&#46png">',
    '<img src="hero&period;png">',
  ]) {
    const result = await buildPublicImportedDocument([
      textFile('page.html', source, 'text/html'),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
    ]);
    assert.match(result.source, /src="data:image\/png;base64,/u);
    assert.equal(result.source.match(/data:image\/png;base64,/gu)?.length, 1);
  }
});

test('HTML import keeps parse-error punctuation inside unquoted attribute values', async () => {
  for (const { fileName, rawValue } of [
    { fileName: 'foo=bar.png', rawValue: 'foo=bar.png' },
    { fileName: 'foo"bar.png', rawValue: 'foo"bar.png' },
    { fileName: "foo'bar.png", rawValue: "foo'bar.png" },
    { fileName: 'foo<bar.png', rawValue: 'foo<bar.png' },
    { fileName: 'foo`bar.png', rawValue: 'foo`bar.png' },
    { fileName: 'bar.png', rawValue: 'folder/bar.png' },
    { fileName: 'foo=bar.png', rawValue: 'foo&#61;bar.png' },
  ]) {
    const result = await buildPublicImportedDocument([
      textFile('page.html', `<img src=${rawValue}>`, 'text/html'),
      new File([new Uint8Array([137, 80, 78, 71])], fileName, { type: 'image/png' }),
    ]);
    const embedded = result.source.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/u)?.[0];
    assert.ok(embedded, `unquoted image value must be embedded: ${rawValue}`);
    assert.equal(
      result.source,
      `<img src=${embedded}>`,
      `the raw replacement range must consume the complete unquoted value: ${rawValue}`,
    );
  }
});

test('HTML import uses bounded iterative tree traversal for adversarial nesting', async () => {
  const image = new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' });
  const deepButAllowed = `${'<i>'.repeat(5_000)}<img src=hero.png>`;
  const imported = await buildPublicImportedDocument([
    textFile('deep.html', deepButAllowed, 'text/html'),
    image,
  ]);
  assert.match(imported.source, /<img src=data:image\/png;base64,/u);

  const size = 2 * 1024 * 1024;
  const tail = '<img src=hero.png>';
  const prefixLength = size - tail.length;
  const tagFlood = `${'<i>'.repeat(Math.floor(prefixLength / 3))}` +
    `${'a'.repeat(prefixLength % 3)}${tail}`;
  assert.equal(tagFlood.length, size, 'the HTML tag flood must remain exactly 2 MiB');
  const startedAt = performance.now();
  await assert.rejects(
    buildPublicImportedDocument([
      textFile('flood.html', tagFlood, 'text/html'),
      image,
    ]),
    (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
  );
  const elapsedMs = performance.now() - startedAt;
  assert.ok(elapsedMs < 1_500, `2 MiB HTML tag flood exceeded 1.5s: ${elapsedMs}ms`);

  const uniqueAttributes = Array.from(
    { length: 180_000 },
    (_, index) => ` a${index}=0`,
  ).join('');
  for (const prefix of ['<img', '<img <', '<img foo<bar=0', '</div']) {
    const uniqueAttributeFlood = `${prefix}${uniqueAttributes} src=hero.png>`;
    assert.ok(uniqueAttributeFlood.length >= 1.6 * 1024 * 1024, 'the unique-attribute flood must exceed 1.6 MiB');
    assert.ok(uniqueAttributeFlood.length <= 2 * 1024 * 1024, 'the unique-attribute flood must stay within the import limit');
    const uniqueAttributeStartedAt = performance.now();
    await assert.rejects(
      buildPublicImportedDocument([
        textFile('attributes.html', uniqueAttributeFlood, 'text/html'),
        image,
      ]),
      (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
    );
    const uniqueAttributeElapsedMs = performance.now() - uniqueAttributeStartedAt;
    assert.ok(
      uniqueAttributeElapsedMs < 1_500,
      `unique-attribute HTML flood (${prefix}) exceeded 1.5s: ${uniqueAttributeElapsedMs}ms`,
    );
  }
});

test('HTML import bounds repeated resource expansion before joining data URLs', async () => {
  const image = new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' });
  for (const source of [
    '<img src=hero.png>'.repeat(8_193),
    `<img srcset="${'hero.png 1x, '.repeat(8_193)}remote.png 2x">`,
  ]) {
    await assert.rejects(
      buildPublicImportedDocument([
        textFile('repeated.html', source, 'text/html'),
        image,
      ]),
      (error: unknown) => error instanceof PublicImportError && error.code === 'document-too-complex',
    );
  }
});

test('HTML import replaces only element-specific image resource attributes', async () => {
  const accepted = [
    '<img src="hero.png">',
    '<image src="hero.png">',
    '<img srcset="remote.png 1x, hero&#46;png 2x">',
    '<picture><source srcset="remote.png 1x, hero&#46;png 2x"></picture>',
    '<video poster="hero.png"></video>',
    '<input src="hero.png" type="im&#x61;ge">',
    '<svg><image href="hero&#46;png"></image></svg>',
    '<svg><feImage xlink:href="hero.png"></feImage></svg>',
    '<math><mglyph src="hero.png"></mglyph></math>',
    '<svg><desc><img src="hero.png"></desc></svg>',
    '<svg><title><img src="hero.png"></title></svg>',
    '<math><mtext><img src="hero.png"></mtext></math>',
    '<math><mtext><mglyph src="hero.png"></mglyph></mtext></math>',
    '<math><annotation-xml><svg><image href="hero.png"></image></svg></annotation-xml></math>',
    '<svg><img src="hero.png"></svg>',
    '<math><img src="hero.png"></math>',
    '<svg><p><video poster="hero.png"></video></p></svg>',
    '<div><svg></p><image src=hero.png></svg></div>',
    '<div><math></p><image src=hero.png></math></div>',
    '<tbody><svg></tbody><image href=hero.png></svg></tbody>',
    '<tr><svg></tr><image href=hero.png></svg></tr>',
    '<td><svg></td><image href=hero.png></svg></td>',
    '<tbody><math></tbody><mglyph src=hero.png></math></tbody>',
    '<tr><math></tr><mglyph src=hero.png></math></tr>',
    '<td><math></td><mglyph src=hero.png></math></td>',
    '<template><img src=hero.png></template>',
    '<img foo<bar="1" src="hero.png">',
    '<select><img src="hero.png"></select>',
    '<select><option><img src="hero.png"></option></select>',
    '<select><svg><image href="hero.png"></image></svg></select>',
    '<select><img src="hero.png">',
    '<select><option><img src="hero.png">',
    '<template><select><img src="hero.png">',
    '<template><select><svg><image href="hero.png">',
    '<template><select><math><mglyph src="hero.png">',
    '<template><select><picture><source srcset="hero.png 1x">',
  ];
  for (const source of accepted) {
    const result = await buildPublicImportedDocument([
      textFile('page.html', source, 'text/html'),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
    ]);
    assert.equal(
      result.source.match(/data:image\/png;base64,/gu)?.length,
      1,
      `actual image attribute must be replaced exactly once: ${source}`,
    );
    assert.match(result.source, /remote\.png 1x|data:image\/png;base64,/u);
  }

  for (const source of [
    '<a href="hero.png">download</a>',
    '<script src="hero.png"></script>',
    '<link href="hero.png" rel="stylesheet">',
    '<video src="hero.png"></video>',
    '<video><source srcset="hero.png"></video>',
    '<img srcset="hero.png invalid-descriptor">',
    '<input src="hero.png" type="button">',
    '<input type="button" type="image" src="hero.png">',
    '<image href="hero.png"></image>',
    '<img src="<hero.png>">',
    '<svg><foreignObject><image href="hero.png"></image></foreignObject></svg>',
    '<svg><![CDATA[ > <image href="hero.png"> ]]></svg>',
    '<svg><image href="remote.png" xlink:href="hero.png"></image></svg>',
    '<select><script>"<img src=hero.png>"</script></select>',
    '<frameset><img src="hero.png"></frameset>',
  ]) {
    await assert.rejects(
      buildPublicImportedDocument([
        textFile('page.html', source, 'text/html'),
        new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
      ]),
      (error: unknown) => error instanceof PublicImportError && error.code === 'unreferenced-image',
      `non-image attribute must not attach a bitmap: ${source}`,
    );
  }
});

test('HTML image attributes keep first-value semantics and exact srcset candidates', async () => {
  await assert.rejects(
    buildPublicImportedDocument([
      textFile('page.html', '<img src="remote.png" src="hero.png">', 'text/html'),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
    ]),
    (error: unknown) => error instanceof PublicImportError && error.code === 'unreferenced-image',
  );

  const source = '<picture><source srcset="first.png 320w, hero&#46;png 640w, last.png 1280w"></picture>';
  const result = await buildPublicImportedDocument([
    textFile('page.html', source, 'text/html'),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);
  assert.match(result.source, /srcset="first\.png 320w, data:image\/png;base64,[^"]+ 640w, last\.png 1280w"/u);
  assert.doesNotMatch(result.source, /hero&#46;png/u);
  assert.equal(result.source.match(/data:image\/png;base64,/gu)?.length, 1);

  const reverseOrderedAttributes = await buildPublicImportedDocument([
    textFile(
      'page.html',
      '<img srcset="remote.png 1x&#44;&#32;hero&#46;png 2x" src="hero.png">',
      'text/html',
    ),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);
  assert.match(
    reverseOrderedAttributes.source,
    /^<img srcset="remote\.png 1x&#44;&#32;data:image\/png;base64,[^"]+ 2x" src="data:image\/png;base64,[^"]+">$/u,
    'replacement order must follow source offsets even when srcset precedes src',
  );
  assert.equal(reverseOrderedAttributes.source.match(/data:image\/png;base64,/gu)?.length, 2);
});

test('HTML import ignores comments and raw-text lookalikes but recognizes a real tag after --!>', async () => {
  for (const source of [
    '<!-- <img src="hero.png"> -->',
    '<script>const example = \'<img src="hero.png">\';</script>',
    '<style>.example::after { content: \'src="hero.png"\'; }</style>',
  ]) {
    await assert.rejects(
      buildPublicImportedDocument([
        textFile('page.html', source, 'text/html'),
        new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
      ]),
      (error: unknown) => error instanceof PublicImportError && error.code === 'unreferenced-image',
    );
  }

  const result = await buildPublicImportedDocument([
    textFile('page.html', '<!-- hidden --!><img src="hero.png" src="ignored.png">', 'text/html'),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
  ]);
  assert.match(result.source, /<img src="data:image\/png;base64,/u);
  assert.match(result.source, /src="ignored\.png"/u);
  assert.equal(result.source.match(/data:image\/png;base64,/gu)?.length, 1);
});

test('HTML bogus and abrupt comments end at the first parser-defined delimiter', async () => {
  for (const source of [
    '<!\'x><img src="hero.png">',
    '<?\'x><img src="hero.png">',
    '<!--><img src="hero.png">',
    '<!---><img src="hero.png">',
  ]) {
    const result = await buildPublicImportedDocument([
      textFile('page.html', source, 'text/html'),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
    ]);
    assert.match(result.source, /<img src="data:image\/png;base64,/u);
    assert.equal(result.source.match(/data:image\/png;base64,/gu)?.length, 1);
  }

  await assert.rejects(
    buildPublicImportedDocument([
      textFile('page.html', '<ſimg src="hero.png">', 'text/html'),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
    ]),
    (error: unknown) => error instanceof PublicImportError && error.code === 'unreferenced-image',
  );
});

test('Final URL transform allows only imported bitmap data URLs', () => {
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  const percentEncodedImage = 'data:image/png;base64,iVBORw0KGgo%0A=';
  assert.equal(transformPublicMarkdownUrl(image), image);
  assert.equal(transformPublicMarkdownUrl(percentEncodedImage), percentEncodedImage);
  assert.equal(transformPublicMarkdownUrl('data:image/png;base64,iVBORw0KGgo%0G='), '');
  assert.equal(transformPublicMarkdownUrl('javascript:alert(1)'), '');
  assert.equal(transformPublicMarkdownUrl('data:text/html;base64,PHNjcmlwdD4='), '');
});

test('local import enforces file count and batch limits before reading', async () => {
  const tooMany = Array.from({ length: PUBLIC_IMPORT_LIMITS.maxFiles + 1 }, (_, index) => textFile(`${index}.md`, 'x'));
  await assert.rejects(
    buildPublicImportedDocument(tooMany),
    (error: unknown) => error instanceof PublicImportError && error.code === 'too-many-files',
  );
  const oversized = new File([new Uint8Array(PUBLIC_IMPORT_LIMITS.maxTotalBytes + 1)], 'huge.png', { type: 'image/png' });
  await assert.rejects(
    buildPublicImportedDocument([oversized]),
    (error: unknown) => error instanceof PublicImportError && error.code === 'batch-too-large',
  );
});

test('local import rejects oversized GIFs instead of embedding an unbounded data URL', async () => {
  const oversizedGif = new File(
    [new Uint8Array(PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES + 1)],
    'animated.gif',
    { type: 'image/gif' },
  );
  await assert.rejects(
    buildPublicImportedDocument([oversizedGif]),
    (error: unknown) => error instanceof PublicImportError && error.code === 'file-too-large',
  );
});

test('local import rejects contradictory bitmap extensions and SVG MIME types', async () => {
  const disguisedSvg = new File(['<svg onload="alert(1)"/>'], 'unsafe.png', { type: 'image/svg+xml' });
  await assert.rejects(
    buildPublicImportedDocument([disguisedSvg]),
    (error: unknown) => error instanceof PublicImportError && error.code === 'unsupported-file-type',
  );
});

test('local import rejects binary data disguised as a text document', async () => {
  const binary = new File([new Uint8Array([0, 1, 2, 3, 4])], 'fake.md', { type: 'text/markdown' });
  await assert.rejects(
    buildPublicImportedDocument([binary]),
    (error: unknown) => error instanceof PublicImportError && error.code === 'unsupported-file-type',
  );
});

test('non-Markdown documents reject unreferenced images instead of corrupting their syntax', async () => {
  const image = new File([new Uint8Array([71, 73, 70, 56])], 'hero.gif', { type: 'image/gif' });
  for (const [name, source, type] of [
    ['artifact.json5', "{project:'MornDraft',}", 'application/json'],
    ['diagram.mmd', 'graph TD\nA-->B', 'text/plain'],
    ['page.html', '<main>no image</main>', 'text/html'],
  ] as const) {
    await assert.rejects(
      buildPublicImportedDocument([textFile(name, source, type), image]),
      (error: unknown) => error instanceof PublicImportError && error.code === 'unreferenced-image',
    );
  }
});

test('non-Markdown text cannot attach an image through Markdown-looking string content', async () => {
  await assert.rejects(
    buildPublicImportedDocument([
      textFile('artifact.json5', "{example:'![not rendered](hero.png)',}", 'application/json'),
      new File([new Uint8Array([137, 80, 78, 71])], 'hero.png', { type: 'image/png' }),
    ]),
    (error: unknown) => error instanceof PublicImportError && error.code === 'unreferenced-image',
  );
});

test('HTML import may attach an image only when the document explicitly references it', async () => {
  const result = await buildPublicImportedDocument([
    textFile('page.html', '<main><img src="hero.gif"></main>', 'text/html'),
    new File([new Uint8Array([71, 73, 70, 56])], 'hero.gif', { type: 'image/gif' }),
  ]);
  assert.match(result.source, /src="data:image\/gif;base64,/u);
  assert.doesNotMatch(result.source, /src="hero\.gif"/u);
});
