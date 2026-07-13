import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicImportedDocument,
  PUBLIC_IMPORT_LIMITS,
  PublicImportError,
} from './publicImport';
import { PUBLIC_IMPORT_FINAL_IMAGE_MAX_BYTES } from './publicImageCompression';
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

test('HTML import resolves URL-encoded parent-relative image paths', async () => {
  const result = await buildPublicImportedDocument([
    textFile('page.html', '<main><img src="../images/hero%20image.png"></main>', 'text/html'),
    new File([new Uint8Array([137, 80, 78, 71])], 'hero image.png', { type: 'image/png' }),
  ]);
  assert.match(result.source, /src="data:image\/png;base64,/u);
  assert.doesNotMatch(result.source, /hero%20image\.png/u);
});

test('Final URL transform allows only imported bitmap data URLs', () => {
  const image = 'data:image/png;base64,iVBORw0KGgo=';
  assert.equal(transformPublicMarkdownUrl(image), image);
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

test('HTML import may attach an image only when the document explicitly references it', async () => {
  const result = await buildPublicImportedDocument([
    textFile('page.html', '<main><img src="hero.gif"></main>', 'text/html'),
    new File([new Uint8Array([71, 73, 70, 56])], 'hero.gif', { type: 'image/gif' }),
  ]);
  assert.match(result.source, /src="data:image\/gif;base64,/u);
  assert.doesNotMatch(result.source, /src="hero\.gif"/u);
});
