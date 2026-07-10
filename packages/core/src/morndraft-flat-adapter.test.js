import test from 'node:test';
import assert from 'node:assert/strict';

import { MORNDRAFT_FLAT_ADAPTER_FIXTURES } from '../fixtures/morndraft-flat-adapter-fixtures.js';
import {
  MORNDRAFT_FLAT_COMPONENT_CAPABILITIES,
  MORNDRAFT_FLAT_PUBLIC_CATEGORIES,
  MORNDRAFT_FLAT_SAMPLE_CATEGORIES,
  MORNDRAFT_FLAT_SAMPLE_PAIRS,
  MORNDRAFT_FLAT_LAYOUT_VARIANTS,
  MORNDRAFT_FLAT_SHOWCASE_CATEGORIES,
  MORNDRAFT_FLAT_SHOWCASE_PAIRS,
  MORNDRAFT_FLAT_STYLE_FAMILIES,
  MORNDRAFT_FLAT_STYLE_SECONDARY_PAIRS,
  adaptMornDraftFlatComponent,
  adaptMornDraftFlatComponentSource,
  describeMornDraftFlatProtocol,
  formatMornDraftFlatDiagnosticMessage,
  getMornDraftFlatStyleFamily,
  resolveMornDraftFlatComponentIntent,
} from './morndraft-flat-adapter.js';
import {
  createDefaultMornDraftFlatItem,
} from './morndraft-flat-default-item.js';
import {
  createMornDraftFlatSourceEditMap,
  patchMornDraftFlatSourceItems,
  patchMornDraftFlatSourceValues,
} from './morndraft-flat-source-patch.js';

const getCodes = (result) => result.diagnostics.map((diagnostic) => diagnostic.code);

const createItems = (count) =>
  Array.from({ length: count }, (_, index) => ({ label: `维度 ${index + 1}` }));

const getPublicVariantCount = () =>
  Object.values(MORNDRAFT_FLAT_LAYOUT_VARIANTS).reduce((sum, variants) => sum + variants.length, 0);

const CANONICAL_PUBLIC_PAIRS = [
  'flow/chain',
  'flow/steps',
  'flow/annotated',
  'flow/wrapped',
  'flow/annotated-chain',
  'flow/timeline',
  'flow/timeline-vertical',
  'flow/loop',
  'flow/closed-loop',
  'flow/journey',
  'flow/gantt',
  'compare/vs',
  'compare/before-after',
  'compare/verification',
  'compare/table',
  'compare/swot',
  'compare/venn',
  'compare/venn-two',
  'matrix/quadrant',
  'matrix/impossible-triangle',
  'matrix/grid',
  'metrics/stats',
  'metrics/radar-hex',
  'map/mind',
  'map/mind-horizontal',
  'map/architecture',
  'map/platform-architecture',
  'map/platform-architecture-complex',
  'map/fishbone',
  'map/iceberg',
  'map/pyramid',
  'map/pyramid-inverted',
  'map/concentric',
  'map/concentric-top',
  'map/concentric-bottom',
  'cards/list',
  'cards/workflow-list',
  'cards/toc',
  'cards/form',
  'cards/alert',
  'cards/terminal',
  'cards/two-column',
  'cards/three-column',
  'cards/split',
  'cards/split-accent',
];

const CANONICAL_PUBLIC_TITLES = [
  '流程链路',
  '分步流程',
  '注释步骤',
  '换行流程',
  '注释链路',
  '横向时间线',
  '垂直时间线',
  '循环流程',
  '闭环流程',
  '用户旅程',
  '甘特图',
  '双方案对比',
  '前后对比',
  '验证对比',
  '对比表格',
  'SWOT 分析',
  '三圆韦恩图',
  '双圆韦恩图',
  '四象限矩阵',
  '不可能三角',
  '网格矩阵',
  '指标卡片',
  '雷达图',
  '思维导图',
  '横向思维导图',
  '分层架构图',
  '平台架构图',
  '复杂平台架构图',
  '鱼骨图',
  '冰山图',
  '金字塔',
  '倒金字塔',
  '同心圆',
  '顶部对齐同心圆',
  '底部对齐同心圆',
  '列表卡片',
  '工作流列表',
  '目录卡片',
  '表单卡片',
  '提示卡片',
  '术语卡片',
  '双栏分栏',
  '三栏分栏',
  '垂直分栏',
  '强调分栏',
];

const INTERNAL_LAYOUT_PAIRS = [
  'map/architecture',
  'cards/workflow-list',
  'cards/toc',
  'cards/form',
  'cards/alert',
  'cards/terminal',
  'cards/split',
  'cards/split-accent',
];

const STYLE_SECONDARY_PAIRS = [
  'flow/timeline-vertical',
  'flow/closed-loop',
  'map/mind-horizontal',
  'map/pyramid-inverted',
  'map/concentric-top',
  'map/concentric-bottom',
  'cards/three-column',
];

const SAMPLE_HIDDEN_PAIRS = [
  'compare/table',
];

