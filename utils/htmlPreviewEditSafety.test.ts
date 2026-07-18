import assert from 'node:assert/strict';
import test from 'node:test';
import { isHtmlTrustedEditingSafe } from './htmlPreviewEditSafety';

test('trusted HTML clone editing remains available for inert article markup', () => {
  assert.equal(isHtmlTrustedEditingSafe('<article><h1>Hello</h1><p>World</p></article>'), true);
});

test('trusted HTML clone editing fails closed for scripts and active nested documents', () => {
  for (const source of [
    '<script>parent.postMessage({ kind: "edit-commit" }, "*")</script>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<svg><script>alert(1)</script></svg>',
    '<math><a href="javascript:alert(1)">x</a></math>',
    '<object data="data:text/html,<script>alert(1)</script>"></object>',
  ]) {
    assert.equal(isHtmlTrustedEditingSafe(source), false, source);
  }
});

test('trusted HTML clone editing rejects event handlers and encoded javascript URLs', () => {
  assert.equal(isHtmlTrustedEditingSafe('<img src=x onerror="alert(1)">'), false);
  assert.equal(isHtmlTrustedEditingSafe('<img/src=x/onerror="alert(1)">'), false);
  assert.equal(isHtmlTrustedEditingSafe('<a href="java&#x73;cript&#58;alert(1)">x</a>'), false);
  assert.equal(isHtmlTrustedEditingSafe('<a href="java&#10;script:alert(1)">x</a>'), false);
  assert.equal(isHtmlTrustedEditingSafe('<a href="data:text/html,<script>alert(1)</script>">x</a>'), false);
  assert.equal(isHtmlTrustedEditingSafe('<a href="blob:https://example.com/id">x</a>'), false);
  assert.equal(isHtmlTrustedEditingSafe('<div srcdoc="unsafe"></div>'), false);
  assert.doesNotThrow(() => isHtmlTrustedEditingSafe('<p>&#x110000;</p>'));
});
