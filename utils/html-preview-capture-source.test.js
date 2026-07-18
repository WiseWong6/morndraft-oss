import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getHtmlPreviewCaptureSource,
  getHtmlPreviewSnapshotSource,
  isNonBlockingRemoteFontStylesheetHref,
  sanitizeHtmlForStaticCapture,
  stripNonBlockingRemoteFontStylesheets,
} from './html-preview-capture-source.js';

test('sanitizeHtmlForStaticCapture removes scripts and inline handlers', () => {
  const source = '<div onclick="alert(1)">Hello</div><script>alert(1)</script>';
  const sanitized = sanitizeHtmlForStaticCapture(source);

  assert.doesNotMatch(sanitized, /<script/i);
  assert.doesNotMatch(sanitized, /onclick=/i);
  assert.match(sanitized, /Hello/);
});

test('sanitizeHtmlForStaticCapture removes morndraft flat edit markers', () => {
  const sanitized = sanitizeHtmlForStaticCapture('<h2 data-morndraft-edit-path="$.title">Title</h2>');

  assert.match(sanitized, /Title/);
  assert.doesNotMatch(sanitized, /data-morndraft-edit-path/);
});

test('sanitizeHtmlForStaticCapture removes external script src references', () => {
  const source =
    '<script src="https://cdn.tailwindcss.com"></script><div class="p-4">Hello</div>';
  const sanitized = sanitizeHtmlForStaticCapture(source);

  assert.doesNotMatch(sanitized, /<script[^>]*src="https:\/\/cdn\.tailwindcss\.com"[^>]*>/i);
  assert.match(sanitized, /Hello/);
});

test('sanitizeHtmlForStaticCapture removes non-blocking remote font stylesheets', () => {
  const source =
    '<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC"><link rel="stylesheet" href="https://example.com/app.css"></head><body><p>Hello</p></body></html>';
  const sanitized = sanitizeHtmlForStaticCapture(source);

  assert.doesNotMatch(sanitized, /fonts\.googleapis\.com/i);
  assert.match(sanitized, /https:\/\/example\.com\/app\.css/i);
  assert.match(sanitized, /Hello/);
});

test('stripNonBlockingRemoteFontStylesheets handles link attribute order without dropping ordinary CSS', () => {
  const source =
    '<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC" rel="preconnect stylesheet"><link href="https://example.com/theme.css" rel="stylesheet">';

  const stripped = stripNonBlockingRemoteFontStylesheets(source);

  assert.doesNotMatch(stripped, /fonts\.googleapis\.com/i);
  assert.match(stripped, /https:\/\/example\.com\/theme\.css/i);
});

test('isNonBlockingRemoteFontStylesheetHref only matches known remote font stylesheets', () => {
  assert.equal(isNonBlockingRemoteFontStylesheetHref('https://fonts.googleapis.com/css2?family=A'), true);
  assert.equal(isNonBlockingRemoteFontStylesheetHref('https://fonts.gstatic.com/s/font.woff2'), true);
  assert.equal(isNonBlockingRemoteFontStylesheetHref('https://example.com/fonts.css'), false);
  assert.equal(isNonBlockingRemoteFontStylesheetHref('/local-fonts.css', 'https://example.com/page'), false);
});

test('sanitizeHtmlForStaticCapture removes javascript URLs, meta refresh, and sandboxes iframes', () => {
  const source =
    '<meta http-equiv="refresh" content="0; url=https://example.com"><a href="javascript:alert(1)">Link</a><iframe srcdoc="<p>Hi</p>"></iframe>';
  const sanitized = sanitizeHtmlForStaticCapture(source);

  assert.doesNotMatch(sanitized, /http-equiv="refresh"/i);
  assert.doesNotMatch(sanitized, /javascript:/i);
  assert.match(sanitized, /<iframe[^>]+sandbox=""/i);
});

test('getHtmlPreviewCaptureSource reads srcdoc without touching contentDocument', () => {
  let contentDocumentRead = false;
  const iframe = {
    srcdoc: '<!doctype html><html><body><p>capture me</p><script>bad()</script></body></html>',
    get contentDocument() {
      contentDocumentRead = true;
      throw new Error('sandboxed frame should not be read');
    },
    getAttribute(name) {
      return name === 'srcdoc' ? this.srcdoc : null;
    },
  };

  const source = getHtmlPreviewCaptureSource(iframe);

  assert.equal(contentDocumentRead, false);
  assert.match(source, /capture me/);
  assert.doesNotMatch(source, /<script>/i);
});

test('getHtmlPreviewSnapshotSource falls back to a sanitized static source outside browsers', async () => {
  const iframe = {
    srcdoc: '<!doctype html><html><body><p>capture me</p><script>bad()</script></body></html>',
    getAttribute(name) {
      return name === 'srcdoc' ? this.srcdoc : null;
    },
  };

  const source = await getHtmlPreviewSnapshotSource(iframe);

  assert.match(source, /capture me/);
  assert.doesNotMatch(source, /<script>/i);
});
