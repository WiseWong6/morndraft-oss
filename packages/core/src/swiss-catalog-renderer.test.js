import assert from 'node:assert/strict';
import test from 'node:test';

import { MORNDRAFT_FLAT_ADAPTER_FIXTURES } from '../fixtures/morndraft-flat-adapter-fixtures.js';
import {
  adaptMornDraftFlatComponent,
  adaptMornDraftFlatComponentSource,
} from './morndraft-flat-adapter.js';
import {
  MORNDRAFT_FLAT_EDIT_PATH_ATTR,
  renderSwissCatalogDocumentSpecToHtml,
  resolveSwissCatalogPreviewHeight,
  resolveSwissCatalogPreviewWidth,
} from './swiss-catalog-renderer.js';

const createSpec = (page, target = '3:4') => ({
  version: 'v1',
  target,
  theme: { scheme: 'K', family: 'editorial' },
  pages: [page],
});

const renderFixture = (id) => {
  const fixture = MORNDRAFT_FLAT_ADAPTER_FIXTURES.find((item) => item.id === id);
  assert.ok(fixture, `Missing fixture ${id}`);
  const adapterResult = adaptMornDraftFlatComponent(fixture.input);
  assert.equal(adapterResult.ok, true, id);
  const renderResult = renderSwissCatalogDocumentSpecToHtml(adapterResult.documentSpec);
  assert.equal(renderResult.ok, true, id);
  return renderResult.html;
};

const renderPage = (page, target = '3:4') => {
  const renderResult = renderSwissCatalogDocumentSpecToHtml(createSpec(page, target));
  assert.equal(renderResult.ok, true, page.layout);
  return renderResult.html;
};

const countMatches = (value, pattern) => value.match(pattern)?.length ?? 0;

const createItems = (count) =>
  Array.from({ length: count }, (_, index) => ({ label: `步骤 ${index + 1}` }));

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const assertConcentricLayerTextTop = (html, layerNumber, top) => {
  assert.match(
    html,
    new RegExp(`<div class="layer layer-${layerNumber}"[^>]*><span class="layer-text" style="top:${escapeRegExp(top)}px;transform:translate\\(-50%, -50%\\)"`),
    `layer-${layerNumber} text top should be ${top}px`,
  );
};

const getFlatPreviewHeight = (input) => {
  const adapterResult = adaptMornDraftFlatComponent(input);
  assert.equal(adapterResult.ok, true);
  return resolveSwissCatalogPreviewHeight(adapterResult.documentSpec);
};

test('renderSwissCatalogDocumentSpecToHtml uses Swiss catalog shell and CSS', () => {
  const html = renderFixture('flow-chain');
  assert.match(html, /data-renderer="swiss-catalog"/);
  assert.match(html, /class="swiss-card swiss-card--body"/);
  assert.match(html, /\.process-chain/);
  assert.match(html, /\.component-shell \{[\s\S]*?width: 744px;/);
  assert.match(html, /\.component-shell \{[\s\S]*?max-width: 100%;[\s\S]*?margin-left: auto;[\s\S]*?margin-right: auto;[\s\S]*?container-type: inline-size;/);
  assert.match(html, /\.swiss-card \.mind-map-fit/);
  assert.match(html, /\.swiss-card \.process-loop \.loop-closed-path/);
  assert.match(html, /\.swiss-card \.card-grid--three/);
  assert.match(html, /\.swiss-card \.process-annotated-stack/);
  assert.match(html, /\.swiss-card \.timeline\[data-type="horizontal"\] \.item \{[\s\S]*?min-width: 0;/);
  assert.match(html, /\.swiss-card \.impossible-triangle \{[^}]*--impossible-triangle-left-corner-x: 62px;[^}]*--impossible-triangle-right-corner-x: 298px;[^}]*--impossible-triangle-bottom-corner-y: 238px;[^}]*--impossible-triangle-corner-label-gap: 30px;/);
  assert.match(html, /\.swiss-card \.impossible-triangle-shape \{[^}]*stroke: #d95e00;[^}]*stroke-width: 2;[^}]*opacity: 1;/);
  assert.match(html, /\.swiss-card \.impossible-triangle-point \{[^}]*width: max-content;[^}]*max-width: 104px;[^}]*padding: 4px 0;[^}]*background: transparent;[^}]*border: 0;[^}]*font-size: 16px;[^}]*font-weight: 400;[^}]*box-shadow: none;/);
  assert.match(html, /\.swiss-card \.impossible-triangle-point-2 \{[^}]*top: calc\(var\(--impossible-triangle-bottom-corner-y\) \+ var\(--impossible-triangle-corner-label-gap\)\);[^}]*left: var\(--impossible-triangle-left-corner-x\);[^}]*justify-content: flex-end;[^}]*text-align: right;[^}]*transform: translate\(-100%, -50%\);/);
  assert.match(html, /\.swiss-card \.impossible-triangle-point-3 \{[^}]*top: calc\(var\(--impossible-triangle-bottom-corner-y\) \+ var\(--impossible-triangle-corner-label-gap\)\);[^}]*left: var\(--impossible-triangle-right-corner-x\);[^}]*justify-content: flex-start;[^}]*text-align: left;[^}]*transform: translateY\(-50%\);/);
  assert.match(html, /@media \(max-width: 420px\)/);
  assert.doesNotMatch(html, /@media \(max-width: 520px\)/);
  assert.doesNotMatch(html, /@container \(max-width: 520px\)/);
  assert.match(html, /\.swiss-card \.concentric \{[\s\S]*?height: 220px !important;/);
  assert.doesNotMatch(html, /\.swiss-card \.three-col \{[^}]*grid-template-columns: 1fr;/);
  assert.doesNotMatch(html, /\.swiss-card \.before-after--verification \.compare-row \{[^}]*grid-template-columns: 1fr;/);
  assert.doesNotMatch(html, /\.swiss-card \.pyramid \{[^}]*transform: none !important;/);
  assert.doesNotMatch(html, /\.swiss-card \.pyramid\[data-type="inverted"\] \.level:last-child/);
  assert.doesNotMatch(html, /morndraft-docspec-page/);
  assert.doesNotMatch(html, /fonts\.googleapis\.com/);
  assert.doesNotMatch(html, /<\/style>\s*<\/style>/);
});

