import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createOssMermaidSandboxDocument, sanitizeOssMermaidSvg } from './mermaidSecurity';
import { detectOssDocument, getEmbeddedFenceKind } from './ossDocument';
import { normalizeOssAiModels, validateOssAiBaseUrl } from './ossAiSettings';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('OSS entry mounts an independent public shell without commercial imports', () => {
  const entry = read('./index.ts');
  const shell = read('./OssShell.tsx');
  const preview = read('./OssPreview.tsx');
  const brand = read('./OssBrandCluster.tsx');

  assert.match(entry, /import OssShell from '\.\/OssShell'/);
  assert.match(entry, /App: OssShell/);
  assert.doesNotMatch(`${entry}\n${shell}\n${preview}\n${brand}`, /AppImpl|ArtifactPreview|AccountMenu|billing|hosted-link|\/api\//);
  assert.match(shell, /data-oss-shell="public"/);
  assert.match(preview, /sandbox="allow-scripts"/);
  assert.doesNotMatch(preview, /allow-same-origin/);
  assert.match(brand, /oss-brand/);
});

test('OSS dialogs trap keyboard focus, close on Escape, inert the shell, and restore the opener', () => {
  const dialog = read('./OssDialog.tsx');
  const shell = read('./OssShell.tsx');
  const aiSettings = read('./OssAiSettingsDialog.tsx');

  assert.match(dialog, /event\.key === 'Escape'/);
  assert.match(dialog, /event\.key === 'Tab'/);
  assert.match(dialog, /shell\.inert = true/);
  assert.match(dialog, /shell\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(dialog, /opener\?\.focus\(\)/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /createPortal/);
  assert.match(shell, /<OssDialog[\s\S]*?data-oss-dialog-initial-focus/);
  assert.match(aiSettings, /<OssDialog[\s\S]*?data-oss-dialog-initial-focus/);
});

test('OSS document routing keeps HTML in an explicit sandbox path', () => {
  assert.deepEqual(detectOssDocument('```html\n<!doctype html><html></html>\n```'), {
    kind: 'html',
    content: '<!doctype html><html></html>',
  });
  assert.equal(detectOssDocument('{"ok":true}').kind, 'json');
  assert.equal(detectOssDocument('flowchart LR\nA-->B').kind, 'mermaid');
  assert.equal(detectOssDocument('# Markdown').kind, 'markdown');
  assert.equal(getEmbeddedFenceKind('language-html-preview'), 'html');
  assert.equal(getEmbeddedFenceKind('language-iframe-html'), null);
});

test('OSS source downloads unwrap standalone HTML, JSON, and Mermaid fences', () => {
  const shell = read('./OssShell.tsx');
  assert.match(
    shell,
    /const detected = detectOssDocument\(source\);[\s\S]*?const payload = detected\.kind === 'markdown' \? source : detected\.content;[\s\S]*?new Blob\(\[payload\]/,
  );

  const cases = [
    {
      source: '```html\n<!doctype html><html><body>hello</body></html>\n```',
      kind: 'html',
      payload: '<!doctype html><html><body>hello</body></html>',
    },
    {
      source: '```json\n{"ok":true}\n```',
      kind: 'json',
      payload: '{"ok":true}',
    },
    {
      source: '```mermaid\nflowchart LR\nA-->B\n```',
      kind: 'mermaid',
      payload: 'flowchart LR\nA-->B',
    },
  ] as const;

  for (const fixture of cases) {
    const document = detectOssDocument(fixture.source);
    assert.equal(document.kind, fixture.kind);
    assert.equal(document.content, fixture.payload);
  }
});

test('OSS AI settings are vendor-neutral by default and fail closed on unsafe URLs', () => {
  assert.deepEqual(validateOssAiBaseUrl('https://models.example.com/v1/'), {
    baseUrl: 'https://models.example.com/v1',
    origin: 'https://models.example.com',
  });
  assert.equal(validateOssAiBaseUrl('http://localhost:11434/v1').origin, 'http://localhost:11434');
  assert.throws(() => validateOssAiBaseUrl('http://models.example.com/v1'), /base_url_https/);
  assert.throws(() => validateOssAiBaseUrl('https://token@models.example.com/v1'), /base_url_credentials/);
  assert.throws(() => validateOssAiBaseUrl('https://models.example.com/v1?secret=1'), /base_url_query_or_fragment/);
  assert.deepEqual(normalizeOssAiModels('model-a, model-a, model-b'), ['model-a', 'model-b']);
  assert.doesNotMatch(read('./OssShell.tsx'), /deepseek/i);
});

test('OSS Mermaid policy sandboxes rendering and strictly sanitizes executable SVG', () => {
  const security = read('./mermaidSecurity.ts');
  const diagram = read('./MermaidDiagram.tsx');
  assert.match(security, /securityLevel: 'sandbox'/);
  assert.match(security, /htmlLabels: false/);
  assert.match(diagram, /sandbox=""/);
  assert.doesNotMatch(diagram, /dangerouslySetInnerHTML/);
  assert.throws(
    () => sanitizeOssMermaidSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    /forbidden script element/,
  );
  assert.throws(
    () => sanitizeOssMermaidSvg('<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>'),
    /forbidden a element/,
  );
  assert.match(
    sanitizeOssMermaidSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1" /></svg>'),
    /<path/,
  );
  const isolated = createOssMermaidSandboxDocument(
    '<svg xmlns="http://www.w3.org/2000/svg"><style>body,.oss-app{display:none!important}</style><text>x</text></svg>',
    'light',
  );
  assert.match(isolated, /body,.oss-app\{display:none!important\}/);
  assert.match(isolated, /Content-Security-Policy/);
});