test('describeMornDraftFlatProtocol exposes the v2 public morndraft contract', () => {
  const protocol = describeMornDraftFlatProtocol();

  assert.equal(protocol.name, 'MornDraft v2 public flat protocol');
  assert.equal(protocol.componentType, 'swiss-catalog');
  assert.equal(protocol.version, '2.0');
  assert.equal(protocol.fencedLanguage, 'html');
  assert.equal(protocol.structureLanguage, 'morndraft');
  assert.deepEqual(protocol.unsupportedFencedLanguages, ['morndraft']);
  assert.equal(protocol.outputMode, 'html-source-only');
  assert.equal(protocol.coverage.publicLayouts, 6);
  assert.equal(getPublicVariantCount(), 45);
  assert.equal(protocol.coverage.publicVariants, getPublicVariantCount());
  assert.deepEqual(protocol.displayCategories.map((category) => category.label), [
    '流程/时序',
    '对比/评估',
    '数据/可视化',
    '关系/结构',
    '内容/排版',
  ]);
  assert.deepEqual(
    MORNDRAFT_FLAT_PUBLIC_CATEGORIES.flatMap((category) => category.pairs),
    CANONICAL_PUBLIC_PAIRS,
  );
  assert.deepEqual(
    protocol.displayCategories.flatMap((category) => category.pairs),
    CANONICAL_PUBLIC_PAIRS,
  );
  const expectedShowcasePairs = CANONICAL_PUBLIC_PAIRS.filter((pair) => (
    !INTERNAL_LAYOUT_PAIRS.includes(pair) &&
    !STYLE_SECONDARY_PAIRS.includes(pair)
  ));
  const expectedSamplePairs = expectedShowcasePairs.filter((pair) => (
    !SAMPLE_HIDDEN_PAIRS.includes(pair)
  ));
  assert.deepEqual(
    MORNDRAFT_FLAT_SHOWCASE_CATEGORIES.map((category) => category.label),
    protocol.displayCategories.map((category) => category.label),
  );
  assert.deepEqual(MORNDRAFT_FLAT_SHOWCASE_PAIRS, expectedShowcasePairs);
  assert.deepEqual(MORNDRAFT_FLAT_SAMPLE_PAIRS, expectedSamplePairs);
  assert.deepEqual(
    protocol.showcaseCategories.flatMap((category) => category.pairs),
    expectedShowcasePairs,
  );
  assert.deepEqual(
    MORNDRAFT_FLAT_SAMPLE_CATEGORIES.flatMap((category) => category.pairs),
    expectedSamplePairs,
  );
  assert.deepEqual(
    protocol.sampleCategories.flatMap((category) => category.pairs),
    expectedSamplePairs,
  );
  assert.deepEqual(MORNDRAFT_FLAT_STYLE_SECONDARY_PAIRS, STYLE_SECONDARY_PAIRS);
  assert.deepEqual(
    MORNDRAFT_FLAT_STYLE_FAMILIES.map((family) => family.id),
    [
      'flow-timeline',
      'flow-loop',
      'map-mind',
      'map-pyramid',
      'map-concentric',
      'cards-column-grid',
    ],
  );
  assert.equal(getMornDraftFlatStyleFamily('flow', 'loop').id, 'flow-loop');
  assert.equal(getMornDraftFlatStyleFamily('flow', 'closed-loop').id, 'flow-loop');
  assert.equal(getMornDraftFlatStyleFamily('cards', 'two-column').id, 'cards-column-grid');
  assert.equal(getMornDraftFlatStyleFamily('cards', 'three-column').id, 'cards-column-grid');
  assert.equal(getMornDraftFlatStyleFamily('compare', 'vs'), null);
  assert.deepEqual(
    protocol.styleFamilies.find((family) => family.id === 'cards-column-grid'),
    {
      id: 'cards-column-grid',
      label: '分栏',
      layout: 'cards',
      defaultVariant: 'two-column',
      variants: [
        { variant: 'two-column', label: '双栏' },
        { variant: 'three-column', label: '三栏' },
      ],
    },
  );
  assert.deepEqual(
    protocol.styleFamilies.find((family) => family.id === 'flow-loop'),
    {
      id: 'flow-loop',
      label: '循环流程',
      layout: 'flow',
      defaultVariant: 'loop',
      variants: [
        { variant: 'loop', label: '循环' },
        { variant: 'closed-loop', label: '闭环' },
      ],
    },
  );
  assert.deepEqual(
    Object.fromEntries(
      [
        'flow/chain',
        'flow/steps',
        'flow/annotated',
        'flow/wrapped',
        'flow/annotated-chain',
        'flow/loop',
        'flow/closed-loop',
      ].map((pair) => [
        pair,
        {
          mode: MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[pair].mode,
          minItems: MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[pair].minItems,
          maxItems: MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[pair].maxItems,
          ...(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[pair].supportedItemCounts
            ? { supportedItemCounts: [...MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[pair].supportedItemCounts] }
            : {}),
        },
      ]),
    ),
    {
      'flow/chain': { mode: 'bounded-items', minItems: undefined, maxItems: 7 },
      'flow/steps': { mode: 'bounded-items', minItems: undefined, maxItems: 6 },
      'flow/annotated': { mode: 'bounded-items', minItems: undefined, maxItems: 4 },
      'flow/wrapped': { mode: 'bounded-items', minItems: 4, maxItems: 8, supportedItemCounts: [4, 6, 8] },
      'flow/annotated-chain': { mode: 'bounded-items', minItems: 2, maxItems: 4 },
      'flow/loop': { mode: 'bounded-items', minItems: 3, maxItems: 6 },
      'flow/closed-loop': { mode: 'bounded-items', minItems: 3, maxItems: 6 },
    },
  );
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['flow/journey'].mode, 'fixed-model');
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['flow/journey'].fixedSlots, 5);
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['metrics/radar'], undefined);
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['metrics/radar-hex'].mode, 'bounded-items');
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['metrics/radar-hex'].recommendedMaxItems, 8);
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['map/pyramid'].minItems, 3);
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['map/pyramid'].maxItems, 5);
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['map/pyramid-inverted'].minItems, 3);
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['map/pyramid-inverted'].maxItems, 5);
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['cards/two-column'].maxItems, 6);
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['matrix/impossible-triangle'].mode, 'fixed-model');
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['matrix/impossible-triangle'].fixedSlots, 3);
  const impossibleTriangleIntent = protocol.componentIntentAliases.find(
    (intent) => intent.pair === 'matrix/impossible-triangle',
  );
  assert.equal(impossibleTriangleIntent?.label, '不可能三角');
  assert.equal(impossibleTriangleIntent?.aliases.includes('不可能三角'), true);
  assert.equal(impossibleTriangleIntent?.aliases.includes('成本质量效率'), true);
  assert.equal(impossibleTriangleIntent?.aliases.includes('impossible triangle'), true);
  assert.equal(impossibleTriangleIntent?.aliases.includes('cost quality speed'), true);
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['compare/table'].publicShowcase, true);
  assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES['compare/table'].sampleShowcase, false);
  assert.equal(MORNDRAFT_FLAT_SHOWCASE_PAIRS.includes('compare/table'), true);
  assert.equal(MORNDRAFT_FLAT_SAMPLE_PAIRS.includes('compare/table'), false);
  for (const pair of INTERNAL_LAYOUT_PAIRS) {
    assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[pair].mode, 'internal-layout', pair);
    assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[pair].publicShowcase, false, pair);
    assert.equal(MORNDRAFT_FLAT_SHOWCASE_PAIRS.includes(pair), false, pair);
  }
  for (const pair of STYLE_SECONDARY_PAIRS) {
    assert.equal(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[pair].publicShowcase, true, pair);
    assert.equal(MORNDRAFT_FLAT_SHOWCASE_PAIRS.includes(pair), false, pair);
  }
  assert.deepEqual(Object.keys(MORNDRAFT_FLAT_LAYOUT_VARIANTS), [
    'flow',
    'compare',
    'map',
    'cards',
    'metrics',
    'matrix',
  ]);
  assert.deepEqual(protocol.shape.commonRootFields, ['layout', 'variant', 'items']);
  assert.deepEqual(protocol.shape.structuralRootFields['map/mind'], ['root']);
  assert.deepEqual(protocol.shape.structuralRootFields['matrix/quadrant'], [
    'axisTop',
    'axisBottom',
    'axisLeft',
    'axisRight',
    'center',
  ]);
  assert.equal(protocol.shape.forbiddenRootFields.includes('themeColor'), true);
  assert.equal(protocol.shape.forbiddenRootFields.includes('steps'), true);
  assert.equal(protocol.layouts.some((layout) => (
    layout.layout === 'flow' &&
    layout.variants.includes('chain') &&
    layout.variants.includes('annotated-chain') &&
    layout.variants.includes('timeline-vertical') &&
    layout.variants.includes('loop') &&
    layout.variants.includes('closed-loop') &&
    !layout.variants.includes('loop-triangle') &&
    !layout.variants.includes('loop-square') &&
    !layout.variants.includes('loop-pentagon')
  )), true);
  assert.equal(protocol.layouts.some((layout) => (
    layout.layout === 'compare' &&
    layout.variants.includes('table') &&
    layout.variants.includes('venn-two')
  )), true);
  assert.equal(protocol.layouts.some((layout) => (
    layout.layout === 'cards' &&
    layout.variants.includes('list') &&
    layout.variants.includes('workflow-list') &&
    layout.variants.includes('split-accent') &&
    !layout.variants.includes('cover') &&
    !layout.variants.includes('title') &&
    !layout.variants.includes('quote') &&
    !layout.variants.includes('code')
  )), true);
  assert.equal(protocol.examples[0].layout, 'flow');
  assert.equal(protocol.examples[0].variant, 'chain');
});

