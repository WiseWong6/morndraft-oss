import test from 'node:test';
import assert from 'node:assert/strict';
import { splitPublicDocumentSegments } from './publicDocument';
import {
  inspectPublicMarkdownMappingWorkForTest,
  patchPublicMarkdownVisibleText,
  resetPublicMarkdownEntityStateForTest,
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

  for (const [entity, visible] of [
    ['&#169;', '©'],
    ['&#x1f600;', '😀'],
    ['&#0;', '�'],
    ['&#128;', '�'],
    ['&#130;', '�'],
    ['&#159;', '�'],
    ['&#x0B;', '�'],
    ['&#xD800;', '�'],
    ['&#xFDD0;', '�'],
    ['&#x110000;', '�'],
  ] as const) {
    assert.equal(patchPublicMarkdownVisibleText({
      source: entity,
      range: { start: 0, end: entity.length },
      previousVisibleText: visible,
      nextVisibleText: 'decoded',
    }), 'decoded');
  }
});

test('multi-code-point named entities stay atomic for selection and patch boundaries', () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const decoder = {
    value: '',
    set innerHTML(value: string) {
      this.value = value === '&NotEqualTilde;' ? '\u2242\u0338' : value;
    },
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => decoder },
  });
  resetPublicMarkdownEntityStateForTest();
  try {
    const source = 'A&NotEqualTilde;B';
    const visibleText = 'A\u2242\u0338B';
    const resolve = (visibleStart: number, visibleEnd: number) => resolvePublicMarkdownVisibleSourceRange({
      source,
      range: { start: 0, end: source.length },
      visibleText,
      visibleStart,
      visibleEnd,
    });
    assert.equal(resolve(1, 2), null, 'the first decoded code point cannot split the entity');
    assert.equal(resolve(2, 3), null, 'the second decoded code point cannot split the entity');
    assert.equal(resolve(1, 3)?.sourceText, '&NotEqualTilde;');
    for (const edge of ['start', 'end'] as const) {
      assert.equal(resolvePublicMarkdownVisibleSourceOffset({
        source,
        range: { start: 0, end: source.length },
        visibleText,
        visibleOffset: 2,
        edge,
      }), null, `the ${edge} offset cannot split a multi-code-point entity`);
    }
    assert.equal(resolvePublicMarkdownVisibleSourceOffset({
      source,
      range: { start: 0, end: source.length },
      visibleText,
      visibleOffset: 1,
      edge: 'start',
    }), 1);
    assert.equal(resolvePublicMarkdownVisibleSourceOffset({
      source,
      range: { start: 0, end: source.length },
      visibleText,
      visibleOffset: 3,
      edge: 'end',
    }), source.indexOf('B'));

    for (const nextVisibleText of ['AX\u0338B', 'A\u2242XB', 'A\u2242X\u0338B']) {
      assert.equal(patchPublicMarkdownVisibleText({
        source,
        range: { start: 0, end: source.length },
        previousVisibleText: visibleText,
        nextVisibleText,
      }), null);
    }
    assert.equal(patchPublicMarkdownVisibleText({
      source,
      range: { start: 0, end: source.length },
      previousVisibleText: visibleText,
      nextVisibleText: 'AXB',
    }), 'AXB');
  } finally {
    resetPublicMarkdownEntityStateForTest();
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
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

  for (const source of [
    '[old label](https://example.com/url(foo))',
    '[old label](https://example.com/url\\(foo\\))',
    '[old label](https://example.com/url(foo) "title with )")',
    "[old label](https://example.com/url(foo) 'title with )')",
  ]) {
    assert.equal(patchPublicMarkdownVisibleText({
      source,
      range: { start: 0, end: source.length },
      previousVisibleText: 'old label',
      nextVisibleText: 'new label',
    }), source.replace('old label', 'new label'));
  }
});

test('Final patch distinguishes literal punctuation from Markdown delimiters', () => {
  const literal = '2 * 3 and snake_case';
  assert.equal(patchPublicMarkdownVisibleText({
    source: literal,
    range: { start: 0, end: literal.length },
    previousVisibleText: literal,
    nextVisibleText: '2 * 4 and snake_case',
  }), '2 * 4 and snake_case');

  const inlineCode = 'Before `**x** &amp; \\*` after';
  assert.equal(patchPublicMarkdownVisibleText({
    source: inlineCode,
    range: { start: 0, end: inlineCode.length },
    previousVisibleText: 'Before **x** &amp; \\* after',
    nextVisibleText: 'Before **y** &amp; \\* after',
  }), 'Before `**y** &amp; \\*` after');
});

