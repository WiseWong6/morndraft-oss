import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPublicAiAdapter,
  hasPublicAiUnsafeHtmlSource,
} from '@morndraft/features-personal/ai';
import {
  buildPublicAiBoundedRequest,
  buildPublicAiSelectionRequest,
  getPublicAiSourceKindForContentType,
  PUBLIC_AI_MAX_INSTRUCTION_CHARS,
  PUBLIC_AI_MAX_SELECTED_TEXT_CHARS,
  PublicAiInputTooLargeError,
} from './publicAiContext';

test('source kind follows renderer semantics and only Markdown skips inert code', () => {
  assert.equal(getPublicAiSourceKindForContentType('html'), 'html');
  assert.equal(getPublicAiSourceKindForContentType('markdown'), 'markdown');
  assert.equal(getPublicAiSourceKindForContentType('mixed'), 'markdown');
  assert.equal(getPublicAiSourceKindForContentType('json'), 'text');
  assert.equal(getPublicAiSourceKindForContentType('mermaid'), 'text');
  const mixed = '# Intro\n\n```html\n<script>run()</script>\n```\n\nSafe text';
  assert.equal(hasPublicAiUnsafeHtmlSource(mixed, 'markdown'), true);
  assert.equal(hasPublicAiUnsafeHtmlSource('```js\nconst literal = "<script>";\n```', 'markdown'), false);
  assert.equal(hasPublicAiUnsafeHtmlSource('`<script>literal()</script>`', 'markdown'), false);
  assert.equal(hasPublicAiUnsafeHtmlSource('`<script>literal()</script>`', 'text'), true);
  assert.equal(hasPublicAiUnsafeHtmlSource('```js\nconst literal = "<script>";\n```', 'text'), true);
  assert.equal(hasPublicAiUnsafeHtmlSource('```bad```\n<script>run()</script>', 'markdown'), true);
  assert.equal(hasPublicAiUnsafeHtmlSource('    ```js\n<script>run()</script>', 'markdown'), true);
  for (const markdownText of [
    'a < b and c > d',
    'x </ y',
    '< script> is not a tag',
    '<style!>content</style!>',
    '<x:y>content</x:y>',
    '<x_y>content</x_y>',
    '<a.b>content</a.b>',
    '`<script>literal()</script>`',
    '``code with `<script>` inside``',
    String.raw`\<script> escaped markup text`,
  ]) assert.equal(hasPublicAiUnsafeHtmlSource(markdownText, 'markdown'), false, markdownText);
  for (const rawHtml of [
    '<section>content</section>',
    '</section>',
    '<script\n>run()</script>',
    '<script\r\n>run()</script>',
    '<div\nonclick="run()">content</div>',
    '<div\r\nonclick="run()">content</div>',
    '<!-- real comment -->',
    '<!DOCTYPE html>',
    '<![CDATA[content]]>',
    '<?processing instruction?>',
    '```html\n<script>run()</script>\n```',
    '```htmlpreview\n<script>run()</script>\n```',
    '```html_preview\n<script>run()</script>\n```',
    '```html!\n<script>run()</script>\n```',
    '```html-preview{foo}\n<script>run()</script>\n```',
  ]) assert.equal(hasPublicAiUnsafeHtmlSource(rawHtml, 'markdown'), true, rawHtml);
});

test('generate and modify carry the immutable source and exact range to the final adapter', () => {
  const image = `data:image/png;base64,${'A'.repeat(100_000)}`;
  const source = `${'before '.repeat(6_000)}\n![local](${image})\nTARGET\n${'after '.repeat(6_000)}`;
  const start = source.indexOf('TARGET');
  const request = buildPublicAiBoundedRequest({
    action: 'modify',
    instruction: 'Improve this.',
    source,
    sourceKind: 'text',
    range: { start, end: start + 'TARGET'.length },
  });

  assert.equal(request.action, 'modify');
  assert.equal(request.source, source);
  assert.deepEqual(request.range, { start, end: start + 'TARGET'.length });
});

test('summarize carries source-backed range or a visible-only fallback, never both', () => {
  assert.deepEqual(buildPublicAiBoundedRequest({
    action: 'summarize',
    source: 'Selected paragraph',
    sourceKind: 'text',
    range: { start: 0, end: 18 },
  }), {
    action: 'summarize',
    instruction: '',
    range: { start: 0, end: 18 },
    source: 'Selected paragraph',
    sourceKind: 'text',
  });
  assert.deepEqual(buildPublicAiBoundedRequest({
    action: 'summarize',
    visibleText: 'Visible paragraph',
  }), {
    action: 'summarize',
    instruction: '',
    visibleText: 'Visible paragraph',
  });
});

