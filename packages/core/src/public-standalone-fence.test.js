import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePublicFenceInfoLanguage,
  parsePublicStandaloneFence,
} from './public-standalone-fence.js';

test('public standalone fence parser preserves CRLF, info strings, and exact offsets', () => {
  const source = '  ```HTML preview linenums\r\n<main>Body</main>\r\n```  \r\n';
  const parsed = parsePublicStandaloneFence(source);
  assert.ok(parsed);
  assert.equal(parsed.language, 'html');
  assert.equal(parsed.content, '<main>Body</main>');
  assert.equal(parsed.contentStart, source.indexOf('<main>'));
  assert.equal(parsed.openingLineBreak, '\r\n');
  assert.equal(parsed.closingLineBreak, '\r\n');
  assert.equal(`${parsed.opening}${parsed.openingLineBreak}${parsed.content}${parsed.closingLineBreak}${parsed.closing}`, source);
});

test('public standalone fence parser rejects unclosed and mismatched fences', () => {
  assert.equal(parsePublicStandaloneFence('```html\n<main>open</main>'), null);
  assert.equal(parsePublicStandaloneFence('````html\n<main>short close</main>\n```'), null);
  assert.equal(normalizePublicFenceInfoLanguage(' JSON5 editor '), 'json5');
});

test('public standalone fence parser handles long indentation without regular-expression backtracking', () => {
  const indentation = '\t'.repeat(100_000);
  const source = `${indentation}\`\`\`html\n<main>Body</main>\n\`\`\`${indentation}`;
  const parsed = parsePublicStandaloneFence(source);
  assert.ok(parsed);
  assert.equal(parsed.content, '<main>Body</main>');
  assert.equal(parsed.contentStart, indentation.length + '```html\n'.length);
  assert.equal(`${parsed.opening}${parsed.openingLineBreak}${parsed.content}${parsed.closingLineBreak}${parsed.closing}`, source);
});
