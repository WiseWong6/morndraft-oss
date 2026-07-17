import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createPublicMermaidSandboxDocument,
  sanitizePublicMermaidSvg,
} from '../../../components/public-workspace/publicMermaidSecurity';
import { detectPublicDocument, normalizePublicFenceLanguage } from '../../../components/public-workspace/publicDocument';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('OSS entry mounts the shared App facade with a fail-closed public composition', () => {
  const entry = read('./index.ts');
  const app = read('../../../App.tsx');
  const publicApp = read('./PublicAppImpl.tsx');
  const adapters = read('./releaseAdapters.ts');
  const deliveryAdapter = read('./publicDeliveryAdapter.ts');
  const workspace = read('../../../components/public-workspace/PublicWorkspace.tsx');
  const publicDialog = read('../../../components/public-workspace/PublicDialog.tsx');
  const preview = read('../../../components/public-workspace/PublicFinalPreview.tsx');

  assert.match(entry, /import App from '\.\.\/\.\.\/\.\.\/App'/);
  assert.match(entry, /App,/);
  assert.match(app, /import ReleaseApp from '@morndraft\/release-app'/);
  assert.doesNotMatch(`${entry}\n${publicApp}\n${adapters}\n${workspace}\n${preview}`, /ArtifactPreview|AccountMenu|billing|\/api\//);
  assert.match(publicApp, /data-public-release-app="true"/);
  assert.match(publicApp, /<PublicWorkspace/);
  assert.match(adapters, /createPublicAiAdapter/);
  assert.match(adapters, /auth: Object\.freeze\(\{ mode: 'none' \}\)/);
  assert.match(adapters, /persistence: Object\.freeze\(\{[\s\S]*?mode: 'memory'/);
  assert.match(adapters, /telemetry: Object\.freeze\(\{[\s\S]*?mode: 'noop'/);
  assert.match(adapters, /linkSharing: Object\.freeze\(\{ mode: 'hidden' \}\)/);
  assert.doesNotMatch(adapters, /createBrowserPublicDeliveryAdapter/);
  assert.match(adapters, /import\('\.\/publicDeliveryAdapter'\)/);
  assert.match(deliveryAdapter, /createBrowserPublicDeliveryAdapter/);
  assert.match(publicApp, /<PublicAiSettingsForm/);
  assert.match(publicApp, /deliveryAdapter=\{adapters\.delivery\}/);
  assert.match(publicApp, /onAiSettingsOpen=\{openAiSettings\}/);
  assert.match(workspace, /const closeMenus = useCallback/u);
  assert.match(workspace, /const closeMoreForDialog = useCallback/u);
  assert.match(publicDialog, /openerDetails && !openerDetails\.open/u);
  assert.match(workspace, /moreMenuRef\.current\.open = false/u);
  assert.match(workspace, /onClick=\{openAbout\}/u);
  assert.match(preview, /sandbox="allow-scripts"/);
  assert.doesNotMatch(preview, /allow-same-origin/);
});

test('OSS release App gives the public workspace a definite viewport height', () => {
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
  assert.match(config, /PUBLIC_AI_DEEPSEEK_PRESET/);
  assert.doesNotMatch(`${publicApp}\n${adapters}\n${client}\n${config}`, /MornDraft API|\/api\/ai|quota|usageLedger/);
});

test('OSS release App keeps the 7·10 workspace geometry and production filing', () => {
  const workspace = read('../../../components/public-workspace/PublicWorkspace.tsx');
  const preview = read('../../../components/public-workspace/PublicFinalPreview.tsx');
  const compliance = read('../../../components/public-workspace/PublicComplianceFooter.tsx');
  const filing = read('../../../components/public-workspace/publicCompliance.ts');
  const styles = read('../../../components/public-workspace/public-workspace.css');

  assert.match(workspace, /aad-commercial-workspace-shell is-public-workspace/);
  assert.match(workspace, /aad-workspace-mode-switch/);
  assert.match(workspace, /morndraft-wordmark-dark\.webp/);
  assert.match(workspace, /<PublicFormatToolbar/);
  assert.match(preview, /aad-document-surface/);
  assert.match(preview, /<PublicComplianceFooter \/>/);
  assert.match(compliance, /aria-label="网站备案信息"/);
  assert.match(compliance, /© 2026 深圳明日回声科技有限公司/);
  assert.match(filing, /粤ICP备2026082169号-1/);
  assert.match(filing, /粤公网安备44030002014257号/);
  assert.match(styles, /--aad-preview-live-page-width: 794px/);
  assert.match(styles, /grid-template-rows: 48px 42px minmax\(0, 1fr\)/);
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
  const diagram = read('../../../components/public-workspace/PublicFinalPreview.tsx');
  assert.match(security, /securityLevel: 'strict'/);
  assert.match(security, /htmlLabels: false/);
  assert.match(diagram, /sandbox=""/);
  assert.match(diagram, /import\('\.\/publicMermaidSecurity'\)/);
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
