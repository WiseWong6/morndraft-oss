import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_FENCE_LANGUAGE_KINDS,
  getCodeFenceLanguageKind,
  normalizeCodeFenceLanguage,
} from './code-fence-language.js';

test('normalizeCodeFenceLanguage is case-insensitive and tolerant of separators', () => {
  assert.equal(normalizeCodeFenceLanguage('MERMAID'), 'mermaid');
  assert.equal(normalizeCodeFenceLanguage('Json5'), 'json5');
  assert.equal(normalizeCodeFenceLanguage('HTML-PREVIEW'), 'html');
  assert.equal(normalizeCodeFenceLanguage('html_preview'), 'html');
  assert.equal(normalizeCodeFenceLanguage('Html-Iframe'), 'html-iframe');
  assert.equal(normalizeCodeFenceLanguage('HTMLIFRAME'), 'htmliframe');
  assert.equal(normalizeCodeFenceLanguage('iframe-html'), 'iframe-html');
});

test('normalizeCodeFenceLanguage leaves removed HTML iframe aliases as code languages', () => {
  assert.equal(normalizeCodeFenceLanguage('html-panel'), 'html-panel');
  assert.equal(normalizeCodeFenceLanguage('HTMLPANEL'), 'htmlpanel');
  assert.equal(normalizeCodeFenceLanguage('html-url'), 'html-url');
  assert.equal(normalizeCodeFenceLanguage('HTMLURL'), 'htmlurl');
});

test('normalizeCodeFenceLanguage maps DocumentSpec aliases', () => {
  assert.equal(normalizeCodeFenceLanguage('swiss'), 'documentspec');
  assert.equal(normalizeCodeFenceLanguage('MornDraft-Expression'), 'documentspec');
  assert.equal(normalizeCodeFenceLanguage('morndraft_expression'), 'documentspec');
  assert.equal(normalizeCodeFenceLanguage('morndraft'), 'morndraft');
});

test('getCodeFenceLanguageKind groups renderable artifact languages', () => {
  assert.equal(getCodeFenceLanguageKind('md'), CODE_FENCE_LANGUAGE_KINDS.MARKDOWN);
  assert.equal(getCodeFenceLanguageKind('mer-maid'), CODE_FENCE_LANGUAGE_KINDS.MERMAID);
  assert.equal(getCodeFenceLanguageKind('json5'), CODE_FENCE_LANGUAGE_KINDS.JSON5);
  assert.equal(getCodeFenceLanguageKind('html-preview'), CODE_FENCE_LANGUAGE_KINDS.HTML_PREVIEW);
  assert.equal(getCodeFenceLanguageKind('html-iframe'), CODE_FENCE_LANGUAGE_KINDS.CODE);
  assert.equal(getCodeFenceLanguageKind('html-panel'), CODE_FENCE_LANGUAGE_KINDS.CODE);
  assert.equal(getCodeFenceLanguageKind('html-url'), CODE_FENCE_LANGUAGE_KINDS.CODE);
  assert.equal(getCodeFenceLanguageKind('iframe-html'), CODE_FENCE_LANGUAGE_KINDS.CODE);
  assert.equal(getCodeFenceLanguageKind('htmliframe'), CODE_FENCE_LANGUAGE_KINDS.CODE);
  assert.equal(getCodeFenceLanguageKind('htmlpanel'), CODE_FENCE_LANGUAGE_KINDS.CODE);
  assert.equal(getCodeFenceLanguageKind('htmlurl'), CODE_FENCE_LANGUAGE_KINDS.CODE);
  assert.equal(getCodeFenceLanguageKind('swiss'), CODE_FENCE_LANGUAGE_KINDS.DOCUMENT_SPEC);
  assert.equal(getCodeFenceLanguageKind('morndraft'), CODE_FENCE_LANGUAGE_KINDS.CODE);
  assert.equal(getCodeFenceLanguageKind('morndraft-component'), CODE_FENCE_LANGUAGE_KINDS.CODE);
  assert.equal(getCodeFenceLanguageKind('typescript'), CODE_FENCE_LANGUAGE_KINDS.CODE);
});
