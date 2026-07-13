import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createPublicMermaidSandboxDocument,
  sanitizePublicMermaidSvg,
} from '../../../components/public-workspace/publicMermaidSecurity';
import { detectPublicDocument, normalizePublicFenceLanguage } from '../../../components/public-workspace/publicDocument';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('OSS entry mounts an independent public shell without commercial imports', () => {
  const entry = read('./index.ts');
  const shell = read('./OssShell.tsx');
  const workspace = read('../../../components/public-workspace/PublicWorkspace.tsx');
  const preview = read('../../../components/public-workspace/PublicFinalPreview.tsx');

  assert.match(entry, /import OssShell from '\.\/OssShell'/);
  assert.match(entry, /App: OssShell/);
  assert.doesNotMatch(`${entry}\n${shell}\n${workspace}\n${preview}`, /AppImpl|ArtifactPreview|AccountMenu|billing|hosted-link|\/api\//);
  assert.match(shell, /data-oss-shell="public"/);
  assert.match(shell, /<PublicWorkspace/);
  assert.match(shell, /createPublicAiAdapter/);
  assert.match(shell, /<PublicAiSettingsForm/);
  assert.match(shell, /onAiSettingsOpen=\{openAiSettings\}/);
  assert.match(preview, /sandbox="allow-scripts"/);
  assert.doesNotMatch(preview, /allow-same-origin/);
});

test('OSS browser AI stays direct, role-based, local, and opt-in', () => {
  const shell = read('./OssShell.tsx');
  const client = read('../../../packages/features-personal/src/ai/client.ts');
  const config = read('../../../packages/features-personal/src/ai/config.ts');
  assert.match(config, /\/chat\/completions/);
  assert.match(client, /authorization: `Bearer \$\{config\.apiKey\.trim\(\)\}`/);
  assert.match(client, /stream: false/);
  assert.match(client, /getPublicAiModelRole/);
  assert.match(config, /PUBLIC_AI_CONFIG_SESSION_STORAGE_KEY/);
  assert.match(config, /persistApiKey/);
  assert.match(config, /PUBLIC_AI_DEEPSEEK_PRESET/);
  assert.doesNotMatch(`${shell}\n${client}\n${config}`, /MornDraft API|\/api\/ai|quota|usageLedger/);
});

test('OSS document routing keeps HTML in an explicit sandbox path', () => {
  assert.deepEqual(detectPublicDocument('```html\n<!doctype html><html></html>\n```'), {
    kind: 'html',
    content: '<!doctype html><html></html>',
    fence: { opening: '```html', closing: '```' },
  });
  assert.equal(detectPublicDocument('{ready:true,}').kind, 'json');
  assert.equal(detectPublicDocument('flowchart LR\nA-->B').kind, 'mermaid');
  assert.equal(detectPublicDocument('# Markdown').kind, 'markdown');
  assert.equal(normalizePublicFenceLanguage('HTML-Preview extra'), 'html-preview');
  assert.equal(normalizePublicFenceLanguage('iframe-html'), 'iframe-html');
});

test('OSS Mermaid policy sandboxes rendering and strictly sanitizes executable SVG', () => {
  const security = read('../../../components/public-workspace/publicMermaidSecurity.ts');
  const diagram = read('../../../components/public-workspace/PublicFinalPreview.tsx');
  assert.match(security, /securityLevel: 'strict'/);
  assert.match(security, /htmlLabels: false/);
  assert.match(diagram, /sandbox=""/);
  assert.doesNotMatch(diagram, /dangerouslySetInnerHTML/);
  assert.throws(
    () => sanitizePublicMermaidSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    /forbidden script element/,
  );
  assert.throws(
    () => sanitizePublicMermaidSvg('<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>'),
    /forbidden a element/,
  );
  assert.match(
    sanitizePublicMermaidSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1" /></svg>'),
    /<path/,
  );
  const isolated = createPublicMermaidSandboxDocument(
    '<svg xmlns="http://www.w3.org/2000/svg"><style>body,.oss-app{display:none!important}</style><text>x</text></svg>',
    'light',
  );
  assert.match(isolated, /body,.oss-app\{display:none!important\}/);
  assert.match(isolated, /Content-Security-Policy/);
});
