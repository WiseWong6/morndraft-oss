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
  assert.match(implementationSources, /reversible=\{isPublicMarkdownNodeSafelyEditable\(node\)\}/u);
  assert.doesNotMatch(implementationSources, /event\.currentTarget\.textContent\s*=/u);
  assert.match(implementationSources, /isEditing && document\.kind !== 'markdown'/u);
  assert.match(implementationSources, /data-public-final-editable/u);
  assert.match(implementationSources, /const PublicHtmlFrame = React\.memo/u);
  assert.match(implementationSources, /key=\{`html-\$\{index\}`\}/u);
  assert.match(implementationSources, /PublicFlatFinalEditor/u);
  assert.match(implementationSources, /patchMornDraftFlatSourceValues/u);
  assert.match(implementationSources, /replacePublicFenceSegmentContent/u);
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
