import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzePublicJsonRepairSource,
  beginPublicJsonRepairReview,
  confirmPublicJsonRepairReview,
  PUBLIC_JSON_REPAIR_MAX_SOURCE_LENGTH,
  undoPublicJsonRepair,
} from './publicJsonRepair';

test('public JSON repair offers a review without mutating a long source', () => {
  const validBody = JSON.stringify({
    items: Array.from({ length: 24 }, (_, index) => ({
      id: index,
      label: `Item ${index}`,
      detail: 'Long deterministic fixture with escaped delimiters } ] and quotes.',
    })),
  });
  const source = `# Result\n\n\`\`\`json\n${validBody.slice(0, -1)}\n\`\`\``;
  const analysis = analyzePublicJsonRepairSource(source);
  const diagnostic = analysis.diagnostics.find((item) => item.fix);

  assert.ok(diagnostic);
  const review = beginPublicJsonRepairReview(source, diagnostic);
  assert.ok(review);
  assert.equal(source.endsWith('}\n```'), false);
  assert.equal(review.source, source);
  assert.equal(review.nextSource, `# Result\n\n\`\`\`json\n${validBody}\n\`\`\``);
});

test('public JSON repair adopts once, rejects stale source and supports one exact undo', () => {
  const source = '```json\n{"items":[{"ok":true\n```';
  const diagnostic = analyzePublicJsonRepairSource(source).diagnostics.find((item) => item.fix);
  assert.ok(diagnostic);
  const review = beginPublicJsonRepairReview(source, diagnostic);
  assert.ok(review);

  assert.equal(confirmPublicJsonRepairReview(review, `${source}\n`), null);
  const confirmed = confirmPublicJsonRepairReview(review, source);
  assert.ok(confirmed);
  assert.equal(confirmed.nextSource, '```json\n{"items":[{"ok":true}]}\n```');
  assert.equal(undoPublicJsonRepair(confirmed.applied, confirmed.nextSource), source);
  assert.equal(undoPublicJsonRepair(confirmed.applied, `${confirmed.nextSource}\n`), null);
});

test('public JSON repair preserves JSON5 CRLF comments', () => {
  const source = "```json5\r\n{items: [1, 2] // keep\r\n```";
  const diagnostic = analyzePublicJsonRepairSource(source).diagnostics.find((item) => item.fix);
  assert.ok(diagnostic);
  const review = beginPublicJsonRepairReview(source, diagnostic);

  assert.ok(review);
  assert.equal(review.nextSource, "```json5\r\n{items: [1, 2] // keep\r\n}\r\n```");
});

test('public JSON repair removes only the targeted redundant fence', () => {
  const first = '````json\n```json\n{"slot":"first"}\n```\n````';
  const second = '````json5\n~~~json5\n{slot:"second",}\n~~~\n````';
  const source = `${first}\n\nKeep this note.\n\n${second}`;
  const analysis = analyzePublicJsonRepairSource(source);
  const firstRepair = analysis.diagnostics.find((item) => item.fix);
  assert.ok(firstRepair);
  const review = beginPublicJsonRepairReview(source, firstRepair);

  assert.ok(review);
  assert.match(review.nextSource, /````json\n\{"slot":"first"\}\n````/u);
  assert.match(review.nextSource, /````json5\n~~~json5\n\{slot:"second",\}\n~~~\n````/u);
  assert.match(review.nextSource, /Keep this note\./u);
});

test('public JSON repair reports unsafe JSON but offers no guessed fix', () => {
  const cases = [
    '```json\n{"a":1 "b":2\n```',
    '```json\n{"a":\n```',
    '```json\n{"a":"unterminated\n```',
    '```json\n{"a":[1}\n```',
    '```json\n{"a":1 // strict JSON comment\n```',
  ];

  for (const source of cases) {
    const analysis = analyzePublicJsonRepairSource(source);
    assert.equal(analysis.diagnostics.length > 0, true);
    assert.equal(analysis.diagnostics.some((item) => item.fix), false, source);
  }
});

test('public JSON repair excludes non-JSON deterministic fixes and fails closed on huge source', () => {
  assert.deepEqual(
    analyzePublicJsonRepairSource('```html-preview\n<main>Fragment</main>\n```').diagnostics,
    [],
  );
  assert.deepEqual(
    analyzePublicJsonRepairSource('```mermaid\ngraph TD\nA -->\n```').diagnostics,
    [],
  );
  assert.deepEqual(
    analyzePublicJsonRepairSource('```markdown\nunclosed').diagnostics,
    [],
  );
  assert.deepEqual(
    analyzePublicJsonRepairSource('x'.repeat(PUBLIC_JSON_REPAIR_MAX_SOURCE_LENGTH + 1)),
    { diagnostics: [], sourceTooLarge: true },
  );
});
