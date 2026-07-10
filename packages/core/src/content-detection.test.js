import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectArtifactContent,
  extractStandaloneHtmlPreviewFence,
  getStrictStandaloneResourceUrl,
  getStrictStandaloneImageUrl,
  hasMultipleFencedCodeBlocks,
  isEmbeddableResourceUrl,
  isImageResourceUrl,
  isPureImageArtifactSource,
  looksLikeHtml,
  looksLikeMermaid,
  normalizeEmbeddableResourceUrl,
  preprocessResourceLinks,
} from './content-detection.js';

test('detectArtifactContent recognizes JSON5 objects and arrays', () => {
  assert.equal(detectArtifactContent('{foo: "bar", count: 2}').primaryType, 'json');
  assert.equal(detectArtifactContent('[1, 2, trailing,]').primaryType, 'json');
  assert.equal(detectArtifactContent('{ "foo": }').primaryType, 'json');
});

test('looksLikeHtml recognizes common fragments beyond the old allowlist', () => {
  assert.equal(looksLikeHtml('<a href="https://example.com">Link</a>'), true);
  assert.equal(looksLikeHtml('<details><summary>More</summary><p>Text</p></details>'), true);
  assert.equal(looksLikeHtml('<my-card data-id="1"></my-card>'), true);
});

test('looksLikeHtml avoids Markdown autolinks and plain comparison text', () => {
  assert.equal(looksLikeHtml('<https://example.com>'), false);
  assert.equal(looksLikeHtml('1 < 2 and 3 > 2'), false);
});

test('looksLikeMermaid skips comments, init directives, and frontmatter', () => {
  assert.equal(looksLikeMermaid('%% comment\n%%{init: {"theme": "base"}}%%\ngraph TD\nA-->B'), true);
  assert.equal(looksLikeMermaid('---\ntitle: Demo\n---\nsequenceDiagram\nA->>B: hi'), true);
});

test('detectArtifactContent keeps mixed fenced documents distinct', () => {
  const mixed = '# Report\n\n```json\n{"ok":true}\n```\n\n```mermaid\ngraph TD\nA-->B\n```';
  assert.equal(hasMultipleFencedCodeBlocks(mixed), true);
  assert.equal(detectArtifactContent(mixed).primaryType, 'mixed');
});

test('detectArtifactContent keeps single-code-block Markdown as Markdown', () => {
  const markdown = '# Notes\n\n```typescript\nconst answer = 42;\n```\n\nBack to prose.';
  assert.equal(hasMultipleFencedCodeBlocks(markdown), false);
  assert.equal(detectArtifactContent(markdown).primaryType, 'markdown');
});

test('detectArtifactContent does not treat fenced HTML fragments as pure HTML', () => {
  const markdown = '```html-panel\nhttps://example.com/\n<div>extra</div>\n```';
  assert.equal(detectArtifactContent(markdown).primaryType, 'markdown');
});

test('detectArtifactContent treats a single fenced full HTML document as pure HTML', () => {
  const htmlPreview = [
    '```html-preview',
    '<!DOCTYPE html>',
    '<html lang="zh-CN"><body><button>新增</button></body></html>',
    '```',
  ].join('\n');
  const html = [
    '```html',
    '<html><body><button>查看</button></body></html>',
    '```',
  ].join('\n');

  assert.equal(detectArtifactContent(htmlPreview).primaryType, 'html');
  assert.equal(detectArtifactContent(html).primaryType, 'html');
  assert.equal(
    extractStandaloneHtmlPreviewFence(htmlPreview)?.html,
    '<!DOCTYPE html>\n<html lang="zh-CN"><body><button>新增</button></body></html>',
  );
});

test('detectArtifactContent keeps mixed and incomplete HTML fences as Markdown', () => {
  const mixedMarkdown = [
    '# Notes',
    '',
    '```html-preview',
    '<!DOCTYPE html><html><body>Preview</body></html>',
    '```',
  ].join('\n');
  const unclosed = [
    '```html-preview',
    '<!DOCTYPE html><html><body>Preview</body></html>',
  ].join('\n');
  const fragment = [
    '```html-preview',
    '<section>Preview</section>',
    '```',
  ].join('\n');
  const multipleFences = [
    '```html-preview',
    '<!DOCTYPE html><html><body>Preview</body></html>',
    '```',
    '',
    '```json',
    '{"ok":true}',
    '```',
  ].join('\n');

  assert.equal(detectArtifactContent(mixedMarkdown).primaryType, 'markdown');
  assert.equal(detectArtifactContent(unclosed).primaryType, 'markdown');
  assert.equal(detectArtifactContent(fragment).primaryType, 'markdown');
  assert.equal(detectArtifactContent(multipleFences).primaryType, 'mixed');
  assert.equal(extractStandaloneHtmlPreviewFence(mixedMarkdown), null);
  assert.equal(extractStandaloneHtmlPreviewFence(unclosed), null);
  assert.equal(extractStandaloneHtmlPreviewFence(fragment), null);
  assert.equal(extractStandaloneHtmlPreviewFence(multipleFences), null);
});

