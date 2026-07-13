import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPublicDocumentSegments } from './publicDocument';
import {
  patchPublicMarkdownVisibleText,
  resolvePublicMarkdownVisibleSourceOffset,
  resolvePublicMarkdownVisibleSourceRange,
} from './publicMarkdownPatch';

test('Final heading edit patches text without removing Markdown structure', () => {
  const source = '# Original title\n\nBody';
  const next = patchPublicMarkdownVisibleText({
    source,
    range: { start: 0, end: '# Original title'.length },
    previousVisibleText: 'Original title',
    nextVisibleText: 'Revised title',
  });
  assert.equal(next, '# Revised title\n\nBody');
});

test('Final paragraph edit preserves surrounding emphasis markers', () => {
  const source = 'This is **bold** text.';
  const next = patchPublicMarkdownVisibleText({
    source,
    range: { start: 0, end: source.length },
    previousVisibleText: 'This is bold text.',
    nextVisibleText: 'This is bolder text.',
  });
  assert.equal(next, 'This is **bolder** text.');
});

test('Final patch uses code-point-safe spans for emoji', () => {
  const source = '# A😀B';
  const next = patchPublicMarkdownVisibleText({
    source,
    range: { start: 0, end: source.length },
    previousVisibleText: 'A😀B',
    nextVisibleText: 'A😃B',
  });
  assert.equal(next, '# A😃B');
});

test('Final patch replaces a decoded HTML entity as one source token', () => {
  const source = 'Fish &amp; chips';
  const next = patchPublicMarkdownVisibleText({
    source,
    range: { start: 0, end: source.length },
    previousVisibleText: 'Fish & chips',
    nextVisibleText: 'Fish and chips',
  });
  assert.equal(next, 'Fish and chips');
});

test('Final patch preserves link destinations and inline code delimiters', () => {
  const linked = '[old label](https://example.com/path) and `code`';
  assert.equal(patchPublicMarkdownVisibleText({
    source: linked,
    range: { start: 0, end: linked.length },
    previousVisibleText: 'old label and code',
    nextVisibleText: 'new label and code',
  }), '[new label](https://example.com/path) and `code`');

  assert.equal(patchPublicMarkdownVisibleText({
    source: linked,
    range: { start: 0, end: linked.length },
    previousVisibleText: 'old label and code',
    nextVisibleText: 'old label and snippet',
  }), '[old label](https://example.com/path) and `snippet`');
});

test('Final patches common list, table, and fenced-code blocks without removing structure', () => {
  const list = '- **one**';
  assert.equal(patchPublicMarkdownVisibleText({
    source: list,
    range: { start: 2, end: list.length },
    previousVisibleText: 'one',
    nextVisibleText: 'two',
  }), '- **two**');

  const table = '| A | B |';
  assert.equal(patchPublicMarkdownVisibleText({
    source: table,
    range: { start: 2, end: 3 },
    previousVisibleText: 'A',
    nextVisibleText: 'First',
  }), '| First | B |');

  const code = '```js\nhello\n```';
  assert.equal(patchPublicMarkdownVisibleText({
    source: code,
    range: { start: 0, end: code.length },
    previousVisibleText: 'hello\n',
    nextVisibleText: 'world\n',
  }), '```js\nworld\n```');
});

test('unsupported inline HTML fails closed instead of corrupting source', () => {
  const source = 'Before <span>inside</span> after';
  assert.equal(patchPublicMarkdownVisibleText({
    source,
    range: { start: 0, end: source.length },
    previousVisibleText: 'Before <span>inside</span> after',
    nextVisibleText: 'Changed',
  }), null);
});

test('rendered selections map through formatting, links, entities, repeats, and emoji', () => {
  const source = '**bold** [label](https://example.com) &amp; repeat repeat 😀';
  const visibleText = 'bold label & repeat repeat 😀';
  const cases = [
    { selected: 'bold', occurrence: 0, sourceText: 'bold' },
    { selected: 'label', occurrence: 0, sourceText: 'label' },
    { selected: '&', occurrence: 0, sourceText: '&amp;' },
    { selected: 'repeat', occurrence: 1, sourceText: 'repeat' },
    { selected: '😀', occurrence: 0, sourceText: '😀' },
  ];
  for (const scenario of cases) {
    let visibleStart = -1;
    let from = 0;
    for (let index = 0; index <= scenario.occurrence; index += 1) {
      visibleStart = visibleText.indexOf(scenario.selected, from);
      from = visibleStart + scenario.selected.length;
    }
    const resolved = resolvePublicMarkdownVisibleSourceRange({
      source,
      range: { start: 0, end: source.length },
      visibleText,
      visibleStart,
      visibleEnd: visibleStart + scenario.selected.length,
    });
    assert.equal(resolved?.sourceText, scenario.sourceText);
    assert.equal(source.slice(resolved?.start, resolved?.end), scenario.sourceText);
  }
});

test('cross-block selection boundaries map to exact source offsets', () => {
  const source = '# **First** 😀 paragraph\n\nSecond [label](https://example.com) ending';
  const firstEnd = source.indexOf('\n\n');
  const secondStart = firstEnd + 2;
  const start = resolvePublicMarkdownVisibleSourceOffset({
    source,
    range: { start: 0, end: firstEnd },
    visibleText: 'First 😀 paragraph',
    visibleOffset: 'First '.length,
    edge: 'start',
  });
  const end = resolvePublicMarkdownVisibleSourceOffset({
    source,
    range: { start: secondStart, end: source.length },
    visibleText: 'Second label ending',
    visibleOffset: 'Second label'.length,
    edge: 'end',
  });

  assert.equal(source.slice(start ?? -1, end ?? -1), '😀 paragraph\n\nSecond [label');
});

test('mixed document segments retain absolute offsets for precise Final patches', () => {
  const source = '# Before\n\n```html\n<div>Stable iframe</div>\n```\n\n## After';
  const segments = splitPublicDocumentSegments(source);
  const after = segments.at(-1);
  assert.equal(after?.kind, 'markdown');
  assert.equal(after?.start, source.indexOf('\n\n## After') + 1);
  assert.equal(source.slice(after?.start, after?.end), '\n## After');
});

test('ambiguous or unmappable rendered text fails closed', () => {
  assert.equal(patchPublicMarkdownVisibleText({
    source: '# Visible',
    range: { start: 0, end: 9 },
    previousVisibleText: 'Different',
    nextVisibleText: 'Changed',
  }), null);
});