test('MornDraft flat intent resolver maps natural names to public component pairs', () => {
  for (const input of [
    '生成不可能三角：成本、质量、效率',
    '画一个项目管理铁三角',
    'cost quality speed tradeoff triangle',
  ]) {
    const intent = resolveMornDraftFlatComponentIntent(input);
    assert.ok(intent, input);
    assert.equal(intent.pair, 'matrix/impossible-triangle');
    assert.equal(intent.layout, 'matrix');
    assert.equal(intent.variant, 'impossible-triangle');
    assert.equal(intent.capability.mode, 'fixed-model');
    assert.equal(intent.capability.fixedSlots, 3);
  }

  assert.equal(resolveMornDraftFlatComponentIntent('输出优先级四象限')?.pair, 'matrix/quadrant');
  assert.equal(resolveMornDraftFlatComponentIntent('画一个能力雷达图')?.pair, 'metrics/radar-hex');
  assert.equal(resolveMornDraftFlatComponentIntent('帮我画一个用户旅程：浏览、加购、支付、复购')?.pair, 'flow/journey');
  assert.equal(resolveMornDraftFlatComponentIntent('帮我画一个换行流程')?.pair, 'flow/wrapped');
  assert.equal(resolveMornDraftFlatComponentIntent('输出项目甘特图')?.pair, 'flow/gantt');
  assert.equal(resolveMornDraftFlatComponentIntent('补一段说明文字'), null);
});

