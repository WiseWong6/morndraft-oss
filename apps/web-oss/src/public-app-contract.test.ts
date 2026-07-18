import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createPublicMermaidSandboxDocument,
  sanitizePublicMermaidSvg,
} from '../../../components/public-workspace/publicMermaidSecurity';
import { detectPublicDocument, normalizePublicFenceLanguage } from '../../../components/public-workspace/publicDocument';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('OSS entry mounts the shared desktop and Lexical Final chain with local-only adapters', () => {
  const entry = read('./index.ts');
  const app = read('../../../App.tsx');
  const publicApp = read('./PublicAppImpl.tsx');
  const adapters = read('./releaseAdapters.ts');
  const publicShell = read('../../../components/public-desktop/PublicDesktopMornDraftShell.tsx');
  const sharedFinal = read('../../../components/public-desktop/PublicSharedFinalPreview.tsx');

  assert.match(entry, /import App from '\.\.\/\.\.\/\.\.\/App'/);
  assert.match(app, /import ReleaseApp from '@morndraft\/release-app'/);
  assert.match(publicApp, /<DesktopMornDraftShell/);
  assert.doesNotMatch(publicApp, /PublicWorkspace/);
  assert.match(publicApp, /derivePublicImportedDocumentTitle/);
  assert.match(publicApp, /data-public-release-app="true"/);
  assert.match(publicShell, /data-shared-desktop-shell/);
  assert.match(publicShell, /<Editor/);
  assert.match(publicShell, /<PublicSharedFinalPreview/);
  assert.match(publicShell, /useEditorImportDropZone/);
  assert.match(sharedFinal, /MarkdownDocumentRenderer/);
  assert.match(sharedFinal, /usePreviewMarkdownEditing/);
  assert.match(sharedFinal, /HtmlPreviewMountSchedulerProvider maxActiveMounts=\{2\}/);
  assert.match(adapters, /createPublicAiAdapter/);
  assert.match(adapters, /auth: Object\.freeze\(\{ mode: 'none' \}\)/);
  assert.match(adapters, /mode: 'memory'/);
  assert.match(adapters, /mode: 'noop'/);
  assert.match(adapters, /linkSharing: Object\.freeze\(\{ mode: 'hidden' \}\)/);
  assert.match(adapters, /import\('\.\/publicDeliveryAdapter'\)/);
  assert.doesNotMatch(`${publicApp}\n${adapters}\n${publicShell}\n${sharedFinal}`, /\/api\//);
});

test('OSS release App gives the shared workspace a definite viewport height', () => {
  const styles = read('./release.css');
  assert.match(styles, /\.oss-app\s*\{[\s\S]*?height:\s*100vh;[\s\S]*?height:\s*100dvh;/u);
  assert.match(styles, /\.oss-app\s*\{[\s\S]*?min-height:\s*100vh;[\s\S]*?min-height:\s*100dvh;/u);
});

test('OSS browser AI stays direct, role-based, local, and opt-in', () => {
  const publicApp = read('./PublicAppImpl.tsx');
  const adapters = read('./releaseAdapters.ts');
  const client = read('../../../packages/features-personal/src/ai/client.ts');
  const config = read('../../../packages/features-personal/src/ai/config.ts');
  assert.match(config, /\/chat\/completions/);
  assert.match(client, /authorization: `Bearer \$\{config\.apiKey\.trim\(\)\}`/);
  assert.match(client, /stream: false/);
  assert.match(client, /getPublicAiModelRole/);
  assert.match(config, /PUBLIC_AI_CONFIG_SESSION_STORAGE_KEY/);
  assert.match(config, /persistApiKey/);
  assert.doesNotMatch(`${publicApp}\n${adapters}\n${client}\n${config}`, /MornDraft API|\/api\/ai|usageLedger/);
});

test('OSS shared shell keeps Source truth, local title derivation, delivery and filing', () => {
  const publicApp = read('./PublicAppImpl.tsx');
  const shell = read('../../../components/public-desktop/PublicDesktopMornDraftShell.tsx');
  const finalPreview = read('../../../components/public-desktop/PublicSharedFinalPreview.tsx');
  const compliance = read('../../../components/public-workspace/PublicComplianceFooter.tsx');
  const filing = read('../../../components/public-workspace/publicCompliance.ts');

  assert.match(publicApp, /const \[source, setSource\]/);
  assert.match(publicApp, /derivePublicImportedDocumentTitle\(source, locale, importedFileTitle\)/);
  assert.match(shell, /onSourceChange/);
  assert.match(shell, /createLocalEditorImportImageAssetResolver/);
  assert.match(shell, /PublicDeliveryToolbar/);
  assert.match(finalPreview, /PreviewFormatToolbar/);
  assert.match(shell, /<PublicComplianceFooter \/>/);
  assert.match(compliance, /aria-label="网站备案信息"/);
  assert.match(filing, /粤ICP备2026082169号-1/);
  assert.match(filing, /粤公网安备44030002014257号/);
});

test('OSS document routing keeps HTML in an explicit sandbox path', () => {
  assert.deepEqual(detectPublicDocument('```html\n<!doctype html><html></html>\n```'), {
    kind: 'html',
    content: '<!doctype html><html></html>',
    fence: {
      opening: '```html',
      closing: '```',
      marker: '```',
      openingLineBreak: '\n',
      closingLineBreak: '\n',
    },
  });
  assert.equal(detectPublicDocument('{ready:true,}').kind, 'json');
  assert.equal(detectPublicDocument('flowchart LR\nA-->B').kind, 'mermaid');
  assert.equal(detectPublicDocument('# Markdown').kind, 'markdown');
  assert.equal(normalizePublicFenceLanguage('HTML-Preview extra'), 'html-preview');
  assert.equal(normalizePublicFenceLanguage('iframe-html'), 'iframe-html');
});

test('OSS Mermaid policy sandboxes rendering and strictly sanitizes executable SVG', () => {
  const security = read('../../../components/public-workspace/publicMermaidSecurity.ts');
  const sharedRenderer = read('../../../utils/mermaid-renderer.js');
  assert.match(security, /securityLevel: 'strict'/);
  assert.match(security, /htmlLabels: false/);
  assert.match(sharedRenderer, /sanitizeMermaidSvg/);
  assert.throws(
    () => sanitizePublicMermaidSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    /forbidden script element/,
  );
  assert.throws(
    () => sanitizePublicMermaidSvg('<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a></svg>'),
    /forbidden a element/,
  );
  const isolated = createPublicMermaidSandboxDocument(
    '<svg xmlns="http://www.w3.org/2000/svg"><style>body,.oss-app{display:none!important}</style><text>x</text></svg>',
    'light',
  );
  assert.match(isolated, /Content-Security-Policy/);
});