test('renderSwissCatalogDocumentSpecToHtml renders every v2 public matrix fixture', () => {
  for (const fixture of MORNDRAFT_FLAT_ADAPTER_FIXTURES) {
    const adapterResult = adaptMornDraftFlatComponent(fixture.input);
    assert.equal(adapterResult.ok, true, fixture.id);
    const renderResult = renderSwissCatalogDocumentSpecToHtml(adapterResult.documentSpec);
    assert.equal(renderResult.ok, true, fixture.id);
    assert.match(renderResult.html, /data-renderer="swiss-catalog"/, fixture.id);
  }
});

test('renderSwissCatalogDocumentSpecToHtml emits morndraft edit markers only from source edit metadata', () => {
  assert.doesNotMatch(renderFixture('flow-chain'), new RegExp(MORNDRAFT_FLAT_EDIT_PATH_ATTR));

  const adapterResult = adaptMornDraftFlatComponentSource(`{
    layout: "flow",
    variant: "chain",
    items: [
      { label: "Draft", note: "Start" },
      { label: "Validate", note: "Check schema" }
    ]
  }`);
  assert.equal(adapterResult.ok, true);

  const renderResult = renderSwissCatalogDocumentSpecToHtml(adapterResult.documentSpec);
  assert.equal(renderResult.ok, true);
  assert.match(renderResult.html, new RegExp(`${MORNDRAFT_FLAT_EDIT_PATH_ATTR}="\\$\\.items\\[0\\]\\.label"`));
  assert.match(renderResult.html, new RegExp(`${MORNDRAFT_FLAT_EDIT_PATH_ATTR}="\\$\\.items\\[1\\]\\.label"`));

  const timelineResult = adaptMornDraftFlatComponentSource(`{
    layout: "flow",
    variant: "timeline",
    items: [
      { label: "2026", value: "Growth", note: "Introduce semantics" }
    ]
  }`);
  assert.equal(timelineResult.ok, true);
  const timelineHtml = renderSwissCatalogDocumentSpecToHtml(timelineResult.documentSpec);
  assert.equal(timelineHtml.ok, true);
  assert.match(timelineHtml.html, new RegExp(`<p><span ${MORNDRAFT_FLAT_EDIT_PATH_ATTR}="\\$\\.items\\[0\\]\\.value">Growth<\\/span><\\/p>`));
});

test('resolveSwissCatalogPreviewWidth exposes stable preview delivery widths', () => {
  const processFixture = MORNDRAFT_FLAT_ADAPTER_FIXTURES.find((item) => item.id === 'flow-chain');
  const timelineFixture = MORNDRAFT_FLAT_ADAPTER_FIXTURES.find((item) => item.id === 'flow-timeline');
  const timelineVerticalFixture = MORNDRAFT_FLAT_ADAPTER_FIXTURES.find((item) => item.id === 'flow-timeline-vertical');
  const mindMapFixture = MORNDRAFT_FLAT_ADAPTER_FIXTURES.find((item) => item.id === 'map-mind');
  const icebergFixture = MORNDRAFT_FLAT_ADAPTER_FIXTURES.find((item) => item.id === 'map-iceberg');
  assert.ok(processFixture);
  assert.ok(timelineFixture);
  assert.ok(timelineVerticalFixture);
  assert.ok(mindMapFixture);
  assert.ok(icebergFixture);
  const processSpec = adaptMornDraftFlatComponent(processFixture.input).documentSpec;
  const timelineSpec = adaptMornDraftFlatComponent(timelineFixture.input).documentSpec;
  const timelineVerticalSpec = adaptMornDraftFlatComponent(timelineVerticalFixture.input).documentSpec;
  const mindMapSpec = adaptMornDraftFlatComponent(mindMapFixture.input).documentSpec;
  const icebergSpec = adaptMornDraftFlatComponent(icebergFixture.input).documentSpec;

  assert.equal(resolveSwissCatalogPreviewWidth(processSpec), 744);
  assert.equal(resolveSwissCatalogPreviewWidth(timelineSpec), 744);
  assert.equal(resolveSwissCatalogPreviewWidth(timelineVerticalSpec), 480);
  assert.equal(resolveSwissCatalogPreviewWidth(mindMapSpec), 600);
  assert.equal(resolveSwissCatalogPreviewWidth(icebergSpec), 600);
  assert.equal(resolveSwissCatalogPreviewWidth(createSpec({
    layout: 'process',
    slots: {},
    items: [{ label: 'A' }, { label: 'B' }],
  }, '16:9')), 744);
  assert.equal(resolveSwissCatalogPreviewWidth(createSpec({
    layout: 'impossible-triangle',
    items: [{ label: '成本' }, { label: '效率' }, { label: '质量' }],
  })), 480);
});

test('resolveSwissCatalogPreviewHeight exposes stable cold-start preview heights', () => {
  const processFixture = MORNDRAFT_FLAT_ADAPTER_FIXTURES.find((item) => item.id === 'flow-chain');
  const mindMapFixture = MORNDRAFT_FLAT_ADAPTER_FIXTURES.find((item) => item.id === 'map-mind');
  assert.ok(processFixture);
  assert.ok(mindMapFixture);
  const processSpec = adaptMornDraftFlatComponent(processFixture.input).documentSpec;
  const mindMapSpec = adaptMornDraftFlatComponent(mindMapFixture.input).documentSpec;

  assert.equal(resolveSwissCatalogPreviewHeight(processSpec), 236);
  assert.equal(resolveSwissCatalogPreviewHeight(mindMapSpec), 470);
  assert.equal(resolveSwissCatalogPreviewHeight(createSpec({
    layout: 'title-card',
    slots: { title: 'Launch' },
    items: [],
  })), 284);
  assert.equal(getFlatPreviewHeight({
    layout: 'compare',
    variant: 'verification',
    items: [
      { fuzzy: '“帮我写邮箱校验函数”', precise: '“写校验函数，附 2 个真伪用例，并自动跑测试验证。”' },
      { fuzzy: '“让仪表板 UI\\n更好看一些”', precise: '“按截图实现，\\n并自动对比差异后修正。”' },
      { fuzzy: '“构建失败了，帮我修”', precise: '“定位根因，验证构建成功，\\n不要静默或绕过错误。”' },
    ],
  }), 445);
  assert.equal(getFlatPreviewHeight({
    layout: 'matrix',
    variant: 'impossible-triangle',
    items: [
      { label: '成本' },
      { label: '效率' },
      { label: '质量' },
    ],
  }), 404);
  assert.equal(getFlatPreviewHeight({
    layout: 'matrix',
    variant: 'quadrant',
    axisTop: '积极',
    axisBottom: '风险',
    axisLeft: '内部',
    axisRight: '外部',
    items: [
      { label: '优势区', note: '语义化布局，复用性高' },
      { label: '机会区', note: 'AI 协作提效，生态扩展' },
      { label: '观察区', note: '学习曲线，文档覆盖不全' },
      { label: '风险区', note: '兼容性风险，依赖链长' },
    ],
  }), 464);
  assert.equal(getFlatPreviewHeight({
    layout: 'flow',
    variant: 'timeline',
    items: [
      { label: 'Snapshot', note: 'Copy Swiss reference renderer.' },
      { label: 'Adapter', note: 'Map flat schema to page shape.' },
      { label: 'Renderer', note: 'Decide the JS rendering path.' },
    ],
  }), 222);
  assert.equal(getFlatPreviewHeight({
    layout: 'flow',
    variant: 'closed-loop',
    items: [
      { label: '输入' },
      { label: '处理' },
      { label: '反馈' },
      { label: '优化' },
    ],
  }), 404);
});