test('detectArtifactContent keeps rich inline HTML Markdown editable', () => {
  const styledText =
    '<span style="font-family: &quot;MornDraft Serif SC&quot;, &quot;Noto Serif SC&quot;, &quot;Source Han Serif SC&quot;, &quot;Songti SC&quot;, &quot;SimSun&quot;, serif">Alpha beta</span>';
  const styledTable = [
    styledText,
    '',
    '| A | B |',
    '| --- | --- |',
    `| ${styledText} | two |`,
  ].join('\n');
  const styledHeading = [
    '# <span style="font-size: 12px">Title</span>',
    '',
    '<span style="font-size: 15px">Alpha beta</span>',
  ].join('\n');

  assert.equal(detectArtifactContent(styledText).primaryType, 'markdown');
  assert.equal(detectArtifactContent(styledTable).primaryType, 'markdown');
  assert.equal(detectArtifactContent(styledHeading).primaryType, 'markdown');
});

test('detectArtifactContent routes pure HTML and pure Mermaid to preview blocks', () => {
  assert.equal(detectArtifactContent('<input value="hello">').primaryType, 'html');
  assert.equal(detectArtifactContent('%% comment\nC4Context\nPerson(user, "User")').primaryType, 'mermaid');
});

test('isImageResourceUrl recognizes common image URL extensions', () => {
  assert.equal(isImageResourceUrl('https://example.com/card.JPG'), true);
  assert.equal(isImageResourceUrl('https://example.com/card.webp?size=large#preview'), true);
  assert.equal(isImageResourceUrl('https://example.com/icon.tiff'), true);
  assert.equal(isImageResourceUrl('https://example.com/page.html'), false);
  assert.equal(isImageResourceUrl('ftp://example.com/card.png'), false);
});

test('isPureImageArtifactSource recognizes only standalone image sources', () => {
  assert.equal(isPureImageArtifactSource('https://example.com/card.png'), true);
  assert.equal(isPureImageArtifactSource('![card](https://example.com/card.webp?size=large)'), true);
  assert.equal(getStrictStandaloneImageUrl('![card](https://example.com/card.webp "Chart")'), 'https://example.com/card.webp');
  assert.equal(isPureImageArtifactSource('<img alt="card" src="https://example.com/card.svg">'), true);
  assert.equal(getStrictStandaloneImageUrl('example.com/card.png'), 'https://example.com/card.png');
  assert.equal(isPureImageArtifactSource('Intro\nhttps://example.com/card.png'), false);
  assert.equal(isPureImageArtifactSource('![card](https://example.com/card.png)\n\nCaption'), false);
  assert.equal(isPureImageArtifactSource('https://example.com/page.html'), false);
});

test('isEmbeddableResourceUrl recognizes http and https resources', () => {
  assert.equal(isEmbeddableResourceUrl('https://example.com'), true);
  assert.equal(isEmbeddableResourceUrl('https://example.com/preview'), true);
  assert.equal(isEmbeddableResourceUrl('http://192.168.1.5/dashboard.php?room=1'), true);
  assert.equal(isEmbeddableResourceUrl('https://example.com/file.pdf'), true);
  assert.equal(isEmbeddableResourceUrl('www.baidu.com'), true);
  assert.equal(isEmbeddableResourceUrl('baidu.com'), true);
  assert.equal(isEmbeddableResourceUrl('127.0.0.1:3003/morndraft/'), true);
  assert.equal(isEmbeddableResourceUrl('localhost:3000'), true);
  assert.equal(isEmbeddableResourceUrl('ftp://example.com/file.pdf'), false);
});

test('normalizeEmbeddableResourceUrl repairs common missing URL prefixes', () => {
  assert.equal(normalizeEmbeddableResourceUrl('www.baidu.com'), 'https://www.baidu.com/');
  assert.equal(normalizeEmbeddableResourceUrl('baidu.com'), 'https://baidu.com/');
  assert.equal(normalizeEmbeddableResourceUrl('https:www.baidu.com'), 'https://www.baidu.com/');
  assert.equal(normalizeEmbeddableResourceUrl('127.0.0.1:3003/morndraft/'), 'http://127.0.0.1:3003/morndraft/');
  assert.equal(normalizeEmbeddableResourceUrl('localhost:3000'), 'http://localhost:3000/');
  assert.equal(normalizeEmbeddableResourceUrl('ftp://example.com/file.pdf'), '');
});

