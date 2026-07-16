import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  hasPublicMarkdownNestedEditableBlock,
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

test('Final renders only the safe inline formatting vocabulary as reversible DOM', () => {
  const safe = renderFinalMarkdown('<span style="color: #244E3A; font-size: 18px">Alpha</span> <u>Beta</u> <mark>Gamma</mark>');
  assert.match(safe, /<span style="color:#244E3A;font-size:18px">Alpha<\/span>/u);
  assert.match(safe, /<u>Beta<\/u>/u);
  assert.match(safe, /<mark>Gamma<\/mark>/u);
  assert.match(safe, /contentEditable="true"/u);
  assert.match(safe, /data-public-final-reversible="true"/u);

  const unsafe = renderFinalMarkdown('<span style="background-image: url(javascript:alert(1))">Unsafe</span><script>alert(1)</script>');
  assert.doesNotMatch(unsafe, /background-image|javascript:|<script/u);
});

test('Final preserves valid percent-encoded local image bytes but rejects malformed escapes', () => {
  const valid = renderFinalMarkdown('![valid](data:image/png;base64,iVBORw0KGgo%0A=)');
  assert.match(valid, /src="data:image\/png;base64,iVBORw0KGgo%0A="/u);

  const malformed = renderFinalMarkdown('![invalid](data:image/png;base64,iVBORw0KGgo%0G=)');
  assert.doesNotMatch(malformed, /src="data:image/u);
});

test('Final canonicalizes case-insensitive local image data URL prefixes', () => {
  const upper = renderFinalMarkdown('![pixel](DATA:IMAGE/PNG;BASE64,iVBORw0KGgo=)');
  assert.match(upper, /src="data:image\/png;base64,iVBORw0KGgo="/u);
  assert.doesNotMatch(upper, /DATA:IMAGE|BASE64/u);
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

test('nested Markdown blocks expose one innermost contentEditable owner', () => {
  const looseList = renderFinalMarkdown('- one\n\n- two');
  assert.match(looseList, /<li[^>]*>\s*<p contentEditable="true"/u);
  assert.doesNotMatch(looseList, /<li contentEditable="true"/u);
  assert.match(looseList, /<li contentEditable="false"[^>]*data-public-final-reversible="true"/u);

  const blockquote = renderFinalMarkdown('> quoted');
  assert.match(blockquote, /<blockquote contentEditable="false"[^>]*>\s*<p contentEditable="true"/u);
  assert.doesNotMatch(blockquote, /<blockquote contentEditable="true"/u);
  assert.match(blockquote, /<blockquote contentEditable="false"[^>]*data-public-final-reversible="true"/u);

  assert.equal(hasPublicMarkdownNestedEditableBlock({
    type: 'element',
    tagName: 'li',
    children: [{ type: 'element', tagName: 'p', children: [{ type: 'text' }] }],
  }), true);
});

test('labelled and unlabelled fenced code blocks are editable but inline code is not a nested owner', () => {
  for (const source of ['```\nplain\n```', '```text\nlabelled\n```']) {
    assert.match(renderFinalMarkdown(source), /<pre><code[^>]*contentEditable="true"/u);
  }

  const inline = renderFinalMarkdown('Parent `inline` text');
  assert.match(inline, /<p contentEditable="true"/u);
  assert.doesNotMatch(inline, /<code[^>]*contentEditable=/u);
});

test('numeric entities intentionally follow the active micromark renderer safety mapping', () => {
  // micromark replaces C1 controls/noncharacters instead of applying the
  // browser HTML tokenizer's Windows-1252 table. Source mapping must match the
  // renderer users actually edit, not native innerHTML behavior.
  for (const entity of ['&#128;', '&#130;', '&#159;', '&#0;', '&#xD800;', '&#xFDD0;', '&#x110000;']) {
    assert.match(renderFinalMarkdown(entity), />�</u);
  }
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
