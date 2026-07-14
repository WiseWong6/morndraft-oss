import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicMornDraftInsertEntries } from '@morndraft/core/oss-public';
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

test('Final expands standalone fence markers when edited content contains a closing run', () => {
  const source = '```markdown\nBefore\n```';
  const document = detectPublicDocument(source);
  assert.equal(
    serializePublicDocumentEdit(document, 'Before\n```\nAfter'),
    '````markdown\nBefore\n```\nAfter\n````',
  );
});

test('standalone fence info strings preserve CRLF edits and exact content offsets', () => {
  const source = "```HTML preview linenums\r\n<!doctype html><html><body>Before</body></html>\r\n```\r\n";
  const document = detectPublicDocument(source);
  assert.equal(document.kind, 'html');
  assert.equal(document.content, '<!doctype html><html><body>Before</body></html>');
  assert.equal(getPublicDocumentContentOffset(source, document), source.indexOf('<!doctype html>'));
  assert.equal(
    serializePublicDocumentEdit(document, '<!doctype html><html><body>After</body></html>'),
    "```HTML preview linenums\r\n<!doctype html><html><body>After</body></html>\r\n```\r\n",
  );
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

test('all standalone canonical MornDraft flat entries stay mixed for structured Final editing', () => {
  const entries = getPublicMornDraftInsertEntries('showcase');
  assert.equal(entries.length, 30);
  for (const entry of entries) {
    const document = detectPublicDocument(entry.source);
    assert.equal(document.kind, 'markdown', entry.id);
    assert.equal(document.content, entry.source, entry.id);
    assert.equal(getPublicContentType(entry.source), 'mixed', entry.id);
  }
});

test('ordinary and forged standalone HTML fences remain raw HTML documents', () => {
  const ordinary = '```html\n<!doctype html><html><body>Plain</body></html>\n```';
  const forged = '```html\n<div data-morndraft-source="morndraft-flat">Missing structure</div>\n```';
  assert.equal(detectPublicDocument(ordinary).kind, 'html');
  assert.equal(detectPublicDocument(forged).kind, 'html');
});

test('valid flat metadata cannot make noncanonical HTML structurally editable', () => {
  const canonicalSource = getPublicMornDraftInsertEntries('showcase')[0].source;
  const canonicalHtml = canonicalSource.replace(/^```html\n/u, '').replace(/\n```$/u, '');
  const forgedBodies = [
    '<body><script>const marker = \'data-morndraft-source="morndraft-flat"\';</script><p>Keep script HTML</p></body>',
    '<body><template><div data-morndraft-source="morndraft-flat"></div></template><p>Keep template HTML</p></body>',
    '<body><!-- <div data-morndraft-source="morndraft-flat"></div> --><p>Keep comment HTML</p></body>',
    '<body><div class="component-shell" data-morndraft-source="morndraft-flat" data-morndraft-layout="flow" data-morndraft-variant="chain" data-renderer="swiss-catalog"><p>Keep arbitrary HTML</p></div></body>',
  ];

  for (const body of forgedBodies) {
    const source = `\`\`\`html\n${canonicalHtml.replace(/<body>[\s\S]*?<\/body>/u, body)}\n\`\`\``;
    const document = detectPublicDocument(source);
    assert.equal(document.kind, 'html');
    assert.match(document.content, /Keep (?:script|template|comment|arbitrary) HTML/u);
  }
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

test('mixed CRLF fences keep info-string languages and exact Final patches', () => {
  const source = [
    '# Mixed CRLF\r\n',
    '\r\n',
    '```HTML preview linenums\r\n',
    '<div>Old</div>\r\n',
    '```\r\n',
    '\r\n',
    '~~~JSON5 editor\r\n',
    "{project:'MornDraft',}\r\n",
    '~~~\r\n',
    '\r\n',
    '# After',
  ].join('');
  const segments = splitPublicDocumentSegments(source);
  const fences = segments.filter(segment => segment.kind === 'fence');
  const htmlFence = fences[0];
  const json5Fence = fences[1];

  assert.equal(getPublicContentType(source), 'mixed');
  assert.equal(fences.length, 2);
  assert.ok(htmlFence?.kind === 'fence');
  assert.ok(json5Fence?.kind === 'fence');
  assert.equal(htmlFence.language, 'HTML');
  assert.equal(htmlFence.content, '<div>Old</div>');
  assert.equal(json5Fence.language, 'JSON5');
  assert.equal(json5Fence.content, "{project:'MornDraft',}");
  assert.equal(
    replacePublicFenceSegmentContent(source, htmlFence, '<div>New</div>'),
    source.replace('<div>Old</div>', '<div>New</div>'),
  );
  assert.equal(
    replacePublicFenceSegmentContent(source, json5Fence, "{project:'Public',}"),
    source.replace("{project:'MornDraft',}", "{project:'Public',}"),
  );
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

test('mixed Final expands only its own fence when edited content contains a closing run', () => {
  const source = '# Before\n\n~~~html\n<div>Old</div>\n~~~\n\n# After';
  const segment = splitPublicDocumentSegments(source).find(candidate => candidate.kind === 'fence');
  assert.ok(segment);
  assert.equal(
    replacePublicFenceSegmentContent(source, segment, '<div>New</div>\n~~~\n<p>Still HTML</p>'),
    '# Before\n\n~~~~html\n<div>New</div>\n~~~\n<p>Still HTML</p>\n~~~~\n\n# After',
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