test('normalizeEmbeddableResourceUrl resolves relative URLs when the browser location is available', () => {
  const previousLocation = globalThis.location;
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: new globalThis.URL('http://127.0.0.1:7891/morndraft/index.html'),
  });

  try {
    assert.equal(
      normalizeEmbeddableResourceUrl('./html-preview-sample.html'),
      'http://127.0.0.1:7891/morndraft/html-preview-sample.html',
    );
  } finally {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: previousLocation,
    });
  }
});

test('preprocessResourceLinks keeps bare non-image links as links', () => {
  const input = [
    'Intro',
    'https://example.com',
    'http://192.168.1.10/status.php?panel=1',
    'https://example.com/file.pdf',
    'Outro',
  ].join('\n');
  assert.equal(preprocessResourceLinks(input), input);
});

test('preprocessResourceLinks keeps inline non-image links in the paragraph', () => {
  const input = 'See https://example.com/path in text';
  assert.equal(preprocessResourceLinks(input), input);
});

test('preprocessResourceLinks renders bare and Markdown image links as images', () => {
  const input = [
    'https://placehold.co/320x180.png',
    'https://example.com/standalone.png',
    'Inline https://example.com/card.png?x=1 works.',
    '[image label](https://example.com/card.webp)',
    '[image title](https://example.com/chart.webp "Chart")',
    '![alt text](https://example.com/photo.avif)',
    '![alt title](https://example.com/photo.png "Photo title")',
    "![alt single](https://example.com/photo.png 'Photo title')",
    '<img src="https://example.com/card.jpg">',
  ].join('\n');
  const processed = preprocessResourceLinks(input);

  assert.match(processed, /^!\[\]\(https:\/\/placehold\.co\/320x180\.png\)$/m);
  assert.match(processed, /^!\[\]\(https:\/\/example\.com\/standalone\.png\)$/m);
  assert.match(processed, /Inline !\[\]\(https:\/\/example\.com\/card\.png\?x=1\) works\./);
  assert.match(processed, /!\[image label]\(https:\/\/example\.com\/card\.webp\)/);
  assert.match(processed, /!\[image title]\(https:\/\/example\.com\/chart\.webp "Chart"\)/);
  assert.match(processed, /!\[alt text]\(https:\/\/example\.com\/photo\.avif\)/);
  assert.match(processed, /!\[alt title]\(https:\/\/example\.com\/photo\.png "Photo title"\)/);
  assert.match(processed, /!\[alt single]\(https:\/\/example\.com\/photo\.png 'Photo title'\)/);
  assert.match(processed, /<img src="https:\/\/example\.com\/card\.jpg">/);
});

test('preprocessResourceLinks keeps Markdown non-image links as links', () => {
  const input = '[打开 MornDraft](http://127.0.0.1:3003/morndraft/)';
  assert.equal(preprocessResourceLinks(input), input);
});

test('preprocessResourceLinks ignores links inside fenced code blocks', () => {
  const input = '```md\nhttps://example.com\nhttps://example.com/card.png\n```';
  assert.equal(preprocessResourceLinks(input), input);
});

test('preprocessResourceLinks does not rewrite raw HTML src and href attributes', () => {
  const input = '<a href="https://example.com">Link</a><img src="https://example.com/card.jpg">';
  assert.equal(preprocessResourceLinks(input), input);
});

test('preprocessResourceLinks treats removed html-panel blocks as ordinary code', () => {
  const input = '```html-panel\nhttp://127.0.0.1:3003/morndraft/\n```';
  assert.equal(preprocessResourceLinks(input), input);
});

test('getStrictStandaloneResourceUrl accepts only one embeddable URL line', () => {
  assert.equal(
    getStrictStandaloneResourceUrl('127.0.0.1:3003/morndraft/'),
    'http://127.0.0.1:3003/morndraft/',
  );
  assert.equal(
    getStrictStandaloneResourceUrl('https://example.com/panel\n<div>extra</div>'),
    '',
  );
  assert.equal(getStrictStandaloneResourceUrl('https://example.com/panel.'), '');
  assert.equal(getStrictStandaloneResourceUrl('ftp://example.com/panel'), '');
});