test('Final deletion removes empty inline wrappers instead of emitting invalid Markdown', () => {
  const cases = [
    ['Before **bold** after', 'Before bold after'],
    ['Before *emphasis* after', 'Before emphasis after'],
    ['Before ~~deleted~~ after', 'Before deleted after'],
    ['Before `code` after', 'Before code after'],
    ['Before ` padded ` after', 'Before padded after'],
    ['Before [label](https://example.com/path) after', 'Before label after'],
    ['Before [label](https://example.com/url(foo) "title with )") after', 'Before label after'],
    ['Before [label](https://example.com/url\\(foo\\)) after', 'Before label after'],
    ['Before <https://example.com/url(foo)> after', 'Before https://example.com/url(foo) after'],
    ['Before **[`nested`](https://example.com/path)** after', 'Before nested after'],
  ] as const;
  for (const [source, visible] of cases) {
    assert.equal(patchPublicMarkdownVisibleText({
      source,
      range: { start: 0, end: source.length },
      previousVisibleText: visible,
      nextVisibleText: 'Before  after',
    }), 'Before  after');
  }
});

test('unknown named entities reuse one decoder and never become hidden source tokens', () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  let decoderCreations = 0;
  const decoder = {
    value: '',
    set innerHTML(value: string) {
      this.value = value;
    },
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => {
        decoderCreations += 1;
        return decoder;
      },
    },
  });
  try {
    const source = Array.from({ length: 5_000 }, (_, index) => `&unknown${index};`).join(' ');
    assert.equal(patchPublicMarkdownVisibleText({
      source,
      range: { start: 0, end: source.length },
      previousVisibleText: source,
      nextVisibleText: `${source}!`,
    }), `${source}!`);
    assert.equal(decoderCreations, 1, 'unknown entities must reuse one detached decoder node');
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
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

  const literalCode = '```text\r\n**x** &amp; [a](b)\r\n```';
  assert.equal(patchPublicMarkdownVisibleText({
    source: literalCode,
    range: { start: 0, end: literalCode.length },
    previousVisibleText: '**x** &amp; [a](b)\n',
    nextVisibleText: '**x** &amp; [a](b)\nnext\n',
  }), '```text\r\n**x** &amp; [a](b)\r\nnext\r\n```');

  const loneCrCode = '```text\rfirst\r```';
  assert.equal(patchPublicMarkdownVisibleText({
    source: loneCrCode,
    range: { start: 0, end: loneCrCode.length },
    previousVisibleText: 'first\n',
    nextVisibleText: 'first\nsecond\n',
  }), '```text\rfirst\rsecond\r```');
});

test('2 MiB hostile Markdown punctuation stays within a fixed linear scan budget', { timeout: 90_000 }, () => {
  const size = 2 * 1024 * 1024;
  for (const character of ['[', '&', '<', '`']) {
    const source = character.repeat(size);
    const startedAt = performance.now();
    const result = inspectPublicMarkdownMappingWorkForTest(source, source);
    const elapsedMs = performance.now() - startedAt;
    assert.equal(result.mappedUnits, size);
    assert.ok(
      result.scanSteps <= size * 6 + 32,
      `${JSON.stringify(character)} used ${result.scanSteps} scan steps for ${size} code units`,
    );
    assert.ok(elapsedMs < 20_000, `${JSON.stringify(character)} mapping exceeded the 20s watchdog: ${elapsedMs}ms`);
  }
});

test('pathologically nested link labels fail closed before exhausting the JavaScript stack', () => {
  let source = 'center';
  for (let depth = 0; depth < 256; depth += 1) source = `[${source}](local-${depth})`;
  assert.equal(patchPublicMarkdownVisibleText({
    source,
    range: { start: 0, end: source.length },
    previousVisibleText: 'center',
    nextVisibleText: 'changed',
  }), null);
});

test('2 MiB of short block lines stays linear without copying every remaining tail', { timeout: 30_000 }, () => {
  const minimumSize = 2 * 1024 * 1024;
  const repeats = Math.ceil(minimumSize / 4);
  const source = '# a\n'.repeat(repeats);
  const visible = 'a\n'.repeat(repeats);
  const startedAt = performance.now();
  const result = inspectPublicMarkdownMappingWorkForTest(source, visible);
  const elapsedMs = performance.now() - startedAt;
  assert.equal(result.mappedUnits, visible.length);
  assert.ok(result.scanSteps <= source.length * 8 + 32, `${result.scanSteps} scan steps for ${source.length} code units`);
  assert.ok(elapsedMs < 15_000, `short-line mapping exceeded the 15s watchdog: ${elapsedMs}ms`);
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

  const emojiStart = visibleText.indexOf('😀');
  assert.equal(resolvePublicMarkdownVisibleSourceRange({
    source,
    range: { start: 0, end: source.length },
    visibleText,
    visibleStart: emojiStart + 1,
    visibleEnd: emojiStart + 2,
  }), null, 'a UTF-16 selection cannot split an emoji surrogate pair');
  for (const edge of ['start', 'end'] as const) {
    assert.equal(resolvePublicMarkdownVisibleSourceOffset({
      source,
      range: { start: 0, end: source.length },
      visibleText,
      visibleOffset: emojiStart + 1,
      edge,
    }), null, `a ${edge} offset cannot split an emoji surrogate pair`);
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
