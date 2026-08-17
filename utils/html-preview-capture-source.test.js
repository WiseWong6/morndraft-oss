import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, serialize } from 'parse5';

import {
  getHtmlPreviewCaptureSource,
  getHtmlPreviewSnapshotSource,
  isNonBlockingRemoteFontStylesheetHref,
  sanitizeHtmlForPublicLivePreview,
  sanitizeHtmlForStaticCapture,
  stripNonBlockingRemoteFontStylesheets,
} from './html-preview-capture-source.js';

// Node has no DOMParser; the production module intentionally requires it (the
// browser always provides one and the sanitizers stay sync / CodeQL-clean).
// Tests install a parse5-backed minimal DOMParser so both branches of the
// sanitizers are exercised without pulling parse5 into the app bundle.
const installParse5DomParser = () => {
  if (typeof globalThis.DOMParser !== 'undefined') return;

  const toElement = (node) => {
    const attributes = Array.isArray(node.attrs) ? node.attrs : [];
    return {
      nodeType: 1,
      tagName: String(node.tagName ?? '').toUpperCase(),
      attributes,
      getAttribute(name) {
        const attribute = attributes.find(item => item.name.toLowerCase() === String(name).toLowerCase());
        return attribute ? attribute.value : null;
      },
      removeAttribute(name) {
        const index = attributes.findIndex(item => item.name.toLowerCase() === String(name).toLowerCase());
        if (index >= 0) attributes.splice(index, 1);
      },
      setAttribute(name, value) {
        const existing = attributes.find(item => item.name.toLowerCase() === String(name).toLowerCase());
        if (existing) existing.value = String(value);
        else attributes.push({ name, value: String(value) });
      },
      remove() {
        const parent = node.parentNode;
        const siblings = parent && Array.isArray(parent.childNodes) ? parent.childNodes : null;
        if (!siblings) return;
        const index = siblings.indexOf(node);
        if (index >= 0) siblings.splice(index, 1);
      },
      get outerHTML() {
        return serialize(node);
      },
    };
  };

  globalThis.DOMParser = class {
    parseFromString(markup, type) {
      if (String(type ?? '').toLowerCase() !== 'text/html') {
        throw new Error(`Unsupported parseFromString type: ${type}`);
      }
      const documentNode = parse(String(markup ?? ''), { scriptingEnabled: true });
      const htmlElementNode = (documentNode.childNodes ?? []).find(
        node => node.tagName === 'html',
      ) ?? documentNode;
      return {
        baseURI: 'about:blank',
        getElementsByTagName(tagName) {
          const normalized = String(tagName).toLowerCase();
          const results = [];
          const visit = (node) => {
            if (node && typeof node.tagName === 'string') {
              if (normalized === '*' || node.tagName.toLowerCase() === normalized) {
                results.push(toElement(node));
              }
            }
            for (const child of node.childNodes ?? []) visit(child);
          };
          visit(documentNode);
          return results;
        },
        documentElement: toElement(htmlElementNode),
      };
    }
  };
};

installParse5DomParser();

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
  assert.match(sanitized, /<iframe/i);
  assert.match(sanitized, /sandbox=""/i);
});

test('sanitizeHtmlForPublicLivePreview keeps external CDN scripts and fonts while stripping inline scripts and handlers', () => {
  const source = [
    '<!doctype html><html><head>',
    '<script src="https://cdn.tailwindcss.com"></script>',
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC">',
    '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">',
    '</head><body>',
    '<button onclick="saveAll()">Save</button>',
    '<a href="javascript:alert(1)">Link</a>',
    '<script>window.ran = true</script>',
    '<iframe srcdoc="<p>Hi</p>"></iframe>',
    '</body></html>',
  ].join('');
  const sanitized = sanitizeHtmlForPublicLivePreview(source);

  assert.match(sanitized, /<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/i);
  assert.match(sanitized, /html2canvas/i);
  assert.doesNotMatch(sanitized, /<script>window\.ran = true<\/script>/i);
  assert.match(sanitized, /fonts\.googleapis\.com/i);
  assert.match(sanitized, /font-awesome/i);
  assert.doesNotMatch(sanitized, /onclick=/i);
  assert.doesNotMatch(sanitized, /javascript:/i);
  assert.match(sanitized, /<iframe/i);
  assert.match(sanitized, /sandbox=""/i);
  assert.match(sanitized, /Save/);
});

test('sanitizeHtmlForPublicLivePreview removes glued on-attributes and unsafe data/vbscript URLs', () => {
  const source = [
    '<div href="x"onclick="alert(1)" data-id="1">Glued</div>',
    '<a href="data:text/html;base64,PHNjcmlwdD4=">Data</a>',
    '<a href="vbscript:msgbox(1)">Vbs</a>',
    '<img src="data:image/png;base64,iVBORw0KGgo=">',
  ].join('');
  const sanitized = sanitizeHtmlForPublicLivePreview(source);

  assert.doesNotMatch(sanitized, /onclick=/i);
  assert.doesNotMatch(sanitized, /data:text\/html/i);
  assert.doesNotMatch(sanitized, /vbscript:/i);
  assert.match(sanitized, /data:image\/png/i);
  assert.match(sanitized, /Glued/);
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