test('adaptMornDraftFlatComponent maps every public variant into existing renderer layouts', () => {
  assert.equal(MORNDRAFT_FLAT_ADAPTER_FIXTURES.length, getPublicVariantCount());
  assert.deepEqual(
    MORNDRAFT_FLAT_ADAPTER_FIXTURES.map((fixture) => `${fixture.input.layout}/${fixture.input.variant}`),
    CANONICAL_PUBLIC_PAIRS,
  );
  assert.deepEqual(
    MORNDRAFT_FLAT_ADAPTER_FIXTURES.map((fixture) => fixture.title),
    CANONICAL_PUBLIC_TITLES,
  );

  for (const fixture of MORNDRAFT_FLAT_ADAPTER_FIXTURES) {
    const result = adaptMornDraftFlatComponent(fixture.input, {
      target: '16:9',
      themeColor: '#0f766e',
    });

    assert.equal(result.ok, true, fixture.id);
    assert.equal(result.diagnostics.length, 0, fixture.id);
    assert.equal(result.documentSpec.version, 'v1', fixture.id);
    assert.equal(result.documentSpec.target, '16:9', fixture.id);
    assert.equal(result.documentSpec.theme.scheme, 'K', fixture.id);
    assert.equal(result.documentSpec.theme.family, 'editorial', fixture.id);
    assert.equal(result.documentSpec.pages.length, 1, fixture.id);
    assert.equal(result.documentSpec.pages[0].layout, fixture.expectedLayout, fixture.id);
    if (fixture.expectedVariant) {
      assert.equal(result.documentSpec.pages[0].variant, fixture.expectedVariant, fixture.id);
      assert.equal(result.metadata.documentSpecVariant, fixture.expectedVariant, fixture.id);
    }
    assert.equal(result.documentSpec.pages[0].items.length, fixture.expectedItems, fixture.id);
    assert.equal(result.metadata.layout, fixture.input.layout, fixture.id);
    assert.equal(result.metadata.variant, fixture.input.variant, fixture.id);
    assert.equal(result.metadata.documentSpecLayout, fixture.expectedLayout, fixture.id);
  }
});

test('adaptMornDraftFlatComponent maps structural public root fields into internal slots', () => {
  const mind = adaptMornDraftFlatComponentSource(`{
    layout: "map",
    variant: "mind",
    root: "产品结构",
    items: [
      { label: "设计", children: ["需求", "原型"] }
    ],
  }`);
  assert.equal(mind.ok, true);
  assert.equal(mind.documentSpec.pages[0].layout, 'mind-map');
  assert.equal(mind.documentSpec.pages[0].slots.root, '产品结构');
  assert.deepEqual(mind.documentSpec.pages[0].__morndraftEditPaths.slots, {
    root: '$.root',
  });

  const quadrant = adaptMornDraftFlatComponent({
    layout: 'matrix',
    variant: 'quadrant',
    axisTop: '高价值',
    axisBottom: '低价值',
    axisLeft: '低成本',
    axisRight: '高成本',
    center: '优先级',
    items: [
      { label: '优先推进' },
      { label: '谨慎规划' },
      { label: '暂缓处理' },
      { label: '快速验证' },
    ],
  });
  assert.equal(quadrant.ok, true);
  assert.equal(quadrant.documentSpec.pages[0].layout, 'quadrant-axis');
  assert.equal(quadrant.documentSpec.pages[0].slots.axisTop, '高价值');
  assert.equal(quadrant.documentSpec.pages[0].slots.center, '优先级');
});

test('adaptMornDraftFlatComponent rejects old public layouts, aliases and natural root fields', () => {
  const cases = [
    {
      input: { layout: 'process', variant: 'arrow', items: createItems(3) },
      codes: ['morndraft_flat.unknown_layout'],
    },
    {
      input: { layout: 'flow', variant: 'arrow', items: createItems(3) },
      codes: ['morndraft_flat.invalid_variant'],
    },
    {
      input: { layout: 'flow', variant: 'loop-triangle', items: createItems(3) },
      codes: ['morndraft_flat.invalid_variant'],
    },
    {
      input: { layout: 'flow', variant: 'loop-square', items: createItems(4) },
      codes: ['morndraft_flat.invalid_variant'],
    },
    {
      input: { layout: 'flow', variant: 'loop-pentagon', items: createItems(5) },
      codes: ['morndraft_flat.invalid_variant'],
    },
    {
      input: { layout: 'flow', variant: 'chain', steps: ['Draft', 'Ship'] },
      codes: ['morndraft_flat.reserved_field', 'morndraft_flat.field_required'],
    },
    {
      input: { layout: 'cards', variant: 'cover', items: createItems(1) },
      codes: ['morndraft_flat.invalid_variant'],
    },
    {
      input: { layout: 'cards', variant: 'title', items: createItems(1) },
      codes: ['morndraft_flat.invalid_variant'],
    },
    {
      input: { layout: 'cards', variant: 'quote', items: createItems(1) },
      codes: ['morndraft_flat.invalid_variant'],
    },
    {
      input: { layout: 'cards', variant: 'code', items: createItems(1) },
      codes: ['morndraft_flat.invalid_variant'],
    },
    {
      input: { layout: 'cards', variant: 'list', themeColor: '#123abc', items: createItems(1) },
      codes: ['morndraft_flat.reserved_field'],
    },
    {
      input: { layout: 'cards', variant: 'terminal', code: 'const ok = true;', language: 'ts', items: createItems(1) },
      codes: ['morndraft_flat.reserved_field', 'morndraft_flat.reserved_field'],
    },
    {
      input: { layout: 'cards', variant: 'list', title: 'Old title', items: createItems(1) },
      codes: ['morndraft_flat.reserved_field'],
    },
    {
      input: { layout: 'cards', variant: 'list', foo: 'bar', items: createItems(1) },
      codes: ['morndraft_flat.unsupported_field'],
    },
    {
      input: { layout: 'flow', variant: 'chain', items: [{ title: '旧标题字段' }] },
      codes: ['morndraft_flat.unsupported_item_field'],
    },
  ];

  for (const item of cases) {
    const result = adaptMornDraftFlatComponent(item.input);
    assert.equal(result.ok, false);
    assert.equal(result.documentSpec, null);
    assert.deepEqual(getCodes(result), item.codes);
  }
});

