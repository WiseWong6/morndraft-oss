import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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

test('OSS about dialog restores the commercial AboutModal structure with support QR', () => {
  const publicShell = read('../../../components/public-desktop/PublicDesktopMornDraftShell.tsx');
  const aboutModal = read('../../../components/AboutModal.tsx');
  const releaseCss = read('./release.css');

  assert.match(publicShell, /<AboutModal/);
  assert.match(publicShell, /showEnterpriseInfo=\{releaseConfig\.showAboutEnterpriseInfo\}/);
  assert.match(publicShell, /showSupportQr=\{releaseConfig\.showAboutSupportQr\}/);
  assert.match(publicShell, /t=\{t\.about\}/);
  assert.doesNotMatch(publicShell, /analyticsDisclosure|COPYRIGHT_NOTICE/);
  assert.match(aboutModal, /t\.problemTitle/);
  assert.match(aboutModal, /t\.problems\.map/);
  assert.match(aboutModal, /t\.confirm/);
  assert.match(aboutModal, /morndraft-about-confirm/);
  assert.match(releaseCss, /\.morndraft-about-confirm\s*\{[\s\S]*?color:\s*#fff/);
  assert.match(aboutModal, /aria-label=\{t\.close\}/);
  assert.match(aboutModal, /reward\.jpg/);
  assert.match(aboutModal, /qrcode\.jpg/);
  assert.match(aboutModal, /t\.coffeeTitle/);
  assert.match(aboutModal, /t\.followTitle/);
  assert.match(aboutModal, /resolveMornDraftStaticAssetUrl/);
  assert.match(aboutModal, /event\.key === 'Escape'/);
  assert.match(aboutModal, /onClick=\{onClose\}/);
  assert.match(aboutModal, /role="dialog"/);
  assert.match(aboutModal, /aria-modal="true"/);
});

test('OSS toolbar exposes a direct, localized home link before the MornDraft wordmark', () => {
  const publicShell = read('../../../components/public-desktop/PublicDesktopMornDraftShell.tsx');
  const workspaceCss = read('../../../components/public-workspace/public-workspace.css');

  assert.match(publicShell, /className="md-public-home-link"/);
  assert.match(publicShell, /href="\/"/);
  assert.match(publicShell, /返回 Wise Wong 主站/);
  assert.match(publicShell, /Back to Wise Wong home/);
  assert.match(publicShell, /<House size=\{16\}/);
  assert.match(publicShell, /md-public-home-link[\s\S]*WorkspaceBrandMark/);
  assert.doesNotMatch(publicShell, /history\.(?:back|go)/);
  assert.match(workspaceCss, /\.md-public-home-link/);
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

test('OSS shared shell keeps Source truth, local title derivation, delivery and copyright footer', () => {
  const publicApp = read('./PublicAppImpl.tsx');
  const shell = read('../../../components/public-desktop/PublicDesktopMornDraftShell.tsx');
  const finalPreview = read('../../../components/public-desktop/PublicSharedFinalPreview.tsx');
  const compliance = read('../../../components/public-workspace/PublicComplianceFooter.tsx');
  const complianceText = read('../../../components/public-workspace/publicCompliance.ts');

  assert.match(publicApp, /const \[source, setSource\]/);
  assert.match(publicApp, /derivePublicImportedDocumentTitle\(source, locale, importedFileTitle\)/);
  assert.match(shell, /onSourceChange/);
  assert.match(shell, /createLocalEditorImportImageAssetResolver/);
  assert.match(shell, /PublicDeliveryToolbar/);
  assert.match(finalPreview, /PreviewFormatToolbar/);
  assert.match(shell, /complianceFooter=\{<PublicComplianceFooter onAboutOpen=\{\(\) => setIsAboutOpen\(true\)\} \/>\}/);
  assert.match(finalPreview, /\{complianceFooter\}/);
  assert.match(compliance, /aria-label="MornDraft 版权信息"/);
  // The copyright notice doubles as the About dialog trigger.
  assert.match(compliance, /onAboutOpen\?\(\): void/);
  assert.match(compliance, /aad-preview-copyright-button/);
  // The analytics disclosure lives in the About dialog, not the page footer.
  assert.doesNotMatch(compliance, /匿名访问统计|analytics-disclosure/);
  assert.doesNotMatch(compliance, /深圳明日回声科技有限公司/);
  assert.doesNotMatch(`${compliance}\n${complianceText}`, /ICP备|公安网安备|公网安备/);
  assert.match(complianceText, /© 2026 深圳明日回声科技有限公司/);
});
test('OSS entry page ships the static SEO layer', () => {
  const page = read('../index.html');

  // Crawlers must get real text without executing the SPA.
  assert.doesNotMatch(page, /skeleton-brand/);
  assert.doesNotMatch(page, /skeleton-tagline/);
  assert.match(page, /<noscript>[\s\S]*?<h1>MornDraft 初稿 - Agent 产物交付编辑器<\/h1>/);
  assert.match(page, /<meta name="description" content="MornDraft 初稿是面向 Agent 产物的交付编辑器/);
  assert.match(page, /<meta name="keywords" content="MornDraft,初稿,/);
  assert.doesNotMatch(page, /ICP备|公安网安备|公网安备/);
  assert.match(page, /<meta name="robots" content="index,follow"/);
  assert.doesNotMatch(page, /baidu[_-](?:union|site|verify)|hm\.baidu\.com|_hmt/i);
  assert.match(page, /<link rel="canonical" href="https:\/\/morndraft\.com\/" \/>/);
  // Social cards.
  assert.match(page, /<meta property="og:image" content="https:\/\/morndraft\.com\/og-cover\.png" \/>/);
  assert.match(page, /<meta name="twitter:card" content="summary"/);
  // Structured data.
  assert.match(page, /<script type="application\/ld\+json">/);
  assert.match(page, /"@type": "WebApplication"/);
  assert.match(page, /"alternateName": "初稿"/);
  assert.match(page, /深圳明日回声科技有限公司/);
  // The skeleton keeps the loading visuals; the SEO layer must not remove them.
  assert.match(page, /class="skeleton-app" aria-hidden="true"/);
  assert.match(page, /class="skeleton-bar/);
});

test('OSS sitemap and robots stay crawlable with a dated sitemap', () => {
  const robots = read('../../../public/robots.txt');
  const sitemap = read('../../../public/sitemap.xml');

  assert.match(robots, /User-agent: \*[\s\S]*?Allow: \//);
  assert.match(robots, /Sitemap: https:\/\/morndraft\.com\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/morndraft\.com\/<\/loc>/);
  assert.match(sitemap, /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
});

test('OSS release does not ship Baidu analytics or verification remnants', () => {
  const page = read('../index.html');
  const manifest = read('../../../profiles/oss-public-distribution.json');

  assert.doesNotMatch(page, /baidu[_-](?:union|site|verify)|hm\.baidu\.com|_hmt/i);
  assert.doesNotMatch(manifest, /baidu_verify_codeva/i);
  assert.equal(existsSync(new URL('../../../public/baidu_verify_codeva-pSX2jJB9B0.html', import.meta.url)), false);
});

test('OSS preview chrome matches the 7.10 toolbar contract', () => {
  const shell = read('../../../components/public-desktop/PublicDesktopMornDraftShell.tsx');
  const finalPreview = read('../../../components/public-desktop/PublicSharedFinalPreview.tsx');
  const deliveryToolbar = read('../../../components/public-workspace/PublicDeliveryToolbar.tsx');
  const page = read('../index.html');

  assert.match(page, /<title>初稿-Morndraft<\/title>/);
  assert.match(page, /class="skeleton-app"/);
  assert.match(page, /class="skeleton-final-pane"/);
  assert.doesNotMatch(page, /skeleton-source-pane/);
  assert.doesNotMatch(page, /matchMedia/);
  assert.match(shell, /aad-toolbar md-oss-shared-toolbar/);
  assert.match(shell, /aad-workspace-mode-switch is-final/);
  assert.match(shell, /data-commercial-workspace-mode/);
  assert.match(shell, /aad-toolbar-title">\{t\.preview\.title\}/);
  assert.match(shell, /<TextMetricsInline/);
  assert.match(
    read('../../../components/public-desktop/usePublicVisiblePreviewMetrics.ts'),
    /compactCharacters: formatCompactCount\(next\.characters\)[\s\S]*?compactTokens: formatCompactCount\(next\.estimatedTokens\)/,
  );
  assert.match(shell, /<TextSearchControl/);
  assert.doesNotMatch(shell, /buttonLabel="Syntax"/);
  assert.doesNotMatch(shell, /buttonLabel="More"/);
  assert.match(deliveryToolbar, /aad-preview-copy-button/);
  assert.match(deliveryToolbar, /aad-preview-share-button/);
  assert.match(deliveryToolbar, /isCopy \? labels\.copyMenu : labels\.exportMenu/);
  assert.match(deliveryToolbar, /copyMenu: '复制', exportMenu: '导出'/);
  assert.match(finalPreview, /PreviewDeliveryDisplayControls/);
  assert.match(finalPreview, /a4PaginationLabel=\{t\.preview\.deliveryA4Pagination\}/);
  assert.match(finalPreview, /codeChromeLabel=\{t\.preview\.deliveryCode\}/);
  assert.match(finalPreview, /usePreviewA4Pagination/);
  assert.match(finalPreview, /ArtifactMapShell/);
  assert.match(finalPreview, /applyPreviewSearchTextHighlights/);
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