test('renderSwissCatalogDocumentSpecToHtml maps public variants to existing catalog DOM classes', () => {
  assert.match(renderFixture('flow-chain'), /class="process-chain"/);
  assert.match(renderFixture('flow-chain'), /class="process-chain" data-type="arrow"/);
  assert.match(renderFixture('flow-steps'), /<div class="process-chain" data-count="4"><div class="step tone-1">确认<\/div><div class="arrow">→<\/div>/);
  assert.doesNotMatch(renderFixture('flow-steps'), /class="process-chain" data-type="arrow"/);
  assert.match(renderFixture('flow-annotated-chain'), /class="process-annotated-grid process-annotated-grid--arrow"/);
  assert.match(renderFixture('flow-timeline-vertical'), /class="timeline" data-type="vertical"/);
  assert.match(renderFixture('flow-loop'), /class="process-loop" data-type="quad" data-count="4" data-style="loop"/);
  const closedLoopHtml = renderFixture('flow-closed-loop');
  assert.match(closedLoopHtml, /class="process-loop process-loop-closed" data-type="quad" data-count="4" data-style="closed-loop"/);
  assert.match(closedLoopHtml, /class="loop-closed-path"/);
  assert.match(closedLoopHtml, /class="loop-closed-track"[^>]*stroke-width="2"/);
  assert.equal(countMatches(closedLoopHtml, /class="loop-closed-arrow"/g), 4);
  assert.doesNotMatch(closedLoopHtml, /M 196 186 L 218 195 L 198 208 Z/);
  assert.match(closedLoopHtml, /输入/);
  assert.match(renderFixture('compare-before-after'), /class="before-after with-arrow"/);
  assert.match(renderFixture('compare-table'), /class="comparison-table"/);
  assert.match(renderFixture('compare-venn-two'), /class="venn" style="height:240px"/);
  assert.match(renderFixture('compare-swot'), /class="swot"/);
  assert.match(renderFixture('matrix-quadrant'), /class="quadrant-axis"/);
  assert.match(renderFixture('matrix-impossible-triangle'), /class="impossible-triangle"/);
  assert.match(renderFixture('matrix-impossible-triangle'), /class="impossible-triangle-shape"/);
  assert.match(renderFixture('matrix-impossible-triangle'), /class="impossible-triangle-point impossible-triangle-point-1">\s*成本\s*<\/div>/);
  assert.match(renderFixture('flow-timeline'), /class="timeline" data-type="horizontal"/);
  assert.match(renderFixture('matrix-grid'), /class="matrix-grid"/);
  assert.match(renderFixture('compare-vs'), /class="vs-grid"/);
  assert.match(renderFixture('compare-vs'), /class="vs-side vs-side--left"/);
  assert.match(renderFixture('compare-vs'), /class="vs-side vs-side--right"/);
  assert.match(renderFixture('metrics-stats'), /class="stat-grid"/);
  assert.match(renderFixture('metrics-radar-hex'), /class="radar radar--hex"/);
  assert.doesNotMatch(renderFixture('metrics-radar-hex'), /radar-title|产品能力评估模型/);
  assert.match(renderFixture('map-mind-horizontal'), /<div class="mind-map-fit mind-map-fit--horizontal"[\s\S]*?<div class="mind-map" data-type="horizontal">\s*<svg class="mind-map-overlay"/);
  assert.match(renderFixture('map-platform-architecture-complex'), /class="arch-complex-v"/);
  assert.match(renderFixture('map-architecture'), /基建层/);
  assert.match(renderFixture('map-platform-architecture'), /Prompt配置/);
  assert.match(renderFixture('map-platform-architecture-complex'), /Multi-Agent编排/);
  assert.match(renderFixture('map-pyramid-inverted'), /class="pyramid" data-type="inverted"/);
  assert.match(renderFixture('map-pyramid-inverted'), /class="level level-5"/);
  assert.match(renderFixture('map-concentric-top'), /class="concentric align-top"/);
  assert.match(renderFixture('map-concentric-bottom'), /class="concentric align-bottom"/);
  assert.match(renderFixture('map-concentric'), /class="concentric align-center align-center-text-bottom"/);
  assert.match(renderFixture('cards-list'), /class="list-card"/);
  assert.match(renderFixture('cards-workflow-list'), /class="list-card list-card--workflow"/);
  assert.match(renderFixture('cards-form'), /class="form-card"/);
  assert.match(renderFixture('cards-terminal'), /class="terminal-box"/);
  assert.match(renderFixture('cards-split-accent'), /class="split-v accent"/);
  assert.match(renderFixture('cards-two-column'), /class="card-grid card-grid--two two-col"/);
  assert.match(renderFixture('cards-two-column'), /风险/);
  assert.match(renderFixture('cards-three-column'), /class="card-grid card-grid--three three-col"/);
  assert.match(renderFixture('cards-three-column'), /扩展/);
  assert.doesNotMatch(renderFixture('cards-three-column'), /<div class="three-col-icon">/);
});