test('flow loop variants keep count-driven public syntax and validate supported item counts', () => {
  for (const variant of ['loop', 'closed-loop']) {
    [3, 4, 5, 6].forEach((count) => {
      const result = adaptMornDraftFlatComponent({
        layout: 'flow',
        variant,
        items: createItems(count),
      });
      assert.equal(result.ok, true, `flow/${variant} ${count} items`);
      assert.equal(result.documentSpec.pages[0].layout, 'process-loop');
      assert.equal(result.documentSpec.pages[0].variant, variant === 'closed-loop' ? 'closed-loop' : undefined);
      assert.equal(result.documentSpec.pages[0].items.length, count);
    });

    [1, 2, 7].forEach((count) => {
      const result = adaptMornDraftFlatComponent({
        layout: 'flow',
        variant,
        items: createItems(count),
      });
      assert.equal(result.ok, false, `flow/${variant} ${count} items`);
      assert.deepEqual(getCodes(result), ['morndraft_flat.loop_item_count']);
    });
  }
});

test('map/pyramid variants validate bounded layer counts', () => {
  for (const variant of ['pyramid', 'pyramid-inverted']) {
    for (const count of [3, 5]) {
      const result = adaptMornDraftFlatComponent({
        layout: 'map',
        variant,
        items: createItems(count),
      });
      assert.equal(result.ok, true, `${variant}:${count}`);
      assert.equal(result.documentSpec.pages[0].items.length, count, `${variant}:${count}`);
    }

    for (const count of [2, 6]) {
      const result = adaptMornDraftFlatComponent({
        layout: 'map',
        variant,
        items: createItems(count),
      });
      assert.equal(result.ok, false, `${variant}:${count}`);
      assert.deepEqual(getCodes(result), ['morndraft_flat.pyramid_item_count'], `${variant}:${count}`);
    }
  }
});

