import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const implementationSources = readdirSync(directory)
  .filter((name) => ['.ts', '.tsx'].includes(extname(name)) && !name.endsWith('.test.ts'))
  .map((name) => readFileSync(join(directory, name), 'utf8'))
  .join('\n');
const finalPreviewSource = readFileSync(join(directory, 'PublicFinalPreview.tsx'), 'utf8');
const publicImportSource = readFileSync(join(directory, 'publicImport.ts'), 'utf8');
const publicDistribution = JSON.parse(
  readFileSync(join(directory, '../../profiles/oss-public-distribution.json'), 'utf8'),
) as { copyFiles: string[] };
const publicAiSourceKindSource = readFileSync(
  join(directory, '../../packages/features-personal/src/ai/sourceKind.ts'),
  'utf8',
);

test('public workspace stays independent from full application and restricted subsystems', () => {
  const forbidden = [
    /AppImpl/u,
    /DraftSidebar/u,
    /utils\/analytics/u,
    /apps\/api/u,
    /useAuthenticated/u,
    /\/api\//u,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(implementationSources, pattern);
});

test('public workspace imports no root application component', () => {
  assert.doesNotMatch(implementationSources, /from ['"]\.\.\/[^.]/u);
  assert.doesNotMatch(implementationSources, /from ['"]@morndraft\/core['"]/u);
  assert.doesNotMatch(publicAiSourceKindSource, /from ['"]@morndraft\/core['"]/u);
  assert.match(publicAiSourceKindSource, /from ['"]@morndraft\/core\/oss-public['"]/u);
});

test('document image parsers stay behind the asynchronous import action', () => {
  assert.doesNotMatch(
    implementationSources,
    /^import .*['"](?:entities(?:\/decode)?|micromark|micromark-util-decode-string|parse5)['"];?$/mu,
  );
  assert.match(publicImportSource, /import\('micromark'\)/u);
  assert.match(publicImportSource, /import\('micromark-util-decode-string'\)/u);
  assert.match(publicImportSource, /import\('\.\/publicImportHtml'\)/u);
  assert.match(publicImportSource, /import\('\.\/publicImportMarkdownBudget'\)/u);
  assert.ok(publicDistribution.copyFiles.includes('components/public-workspace/publicImportHtml.ts'));
  assert.ok(publicDistribution.copyFiles.includes('components/public-workspace/publicImportMarkdownBudget.ts'));
  assert.match(implementationSources, /import\('entities\/decode'\)/u);
  assert.match(implementationSources, /import\('parse5'\)/u);
});

test('Mermaid never injects rendered SVG into the application document', () => {
  assert.doesNotMatch(implementationSources, /dangerouslySetInnerHTML/u);
  assert.match(implementationSources, /data-mermaid-security="strict-isolated"/u);
  assert.match(implementationSources, /sandbox=""/u);
  assert.match(implementationSources, /PUBLIC_MERMAID_MAX_SOURCE_LENGTH = 50_000/u);
  assert.match(implementationSources, /PUBLIC_MERMAID_MAX_SVG_LENGTH = 2_000_000/u);
});

test('Final uses rendered contenteditable blocks and keeps HTML frames stable', () => {
  assert.match(implementationSources, /contentEditable: canEditBlock/u);
  assert.match(
    implementationSources,
    /sourceReversible=\{isPublicMarkdownNodeSafelyEditable\(node\)\}/u,
  );
  assert.match(implementationSources, /canOwnEdit=\{!hasPublicMarkdownNestedEditableBlock\(node\)\}/u);
  assert.match(
    implementationSources,
    /const canEditBlock = editable && canPatch && sourceReversible && canOwnEdit/u,
  );
  assert.match(
    implementationSources,
    /'data-public-final-reversible': canPatch \? String\(sourceReversible\) : undefined/u,
  );
  assert.doesNotMatch(implementationSources, /event\.currentTarget\.textContent\s*=/u);
  assert.match(implementationSources, /isEditing && document\.kind !== 'markdown'/u);
  assert.match(implementationSources, /data-public-final-editable/u);
  assert.match(implementationSources, /browserEntityDecoder \?\?= document\.createElement\('textarea'\)/u);
  assert.match(implementationSources, /decoded !== null && decodedBrowserEntities\.size < PUBLIC_BROWSER_ENTITY_CACHE_MAX/u);
  assert.match(implementationSources, /insertOperationRef\.current !== operation \|\| latestSourceRef\.current !== requestSource/u);
  assert.match(implementationSources, /applyPublicInsert\(requestSource, requestTrigger, insertion\)/u);
  assert.match(implementationSources, /const PublicHtmlFrame = React\.memo/u);
  assert.match(implementationSources, /key=\{`html-\$\{index\}`\}/u);
  assert.match(implementationSources, /PublicFlatFinalEditor/u);
  assert.match(implementationSources, /patchMornDraftFlatSourceValues/u);
  assert.match(implementationSources, /replacePublicFenceSegmentContent/u);
  assert.match(
    finalPreviewSource,
    /content=\{source\.slice\(segment\.start, segment\.end\)\}/u,
    'ordinary raw and mixed Markdown fences must keep their exact wrapper in the editable Markdown path',
  );
});

test('public workspace exposes the browser-local AI interaction hooks', () => {
  for (const testId of [
    'oss-ai-settings-open',
    'oss-ai-generate',
    'oss-ai-modify',
    'oss-ai-summarize',
    'oss-ai-instruction',
    'oss-ai-result',
    'oss-ai-adopt',
  ]) {
    assert.match(implementationSources, new RegExp(`data-testid=["']${testId}["']`, 'u'), testId);
  }
});
