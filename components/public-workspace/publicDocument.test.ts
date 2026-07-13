import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPublicInsert,
  detectPublicDocument,
  findPublicSlashTrigger,
  formatPublicJson5,
  getPublicDocumentContentOffset,
  getPublicContentType,
  replacePublicFenceSegmentContent,
  serializePublicDocumentEdit,
  splitPublicDocumentSegments,
} from './publicDocument';

test('detectPublicDocument accepts real JSON5 containers', () => {
  const document = detectPublicDocument(`{
    // comment
    project: 'MornDraft',
    features: ['single-quotes', 'trailing-comma',],
  }`);
  assert.equal(document.kind, 'json');
  assert.match(formatPublicJson5(document.content), /"project": "MornDraft"/u);
  assert.equal(
    detectPublicDocument("// top comment\n{project:'MornDraft', trailing:true,}").kind,
    'json',
  );
  assert.equal(
    detectPublicDocument("/* top comment */\n['MornDraft',]").kind,
    'json',
  );
});

test('standalone JSON5 fence keeps its exact fence contract when Final edits content', () => {
  const source = "```JSON5\n{project:'MornDraft',}\n```";
  const document = detectPublicDocument(source);
  assert.equal(document.kind, 'json');
  assert.equal(serializePublicDocumentEdit(document, "{project:'Public',}"), "```JSON5\n{project:'Public',}\n```");
});

test('standalone fence records the exact content offset instead of searching repeated text', () => {
  const source = '\n  ```   JSON5  \nJSON5\n```  \n';
  const document = detectPublicDocument(source);
  assert.equal(document.kind, 'json');
  assert.equal(document.content, 'JSON5');
  assert.equal(getPublicDocumentContentOffset(source, document), source.lastIndexOf('JSON5'));
  assert.notEqual(getPublicDocumentContentOffset(source, document), source.indexOf(document.content));
  assert.equal(serializePublicDocumentEdit(document, 'JSON5'), source);
});

test('standalone Markdown fence exposes only its inner Markdown for exact Final patches', () => {
  const source = '```markdown\n# Original\n\nBody\n```';
  const document = detectPublicDocument(source);
  assert.equal(document.kind, 'markdown');
  assert.equal(document.content, '# Original\n\nBody');
  assert.equal(getPublicDocumentContentOffset(source, document), source.indexOf('# Original'));
});

test('mixed source splits supported fences while legacy morndraft remains ordinary code', () => {
  const source = [
    '# Mixed',
    '',
    '```json5',
    '{ok:true,}',
    '```',
    '',
    '```morndraft',
    '{layout:"flow"}',
    '```',
  ].join('\n');
  const segments = splitPublicDocumentSegments(source);
  const legacyFence = segments.find((segment) => segment.kind === 'fence' && segment.language === 'morndraft');
  assert.equal(getPublicContentType(source), 'mixed');
  assert.equal(segments.filter((segment) => segment.kind === 'fence').length, 2);
  assert.equal(legacyFence?.kind === 'fence' ? legacyFence.language : null, 'morndraft');
});

test('mixed fence scan handles a large unclosed fence in one forward pass', () => {
  const source = ['```text', ...Array.from({ length: 10_000 }, (_, index) => `line ${index}`)].join('\n');
  const segments = splitPublicDocumentSegments(source);
  assert.deepEqual(segments, [{ kind: 'markdown', content: source, start: 0, end: source.length }]);
});

test('mixed Final replaces only the selected fenced content', () => {
  const source = '# Before\n\n```html\n<div>Old</div>\n```\n\n# After';
  const segment = splitPublicDocumentSegments(source).find(candidate => candidate.kind === 'fence');
  assert.ok(segment);
  assert.equal(
    replacePublicFenceSegmentContent(source, segment, '<div>New</div>'),
    '# Before\n\n```html\n<div>New</div>\n```\n\n# After',
  );
});

test('slash trigger replaces only the active line', () => {
  const source = '# Title\n/mind';
  const trigger = findPublicSlashTrigger(source, source.length);
  assert.deepEqual(trigger, { start: 8, end: 13, query: 'mind' });
  const result = applyPublicInsert(source, trigger!, '```html\n<div>Mind map</div>\n```');
  assert.equal(result.source, '# Title\n```html\n<div>Mind map</div>\n```');
});

test('raw HTML and Mermaid remain distinct Final document kinds', () => {
  assert.equal(detectPublicDocument('<!doctype html><html><body>Hi</body></html>').kind, 'html');
  assert.equal(detectPublicDocument('flowchart LR\nA --> B').kind, 'mermaid');
});

test('raw Mermaid detection uses every canonical core opener', () => {
  for (const source of ['kanban\n  column1[Todo]', 'treemap\n"A": 1', 'architecture-beta\n  group api(cloud)']) {
    assert.equal(detectPublicDocument(source).kind, 'mermaid');
  }
});

test('raw structured Final edits preserve Source boundary whitespace', () => {
  for (const source of ['  {project: \'MornDraft\',}\n', '\n<!doctype html><html><body>Hi</body></html>  ']) {
    const document = detectPublicDocument(source);
    assert.equal(document.content, source);
    assert.equal(serializePublicDocumentEdit(document, document.content), source);
  }
});

test('Final inner editors map fenced and raw offsets back to the complete Source', () => {
  const fenced = '```json5\n{project:\'MornDraft\',}\n```';
  const fencedDocument = detectPublicDocument(fenced);
  assert.equal(getPublicDocumentContentOffset(fenced, fencedDocument), fenced.indexOf('{project'));
  const raw = "  {project:'MornDraft',}  ";
  const rawDocument = detectPublicDocument(raw);
  assert.equal(getPublicDocumentContentOffset(raw, rawDocument), 0);
});
