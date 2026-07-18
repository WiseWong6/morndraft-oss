import assert from 'node:assert/strict';
import test from 'node:test';

import { patchArtifactCodeSource } from '@morndraft/core';
import { getCodeBlockContentSourceRange, hasClosedCodeFenceSourceRange } from './sourcePosition';

test('code block content range patches the second identical custom fence by source position', () => {
  const block = [
    '{',
    '  "layout": "process",',
    '  "steps": [',
    '    { "label": "识别", "note": "阶段 1" }',
    '  ]',
    '}',
  ].join('\n');
  const source = [
    '```custom-code',
    block,
    '```',
    '',
    '```custom-code',
    block,
    '```',
  ].join('\n');
  const secondNode = {
    position: {
      start: { line: 10, column: 1 },
      end: { line: 17, column: 4 },
    },
    value: block,
  };
  const secondRange = getCodeBlockContentSourceRange(secondNode, undefined, block);
  const replacement = block.replace('"识别"', '"第二块识别"');

  assert.deepEqual(secondRange, {
    startLine: 11,
    startColumn: 1,
    endLine: 16,
    endColumn: 2,
  });
  const result = patchArtifactCodeSource(source, {
    contentRange: secondRange,
    replacement,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const blocks = [...result.source.matchAll(/```custom-code\n([\s\S]*?)\n```/g)].map((match) => match[1]);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].includes('第二块识别'), false);
  assert.equal(blocks[1].includes('第二块识别'), true);
});

test('code fence source range reports whether the original source has a closing fence', () => {
  const closedSource = [
    '```html',
    '<div>closed</div>',
    '```',
  ].join('\n');
  const closedNode = {
    position: {
      start: { line: 1, column: 1 },
      end: { line: 3, column: 4 },
    },
    value: '<div>closed</div>',
  };
  const unclosedSource = [
    '```mermaid',
    'graph TD',
    '  A-->B',
  ].join('\n');
  const unclosedNode = {
    position: {
      start: { line: 1, column: 1 },
      end: { line: 3, column: 7 },
    },
    value: 'graph TD\n  A-->B',
  };

  assert.equal(hasClosedCodeFenceSourceRange(closedSource, closedNode), true);
  assert.equal(hasClosedCodeFenceSourceRange(unclosedSource, unclosedNode), false);
});
