import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  isPublicMarkdownNodeSafelyEditable,
  PublicEditableMarkdown,
} from './PublicEditableMarkdown';

const renderFinalMarkdown = (content: string, segmentStart = 0) => renderToStaticMarkup(React.createElement(
  PublicEditableMarkdown,
  {
    content,
    editable: true,
    onSourcePatch: () => undefined,
    segmentStart,
    source: `${' '.repeat(segmentStart)}${content}`,
  },
));

test('Final exposes contentEditable only for reversible Markdown blocks', () => {
  const editable = renderFinalMarkdown('Editable **text** and [link](https://example.com).');
  assert.match(editable, /contentEditable="true"/u);
  assert.match(editable, /data-public-final-reversible="true"/u);

  const image = renderFinalMarkdown('Before ![hero](data:image/png;base64,iVBORw0KGgo=) after');
  assert.match(image, /<img/u);
  assert.doesNotMatch(image, /contentEditable="true"/u);
  assert.match(image, /data-public-final-reversible="false"/u);

  const hardBreak = renderFinalMarkdown('First  \nSecond');
  assert.match(hardBreak, /<br\/?/u);
  assert.doesNotMatch(hardBreak, /contentEditable="true"/u);
  assert.match(hardBreak, /data-public-final-reversible="false"/u);
});

test('irreversible Markdown AST nodes fail the Final editability guard', () => {
  assert.equal(isPublicMarkdownNodeSafelyEditable({
    type: 'element',
    tagName: 'p',
    children: [{ type: 'element', tagName: 'img' }],
  }), false);
  assert.equal(isPublicMarkdownNodeSafelyEditable({
    type: 'element',
    tagName: 'p',
    children: [{ type: 'raw' }],
  }), false);
  assert.equal(isPublicMarkdownNodeSafelyEditable({
    type: 'element',
    tagName: 'p',
    children: [{ type: 'text' }, {
      type: 'element',
      tagName: 'strong',
      children: [{ type: 'text' }],
    }],
  }), true);
});

test('Final blocks expose absolute Source and segment ranges for cross-block selection', () => {
  const markup = renderFinalMarkdown('First paragraph\n\nSecond **paragraph**', 10);
  assert.match(markup, /data-public-source-start="10"/u);
  assert.match(markup, /data-public-source-end="25"/u);
  assert.match(markup, /data-public-source-start="27"/u);
  assert.match(markup, /data-public-source-end="47"/u);
  assert.equal((markup.match(/data-public-segment-start="10"/gu) ?? []).length, 2);
  assert.equal((markup.match(/data-public-segment-end="47"/gu) ?? []).length, 2);
});