test('matrix/impossible-triangle validates exactly three tradeoff points', () => {
  const valid = adaptMornDraftFlatComponent({
    layout: 'matrix',
    variant: 'impossible-triangle',
    items: [
      { label: '成本' },
      { label: '效率' },
      { label: '质量' },
    ],
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.documentSpec.pages[0].layout, 'impossible-triangle');
  assert.equal(valid.documentSpec.pages[0].items.length, 3);

  for (const count of [2, 4]) {
    const invalid = adaptMornDraftFlatComponent({
      layout: 'matrix',
      variant: 'impossible-triangle',
      items: createItems(count),
    });
    assert.equal(invalid.ok, false, `impossible-triangle:${count}`);
    assert.deepEqual(getCodes(invalid), ['morndraft_flat.impossible_triangle_item_count']);
  }
});

test('flow process variants validate bounded item counts', () => {
  const cases = [
    ['chain', 7],
    ['steps', 6],
    ['annotated', 4],
    ['annotated-chain', 4],
  ];

  for (const [variant, maxItems] of cases) {
    const valid = adaptMornDraftFlatComponent({
      layout: 'flow',
      variant,
      items: createItems(maxItems),
    });
    assert.equal(valid.ok, true, `${variant}:${maxItems}`);
    assert.equal(valid.documentSpec.pages[0].items.length, maxItems, `${variant}:${maxItems}`);

    const invalid = adaptMornDraftFlatComponent({
      layout: 'flow',
      variant,
      items: createItems(maxItems + 1),
    });
    assert.equal(invalid.ok, false, `${variant}:${maxItems + 1}`);
    assert.deepEqual(getCodes(invalid), ['morndraft_flat.process_item_count'], `${variant}:${maxItems + 1}`);
  }

  for (const count of [4, 6, 8]) {
    const validWrapped = adaptMornDraftFlatComponent({
      layout: 'flow',
      variant: 'wrapped',
      items: createItems(count),
    });
    assert.equal(validWrapped.ok, true, `wrapped:${count}`);
    assert.equal(validWrapped.documentSpec.pages[0].items.length, count, `wrapped:${count}`);
  }

  for (const count of [1, 2, 3, 5, 7, 9]) {
    const invalidWrapped = adaptMornDraftFlatComponent({
      layout: 'flow',
      variant: 'wrapped',
      items: createItems(count),
    });
    assert.equal(invalidWrapped.ok, false, `wrapped:${count}`);
    assert.deepEqual(getCodes(invalidWrapped), ['morndraft_flat.process_item_count'], `wrapped:${count}`);
    assert.match(invalidWrapped.diagnostics[0].message, /flow\/wrapped supports exactly 4, 6, or 8 items/);
  }

  const annotatedChainSingle = adaptMornDraftFlatComponent({
    layout: 'flow',
    variant: 'annotated-chain',
    items: createItems(1),
  });
  assert.equal(annotatedChainSingle.ok, false);
  assert.deepEqual(getCodes(annotatedChainSingle), ['morndraft_flat.process_item_count']);

  const annotatedChainMinimum = adaptMornDraftFlatComponent({
    layout: 'flow',
    variant: 'annotated-chain',
    items: createItems(2),
  });
  assert.equal(annotatedChainMinimum.ok, true);
  assert.equal(annotatedChainMinimum.documentSpec.pages[0].items.length, 2);
});

test('metrics/radar-hex enforces dynamic dimension count rules with stable diagnostics', () => {
  const two = adaptMornDraftFlatComponent({
    layout: 'metrics',
    variant: 'radar-hex',
    items: createItems(2),
  });
  assert.equal(two.ok, false);
  assert.deepEqual(getCodes(two), ['morndraft_flat.radar_item_count']);

  const three = adaptMornDraftFlatComponent({
    layout: 'metrics',
    variant: 'radar-hex',
    items: createItems(3),
  });
  assert.equal(three.ok, true);
  assert.deepEqual(three.diagnostics, []);

  const eight = adaptMornDraftFlatComponent({
    layout: 'metrics',
    variant: 'radar-hex',
    items: createItems(8),
  });
  assert.equal(eight.ok, true);
  assert.deepEqual(eight.diagnostics, []);

  const nine = adaptMornDraftFlatComponent({
    layout: 'metrics',
    variant: 'radar-hex',
    items: createItems(9),
  });
  assert.equal(nine.ok, true);
  assert.equal(nine.diagnostics[0].severity, 'warning');
  assert.equal(nine.diagnostics[0].code, 'morndraft_flat.radar_item_count');

  const twelve = adaptMornDraftFlatComponent({
    layout: 'metrics',
    variant: 'radar-hex',
    items: createItems(12),
  });
  assert.equal(twelve.ok, false);
  assert.deepEqual(getCodes(twelve), ['morndraft_flat.radar_item_count']);
});

test('metrics/radar is no longer accepted by the public v2 protocol', () => {
  const result = adaptMornDraftFlatComponent({
    layout: 'metrics',
    variant: 'radar',
    items: createItems(3),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(getCodes(result), ['morndraft_flat.invalid_variant']);
});

test('cards/two-column and cards/three-column validate bounded dynamic card grids', () => {
  for (const variant of ['two-column', 'three-column']) {
    for (const count of [2, 3, 6]) {
      const result = adaptMornDraftFlatComponent({
        layout: 'cards',
        variant,
        items: createItems(count),
      });
      assert.equal(result.ok, true, `${variant}:${count}`);
      assert.equal(result.documentSpec.pages[0].items.length, count, `${variant}:${count}`);
    }

    for (const count of [1, 7]) {
      const result = adaptMornDraftFlatComponent({
        layout: 'cards',
        variant,
        items: createItems(count),
      });
      assert.equal(result.ok, false, `${variant}:${count}`);
      assert.deepEqual(getCodes(result), ['morndraft_flat.card_grid_item_count'], `${variant}:${count}`);
    }
  }
});

test('morndraft flat source edit map patches v2 item and structural fields without reformatting JSON5', () => {
  const source = [
    '{',
    '  // keep comment',
    "  layout: 'flow',",
    "  variant: 'chain',",
    '  items: [',
    '    { label: "Draft", note: "Start" },',
    '    { label: "Validate", note: "Check schema" },',
    '  ],',
    '}',
  ].join('\n');
  const editMap = createMornDraftFlatSourceEditMap(source);

  assert.equal(editMap['$.items[0].label'].value, 'Draft');
  assert.equal(editMap['$.items[1].note'].value, 'Check schema');

  const patched = patchMornDraftFlatSourceValues(source, [
    { path: '$.items[0].label', value: '编辑闭环' },
    { path: '$.items[1].note', value: '校验协议' },
  ]);

  assert.equal(patched.ok, true);
  assert.equal(patched.changed, true);
  assert.match(patched.source, /\/\/ keep comment/);
  assert.match(patched.source, /layout: 'flow'/);
  assert.match(patched.source, /label: "编辑闭环"/);
  assert.match(patched.source, /note: "校验协议"/);
  assert.equal(adaptMornDraftFlatComponentSource(patched.source).ok, true);
});

test('morndraft flat source patch appends and removes items without truncating dynamic components', () => {
  const source = [
    '{',
    '  // keep comment',
    "  layout: 'cards',",
    "  variant: 'two-column',",
    '  items: [',
    '    { label: "背景", value: "说明问题" },',
    '    { label: "方案", value: "说明做法" }',
    '  ],',
    '}',
  ].join('\n');

  const stylePatched = patchMornDraftFlatSourceValues(source, [
    { path: '$.variant', value: 'three-column' },
  ]);
  assert.equal(stylePatched.ok, true);
  assert.match(stylePatched.source, /variant: 'three-column'/);
  assert.equal(adaptMornDraftFlatComponentSource(stylePatched.source).ok, true);

  const appended = patchMornDraftFlatSourceItems(stylePatched.source, {
    action: 'append',
    item: { label: '新增项 3', value: '补充内容' },
  });
  assert.equal(appended.ok, true);
  assert.match(appended.source, /\/\/ keep comment/);
  assert.match(appended.source, /\{ label: "新增项 3", value: "补充内容" \}/);
  const appendedResult = adaptMornDraftFlatComponentSource(appended.source);
  assert.equal(appendedResult.ok, true);
  assert.equal(appendedResult.documentSpec.pages[0].items.length, 3);

  const removed = patchMornDraftFlatSourceItems(appended.source, { action: 'remove-last' });
  assert.equal(removed.ok, true);
  assert.doesNotMatch(removed.source, /新增项 3/);
  assert.match(removed.source, /\{ label: "方案", value: "说明做法" \}\n\s{2}\]/);
  assert.doesNotMatch(removed.source, /\{ label: "方案", value: "说明做法" \},\n\s{2}\]/);
  const removedResult = adaptMornDraftFlatComponentSource(removed.source);
  assert.equal(removedResult.ok, true);
  assert.equal(removedResult.documentSpec.pages[0].items.length, 2);

  const compact = patchMornDraftFlatSourceItems(
    '{ layout: "flow", variant: "chain", items: [{ label: "A" }, { label: "B" }] }',
    { action: 'append', item: { label: 'C' } },
  );
  assert.equal(compact.ok, true);
  assert.match(compact.source, /\{ label: "B" \}, \{ label: "C" \}/);
  const compactRemoved = patchMornDraftFlatSourceItems(compact.source, { action: 'remove-last' });
  assert.equal(compactRemoved.ok, true);
  assert.doesNotMatch(compactRemoved.source, /label: "C"/);
  assert.doesNotMatch(compactRemoved.source, /\},\s*\]/);
  assert.equal(adaptMornDraftFlatComponentSource(compactRemoved.source).ok, true);

  const compactTrailingAppended = patchMornDraftFlatSourceItems(
    '{ layout: "flow", variant: "chain", items: [{ label: "A" }, { label: "B" },] }',
    { action: 'append', item: { label: 'C' } },
  );
  assert.equal(compactTrailingAppended.ok, true);
  assert.match(compactTrailingAppended.source, /\{ label: "B" \}, \{ label: "C" \},\]/);
  assert.doesNotMatch(compactTrailingAppended.source, /,,/);
  assert.equal(adaptMornDraftFlatComponentSource(compactTrailingAppended.source).ok, true);

  const compactTrailingRemoved = patchMornDraftFlatSourceItems(
    '{ layout: "flow", variant: "chain", items: [{ label: "A" }, { label: "B" },] }',
    { action: 'remove-last' },
  );
  assert.equal(compactTrailingRemoved.ok, true);
  assert.match(compactTrailingRemoved.source, /\{ label: "A" \},\s*\]/);
  assert.equal(adaptMornDraftFlatComponentSource(compactTrailingRemoved.source).ok, true);

  const multilineTrailingRemoved = patchMornDraftFlatSourceItems([
    '{',
    '  layout: "flow",',
    '  variant: "chain",',
    '  items: [',
    '    { label: "A" },',
    '    { label: "B" },',
    '  ],',
    '}',
  ].join('\n'), { action: 'remove-last' });
  assert.equal(multilineTrailingRemoved.ok, true);
  assert.match(multilineTrailingRemoved.source, /\{ label: "A" \},\n\s{2}\]/);
  assert.equal(adaptMornDraftFlatComponentSource(multilineTrailingRemoved.source).ok, true);
});