test('renderSwissCatalogDocumentSpecToHtml keeps bounded process variants visible', () => {
  const chainItems = [
    { label: '识别' },
    { label: '分析' },
    { label: '执行' },
    { label: '新增项 4' },
    { label: '新增项 5' },
    { label: '新增项 6' },
    { label: '新增项 7' },
  ];
  const stepItems = [
    { label: '识别' },
    { label: '分析' },
    { label: '执行' },
    { label: '新增项 4' },
    { label: '新增项 5' },
    { label: '新增项 6' },
  ];
  const wrappedItems = [
    { label: '识别' },
    { label: '分析' },
    { label: '执行' },
    { label: '新增项 4' },
    { label: '新增项 5' },
    { label: '新增项 6' },
    { label: '新增项 7' },
    { label: '新增项 8' },
  ];
  const chainHtml = renderSwissCatalogDocumentSpecToHtml(createSpec({
    layout: 'process',
    variant: 'arrow',
    items: chainItems,
  }));
  const stepsHtml = renderSwissCatalogDocumentSpecToHtml(createSpec({
    layout: 'process',
    variant: 'plain',
    items: stepItems,
  }));

  assert.equal(chainHtml.ok, true);
  assert.match(chainHtml.html, /class="process-chain" data-type="arrow" data-count="7"/);
  assert.match(chainHtml.html, /class="step tone-7">新增项 7<\/div>/);
  assert.equal(stepsHtml.ok, true);
  assert.match(stepsHtml.html, /class="process-chain" data-count="6"/);
  assert.match(stepsHtml.html, /class="step tone-6">新增项 6<\/div>/);
  assert.doesNotMatch(stepsHtml.html, /<div class="process-chain"[^>]*data-density="wrap"/);

  const wrappedHtml = renderSwissCatalogDocumentSpecToHtml(createSpec({
    layout: 'process',
    variant: 'wrap',
    items: wrappedItems,
  }));
  const wrappedFourHtml = renderSwissCatalogDocumentSpecToHtml(createSpec({
    layout: 'process',
    variant: 'wrap',
    items: wrappedItems.slice(0, 4),
  }));
  const wrappedSixHtml = renderSwissCatalogDocumentSpecToHtml(createSpec({
    layout: 'process',
    variant: 'wrap',
    items: wrappedItems.slice(0, 6),
  }));
  assert.equal(wrappedHtml.ok, true);
  assert.equal(wrappedFourHtml.ok, true);
  assert.equal(wrappedSixHtml.ok, true);
  assert.match(wrappedHtml.html, /<div class="process-chain" data-type="wrap" data-density="wrap" data-count="8"/);
  assert.match(wrappedHtml.html, /class="step tone-8">新增项 8<\/div>/);
  assert.match(wrappedHtml.html, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(wrappedHtml.html, /"s1 s2 s3 s4"[\s\S]*"s8 s7 s6 s5"/);
  assert.match(wrappedFourHtml.html, /\.process-chain\[data-type="wrap"\]\[data-count="4"\] \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?"s1 s2"[\s\S]*?"s4 s3"/);
  assert.match(wrappedSixHtml.html, /\.process-chain\[data-type="wrap"\]\[data-count="6"\] \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?"s1 s2 s3"[\s\S]*?"s6 s5 s4"/);
  assert.match(wrappedHtml.html, /\.process-chain\[data-type="wrap"\] \.step \{[\s\S]*?z-index: 1;/);
  assert.match(wrappedHtml.html, /\.process-chain\[data-type="wrap"\]\[data-count="8"\] \.step:nth-child\(15\)::after \{[\s\S]*?content: '↑';[\s\S]*?top: -26px;/);
  assert.match(wrappedFourHtml.html, /\.process-chain\[data-type="wrap"\]\[data-count="4"\] \.step:nth-child\(3\)::after,[\s\S]*?content: '↓';/);
  assert.match(wrappedFourHtml.html, /\.process-chain\[data-type="wrap"\]\[data-count="4"\] \.step:nth-child\(5\)::after,[\s\S]*?content: '←';/);
  assert.match(wrappedFourHtml.html, /\.process-chain\[data-type="wrap"\]\[data-count="4"\] \.step:nth-child\(7\)::after,[\s\S]*?content: '↑';/);
  assert.match(wrappedSixHtml.html, /\.process-chain\[data-type="wrap"\]\[data-count="6"\] \.step:nth-child\(5\)::after,[\s\S]*?content: '↓';/);
  assert.match(wrappedSixHtml.html, /\.process-chain\[data-type="wrap"\]\[data-count="6"\] \.step:nth-child\(7\)::after,[\s\S]*?content: '←';/);
  assert.doesNotMatch(wrappedHtml.html, /process-wrap-loop/);
  assert.doesNotMatch(wrappedHtml.html, />↑<\/span>/);
  assert.doesNotMatch(wrappedFourHtml.html, /<svg class="process-wrap-loop-connector/);
  assert.match(wrappedHtml.html, /\.process-chain\[data-type="wrap"\]\[data-count="8"\] \.step:nth-child\(13\)::after/);
  const wrapReturnArrowSelectors = new Map([
    [6, 11],
    [8, 15],
  ]);
  for (const [count, finalStepNthChild] of wrapReturnArrowSelectors) {
    const result = renderSwissCatalogDocumentSpecToHtml(createSpec({
      layout: 'process',
      variant: 'wrap',
      items: wrappedItems.slice(0, count),
    }));
    assert.equal(result.ok, true, `wrap:${count}`);
    assert.doesNotMatch(result.html, /process-wrap-loop/, `wrap:${count}`);
    assert.match(result.html, new RegExp(`\\[data-count="${count}"\\] \\.step:nth-child\\(${finalStepNthChild}\\)::after`), `wrap:${count}`);
    assert.match(result.html, /content: '↑';/, `wrap:${count}`);
  }
});

test('renderSwissCatalogDocumentSpecToHtml keeps direct three-column icons data-driven', () => {
  const adapterResult = adaptMornDraftFlatComponent({
    layout: 'cards',
    variant: 'three-column',
    items: [
      { label: '设计', value: '01', note: '统一视觉语言', icon: '✦' },
      { label: '开发', value: '02', note: '组件化实现', icon: '⚙' },
      { label: '交付', value: '03', note: '完成验证发布', icon: '✓' },
    ],
  });
  assert.equal(adapterResult.ok, true);
  const renderResult = renderSwissCatalogDocumentSpecToHtml(adapterResult.documentSpec);
  assert.equal(renderResult.ok, true);
  assert.match(renderResult.html, /<div class="three-col-icon">✦<\/div>/);
  assert.match(renderResult.html, /<div class="three-col-icon">⚙<\/div>/);
  assert.match(renderResult.html, /<div class="three-col-icon">✓<\/div>/);
});

test('renderSwissCatalogDocumentSpecToHtml renders added labels for items-driven and bounded components', () => {
  const cases = [
    ['flow/chain', `{ layout: "flow", variant: "chain", items: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "新增链路" }] }`, '新增链路'],
    ['flow/steps', `{ layout: "flow", variant: "steps", items: [{ label: "A" }, { label: "B" }, { label: "新增步骤" }] }`, '新增步骤'],
    ['flow/annotated', `{ layout: "flow", variant: "annotated", items: [{ label: "A", note: "1" }, { label: "B", note: "2" }, { label: "C", note: "3" }, { label: "新增注释", badge: "Step 04", note: "4" }] }`, '新增注释'],
    ['flow/wrapped', `{ layout: "flow", variant: "wrapped", items: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }, { label: "E" }, { label: "F" }, { label: "G" }, { label: "新增换行" }] }`, '新增换行'],
    ['flow/annotated-chain', `{ layout: "flow", variant: "annotated-chain", items: [{ label: "A", note: "1" }, { label: "B", note: "2" }, { label: "C", note: "3" }, { label: "新增链路注释", badge: "Stage 04", note: "4" }] }`, '新增链路注释'],
    ['flow/timeline', `{ layout: "flow", variant: "timeline", items: [{ label: "A", note: "1" }, { label: "B", note: "2" }, { label: "新增时间", note: "3" }] }`, '新增时间'],
    ['flow/timeline-vertical', `{ layout: "flow", variant: "timeline-vertical", items: [{ label: "A", value: "1" }, { label: "B", value: "2" }, { label: "新增垂直时间", value: "3" }] }`, '新增垂直时间'],
    ['flow/loop', `{ layout: "flow", variant: "loop", items: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }, { label: "新增循环" }] }`, '新增循环'],
    ['flow/closed-loop', `{ layout: "flow", variant: "closed-loop", items: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "新增闭环" }] }`, '新增闭环'],
    ['flow/gantt', `{ layout: "flow", variant: "gantt", items: [{ label: "A" }, { label: "B" }, { label: "新增甘特" }] }`, '新增甘特'],
    ['compare/table', `{ layout: "compare", variant: "table", items: [{ role: "header", values: ["维度", "A", "B"] }, { values: ["结构", "散", "合"] }, { values: ["新增维度", "低", "高"] }] }`, '新增维度'],
    ['matrix/impossible-triangle', `{ layout: "matrix", variant: "impossible-triangle", items: [{ label: "成本" }, { label: "效率" }, { label: "质量" }] }`, '质量'],
    ['matrix/grid', `{ layout: "matrix", variant: "grid", items: [{ label: "A" }, { label: "B" }, { label: "新增矩阵" }] }`, '新增矩阵'],
    ['metrics/stats', `{ layout: "metrics", variant: "stats", items: [{ label: "A", value: "1" }, { label: "新增指标", value: "2" }] }`, '新增指标'],
    ['metrics/radar-hex', `{ layout: "metrics", variant: "radar-hex", items: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "新增六边雷达" }] }`, '新增六边雷达'],
    ['map/mind', `{ layout: "map", variant: "mind", root: "Root", items: [{ label: "A" }, { label: "新增脑图" }] }`, '新增脑图'],
    ['map/mind-horizontal', `{ layout: "map", variant: "mind-horizontal", root: "Root", items: [{ label: "A" }, { label: "新增横向脑图" }] }`, '新增横向脑图'],
    ['map/platform-architecture', `{ layout: "map", variant: "platform-architecture", items: [{ label: "A", modules: ["a"] }, { label: "新增平台层", modules: ["b"] }] }`, '新增平台层'],
    ['map/platform-architecture-complex', `{ layout: "map", variant: "platform-architecture-complex", items: [{ label: "A", modules: ["a"] }, { label: "新增复杂层", modules: ["b"] }] }`, '新增复杂层'],
    ['map/fishbone', `{ layout: "map", variant: "fishbone", items: [{ label: "A", side: "top" }, { label: "B", side: "bottom" }, { label: "新增鱼骨", side: "bottom" }] }`, '新增鱼骨'],
    ['map/pyramid', `{ layout: "map", variant: "pyramid", items: [{ label: "A" }, { label: "B" }, { label: "新增金字塔" }] }`, '新增金字塔'],
    ['map/pyramid-inverted', `{ layout: "map", variant: "pyramid-inverted", items: [{ label: "A" }, { label: "B" }, { label: "新增倒金字塔" }] }`, '新增倒金字塔'],
    ['map/concentric', `{ layout: "map", variant: "concentric", items: [{ label: "A" }, { label: "B" }, { label: "新增同心圆" }] }`, '新增同心圆'],
    ['map/concentric-top', `{ layout: "map", variant: "concentric-top", items: [{ label: "A" }, { label: "B" }, { label: "新增顶部同心圆" }] }`, '新增顶部同心圆'],
    ['map/concentric-bottom', `{ layout: "map", variant: "concentric-bottom", items: [{ label: "A" }, { label: "B" }, { label: "新增底部同心圆" }] }`, '新增底部同心圆'],
    ['cards/list', `{ layout: "cards", variant: "list", items: [{ label: "A" }, { label: "新增列表" }] }`, '新增列表'],
    ['cards/two-column', `{ layout: "cards", variant: "two-column", items: [{ label: "A" }, { label: "B" }, { label: "新增双列卡片" }] }`, '新增双列卡片'],
    ['cards/three-column', `{ layout: "cards", variant: "three-column", items: [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "新增三列卡片" }] }`, '新增三列卡片'],
  ];

  for (const [name, source, expectedLabel] of cases) {
    assert.match(renderFlatSourceToHtml(source), new RegExp(expectedLabel), name);
  }
});

test('renderSwissCatalogDocumentSpecToHtml infers public flow/loop shape from item count', () => {
  const createLoopSource = (count) => `{
    layout: "flow",
    variant: "loop",
    items: ${JSON.stringify(createItems(count))}
  }`;
  const createClosedLoopSource = (count) => `{
    layout: "flow",
    variant: "closed-loop",
    items: ${JSON.stringify(createItems(count))}
  }`;

  assert.match(renderFlatSourceToHtml(createLoopSource(3)), /class="process-loop" data-type="triangle"/);
  assert.match(renderFlatSourceToHtml(createLoopSource(4)), /class="process-loop" data-type="quad"/);
  const fiveHtml = renderFlatSourceToHtml(createLoopSource(5));
  const sixHtml = renderFlatSourceToHtml(createLoopSource(6));
  assert.match(fiveHtml, /class="process-loop" data-type="pentagon" data-count="5"/);
  assert.match(fiveHtml, /\.process-loop\[data-type="pentagon"\] \.loop-item:nth-child\(5\) \{ top: calc\(50% - 28px\); left: calc\(50% - 86px\); \}/);
  assert.match(sixHtml, /class="process-loop" data-type="hex" data-count="6"/);
  assert.match(sixHtml, /\.process-loop\[data-type="hex"\] \.loop-item:nth-child\(6\) \{ top: calc\(50% - 45px\); left: calc\(50% - 78px\); \}/);
  assert.match(sixHtml, /\.process-loop\[data-type="hex"\]::before \{[\s\S]*?width: 180px;[\s\S]*?height: 180px;/);
  for (const [count, shape] of [[3, 'triangle'], [4, 'quad'], [5, 'pentagon'], [6, 'hex']]) {
    const closedLoopHtmlForCount = renderFlatSourceToHtml(createClosedLoopSource(count));
    assert.match(closedLoopHtmlForCount, new RegExp(`class="process-loop process-loop-closed" data-type="${shape}" data-count="${count}" data-style="closed-loop"`));
    assert.match(closedLoopHtmlForCount, /class="loop-closed-track"[^>]*stroke-width="2"/);
    assert.equal(countMatches(closedLoopHtmlForCount, /class="loop-closed-arrow"/g), count);
    assert.doesNotMatch(closedLoopHtmlForCount, /M 196 186 L 218 195 L 198 208 Z/);
  }
  const closedLoopHtml = renderFlatSourceToHtml(createClosedLoopSource(5));
  assert.match(closedLoopHtml, /class="process-loop process-loop-closed" data-type="pentagon" data-count="5" data-style="closed-loop"/);
  assert.match(closedLoopHtml, /class="loop-closed-path"/);
  assert.match(closedLoopHtml, /\.swiss-card \.process-loop\.process-loop-closed::before \{[\s\S]*?display: none;/);
  assert.match(sixHtml, /\.vs-grid \.vs-side--left \{[\s\S]*?justify-self: end;/);
  assert.match(sixHtml, /\.vs-grid \.vs-side--left \{[\s\S]*?text-align: right;/);
  assert.match(sixHtml, /\.vs-grid \.vs-side--left h4,[\s\S]*?\.vs-grid \.vs-side--left p \{[\s\S]*?text-align: right;/);
  assert.match(sixHtml, /\.vs-grid \.vs-side--right \{[\s\S]*?text-align: left;/);
});

test('renderSwissCatalogDocumentSpecToHtml renders concentric with catalog layer elements', () => {
  const html = renderFixture('map-concentric');
  assert.match(html, /class="layer layer-3"/);
  assert.match(html, /class="layer layer-1"/);
  assert.match(html, /class="layer-text" style="[^"]*">数据层<\/span>/);
  assert.match(html, /class="layer-text" style="[^"]*">应用层<\/span>/);
});

test('renderSwissCatalogDocumentSpecToHtml computes concentric text y positions from layer geometry', () => {
  const threeHtml = renderPage({
    layout: 'concentric',
    items: createItems(3),
  });
  assertConcentricLayerTextTop(threeHtml, 1, '55');
  assertConcentricLayerTextTop(threeHtml, 2, '173.75');
  assertConcentricLayerTextTop(threeHtml, 3, '258.75');

  const fourHtml = renderPage({
    layout: 'concentric',
    items: createItems(4),
  });
  assert.equal(countMatches(fourHtml, /class="layer layer-/g), 4);
  assertConcentricLayerTextTop(fourHtml, 4, '258.5');

  const fiveHtml = renderPage({
    layout: 'concentric',
    items: createItems(5),
  });
  assert.equal(countMatches(fiveHtml, /class="layer layer-/g), 5);
  assertConcentricLayerTextTop(fiveHtml, 5, '312.5');

  const topHtml = renderPage({
    layout: 'concentric',
    variant: 'align-top',
    items: createItems(5),
  });
  assertConcentricLayerTextTop(topHtml, 5, '299');

  const bottomHtml = renderPage({
    layout: 'concentric',
    variant: 'align-bottom',
    items: createItems(5),
  });
  assertConcentricLayerTextTop(bottomHtml, 5, '27');
  assert.doesNotMatch(fiveHtml, /\.swiss-card \.concentric\.align-center-text-bottom \.layer-3 \.layer-text/);
});

test('renderSwissCatalogDocumentSpecToHtml preserves nested object cards in platform architecture items', () => {
  const { documentSpec } = adaptMornDraftFlatComponent({
    layout: 'map',
    variant: 'platform-architecture',
    items: [
      {
        label: '资源',
        items: [
          { label: '提示词', items: ['Prompt配置', '模型配置', '变量应用', '自动化'] },
          { label: '工具接入', items: ['内部API接入', 'MCP接入', '工具注册', '调用监控'] },
        ],
      },
    ],
  });
  const { html } = renderSwissCatalogDocumentSpecToHtml(documentSpec);
  assert.match(html, /提示词/);
  assert.match(html, /Prompt配置/);
  assert.match(html, /工具接入/);
  assert.match(html, /MCP接入/);
});

test('renderSwissCatalogDocumentSpecToHtml keeps internal catalog variant classes stable', () => {
  assert.match(renderPage({
    layout: 'process',
    variant: 'annotated',
    items: [
      { label: '需求', note: '明确目标' },
      { label: '设计', note: '定义模块' },
      { label: '开发', note: '落地实现' },
      { label: '测试', note: '准备发布' },
    ],
  }), /class="process-annotated-grid process-annotated-grid--plain"/);
  assert.match(renderPage({
    layout: 'process',
    variant: 'annotated-arrow',
    items: [
      { label: '需求', note: '明确目标' },
      { label: '设计', note: '定义模块' },
      { label: '开发', note: '落地实现' },
      { label: '测试', note: '准备发布' },
    ],
  }), /class="process-annotated-grid process-annotated-grid--arrow"/);
  assert.match(renderPage({
    layout: 'before-after',
    variant: 'verification',
    items: [{ fuzzy: '模糊输入', precise: '明确输入' }],
  }), /class="before-after--verification"/);
  assert.match(renderPage({
    layout: 'list-card',
    variant: 'workflow',
    items: [{ label: '第一步', value: '整理需求' }],
  }), /class="list-card list-card--workflow"/);
  assert.match(renderPage({
    layout: 'venn',
    variant: 'double',
    items: [{ label: '产品' }, { label: '技术' }],
  }), /class="venn" style="height:240px"/);

  const horizontalMindMap = renderPage({
    layout: 'mind-map',
    variant: 'horizontal',
    slots: { root: '产品架构' },
    items: [
      { label: '输入' },
      { label: '处理' },
      { label: '交付' },
      { label: '反馈' },
    ],
  });
  const verticalMindMap = renderPage({
    layout: 'mind-map',
    variant: 'vertical',
    slots: { root: '产品架构' },
    items: [
      { label: '输入', children: JSON.stringify(['Markdown', '图片']) },
      { label: '处理', children: JSON.stringify(['解析', '渲染']) },
      { label: '交付', children: JSON.stringify(['复制', '导出']) },
    ],
  });
  assert.match(horizontalMindMap, /<div class="mind-map-fit mind-map-fit--horizontal" style="[^"]*--mind-map-base-width:496px[\s\S]*?<div class="mind-map" data-type="horizontal">\s*<svg class="mind-map-overlay"[\s\S]*?<div class="root-node">产品架构<\/div>/);
  assert.equal(countMatches(horizontalMindMap, /class="mind-map-line"/g), 6);
  assert.match(horizontalMindMap, /viewBox="0 0 496 239"/);
  assert.match(horizontalMindMap, /--mind-map-narrow-scale:0\.46/);
  assert.match(horizontalMindMap, /--mind-map-narrow-width:229px/);
  assert.match(verticalMindMap, /<div class="mind-map-fit mind-map-fit--vertical" style="[^"]*--mind-map-base-width:568px;--mind-map-base-height:366px/);
  assert.match(verticalMindMap, /<div class="mind-map" data-type="vertical">/);
  assert.match(verticalMindMap, /--mind-map-narrow-scale:0\.4/);
  assert.match(verticalMindMap, /class="sub-branches"/);
  assert.equal(countMatches(verticalMindMap, /class="mind-map-line"/g), 17);
  assert.match(verticalMindMap, /viewBox="0 0 568 366"/);
  assert.match(verticalMindMap, /stroke="#d95e00"/);
  assert.match(verticalMindMap, /stroke-width="2"/);
  assert.match(verticalMindMap, /vector-effect="non-scaling-stroke"/);
  assert.match(verticalMindMap, /\.component-shell \{[\s\S]*?width: 600px;/);
  assert.match(renderPage({
    layout: 'split-v',
    variant: 'accent',
    slots: { title: '垂直分栏', subtitle: '从信息到交付', body: '关键依据与下一步动作' },
    items: [],
  }), /class="split-v accent"/);
  assert.match(renderPage({
    layout: 'pyramid',
    variant: 'inverted',
    items: [{ label: '愿景' }, { label: '战略' }],
  }), /class="pyramid" data-type="inverted"/);
  assert.match(renderPage({
    layout: 'concentric',
    variant: 'align-top',
    items: [{ label: '数据层' }, { label: '服务层' }, { label: '应用层' }],
  }), /class="concentric align-top"/);
});

test('renderSwissCatalogDocumentSpecToHtml renders static connector svg only for mind maps', () => {
  const mindMap = renderFixture('map-mind');
  const process = renderFixture('flow-chain');
  assert.match(mindMap, /class="mind-map-overlay"/);
  assert.match(mindMap, /class="mind-map-line"/);
  assert.doesNotMatch(mindMap, /data-morndraft-mind-map-connectors|syncMindMapConnectors/);
  assert.doesNotMatch(process, /class="mind-map-overlay"|class="mind-map-line"/);
});

test('renderSwissCatalogDocumentSpecToHtml returns diagnostics instead of throwing', () => {
  const result = renderSwissCatalogDocumentSpecToHtml(createSpec({
    layout: 'unknown',
    slots: {},
    items: [],
  }));
  assert.equal(result.ok, false);
  assert.equal(result.html, '');
  assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'document_spec.unknown_layout'));
});

const renderFlatSourceToHtml = (source) => {
  const adapterResult = adaptMornDraftFlatComponentSource(source);
  assert.equal(adapterResult.ok, true, `adapter failed for:\n${source}`);
  const renderResult = renderSwissCatalogDocumentSpecToHtml(adapterResult.documentSpec);
  assert.equal(renderResult.ok, true, `renderer failed for:\n${source}`);
  return renderResult.html;
};

const assertHtmlHasEditPath = (html, path, message) => {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, (match) => String.fromCharCode(92) + match);
  const pattern = new RegExp(MORNDRAFT_FLAT_EDIT_PATH_ATTR + '="' + escapedPath + '"');
  assert.match(html, pattern, message ?? 'expected edit-path attribute for ' + path);
};

test('renderSwissCatalogDocumentSpecToHtml reflows inverted pyramid geometry by visible layer count', () => {
  const threeHtml = renderFlatSourceToHtml(`{
    layout: "map",
    variant: "pyramid-inverted",
    items: [{ label: "能力" }, { label: "系统" }, { label: "流程" }]
  }`);
  assert.match(threeHtml, /class="pyramid" data-type="inverted" data-count="3"/);
  assert.equal(countMatches(threeHtml, /class="level level-/g), 3);
  assert.match(threeHtml, /class="level level-3"[\s\S]*流程/);
  assert.doesNotMatch(threeHtml, /class="level level-4"|class="level level-5"/);
  assert.match(threeHtml, /\.swiss-card \.pyramid\[data-type="inverted"\]\[data-count="3"\] \.level-2 \{[\s\S]*?width: 360px;[\s\S]*?clip-path: polygon\(0% 0%, 100% 0%, 75% 100%, 25% 100%\);/);
  assert.match(threeHtml, /\.swiss-card \.pyramid\[data-type="inverted"\]\[data-count="3"\] \.level-3 \{[\s\S]*?width: 180px;[\s\S]*?clip-path: polygon\(0% 0%, 100% 0%, 50% 100%\);/);

  const fourHtml = renderFlatSourceToHtml(`{
    layout: "map",
    variant: "pyramid-inverted",
    items: [{ label: "新增层" }, { label: "能力" }, { label: "系统" }, { label: "流程" }]
  }`);
  assert.match(fourHtml, /class="pyramid" data-type="inverted" data-count="4"/);
  assert.equal(countMatches(fourHtml, /class="level level-/g), 4);
  assert.match(fourHtml, /class="level level-4"[\s\S]*流程/);
  assert.doesNotMatch(fourHtml, /class="level level-5"/);
  assert.match(fourHtml, /\.swiss-card \.pyramid\[data-type="inverted"\]\[data-count="4"\] \.level-2 \{[\s\S]*?width: 405px;[\s\S]*?clip-path: polygon\(0% 0%, 100% 0%, 83.33% 100%, 16.67% 100%\);/);
  assert.match(fourHtml, /\.swiss-card \.pyramid\[data-type="inverted"\]\[data-count="4"\] \.level-4 \{[\s\S]*?width: 135px;[\s\S]*?clip-path: polygon\(0% 0%, 100% 0%, 50% 100%\);/);

  const fiveHtml = renderFlatSourceToHtml(`{
    layout: "map",
    variant: "pyramid-inverted",
    items: [{ label: "愿景" }, { label: "战略" }, { label: "能力" }, { label: "系统" }, { label: "流程" }]
  }`);
  assert.match(fiveHtml, /class="pyramid" data-type="inverted" data-count="5"/);
  assert.equal(countMatches(fiveHtml, /class="level level-/g), 5);
  assert.match(fiveHtml, /\.swiss-card \.pyramid\[data-type="inverted"\]\[data-count="5"\] \.level-5 \{[\s\S]*?width: 108px;[\s\S]*?clip-path: polygon\(0% 0%, 100% 0%, 50% 100%\);/);
  assert.doesNotMatch(fiveHtml, /\.swiss-card \.pyramid\[data-type="inverted"\] \.level:last-child/);
});

test('renderSwissCatalogDocumentSpecToHtml emits edit markers for public item-backed v2 layouts', () => {
  const cases = [
    {
      name: 'gantt',
      source: `{ layout: "flow", variant: "gantt", items: [{ label: "需求分析" }, { label: "开发实现" }] }`,
      expectPaths: ['$.items[0].label', '$.items[1].label'],
    },
    {
      name: 'pyramid',
      source: `{ layout: "map", variant: "pyramid", items: [{ label: "愿景" }, { label: "战略" }, { label: "执行" }] }`,
      expectPaths: ['$.items[0].label', '$.items[1].label', '$.items[2].label'],
    },
    {
      name: 'swot',
      source: `{ layout: "compare", variant: "swot", items: [{ label: "技术强" }, { label: "人手少" }, { label: "市场大" }, { label: "竞争烈" }] }`,
      expectPaths: ['$.items[0].label', '$.items[1].label', '$.items[2].label', '$.items[3].label'],
    },
    {
      name: 'quadrant',
      source: `{ layout: "matrix", variant: "quadrant", axisTop: "积极", items: [{ label: "优势区", note: "核心能力" }, { label: "机会区", note: "增长点" }] }`,
      expectPaths: ['$.axisTop', '$.items[0].label', '$.items[0].note', '$.items[1].label'],
    },
    {
      name: 'impossible-triangle',
      source: `{ layout: "matrix", variant: "impossible-triangle", items: [{ label: "成本" }, { label: "效率" }, { label: "质量" }] }`,
      expectPaths: ['$.items[0].label', '$.items[1].label', '$.items[2].label'],
    },
    {
      name: 'fishbone',
      source: `{ layout: "map", variant: "fishbone", items: [{ label: "人员", side: "top" }, { label: "流程", side: "bottom" }] }`,
      expectPaths: ['$.items[0].label', '$.items[1].label'],
    },
    {
      name: 'iceberg',
      source: `{ layout: "map", variant: "iceberg", items: [{ badge: "表层", label: "现象" }, { badge: "深层", label: "根因" }] }`,
      expectPaths: ['$.items[0].badge', '$.items[0].label', '$.items[1].badge', '$.items[1].label'],
    },
    {
      name: 'venn',
      source: `{ layout: "compare", variant: "venn", items: [{ label: "集合A" }, { label: "集合B" }, { label: "集合C" }] }`,
      expectPaths: ['$.items[0].label', '$.items[1].label', '$.items[2].label'],
    },
    {
      name: 'matrix',
      source: `{ layout: "matrix", variant: "grid", items: [{ label: "高优", note: "立即处理" }] }`,
      expectPaths: ['$.items[0].label', '$.items[0].note'],
    },
    {
      name: 'stats',
      source: `{ layout: "metrics", variant: "stats", items: [{ label: "用户", value: "10万", unit: "人" }] }`,
      expectPaths: ['$.items[0].label', '$.items[0].value', '$.items[0].unit'],
    },
    {
      name: 'architecture',
      source: `{ layout: "map", variant: "architecture", items: [{ label: "接入层", modules: ["网关", "鉴权"] }] }`,
      expectPaths: ['$.items[0].label', '$.items[0].modules[0]', '$.items[0].modules[1]'],
    },
    {
      name: 'concentric',
      source: `{ layout: "map", variant: "concentric", items: [{ label: "核心层" }, { label: "扩展层" }] }`,
      expectPaths: ['$.items[0].label', '$.items[1].label'],
    },
    {
      name: 'list-card',
      source: `{ layout: "cards", variant: "list", items: [{ label: "第一步" }] }`,
      expectPaths: ['$.items[0].label'],
    },
    {
      name: 'closed-loop',
      source: `{ layout: "flow", variant: "closed-loop", items: [{ label: "输入" }, { label: "处理" }, { label: "反馈" }, { label: "优化" }] }`,
      expectPaths: ['$.items[0].label', '$.items[1].label', '$.items[2].label', '$.items[3].label'],
    },
    {
      name: 'form-card',
      source: `{ layout: "cards", variant: "form", items: [{ label: "姓名", value: "张三" }] }`,
      expectPaths: ['$.items[0].label', '$.items[0].value'],
    },
    {
      name: 'two-col',
      source: `{ layout: "cards", variant: "two-column", items: [{ label: "对比A" }, { label: "对比B" }] }`,
      expectPaths: ['$.items[0].label', '$.items[1].label'],
    },
    {
      name: 'three-col',
      source: `{ layout: "cards", variant: "three-column", items: [{ label: "特性A", value: "描述A" }, { label: "特性B", value: "描述B" }] }`,
      expectPaths: ['$.items[0].label', '$.items[0].value', '$.items[1].label', '$.items[1].value'],
    },
    {
      name: 'alert-box',
      source: `{ layout: "cards", variant: "alert", items: [{ label: "警告", value: "请注意", type: "warning" }] }`,
      expectPaths: ['$.items[0].label', '$.items[0].value'],
    },
    {
      name: 'mind-map',
      source: `{ layout: "map", variant: "mind", root: "主题", items: [{ label: "分支A", children: ["子项1", "子项2"] }] }`,
      expectPaths: ['$.root', '$.items[0].label', '$.items[0].children[0]', '$.items[0].children[1]'],
    },
    {
      name: 'radar',
      source: `{ layout: "metrics", variant: "radar-hex", items: [{ label: "性能" }, { label: "安全" }, { label: "体验" }] }`,
      expectPaths: ['$.items[0].label', '$.items[1].label', '$.items[2].label'],
    },
  ];

  for (const { name, source, expectPaths } of cases) {
    const html = renderFlatSourceToHtml(source);
    for (const path of expectPaths) {
      assertHtmlHasEditPath(html, path, `[${name}] missing edit-path for ${path}`);
    }
  }
});
