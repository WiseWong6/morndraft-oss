import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createHtmlPreviewRichCopyFallbackHtml,
  createPortableBlockHeaderHtml,
  createPortableRichBlockHtml,
  createPortableRichCodeBlockHtml,
  createPortableRichMediaBlockHtml,
  createPortableRichMessageBlockHtml,
  selectPortableRichBlockText,
} from './portable-block-header.js';

const FORBIDDEN_RICH_COPY_PATTERNS = [
  /<header\b/i,
  /display:flex/i,
  /\bgap\s*:/i,
  /\bgrid\b/i,
  /\bposition\s*:/i,
  /\btransform\s*:/i,
  /class="[^"]*\baad-/i,
  /data-copy-remove/i,
  /aad-block-header/i,
];

test('createPortableBlockHeaderHtml returns inline-styled header for rich paste targets', () => {
  const html = createPortableBlockHeaderHtml('Mermaid', 'dark');

  assert.match(html, /Mermaid/);
  assert.match(html, /style="/);
  assert.match(html, /border-bottom:1px solid #3A3A3C/);
  assert.doesNotMatch(html, /border:1px solid/);
  assert.doesNotMatch(html, /class="/);
});

test('createPortableBlockHeaderHtml avoids fragile rich-editor layout styles', () => {
  const html = createPortableBlockHeaderHtml('HTML Preview', 'dark', 'Preview');

  assert.match(html, /^<div\b/);
  assert.doesNotMatch(html, /<header\b/);
  assert.doesNotMatch(html, /display:flex/);
  assert.doesNotMatch(html, /gap:/);
  assert.doesNotMatch(html, /margin:18px/);
  assert.doesNotMatch(html, /border-bottom:0/);
});

test('createHtmlPreviewRichCopyFallbackHtml keeps fallback body adjacent to the header', () => {
  const html = createHtmlPreviewRichCopyFallbackHtml('iframe', 'dark');

  assert.match(html, /^<section\b/);
  assert.match(html, /class="rich-artifact__fix"/);
  assert.equal((html.match(/<section\b/g) ?? []).length, 1);
  assert.equal((html.match(/class="code-dot"/g) ?? []).length, 3);
  assert.doesNotMatch(html, /margin:18px/);
  assert.match(html, /<p\b[\s\S]*iframe[\s\S]*<\/p>/);
  assert.doesNotMatch(html, /HTML preview/);
  assert.match(html, /class="rich-artifact-body"[\s\S]*这段 HTML 预览/);
});

test('createHtmlPreviewRichCopyFallbackHtml tells users to share image or HTML', () => {
  const html = createHtmlPreviewRichCopyFallbackHtml('iframe', 'light');

  assert.match(html, /iframe/);
  assert.match(html, /分享图片/);
  assert.match(html, /HTML/);
});

test('createHtmlPreviewRichCopyFallbackHtml accepts localized fallback copy', () => {
  const html = createHtmlPreviewRichCopyFallbackHtml(
    'HTML Preview',
    'light',
    'This HTML preview contains a full page. Use image copy, preview, or HTML export.',
  );

  assert.match(html, /This HTML preview contains a full page/);
  assert.doesNotMatch(html, /这段 HTML 预览/);
});

test('createPortableRichBlockHtml emits a complete WeChat-safe shell', () => {
  const html = createPortableRichBlockHtml({
    label: 'Mermaid',
    meta: 'Preview',
    theme: 'dark',
    bodyHtml: '<div><img src="data:image/png;base64,xx" alt=""></div>',
    bodyKind: 'media',
  });

  assert.match(html, /^<section\b/);
  assert.match(html, /class="rich-artifact__fix"/);
  assert.match(html, /data-copy-preserve-layout="true"/);
  assert.match(html, /border:1px solid #2f3248/);
  assert.match(html, /border-radius:12px/);
  assert.match(html, /class="rich-artifact-header"/);
  assert.equal((html.match(/class="code-dot"/g) ?? []).length, 3);
  assert.match(html, /class="rich-artifact-label"[\s\S]*Mermaid/);
  assert.doesNotMatch(html, /class="rich-artifact-label"[^>]*font-weight/);
  assert.match(html, /Preview/);
  assert.match(html, /<p\b[\s\S]*Mermaid[\s\S]*<\/p>/);
  assert.match(html, /class="rich-artifact-body"[\s\S]*<img/);
  assert.match(html, /class="rich-artifact-body"[^>]*padding:12px/);
  for (const pattern of FORBIDDEN_RICH_COPY_PATTERNS) {
    assert.doesNotMatch(html, pattern);
  }
});

test('createPortableRichBlockHtml supports zero padding media bodies', () => {
  const html = createPortableRichBlockHtml({
    label: 'iframe',
    theme: 'light',
    bodyHtml: '<img src="data:image/png;base64,xx" alt="">',
    bodyKind: 'media',
    bodyPadding: '0',
  });

  assert.match(html, /class="rich-artifact-label"[\s\S]*iframe/);
  assert.match(html, /class="rich-artifact-body"[^>]*padding:0/);
  assert.equal((html.match(/<section\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /HTML Preview/i);
});

test('createPortableRichCodeBlockHtml emits the unified WeChat code shell', () => {
  const html = createPortableRichCodeBlockHtml({
    label: 'TypeScript',
    theme: 'dark',
    code: 'function greet(name: string): string {\n  return `hi ${name}`;\n}',
  });

  assert.match(html, /^<section\b/);
  const preStyle = html.match(/<pre\b[^>]*style="([^"]*)"/)?.[1] ?? '';
  assert.match(html, /class="code-snippet__fix"/);
  assert.match(html, /data-copy-preserve-layout="true"/);
  assert.match(html, /margin:0 auto 24px/);
  assert.match(html, /background:#1a1a2e/);
  assert.match(html, /border:1px solid #2f3248/);
  assert.match(html, /border-radius:12px/);
  assert.match(html, /class="code-header"/);
  assert.match(html, /background:#2b2b43/);
  assert.match(html, /class="code-dots"/);
  assert.equal((html.match(/class="code-dot"/g) ?? []).length, 3);
  assert.match(html, /class="code-lang"[\s\S]*typescript/);
  assert.match(html, /<pre\b/);
  assert.match(html, /<code\b/);
  assert.match(html, /class="code-snippet_outer"/);
  assert.match(html, /padding:12px 14px/);
  assert.match(html, /font-size:12px/);
  assert.match(html, /line-height:1\.55/);
  assert.match(html, /white-space:pre/);
  assert.match(html, /tab-size:2/);
  assert.match(html, /<pre\b[^>]*style="[^"]*width:auto;min-width:0;max-width:100%;box-sizing:border-box/);
  assert.match(html, /<pre\b[^>]*style="[^"]*overflow:auto/);
  assert.match(html, /<code style="display:block;min-width:0;max-width:100%/);
  assert.match(html, /<span class="code-snippet_outer" style="display:block;min-width:0;max-width:100%/);
  assert.doesNotMatch(preStyle, /(?:^|;)width:100%;/);
  assert.match(html, /return `hi \$\{name\}`;/);
  for (const pattern of FORBIDDEN_RICH_COPY_PATTERNS) {
    assert.doesNotMatch(html, pattern);
  }
});

test('createPortableRichCodeBlockHtml keeps code indentation and long tokens scrollable', () => {
  const longValue = 'x'.repeat(160);
  const html = createPortableRichCodeBlockHtml({
    label: 'JSON',
    theme: 'light',
    code: `{"long":"${longValue}"}`,
  });

  assert.match(html, /max-width:677px/);
  assert.match(html, /<pre\b[^>]*style="[^"]*width:auto;min-width:0;max-width:100%/);
  assert.match(html, /<pre\b[^>]*style="[^"]*overflow:auto/);
  assert.match(html, /<pre\b[^>]*style="[^"]*white-space:pre;word-break:normal;overflow-wrap:normal;tab-size:2/);
  assert.match(html, /<code style="[^"]*white-space:inherit;word-break:inherit;overflow-wrap:inherit;tab-size:inherit/);
  assert.match(html, /<span class="code-snippet_outer" style="[^"]*white-space:inherit;word-break:inherit;overflow-wrap:inherit;tab-size:inherit/);
  assert.match(html, new RegExp(longValue));
});

test('createPortableRichCodeBlockHtml emits a distinct light code theme', () => {
  const html = createPortableRichCodeBlockHtml({
    label: 'TypeScript',
    theme: 'light',
    code: 'const mode = "light";',
  });

  assert.match(html, /margin:0 auto 24px/);
  assert.match(html, /background:#f7f7f2/);
  assert.match(html, /background:#efede4/);
  assert.match(html, /border:1px solid #d9d6cc/);
  assert.match(html, /color:#1d1d18/);
  assert.match(html, /class="code-lang"[\s\S]*typescript/);
  assert.match(html, /<pre\b/);
  assert.match(html, /<code\b/);
  for (const pattern of FORBIDDEN_RICH_COPY_PATTERNS) {
    assert.doesNotMatch(html, pattern);
  }
});

test('createPortableRichCodeBlockHtml escapes source while preserving line breaks', () => {
  const html = createPortableRichCodeBlockHtml({
    label: 'tsx!!',
    code: '<Button title="MornDraft">\n  & copy\n</Button>',
  });

  assert.match(html, /tsx/);
  assert.match(html, /&lt;Button title=&quot;MornDraft&quot;&gt;\n {2}&amp; copy\n&lt;\/Button&gt;/);
  assert.doesNotMatch(html, /<Button/);
});

test('selectPortableRichBlockText prefers explicit formatted artifact text', () => {
  const text = selectPortableRichBlockText({
    explicitText: '{\n  "project": "MornDraft"\n}',
    fallbackText: '{  "project": "MornDraft"}',
  });

  assert.equal(text, '{\n  "project": "MornDraft"\n}');
});

test('createPortableRichMessageBlockHtml keeps full document fallback in one shell', () => {
  const html = createPortableRichMessageBlockHtml({
    label: 'HTML Preview',
    meta: 'HTML Preview',
    theme: 'dark',
    message: '这段 HTML 预览包含完整页面。',
  });

  assert.match(html, /^<section\b/);
  assert.match(html, /class="rich-artifact__fix"/);
  assert.equal((html.match(/<section\b/g) ?? []).length, 1);
  assert.equal((html.match(/class="code-dot"/g) ?? []).length, 3);
  assert.match(html, /class="rich-artifact-header"/);
  assert.match(html, /class="rich-artifact-label"[\s\S]*HTML Preview/);
  assert.doesNotMatch(html, /class="rich-artifact-label"[^>]*font-weight/);
  assert.doesNotMatch(html, /class="rich-artifact-meta"[^>]*font-weight/);
  assert.match(html, /HTML Preview/);
  assert.match(html, /HTML Preview/);
  assert.match(html, /border:1px solid #2f3248/);
  assert.match(html, /border-radius:12px/);
  assert.match(html, /这段 HTML 预览包含完整页面。/);
  for (const pattern of FORBIDDEN_RICH_COPY_PATTERNS) {
    assert.doesNotMatch(html, pattern);
  }
});

test('createPortableRichMediaBlockHtml uses the same shell for Mermaid images', () => {
  const html = createPortableRichMediaBlockHtml({
    label: 'Mermaid',
    theme: 'light',
    mediaHtml: '<img src="data:image/png;base64,xx" alt="">',
  });

  assert.match(html, /^<section\b/);
  assert.match(html, /class="rich-artifact__fix"/);
  assert.equal((html.match(/class="code-dot"/g) ?? []).length, 3);
  assert.match(html, /border:1px solid #d9d6cc/);
  assert.match(html, /border-radius:12px/);
  assert.match(html, /Mermaid/);
  assert.match(html, /<img src="data:image\/png;base64,xx"/);
  assert.match(html, /class="rich-artifact-body"[\s\S]*<img/);
  for (const pattern of FORBIDDEN_RICH_COPY_PATTERNS) {
    assert.doesNotMatch(html, pattern);
  }
});