test('morndraft flat source patch can prepend and remove first items for inverted pyramid', () => {
  const compactPrepended = patchMornDraftFlatSourceItems(
    '{ layout: "map", variant: "pyramid-inverted", items: [{ label: "A" }, { label: "B" }, { label: "C" }] }',
    { action: 'prepend', item: { label: '新增层' } },
  );
  assert.equal(compactPrepended.ok, true);
  assert.match(compactPrepended.source, /items: \[\{ label: "新增层" \}, \{ label: "A" \}/);
  assert.equal(adaptMornDraftFlatComponentSource(compactPrepended.source).ok, true);

  const compactRemoved = patchMornDraftFlatSourceItems(compactPrepended.source, { action: 'remove-first' });
  assert.equal(compactRemoved.ok, true);
  assert.doesNotMatch(compactRemoved.source, /新增层/);
  assert.match(compactRemoved.source, /items: \[\{ label: "A" \}, \{ label: "B" \}, \{ label: "C" \}\]/);
  assert.equal(adaptMornDraftFlatComponentSource(compactRemoved.source).ok, true);

  const multilinePrepended = patchMornDraftFlatSourceItems([
    '{',
    '  layout: "map",',
    '  variant: "pyramid-inverted",',
    '  items: [',
    '    { label: "愿景" },',
    '    { label: "战略" },',
    '    { label: "能力" }',
    '  ],',
    '}',
  ].join('\n'), { action: 'prepend', item: { label: '新增层' } });
  assert.equal(multilinePrepended.ok, true);
  assert.match(multilinePrepended.source, /items: \[\n\s{4}\{ label: "新增层" \},\n\s{4}\{ label: "愿景" \}/);
  assert.equal(adaptMornDraftFlatComponentSource(multilinePrepended.source).ok, true);

  const multilineRemoved = patchMornDraftFlatSourceItems(multilinePrepended.source, { action: 'remove-first' });
  assert.equal(multilineRemoved.ok, true);
  assert.doesNotMatch(multilineRemoved.source, /新增层/);
  assert.match(multilineRemoved.source, /items: \[\n\s{4}\{ label: "愿景" \},\n\s{4}\{ label: "战略" \}/);
  assert.equal(adaptMornDraftFlatComponentSource(multilineRemoved.source).ok, true);
});

test('morndraft flat default item factory keeps add-item output renderer-shaped', () => {
  assert.deepEqual(
    createDefaultMornDraftFlatItem({
      layout: 'metrics',
      variant: 'radar-hex',
      items: createItems(3),
    }),
    { label: '新增项 4', value: '60%' },
  );

  assert.deepEqual(
    createDefaultMornDraftFlatItem({
      layout: 'flow',
      variant: 'gantt',
      items: [
        { label: '调研', start: 0, width: 24 },
        { label: '设计', start: 20, width: 28 },
      ],
    }),
    { label: '新增项 3', start: 28, width: 28 },
  );

  assert.deepEqual(
    createDefaultMornDraftFlatItem({
      layout: 'compare',
      variant: 'table',
      items: [
        { role: 'header', values: ['维度', '当前', '目标'] },
        { values: ['结构', '分散', '统一'] },
      ],
    }),
    { values: ['新增项 3', '补充内容', '补充内容'] },
  );

  assert.deepEqual(
    createDefaultMornDraftFlatItem({
      layout: 'map',
      variant: 'fishbone',
      items: [
        { label: '人员不足', side: 'top' },
        { label: '流程混乱', side: 'top' },
        { label: '工具落后', side: 'bottom' },
      ],
    }),
    { label: '新增项 4', side: 'bottom' },
  );

  assert.deepEqual(
    createDefaultMornDraftFlatItem({
      layout: 'map',
      variant: 'platform-architecture',
      items: [{ label: '应用', modules: ['应用管理'] }],
    }),
    { label: '新增项 2', modules: ['模块'] },
  );

  assert.deepEqual(
    createDefaultMornDraftFlatItem({
      layout: 'map',
      variant: 'pyramid',
      items: createItems(3),
    }),
    { label: '新增项 4' },
  );

  assert.deepEqual(
    createDefaultMornDraftFlatItem({
      layout: 'map',
      variant: 'pyramid-inverted',
      items: createItems(3),
    }),
    { label: '新增层' },
  );

  assert.deepEqual(
    createDefaultMornDraftFlatItem({
      layout: 'cards',
      variant: 'three-column',
      items: [{ icon: '✦', label: '设计', value: '统一视觉语言' }],
    }),
    { label: '新增项 2', value: '补充内容' },
  );

});

test('morndraft flat writeback keeps items paths for map/mind children and quadrant axes', () => {
  const mindSource = [
    '{',
    '  layout: "map",',
    '  variant: "mind",',
    '  root: "产品",',
    '  items: [',
    '    { label: "设计", children: ["需求", "原型"] },',
    '  ],',
    '}',
  ].join('\n');
  const mindMap = createMornDraftFlatSourceEditMap(mindSource);
  assert.equal(mindMap['$.root'].value, '产品');
  assert.equal(mindMap['$.items[0].children[0]'].value, '需求');

  const mindPatched = patchMornDraftFlatSourceValues(mindSource, [
    { path: '$.root', value: '交付结构' },
    { path: '$.items[0].children[0]', value: '用户调研' },
  ]);
  assert.equal(mindPatched.ok, true);
  assert.match(mindPatched.source, /root: "交付结构"/);
  assert.match(mindPatched.source, /"用户调研"/);
  assert.equal(adaptMornDraftFlatComponentSource(mindPatched.source).ok, true);

  const quadrantSource = [
    '{',
    '  layout: "matrix",',
    '  variant: "quadrant",',
    '  axisTop: "高价值",',
    '  axisBottom: "低价值",',
    '  items: [',
    '    { label: "优先推进" },',
    '  ],',
    '}',
  ].join('\n');
  const quadrantPatched = patchMornDraftFlatSourceValues(quadrantSource, [
    { path: '$.axisTop', value: '高影响' },
    { path: '$.items[0].label', value: '立即推进' },
  ]);
  assert.equal(quadrantPatched.ok, true);
  assert.match(quadrantPatched.source, /axisTop: "高影响"/);
  assert.match(quadrantPatched.source, /label: "立即推进"/);
  assert.equal(adaptMornDraftFlatComponentSource(quadrantPatched.source).ok, true);
});

test('adaptMornDraftFlatComponentSource parses JSON5 and formats v2 diagnostics', () => {
  const result = adaptMornDraftFlatComponentSource('{ layout: "flow", variant: "chain", items: ["Draft", "Ship"] }');
  assert.equal(result.ok, false);
  assert.deepEqual(getCodes(result), [
    'morndraft_flat.invalid_item',
    'morndraft_flat.invalid_item',
  ]);

  const valid = adaptMornDraftFlatComponentSource('{ layout: "flow", variant: "chain", items: [{ label: "Draft" }] }');
  assert.equal(valid.ok, true);
  assert.equal(valid.component.layout, 'flow');
  assert.equal(valid.sourceEditMap['$.items[0].label'].value, 'Draft');
  assert.equal(valid.documentSpec.pages[0].items[0].__morndraftEditPaths.label, '$.items[0].label');

  const invalid = adaptMornDraftFlatComponentSource('{ layout: "unknown", variant: "x", items: [{ label: "Draft" }] }');
  assert.equal(invalid.ok, false);
  assert.equal(invalid.component.layout, 'unknown');
  assert.equal(invalid.diagnostics[0].code, 'morndraft_flat.unknown_layout');
  assert.match(formatMornDraftFlatDiagnosticMessage(invalid.diagnostics[0]), /Unsupported MornDraft layout/);

  const syntax = adaptMornDraftFlatComponentSource('{ layout: }');
  assert.equal(syntax.ok, false);
  assert.equal(syntax.diagnostics[0].code, 'morndraft_flat.invalid_source');
  assert.match(formatMornDraftFlatDiagnosticMessage(syntax.diagnostics[0]), /JSON object/);
});
