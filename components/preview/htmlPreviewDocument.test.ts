import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHtmlPreviewSrcDoc,
  buildStandaloneRawHtml,
  wrapStandaloneHtml,
} from './htmlPreviewDocument';
import {
  getStandaloneMermaidZoomRuntimeNonce,
  getStandaloneRuntimeNonce,
} from '../../utils/htmlStandaloneViewer';

const assertHasScriptlessCspMeta = (html: string) => {
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src &#39;none&#39;/);
};

/** Live preview CSP allows CDN scripts and inline scripts — verify the allowlist. */
const assertHasLivePreviewCspMeta = (html: string) => {
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src &#39;unsafe-inline&#39; https:\/\/cdn\.tailwindcss\.com/);
  assert.match(html, /style-src &#39;self&#39; &#39;unsafe-inline&#39; https:/);
  assert.match(html, /font-src &#39;self&#39; data: https:/);
};

const assertNoMornDraftHtmlThemeBridge = (html: string) => {
  assert.doesNotMatch(html, /#f5f5f0/i);
  assert.doesNotMatch(html, /#111113/i);
  assert.doesNotMatch(html, /fallbackTheme/);
  assert.doesNotMatch(html, /html-preview-theme/);
  assert.doesNotMatch(html, /__setArtifactPreviewTheme/);
};

test('raw HTML fragment preview preserves browser-owned background defaults', () => {
  const html = buildHtmlPreviewSrcDoc({
    html: '<section><p>Plain WeChat fragment</p></section>',
    id: 'raw-fragment',
    theme: 'dark',
    renderMode: 'raw',
  });

  assert.match(html, /morndraft-html-fragment-viewport/);
  assert.match(html, /html,body\{margin:0;min-height:0;overflow-y:hidden;\}/);
  assert.doesNotMatch(html, /data-morndraft-standalone-fragment-fit/);
  assertHasLivePreviewCspMeta(html);
  assert.match(html, /data-morndraft-html-preview-bridge/);
  assert.doesNotMatch(html, /edit-request|edit-commit-request/);
  assert.doesNotMatch(html, /window\.__ready/);
  assertNoMornDraftHtmlThemeBridge(html);
});

test('raw full HTML preview keeps user document colors without MornDraft theme fallback', () => {
  const html = buildHtmlPreviewSrcDoc({
    html: '<!doctype html><html><head><script src="https://cdn.tailwindcss.com"></script><style>body{background:#ffeecc;color:#222}</style></head><body>Article</body></html>',
    id: 'raw-doc',
    theme: 'dark',
    renderMode: 'raw',
  });

  assert.match(html, /body\{background:#ffeecc;color:#222\}/);
  assert.match(html, /data-morndraft-raw-preview-fit/);
  assertHasLivePreviewCspMeta(html);
  const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? '';
  assert.doesNotMatch(head, /<script[^>]+src="https:\/\/cdn\.tailwindcss\.com"/);
  assert.match(html, /Article<script src="https:\/\/cdn\.tailwindcss\.com"><\/script><\/body>/);
  assert.match(html, /data-morndraft-html-preview-bridge/);
  assert.doesNotMatch(html, /edit-request|edit-commit-request/);
  assert.doesNotMatch(html, /window\.__ready/);
  assertNoMornDraftHtmlThemeBridge(html);
});

test('raw HTML preview and standalone delivery ignore fake head tags in inert source contexts', () => {
  const cases = [
    '<!doctype html><html><script>const fakeHead = "<head data-fake>";</script><body>Script</body></html>',
    '<!doctype html><html><!-- <head data-fake> --><body>Comment</body></html>',
    '<!doctype html><html><template><head data-fake><title>Template</title></head></template><body>Template</body></html>',
  ];

  for (const [index, source] of cases.entries()) {
    const preview = buildHtmlPreviewSrcDoc({
      html: source,
      id: `raw-fake-head-${index}`,
      theme: 'light',
      renderMode: 'raw',
    });
    const standalone = buildStandaloneRawHtml(source, 'light', 'MornDraft');

    assert.match(preview, /^<!doctype html><html><head><base data-morndraft-inject/u);
    assert.match(standalone, /^<!doctype html><html><head><meta http-equiv="Content-Security-Policy"/u);
    assert.ok(preview.indexOf('data-morndraft-html-preview-bridge') < preview.indexOf('data-fake'));
    assert.ok(standalone.indexOf('Content-Security-Policy') < standalone.indexOf('data-fake'));
  }
});

test('raw HTML preview and standalone CSP precede scripts before an invalid late head', () => {
  const source = '<!doctype html><html><script>window.ranBeforeCsp = true;</script><head><title>Late</title></head><body>Body</body></html>';
  const preview = buildHtmlPreviewSrcDoc({
    html: source,
    id: 'raw-late-head',
    theme: 'light',
    renderMode: 'raw',
  });
  const standalone = buildStandaloneRawHtml(source, 'light', 'MornDraft');

  assert.match(preview, /^<!doctype html><html><head><base data-morndraft-inject/u);
  assert.match(standalone, /^<!doctype html><html><head><meta http-equiv="Content-Security-Policy"/u);
  assert.ok(preview.indexOf('Content-Security-Policy') < preview.indexOf('<script>'));
  assert.ok(standalone.indexOf('Content-Security-Policy') < standalone.indexOf('<script>'));
  assert.match(preview, /<script>window\.ranBeforeCsp = true;<\/script><head>/u);
  assert.match(standalone, /<script>window\.ranBeforeCsp = true;<\/script><head>/u);
});

test('raw HTML standalone keeps NBSP as author text and places CSP in the outer head', () => {
  const source = '\u00a0<html><head><script>window.__NBSP_BYPASS__=48</script></head><body>Body</body></html>';
  const standalone = buildStandaloneRawHtml(source, 'light', 'MornDraft');

  assert.match(standalone, /^<!DOCTYPE html>\s*<html lang="zh-CN">\s*<head>/u);
  assert.ok(standalone.indexOf('Content-Security-Policy') < standalone.indexOf('__NBSP_BYPASS__'));
  assert.match(standalone, /morndraft-html-fragment-content[\s\S]*\u00a0<html>/u);
});

test('standalone raw HTML does not inject MornDraft preview theme fallback', () => {
  const fragment = buildStandaloneRawHtml(
    '<section><p>Standalone fragment</p></section>',
    'dark',
    'MornDraft',
  );
  const fullDocument = buildStandaloneRawHtml(
    '<!doctype html><html><head><style>body{background:#ffeecc}</style></head><body>Standalone</body></html>',
    'dark',
    'MornDraft',
  );

  assertNoMornDraftHtmlThemeBridge(fragment);
  assertNoMornDraftHtmlThemeBridge(fullDocument);
  assert.match(fullDocument, /body\{background:#ffeecc\}/);
  assertHasScriptlessCspMeta(fragment);
  assertHasScriptlessCspMeta(fullDocument);
  assert.match(fragment, /data-morndraft-standalone-fragment-fit/);
  assert.match(fragment, /html\{height:auto!important;min-height:100%;overflow-x:hidden!important;overflow-y:auto!important;\}/);
  assert.match(fragment, /body\{margin:0;max-width:none;height:auto!important;min-height:0;overflow-x:hidden!important;overflow-y:visible!important;\}/);
  assert.match(fragment, /\.morndraft-html-fragment-viewport\{height:auto!important;min-height:0;box-sizing:border-box;display:block;overflow:visible!important;padding:0;\}/);
  assert.doesNotMatch(fragment, /data-morndraft-html-preview-bridge|edit-request/);
  assert.doesNotMatch(fullDocument, /data-morndraft-html-preview-bridge|edit-request/);
});

test('commercial standalone shells escape hostile titles through the shared portable document', () => {
  const title = '</title><script>titleEscape()</script>';
  const rendered = wrapStandaloneHtml('<main>Rendered</main>', title, 'light');
  const rawFragment = buildStandaloneRawHtml('<main>Raw</main>', 'light', title);

  for (const html of [rendered, rawFragment]) {
    assert.match(html, /<title>&lt;\/title&gt;&lt;script&gt;titleEscape\(\)&lt;\/script&gt;<\/title>/u);
    assert.equal((html.match(/<title>/gu) ?? []).length, 1);
    assert.doesNotMatch(html, /<script>titleEscape\(\)<\/script>/u);
  }
});

test('MornDraft shared-CSS HTML Source injects Swiss base CSS in preview and standalone output', () => {
  const source = '<!doctype html><html><head><style data-morndraft-source-style>:root{--morndraft-accent:#d95e00}</style></head><body><div class="component-shell" data-morndraft-source="morndraft-flat" data-morndraft-layout="flow" data-morndraft-variant="chain"><div class="swiss-card">Flow</div></div></body></html>';
  const preview = buildHtmlPreviewSrcDoc({
    html: source,
    id: 'morndraft-shared-css',
    theme: 'light',
    renderMode: 'raw',
  });
  const standalone = buildStandaloneRawHtml(source, 'light', 'MornDraft');

  assert.match(preview, /data-morndraft-swiss-catalog-shared/);
  assert.match(preview, /data-morndraft-source-style/);
  assert.match(preview, /Swiss Card 样式/);
  assert.match(standalone, /data-morndraft-swiss-catalog-shared/);
  assert.match(standalone, /Content-Security-Policy/);
});

test('MornDraft standalone HTML never injects A4 runtime into static exports', () => {
  const withoutPagination = wrapStandaloneHtml(
    '<div class="aad-document-surface"><h1>Plain</h1></div>',
    'MornDraft',
    'light',
  );
  const withPagination = wrapStandaloneHtml(
    '<div class="aad-document-surface" data-preview-a4-pagination="true"><h1>Pages</h1></div>',
    'MornDraft',
    'light',
  );
  const frozenPagination = wrapStandaloneHtml(
    '<div class="aad-document-surface" data-preview-a4-pagination="true" data-preview-a4-page-count="2" style="--aad-preview-a4-page-count:2;min-height:1200px"><h1>Pages</h1></div>',
    'MornDraft',
    'light',
    { includeA4PaginationRuntime: false },
  );

  assert.doesNotMatch(withoutPagination, /data-morndraft-a4-pagination-runtime/);
  assert.doesNotMatch(withPagination, /data-morndraft-a4-pagination-runtime/);
  assert.doesNotMatch(withPagination, /document\.fonts\?\.ready/);
  assert.doesNotMatch(withPagination, /classList\.contains\('aad-md-paragraph'\)/);
  assert.doesNotMatch(frozenPagination, /data-morndraft-a4-pagination-runtime/);
  assert.match(frozenPagination, /data-preview-a4-page-count="2"/);
  assert.match(frozenPagination, /min-height:1200px/);
  assertHasScriptlessCspMeta(withPagination);
  assert.match(withoutPagination, /data-morndraft-standalone-fit/);
  assert.match(withoutPagination, /html\{height:auto!important;min-height:100%;overflow-x:hidden!important;overflow-y:auto!important;\}/);
  assert.match(withoutPagination, /body\{max-width:none;height:auto!important;min-height:100vh;overflow-x:hidden!important;overflow-y:visible!important;\}/);
  assert.match(withoutPagination, /main\.container\{display:block!important;height:auto!important;min-height:100vh;overflow:visible!important;\}/);
  assert.match(withoutPagination, /<body style="min-height:100vh;margin:0;">/);
  assert.match(withoutPagination, /<main class="container">/);
  assert.doesNotMatch(withoutPagination, /display:flex;flex:1;min-height:0/);
});

test('MornDraft standalone HTML dedupes repeated embedded style tags while keeping cascade order', () => {
  const repeatedCss = '.component-shell { width: 480px; } .swiss-card { color: red; }';
  const alternateCss = '.component-shell { width: 744px; } .swiss-card { color: blue; }';
  const html = wrapStandaloneHtml(
    [
      `<section><style>${repeatedCss}</style><div class="component-shell">First</div></section>`,
      `<section><style>${alternateCss}</style><div class="component-shell">Second</div></section>`,
      `<section><style>${repeatedCss}</style><div class="component-shell">Third</div></section>`,
      `<section><style media="print">${repeatedCss}</style><div>Print</div></section>`,
    ].join(''),
    'MornDraft',
    'light',
  );

  assert.equal(html.split(`<style>${repeatedCss}</style>`).length - 1, 1);
  assert.equal(html.split(`<style>${alternateCss}</style>`).length - 1, 1);
  assert.equal(html.split(`<style media="print">${repeatedCss}</style>`).length - 1, 1);
  assert.ok(html.indexOf(`<style>${alternateCss}</style>`) < html.indexOf(`<style>${repeatedCss}</style>`));
  assert.ok(html.indexOf('Second') < html.indexOf(`<style>${repeatedCss}</style>`));
});

test('MornDraft standalone HTML injects Mermaid zoom runtime only when requested', () => {
  const plain = wrapStandaloneHtml(
    '<div class="aad-document-surface"><h1>Plain</h1></div>',
    'MornDraft',
    'light',
  );
  const mermaid = wrapStandaloneHtml(
    '<div class="aad-document-surface"><section class="aad-mermaid-block" data-morndraft-standalone-mermaid-zoom="true"><div data-morndraft-standalone-mermaid-viewport="true"></div></section></div>',
    'MornDraft',
    'light',
    { includeMermaidZoomRuntime: true, scriptNonce: 'MermaidNonce_123' },
  );

  assertHasScriptlessCspMeta(plain);
  assert.doesNotMatch(plain, /data-morndraft-standalone-mermaid-runtime/);
  assert.doesNotMatch(plain, /data-morndraft-standalone-mermaid-zoom-action/);
  assert.equal(getStandaloneMermaidZoomRuntimeNonce(plain), null);
  assert.equal(getStandaloneRuntimeNonce(plain), null);

  assert.match(mermaid, /script-src &#39;nonce-MermaidNonce_123&#39;/);
  assert.match(mermaid, /data-morndraft-standalone-mermaid-zoom/);
  assert.match(mermaid, /data-morndraft-inject data-morndraft-standalone-mermaid-zoom-style/);
  assert.match(mermaid, /\.aad-block-header-main/);
  assert.match(mermaid, /\.aad-block-header-main\{[\s\S]*?height:26px;[\s\S]*?line-height:1\.75;/);
  assert.match(mermaid, /\.aad-block-header-main \.aad-block-label\{[\s\S]*?line-height:1\.75;[\s\S]*?color:light-dark\(#6e6e62,#c7c7cc\);/);
  assert.match(mermaid, /\.aad-mermaid-toolbar/);
  assert.match(mermaid, /\.aad-mermaid-toolbar\{[\s\S]*?height:24px;[\s\S]*?line-height:1\.75;/);
  assert.match(mermaid, /color:light-dark\(#7a7568,#a1a1a6\)/);
  assert.match(mermaid, /\.aad-standalone-mermaid-zoom-value\{[\s\S]*?height:16px;[\s\S]*?font-size:12px;[\s\S]*?line-height:16px;[\s\S]*?color:light-dark\(#6e6e62,#c7c7cc\);/);
  assert.match(mermaid, /\.aad-mermaid-toolbar \.aad-icon-button:disabled/);
  assert.doesNotMatch(mermaid, /width:28px/);
  assert.doesNotMatch(mermaid, /aad-standalone-mermaid-toolbar/);
  assert.match(mermaid, /data-morndraft-standalone-mermaid-runtime="true" nonce="MermaidNonce_123"/);
  assert.match(mermaid, /data-morndraft-standalone-mermaid-pannable/);
  assert.match(mermaid, /data-morndraft-standalone-mermaid-zoom-action/);
  assert.match(mermaid, /updateControls\(block,scale\)/);
  assert.match(mermaid, /pointerdown/);
  assert.equal(getStandaloneMermaidZoomRuntimeNonce(mermaid), 'MermaidNonce_123');
  assert.equal(getStandaloneRuntimeNonce(mermaid), 'MermaidNonce_123');
  assert.equal(
    getStandaloneMermaidZoomRuntimeNonce(mermaid.replace('</body>', '<script>alert(1)</script></body>')),
    null,
  );
  assert.equal(
    getStandaloneRuntimeNonce(mermaid.replace('</body>', '<script>alert(1)</script></body>')),
    null,
  );

  const uiRuntime = wrapStandaloneHtml('<main>code</main>', 'MornDraft', 'light', {
    includeMornDraftRuntime: true,
    scriptNonce: 'UiNonce_123',
  });
  assert.match(uiRuntime, /script-src &#39;nonce-UiNonce_123&#39;/);
  assert.match(uiRuntime, /data-morndraft-standalone-ui-runtime="true" nonce="UiNonce_123"/);
  assert.match(uiRuntime, /aad-json-tree-toggle/);
  assert.equal(getStandaloneMermaidZoomRuntimeNonce(uiRuntime), null);
  assert.equal(getStandaloneRuntimeNonce(uiRuntime), 'UiNonce_123');

  const combinedRuntime = wrapStandaloneHtml(
    '<div class="aad-document-surface"><section class="aad-mermaid-block" data-morndraft-standalone-mermaid-zoom="true"><div data-morndraft-standalone-mermaid-viewport="true"></div></section></div>',
    'MornDraft',
    'light',
    {
      includeMornDraftRuntime: true,
      includeMermaidZoomRuntime: true,
      scriptNonce: 'SharedNonce_123',
    },
  );
  assert.match(combinedRuntime, /data-morndraft-standalone-ui-runtime="true" nonce="SharedNonce_123"/);
  assert.match(combinedRuntime, /data-morndraft-standalone-mermaid-runtime="true" nonce="SharedNonce_123"/);
  assert.equal(getStandaloneMermaidZoomRuntimeNonce(combinedRuntime), null);
  assert.equal(getStandaloneRuntimeNonce(combinedRuntime), 'SharedNonce_123');
});