test('raw HTML summarize keeps only trusted visible text and rejects source-only selections', () => {
  assert.deepEqual(buildPublicAiSelectionRequest({
    action: 'summarize',
    range: { start: 8, end: 15 },
    source: '<script>SECRET_SOURCE</script><p>Visible</p>',
    sourceKind: 'html',
    visibleText: 'Visible',
  }), {
    action: 'summarize',
    instruction: '',
    visibleText: 'Visible',
  });
  assert.throws(() => buildPublicAiSelectionRequest({
    action: 'summarize',
    range: { start: 8, end: 15 },
    source: '<script>SECRET_SOURCE</script>',
    sourceKind: 'html',
  }), (error: unknown) => (
    error instanceof Error
    && 'code' in error
    && error.code === 'privacy_unsafe_input'
  ));

  const dataSource = '<p>Visible</p><img src="data:text/plain;base64,UEFZTE9BRF9TRUNSRVQ=">';
  const dataStart = dataSource.indexOf('data:');
  assert.throws(() => buildPublicAiSelectionRequest({
    action: 'summarize',
    range: { start: dataStart + 2, end: dataStart + 6 },
    source: dataSource,
    sourceKind: 'html',
    visibleText: 'caller-controlled payload only',
    selectedText: 'caller-controlled payload only',
  } as Parameters<typeof buildPublicAiSelectionRequest>[0]), (error: unknown) => (
    error instanceof Error
    && 'code' in error
    && error.code === 'privacy_unsafe_input'
  ));
});

test('raw HTML summarize actual provider body excludes nearby runtime-built URLs and script secrets', async () => {
  const source = [
    '# Safe selection',
    '```html',
    '<script>const localUrl = "da" + "ta:"; const secret = "SECRET_NEARBY";</script>',
    '```',
  ].join('\n');
  let providerBody = '';
  const adapter = createPublicAiAdapter({
    readConfig: () => ({
      apiKey: 'test-key',
      baseUrl: 'https://provider.example.test/v1',
      models: { generate: 'g', modify: 'm', summarize: 's' },
      persistApiKey: false,
    }),
    fetch: async (_input, init) => {
      providerBody = String(init?.body);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'summary' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  const request = buildPublicAiSelectionRequest({
    action: 'summarize',
    instruction: 'Follow-up request: keep it short.\nPrevious result: OLD_SUMMARY',
    range: { start: 2, end: '# Safe selection'.length },
    source,
    sourceKind: getPublicAiSourceKindForContentType('mixed'),
    visibleText: 'Safe selection',
  });
  await adapter.request(request);

  const parsed = JSON.parse(providerBody) as { messages: Array<{ content: string }> };
  assert.equal(parsed.messages[1]?.content, [
    'User request:',
    'Follow-up request: keep it short.\nPrevious result: OLD_SUMMARY',
    '',
    'Visible text:',
    'Safe selection',
  ].join('\n'));
  assert.doesNotMatch(providerBody, /SECRET_NEARBY|<script>|"da"|runtime-built/iu);
  assert.match(providerBody, /OLD_SUMMARY/u);
});

test('oversized instructions and selections fail before reaching an adapter', () => {
  assert.throws(() => buildPublicAiBoundedRequest({
    action: 'generate',
    instruction: 'x'.repeat(PUBLIC_AI_MAX_INSTRUCTION_CHARS + 1),
    source: '/AI',
    sourceKind: 'text',
    range: { start: 0, end: 3 },
  }), PublicAiInputTooLargeError);
  assert.throws(() => buildPublicAiBoundedRequest({
    action: 'summarize',
    visibleText: 'x'.repeat(PUBLIC_AI_MAX_SELECTED_TEXT_CHARS + 1),
  }), PublicAiInputTooLargeError);
  assert.throws(() => buildPublicAiBoundedRequest({
    action: 'generate',
    instruction: ' '.repeat(PUBLIC_AI_MAX_INSTRUCTION_CHARS + 1),
    source: '/AI',
    sourceKind: 'text',
    range: { start: 0, end: 3 },
  }), PublicAiInputTooLargeError);
  const source = 'x'.repeat((PUBLIC_AI_MAX_SELECTED_TEXT_CHARS * 2) + 2);
  assert.throws(() => buildPublicAiBoundedRequest({
    action: 'modify',
    patchRange: { start: 0, end: PUBLIC_AI_MAX_SELECTED_TEXT_CHARS + 1 },
    range: {
      start: PUBLIC_AI_MAX_SELECTED_TEXT_CHARS + 1,
      end: PUBLIC_AI_MAX_SELECTED_TEXT_CHARS + 2,
    },
    source,
    sourceKind: 'text',
  }), PublicAiInputTooLargeError);
});
