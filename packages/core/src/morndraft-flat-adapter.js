import {
  DOCUMENT_SPEC_VERSION,
  validateDocumentSpec,
} from './document-spec.js';
import JSON5 from 'json5';
import { createMornDraftFlatSourceEditMap } from './morndraft-flat-source-patch.js';

const DEFAULT_COMPONENT_TYPE = 'morndraft-flat';
const MORNDRAFT_CATALOG_COMPONENT_TYPE = 'swiss-catalog';
const DEFAULT_TARGET = '3:4';
const DEFAULT_PROTOCOL_VERSION = '2.0';
const DEFAULT_SWISS_CATALOG_THEME = Object.freeze({
  scheme: 'K',
  family: 'editorial',
});

export const MORNDRAFT_FLAT_PUBLIC_LAYOUTS = Object.freeze([
  'flow',
  'compare',
  'map',
  'cards',
  'metrics',
  'matrix',
]);

export const MORNDRAFT_FLAT_LAYOUT_VARIANTS = Object.freeze({
  flow: Object.freeze([
    'chain',
    'steps',
    'annotated',
    'wrapped',
    'annotated-chain',
    'timeline',
    'timeline-vertical',
    'loop',
    'closed-loop',
    'journey',
    'gantt',
  ]),
  compare: Object.freeze([
    'vs',
    'before-after',
    'verification',
    'table',
    'swot',
    'venn',
    'venn-two',
  ]),
  map: Object.freeze([
    'mind',
    'mind-horizontal',
    'architecture',
    'platform-architecture',
    'platform-architecture-complex',
    'fishbone',
    'iceberg',
    'pyramid',
    'pyramid-inverted',
    'concentric',
    'concentric-top',
    'concentric-bottom',
  ]),
  cards: Object.freeze([
    'list',
    'workflow-list',
    'toc',
    'form',
    'alert',
    'terminal',
    'two-column',
    'three-column',
    'split',
    'split-accent',
  ]),
  metrics: Object.freeze(['radar-hex', 'stats']),
  matrix: Object.freeze(['quadrant', 'impossible-triangle', 'grid']),
});

export const MORNDRAFT_FLAT_PUBLIC_CATEGORIES = Object.freeze([
  Object.freeze({
    id: 'flow',
    label: '流程/时序',
    pairs: Object.freeze([
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
    ]),
  }),
  Object.freeze({
    id: 'comparison',
    label: '对比/评估',
    pairs: Object.freeze([
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
    ]),
  }),
  Object.freeze({
    id: 'data',
    label: '数据/可视化',
    pairs: Object.freeze([
      'metrics/stats',
      'metrics/radar-hex',
    ]),
  }),
  Object.freeze({
    id: 'structure',
    label: '关系/结构',
    pairs: Object.freeze([
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
    ]),
  }),
  Object.freeze({
    id: 'content',
    label: '内容/排版',
    pairs: Object.freeze([
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
    ]),
  }),
]);

export const MORNDRAFT_FLAT_COMPONENT_CAPABILITIES = Object.freeze({
  'flow/chain': Object.freeze({ mode: 'bounded-items', publicShowcase: true, maxItems: 7 }),
  'flow/steps': Object.freeze({ mode: 'bounded-items', publicShowcase: true, maxItems: 6 }),
  'flow/annotated': Object.freeze({ mode: 'bounded-items', publicShowcase: true, maxItems: 4 }),
  'flow/wrapped': Object.freeze({
    mode: 'bounded-items',
    publicShowcase: true,
    minItems: 4,
    maxItems: 8,
    supportedItemCounts: Object.freeze([4, 6, 8]),
  }),
  'flow/annotated-chain': Object.freeze({ mode: 'bounded-items', publicShowcase: true, minItems: 2, maxItems: 4 }),
  'flow/timeline': Object.freeze({ mode: 'items-driven', publicShowcase: true }),
  'flow/timeline-vertical': Object.freeze({ mode: 'items-driven', publicShowcase: true }),
  'flow/loop': Object.freeze({ mode: 'bounded-items', publicShowcase: true, minItems: 3, maxItems: 6 }),
  'flow/closed-loop': Object.freeze({ mode: 'bounded-items', publicShowcase: true, minItems: 3, maxItems: 6 }),
  'flow/journey': Object.freeze({ mode: 'fixed-model', publicShowcase: true, fixedSlots: 5 }),
  'flow/gantt': Object.freeze({ mode: 'items-driven', publicShowcase: true }),
  'compare/vs': Object.freeze({ mode: 'fixed-model', publicShowcase: true, fixedSlots: 2 }),
  'compare/before-after': Object.freeze({ mode: 'fixed-model', publicShowcase: true, fixedSlots: 2 }),
  'compare/verification': Object.freeze({ mode: 'fixed-model', publicShowcase: true }),
  'compare/table': Object.freeze({ mode: 'items-driven', publicShowcase: true, sampleShowcase: false }),
  'compare/swot': Object.freeze({ mode: 'fixed-model', publicShowcase: true, fixedSlots: 4 }),
  'compare/venn': Object.freeze({ mode: 'fixed-model', publicShowcase: true, fixedSlots: 3 }),
  'compare/venn-two': Object.freeze({ mode: 'fixed-model', publicShowcase: true, fixedSlots: 2 }),
  'matrix/quadrant': Object.freeze({ mode: 'fixed-model', publicShowcase: true, fixedSlots: 4 }),
  'matrix/impossible-triangle': Object.freeze({ mode: 'fixed-model', publicShowcase: true, fixedSlots: 3 }),
  'matrix/grid': Object.freeze({ mode: 'items-driven', publicShowcase: true }),
  'metrics/stats': Object.freeze({ mode: 'items-driven', publicShowcase: true }),
  'metrics/radar-hex': Object.freeze({ mode: 'bounded-items', publicShowcase: true, minItems: 3, recommendedMaxItems: 8, maxItems: 11 }),
  'map/mind': Object.freeze({ mode: 'items-driven', publicShowcase: true }),
  'map/mind-horizontal': Object.freeze({ mode: 'items-driven', publicShowcase: true }),
  'map/architecture': Object.freeze({ mode: 'internal-layout', publicShowcase: false }),
  'map/platform-architecture': Object.freeze({ mode: 'items-driven', publicShowcase: true }),
  'map/platform-architecture-complex': Object.freeze({ mode: 'items-driven', publicShowcase: true }),
  'map/fishbone': Object.freeze({ mode: 'items-driven', publicShowcase: true }),
  'map/iceberg': Object.freeze({ mode: 'fixed-model', publicShowcase: true, fixedSlots: 2 }),
  'map/pyramid': Object.freeze({ mode: 'bounded-items', publicShowcase: true, minItems: 3, maxItems: 5 }),
  'map/pyramid-inverted': Object.freeze({ mode: 'bounded-items', publicShowcase: true, minItems: 3, maxItems: 5 }),
  'map/concentric': Object.freeze({ mode: 'bounded-items', publicShowcase: true, minItems: 2, recommendedMaxItems: 5 }),
  'map/concentric-top': Object.freeze({ mode: 'bounded-items', publicShowcase: true, minItems: 2, recommendedMaxItems: 5 }),
  'map/concentric-bottom': Object.freeze({ mode: 'bounded-items', publicShowcase: true, minItems: 2, recommendedMaxItems: 5 }),
  'cards/list': Object.freeze({ mode: 'items-driven', publicShowcase: true }),
  'cards/workflow-list': Object.freeze({ mode: 'internal-layout', publicShowcase: false }),
  'cards/toc': Object.freeze({ mode: 'internal-layout', publicShowcase: false }),
  'cards/form': Object.freeze({ mode: 'internal-layout', publicShowcase: false }),
  'cards/alert': Object.freeze({ mode: 'internal-layout', publicShowcase: false }),
  'cards/terminal': Object.freeze({ mode: 'internal-layout', publicShowcase: false }),
  'cards/two-column': Object.freeze({ mode: 'bounded-items', publicShowcase: true, minItems: 2, maxItems: 6 }),
  'cards/three-column': Object.freeze({ mode: 'bounded-items', publicShowcase: true, minItems: 2, maxItems: 6 }),
  'cards/split': Object.freeze({ mode: 'internal-layout', publicShowcase: false }),
  'cards/split-accent': Object.freeze({ mode: 'internal-layout', publicShowcase: false }),
});

const freezeStyleFamily = (family) => Object.freeze({
  ...family,
  variants: Object.freeze(family.variants.map((variant) => Object.freeze({ ...variant }))),
});

export const MORNDRAFT_FLAT_STYLE_FAMILIES = Object.freeze([
  freezeStyleFamily({
    id: 'flow-timeline',
    label: '时间线',
    layout: 'flow',
    defaultVariant: 'timeline',
    variants: [
      { variant: 'timeline', label: '横向' },
      { variant: 'timeline-vertical', label: '垂直' },
    ],
  }),
  freezeStyleFamily({
    id: 'flow-loop',
    label: '循环流程',
    layout: 'flow',
    defaultVariant: 'loop',
    variants: [
      { variant: 'loop', label: '循环' },
      { variant: 'closed-loop', label: '闭环' },
    ],
  }),
  freezeStyleFamily({
    id: 'map-mind',
    label: '思维导图',
    layout: 'map',
    defaultVariant: 'mind',
    variants: [
      { variant: 'mind', label: '纵向' },
      { variant: 'mind-horizontal', label: '横向' },
    ],
  }),
  freezeStyleFamily({
    id: 'map-pyramid',
    label: '金字塔',
    layout: 'map',
    defaultVariant: 'pyramid',
    variants: [
      { variant: 'pyramid', label: '正金字塔' },
      { variant: 'pyramid-inverted', label: '倒金字塔' },
    ],
  }),
  freezeStyleFamily({
    id: 'map-concentric',
    label: '同心圆',
    layout: 'map',
    defaultVariant: 'concentric',
    variants: [
      { variant: 'concentric', label: '居中' },
      { variant: 'concentric-top', label: '顶部对齐' },
      { variant: 'concentric-bottom', label: '底部对齐' },
    ],
  }),
  freezeStyleFamily({
    id: 'cards-column-grid',
    label: '分栏',
    layout: 'cards',
    defaultVariant: 'two-column',
    variants: [
      { variant: 'two-column', label: '双栏' },
      { variant: 'three-column', label: '三栏' },
    ],
  }),
]);

export const MORNDRAFT_FLAT_STYLE_FAMILY_BY_PAIR = Object.freeze(
  Object.fromEntries(
    MORNDRAFT_FLAT_STYLE_FAMILIES.flatMap((family) =>
      family.variants.map((variant) => [
        `${family.layout}/${variant.variant}`,
        family,
      ]),
    ),
  ),
);

export const MORNDRAFT_FLAT_STYLE_SECONDARY_PAIRS = Object.freeze(
  MORNDRAFT_FLAT_STYLE_FAMILIES.flatMap((family) =>
    family.variants
      .filter((variant) => variant.variant !== family.defaultVariant)
      .map((variant) => `${family.layout}/${variant.variant}`),
  ),
);

const MORNDRAFT_FLAT_STYLE_SECONDARY_PAIR_SET = new Set(MORNDRAFT_FLAT_STYLE_SECONDARY_PAIRS);

export function getMornDraftFlatStyleFamily(layout, variant) {
  const pair = `${maybeString(layout)}/${maybeString(variant)}`;
  return MORNDRAFT_FLAT_STYLE_FAMILY_BY_PAIR[pair] || null;
}

const MORNDRAFT_FLAT_COMPONENT_INTENTS = Object.freeze([
  Object.freeze({
    pair: 'matrix/impossible-triangle',
    label: '不可能三角',
    aliases: Object.freeze([
      '不可能三角',
      '不可能三角形',
      '三角取舍',
      '三难选择',
      '项目三角',
      '项目管理三角',
      '铁三角',
      '成本质量效率',
      '成本效率质量',
      '质量效率成本',
      '质量成本效率',
      '效率质量成本',
      '效率成本质量',
      'impossible triangle',
      'tradeoff triangle',
      'iron triangle',
      'project triangle',
      'project management triangle',
      'trilemma',
      'cost quality speed',
      'cost speed quality',
      'cost quality time',
      'time cost quality',
    ]),
  }),
  Object.freeze({
    pair: 'matrix/quadrant',
    label: '四象限矩阵',
    aliases: Object.freeze(['四象限', '象限图', '优先级矩阵', 'quadrant', '2x2 matrix', 'priority matrix']),
  }),
  Object.freeze({
    pair: 'metrics/radar-hex',
    label: '雷达图',
    aliases: Object.freeze(['雷达图', '能力雷达', '指标雷达', 'radar chart']),
  }),
  Object.freeze({
    pair: 'map/mind',
    label: '思维导图',
    aliases: Object.freeze(['思维导图', '脑图', 'mind map', 'mindmap']),
  }),
  Object.freeze({
    pair: 'compare/swot',
    label: 'SWOT 分析',
    aliases: Object.freeze(['swot', 'SWOT', '优势劣势机会威胁', '优势 劣势 机会 威胁']),
  }),
  Object.freeze({
    pair: 'map/pyramid',
    label: '金字塔',
    aliases: Object.freeze(['金字塔', 'pyramid']),
  }),
  Object.freeze({
    pair: 'map/pyramid-inverted',
    label: '倒金字塔',
    aliases: Object.freeze(['倒金字塔', 'inverted pyramid']),
  }),
  Object.freeze({
    pair: 'map/concentric',
    label: '同心圆',
    aliases: Object.freeze(['同心圆', '圈层', 'concentric']),
  }),
  Object.freeze({
    pair: 'compare/venn',
    label: '三圆韦恩图',
    aliases: Object.freeze(['韦恩图', '三圆韦恩', 'venn']),
  }),
  Object.freeze({
    pair: 'compare/venn-two',
    label: '双圆韦恩图',
    aliases: Object.freeze(['双圆韦恩', '双集合韦恩', 'two circle venn', 'venn two']),
  }),
  Object.freeze({
    pair: 'flow/steps',
    label: '分步流程',
    aliases: Object.freeze(['分步流程', '步骤图', '步骤流程图', 'step flow', 'steps flow']),
  }),
  Object.freeze({
    pair: 'flow/annotated',
    label: '注释步骤',
    aliases: Object.freeze(['注释步骤', '带注释步骤', '说明步骤', 'annotated steps']),
  }),
  Object.freeze({
    pair: 'flow/wrapped',
    label: '换行流程',
    aliases: Object.freeze(['换行流程', '折行流程', '自动换行流程', '换行步骤', 'wrapped flow', 'wrap flow']),
  }),
  Object.freeze({
    pair: 'flow/annotated-chain',
    label: '注释链路',
    aliases: Object.freeze(['注释链路', '带注释链路', '说明链路', 'annotated chain']),
  }),
  Object.freeze({
    pair: 'flow/timeline',
    label: '横向时间线',
    aliases: Object.freeze(['横向时间线', '时间线', 'timeline', 'horizontal timeline']),
  }),
  Object.freeze({
    pair: 'flow/timeline-vertical',
    label: '垂直时间线',
    aliases: Object.freeze(['垂直时间线', '纵向时间线', 'vertical timeline']),
  }),
  Object.freeze({
    pair: 'flow/loop',
    label: '循环流程',
    aliases: Object.freeze(['循环流程', '闭环流程', '循环链路', 'loop flow']),
  }),
  Object.freeze({
    pair: 'flow/journey',
    label: '用户旅程',
    aliases: Object.freeze(['用户旅程', '客户旅程', '旅程图', '用户旅程图', 'customer journey', 'journey map']),
  }),
  Object.freeze({
    pair: 'flow/gantt',
    label: '甘特图',
    aliases: Object.freeze(['甘特图', '项目甘特图', 'gantt', 'gantt chart']),
  }),
  Object.freeze({
    pair: 'flow/chain',
    label: '流程链路',
    aliases: Object.freeze(['流程链路', '推进流程', '步骤流程', '流程组件', 'chain flow', 'process chain']),
  }),
]);

const normalizeMornDraftIntentText = (value) => maybeString(value)
  .toLowerCase()
  .replace(/[，、。；;：:（）()[\]{}"'“”‘’《》<>]/gu, ' ')
  .replace(/[-_/]+/gu, ' ')
  .replace(/\s+/gu, ' ')
  .trim();

const compactMornDraftIntentText = (value) => normalizeMornDraftIntentText(value).replace(/\s+/gu, '');

const splitMornDraftFlatPair = (pair) => {
  const [layout, variant] = maybeString(pair).split('/');
  return { layout, variant };
};

export function resolveMornDraftFlatComponentIntent(input) {
  const normalizedText = normalizeMornDraftIntentText(input);
  const compactText = compactMornDraftIntentText(input);
  if (!normalizedText && !compactText) return null;

  for (const intent of MORNDRAFT_FLAT_COMPONENT_INTENTS) {
    const matchedAlias = intent.aliases.find((alias) => {
      const normalizedAlias = normalizeMornDraftIntentText(alias);
      const compactAlias = compactMornDraftIntentText(alias);
      return (
        (normalizedAlias && normalizedText.includes(normalizedAlias)) ||
        (compactAlias && compactText.includes(compactAlias))
      );
    });
    if (!matchedAlias) continue;
    const { layout, variant } = splitMornDraftFlatPair(intent.pair);
    const capability = MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[intent.pair] || null;
    return {
      pair: intent.pair,
      layout,
      variant,
      label: intent.label,
      matchedAlias,
      aliases: [...intent.aliases],
      capability: capability ? { ...capability } : null,
      styleFamily: getMornDraftFlatStyleFamily(layout, variant),
    };
  }
  return null;
}

export const MORNDRAFT_FLAT_SHOWCASE_CATEGORIES = Object.freeze(
  MORNDRAFT_FLAT_PUBLIC_CATEGORIES
    .map((category) => Object.freeze({
      id: category.id,
      label: category.label,
      pairs: Object.freeze(
        category.pairs.filter((pair) => (
          MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[pair]?.publicShowcase !== false &&
          !MORNDRAFT_FLAT_STYLE_SECONDARY_PAIR_SET.has(pair)
        )),
      ),
    }))
    .filter((category) => category.pairs.length > 0),
);

export const MORNDRAFT_FLAT_SHOWCASE_PAIRS = Object.freeze(
  MORNDRAFT_FLAT_SHOWCASE_CATEGORIES.flatMap((category) => category.pairs),
);

export const MORNDRAFT_FLAT_SAMPLE_CATEGORIES = Object.freeze(
  MORNDRAFT_FLAT_SHOWCASE_CATEGORIES
    .map((category) => Object.freeze({
      id: category.id,
      label: category.label,
      pairs: Object.freeze(
        category.pairs.filter((pair) => (
          MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[pair]?.sampleShowcase !== false
        )),
      ),
    }))
    .filter((category) => category.pairs.length > 0),
);

export const MORNDRAFT_FLAT_SAMPLE_PAIRS = Object.freeze(
  MORNDRAFT_FLAT_SAMPLE_CATEGORIES.flatMap((category) => category.pairs),
);

const MORNDRAFT_FLAT_INTERNAL_VARIANTS = Object.freeze({
  'flow/chain': Object.freeze({ layout: 'process', variant: 'arrow' }),
  'flow/steps': Object.freeze({ layout: 'process', variant: 'plain' }),
  'flow/annotated': Object.freeze({ layout: 'process', variant: 'annotated' }),
  'flow/wrapped': Object.freeze({ layout: 'process', variant: 'wrap' }),
  'flow/annotated-chain': Object.freeze({ layout: 'process', variant: 'annotated-arrow' }),
  'flow/timeline': Object.freeze({ layout: 'timeline', variant: 'horizontal' }),
  'flow/timeline-vertical': Object.freeze({ layout: 'timeline', variant: 'vertical' }),
  'flow/loop': Object.freeze({ layout: 'process-loop' }),
  'flow/closed-loop': Object.freeze({ layout: 'process-loop', variant: 'closed-loop' }),
  'flow/journey': Object.freeze({ layout: 'journey' }),
  'flow/gantt': Object.freeze({ layout: 'gantt' }),
  'compare/vs': Object.freeze({ layout: 'vs' }),
  'compare/before-after': Object.freeze({ layout: 'before-after' }),
  'compare/verification': Object.freeze({ layout: 'before-after', variant: 'verification' }),
  'compare/table': Object.freeze({ layout: 'comparison-table' }),
  'compare/swot': Object.freeze({ layout: 'swot' }),
  'compare/venn': Object.freeze({ layout: 'venn' }),
  'compare/venn-two': Object.freeze({ layout: 'venn', variant: 'double' }),
  'map/mind': Object.freeze({ layout: 'mind-map', variant: 'vertical' }),
  'map/mind-horizontal': Object.freeze({ layout: 'mind-map', variant: 'horizontal' }),
  'map/architecture': Object.freeze({ layout: 'architecture' }),
  'map/platform-architecture': Object.freeze({ layout: 'arch-platform' }),
  'map/platform-architecture-complex': Object.freeze({ layout: 'arch-platform-complex-v' }),
  'map/fishbone': Object.freeze({ layout: 'fishbone' }),
  'map/iceberg': Object.freeze({ layout: 'iceberg' }),
  'map/pyramid': Object.freeze({ layout: 'pyramid' }),
  'map/pyramid-inverted': Object.freeze({ layout: 'pyramid', variant: 'inverted' }),
  'map/concentric': Object.freeze({ layout: 'concentric' }),
  'map/concentric-top': Object.freeze({ layout: 'concentric', variant: 'align-top' }),
  'map/concentric-bottom': Object.freeze({ layout: 'concentric', variant: 'align-bottom' }),
  'cards/list': Object.freeze({ layout: 'list-card' }),
  'cards/workflow-list': Object.freeze({ layout: 'list-card', variant: 'workflow' }),
  'cards/toc': Object.freeze({ layout: 'toc-card' }),
  'cards/form': Object.freeze({ layout: 'form-card' }),
  'cards/alert': Object.freeze({ layout: 'alert-box' }),
  'cards/terminal': Object.freeze({ layout: 'terminal-box' }),
  'cards/two-column': Object.freeze({ layout: 'two-col' }),
  'cards/three-column': Object.freeze({ layout: 'three-col' }),
  'cards/split': Object.freeze({ layout: 'split-v' }),
  'cards/split-accent': Object.freeze({ layout: 'split-v', variant: 'accent' }),
  'metrics/radar-hex': Object.freeze({ layout: 'radar-hex' }),
  'metrics/stats': Object.freeze({ layout: 'stat-card' }),
  'matrix/quadrant': Object.freeze({ layout: 'quadrant-axis' }),
  'matrix/impossible-triangle': Object.freeze({ layout: 'impossible-triangle' }),
  'matrix/grid': Object.freeze({ layout: 'matrix' }),
});

const MORNDRAFT_FLAT_STRUCTURAL_ROOT_FIELDS = Object.freeze({
  'map/mind': Object.freeze(['root']),
  'map/mind-horizontal': Object.freeze(['root']),
  'matrix/quadrant': Object.freeze([
    'axisTop',
    'axisBottom',
    'axisLeft',
    'axisRight',
    'center',
  ]),
});

const MORNDRAFT_FLAT_COMMON_ROOT_FIELDS = Object.freeze(['layout', 'variant', 'items']);

export const MORNDRAFT_FLAT_ITEM_FIELDS = Object.freeze([
  'label',
  'value',
  'note',
  'badge',
  'role',
  'side',
  'type',
  'unit',
  'trend',
  'icon',
  'status',
  'marker',
  'fuzzy',
  'precise',
  'before',
  'after',
  'start',
  'width',
  'page',
  'children',
  'items',
  'modules',
  'actions',
  'values',
]);

const MORNDRAFT_FLAT_ITEM_FIELD_SET = new Set(MORNDRAFT_FLAT_ITEM_FIELDS);

export const MORNDRAFT_FLAT_PROTOCOL_FORBIDDEN_FIELDS = Object.freeze([
  'version',
  'schema',
  'target',
  'theme',
  'pages',
  'blocks',
  'slots',
  'swiss',
  'component',
  'componentType',
  'type',
  'morndraft-expression',
  'morndraft-component',
  'morndraft_component',
  'html-preview',
  'html-iframe',
  'html-panel',
  'html-url',
  'iframe-html',
  'title',
  'subtitle',
  'themeColor',
  'tone',
  'view',
  'steps',
  'events',
  'metrics',
  'branches',
  'tasks',
  'quadrants',
  'columns',
  'code',
  'language',
  'left',
  'right',
  'before',
  'after',
  'rows',
  'strengths',
  'weaknesses',
  'opportunities',
  'threats',
  'points',
  'levels',
  'layers',
  'circles',
  'stats',
  'list',
  'sections',
  'fields',
  'actions',
  'body',
  'quote',
  'author',
  'source',
  'alerts',
  'term',
  'definition',
  'usage',
  'eyebrow',
  'caption',
  'meta',
  'prompt',
  'top',
  'bottom',
  'head',
  'surface',
  'surfaceLabel',
  'depth',
  'depthLabel',
  'cards',
]);

const MORNDRAFT_FLAT_PROTOCOL_FORBIDDEN_FIELD_SET = new Set(
  MORNDRAFT_FLAT_PROTOCOL_FORBIDDEN_FIELDS,
);

const SUPPORTED_LAYOUTS_MESSAGE = MORNDRAFT_FLAT_PUBLIC_LAYOUTS.join('、');
const PUBLIC_VARIANT_COUNT = Object.values(MORNDRAFT_FLAT_LAYOUT_VARIANTS).reduce(
  (sum, variants) => sum + variants.length,
  0,
);

const THEME_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export function describeMornDraftFlatProtocol() {
  return {
    protocol: 'morndraft-flat-component',
    fencedLanguage: 'html',
    structureLanguage: 'morndraft',
    unsupportedFencedLanguages: ['morndraft'],
    outputMode: 'html-source-only',
    name: 'MornDraft v2 public flat protocol',
    componentType: MORNDRAFT_CATALOG_COMPONENT_TYPE,
    defaultTarget: DEFAULT_TARGET,
    version: DEFAULT_PROTOCOL_VERSION,
    commonFields: [...MORNDRAFT_FLAT_COMMON_ROOT_FIELDS],
    optionalCommonFields: [],
    structuralRootFields: Object.fromEntries(
      Object.entries(MORNDRAFT_FLAT_STRUCTURAL_ROOT_FIELDS).map(([pair, fields]) => [
        pair,
        [...fields],
      ]),
    ),
    itemFields: [...MORNDRAFT_FLAT_ITEM_FIELDS],
    forbiddenFields: [...MORNDRAFT_FLAT_PROTOCOL_FORBIDDEN_FIELDS],
    shape: {
      commonRootFields: [...MORNDRAFT_FLAT_COMMON_ROOT_FIELDS],
      structuralRootFields: Object.fromEntries(
        Object.entries(MORNDRAFT_FLAT_STRUCTURAL_ROOT_FIELDS).map(([pair, fields]) => [
          pair,
          [...fields],
        ]),
      ),
      itemFields: [...MORNDRAFT_FLAT_ITEM_FIELDS],
      forbiddenRootFields: [...MORNDRAFT_FLAT_PROTOCOL_FORBIDDEN_FIELDS],
    },
    coverage: {
      publicLayouts: MORNDRAFT_FLAT_PUBLIC_LAYOUTS.length,
      publicVariants: PUBLIC_VARIANT_COUNT,
      internalRenderer: 'swiss-catalog',
    },
    layouts: Object.entries(MORNDRAFT_FLAT_LAYOUT_VARIANTS).map(([layout, variants]) => ({
      layout,
      requiredFields: [...MORNDRAFT_FLAT_COMMON_ROOT_FIELDS],
      variants: [...variants],
    })),
    displayCategories: MORNDRAFT_FLAT_PUBLIC_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      pairs: [...category.pairs],
    })),
    showcaseCategories: MORNDRAFT_FLAT_SHOWCASE_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      pairs: [...category.pairs],
    })),
    sampleCategories: MORNDRAFT_FLAT_SAMPLE_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      pairs: [...category.pairs],
    })),
    componentCapabilities: Object.fromEntries(
      Object.entries(MORNDRAFT_FLAT_COMPONENT_CAPABILITIES).map(([pair, capability]) => [
        pair,
        { ...capability },
      ]),
    ),
    componentIntentAliases: MORNDRAFT_FLAT_COMPONENT_INTENTS.map((intent) => ({
      pair: intent.pair,
      label: intent.label,
      aliases: [...intent.aliases],
    })),
    styleFamilies: MORNDRAFT_FLAT_STYLE_FAMILIES.map((family) => ({
      id: family.id,
      label: family.label,
      layout: family.layout,
      defaultVariant: family.defaultVariant,
      variants: family.variants.map((variant) => ({ ...variant })),
    })),
    examples: [
      {
        layout: 'flow',
        variant: 'chain',
        items: [
          { label: '需求确认', note: '明确目标和边界' },
          { label: '生成草稿', note: '输出可编辑 Source' },
          { label: '交付复核', note: '复制、导出或分享' },
        ],
      },
      {
        layout: 'map',
        variant: 'mind',
        root: 'MornDraft v2',
        items: [
          { label: '协议', children: ['layout', 'variant', 'items'] },
          { label: '展示', children: ['复用现有 renderer', '不改 CSS'] },
        ],
      },
    ],
    notes: [
      'Public input must use { layout, variant, items }.',
      'Only map/mind may add root.',
      'Only matrix/quadrant may add axisTop, axisBottom, axisLeft, axisRight, center.',
      'Old renderer layouts, aliases, natural root fields and themeColor are rejected.',
    ],
  };
}

function createDiagnostic(code, message, path, severity = 'error') {
  return {
    code,
    message,
    severity,
    ...(path ? { path } : {}),
  };
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function toStringValue(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function maybeString(value) {
  const normalized = toStringValue(value);
  return normalized || '';
}

function parseListValue(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }
      if (typeof item === 'number' || typeof item === 'boolean') {
        return String(item);
      }
      if (isRecord(item)) {
        return maybeString(item.label) || maybeString(item.value) || maybeString(item.note);
      }
      return '';
    })
    .filter(Boolean);
}

function addPathMetadata(target, field, path) {
  if (Array.isArray(path) && path.every((item) => !item)) {
    return;
  }
  if (!path) {
    return;
  }
  target[field] = path;
}

function normalizeThemeColor(value) {
  const normalized = maybeString(value);
  if (!normalized) {
    return '';
  }
  return THEME_COLOR_PATTERN.test(normalized) ? normalized.toLowerCase() : '';
}

function normalizeTarget(value, diagnostics) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_TARGET;
  }
  const normalized = maybeString(value).toLowerCase();
  if (normalized === '3:4' || normalized === '16:9') {
    return normalized;
  }
  diagnostics.push(
    createDiagnostic(
      'morndraft_flat.unsupported_target',
      'MornDraft flat component target must be "3:4" or "16:9".',
      '$.target',
    ),
  );
  return normalized || DEFAULT_TARGET;
}

function resolveOptionsThemeColor(options, diagnostics) {
  if (!isRecord(options) || !Object.prototype.hasOwnProperty.call(options, 'themeColor')) {
    return {};
  }
  const themeColor = normalizeThemeColor(options.themeColor);
  if (!themeColor) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.invalid_theme_color',
        'themeColor option must be a #RRGGBB hex color when provided by the host.',
        '$options.themeColor',
      ),
    );
    return {};
  }
  return {
    themeColor,
    themeColorSource: 'options',
  };
}

export function formatMornDraftFlatDiagnosticMessage(diagnostic) {
  if (!diagnostic || !diagnostic.code) {
    return diagnostic?.message || 'MornDraft flat component failed validation.';
  }

  switch (diagnostic.code) {
    case 'morndraft_flat.invalid_source':
      return 'MornDraft block must contain a JSON object.';
    case 'morndraft_flat.layout_required':
      return 'MornDraft v2 requires "layout".';
    case 'morndraft_flat.unknown_layout':
      return `Unsupported MornDraft layout. Use one of: ${SUPPORTED_LAYOUTS_MESSAGE}.`;
    case 'morndraft_flat.variant_required':
      return 'MornDraft v2 requires "variant".';
    case 'morndraft_flat.invalid_variant':
      return 'Unsupported MornDraft variant for the selected layout.';
    case 'morndraft_flat.field_required':
      return 'MornDraft v2 requires "items" to be a non-empty array.';
    case 'morndraft_flat.reserved_field':
      return 'Unsupported old MornDraft field. Use only layout, variant, items and the documented structural root fields.';
    case 'morndraft_flat.unsupported_field':
      return 'Unsupported MornDraft v2 root field.';
    case 'morndraft_flat.unsupported_item_field':
      return 'Unsupported MornDraft v2 item field.';
    case 'morndraft_flat.radar_item_count':
      return diagnostic.message;
    case 'morndraft_flat.loop_item_count':
      return diagnostic.message;
    case 'morndraft_flat.process_item_count':
      return diagnostic.message;
    case 'morndraft_flat.pyramid_item_count':
      return diagnostic.message;
    case 'morndraft_flat.impossible_triangle_item_count':
      return diagnostic.message;
    case 'morndraft_flat.card_grid_item_count':
      return diagnostic.message;
    case 'morndraft_flat.invalid_theme_color':
      return 'themeColor is no longer accepted in public MornDraft syntax.';
    case 'morndraft_flat.unsupported_target':
      return 'MornDraft flat component target must be "3:4" or "16:9".';
    default:
      return diagnostic.message || 'MornDraft flat component failed validation.';
  }
}

function parseJsonErrorLocation(message) {
  if (typeof message !== 'string') {
    return '$';
  }
  const positionMatch = message.match(/position\s+(\d+)/i);
  if (positionMatch) {
    return `$@${positionMatch[1]}`;
  }
  const lineColumnMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineColumnMatch) {
    return `$@${lineColumnMatch[1]}:${lineColumnMatch[2]}`;
  }
  return '$';
}

function getEditableSourcePath(sourceEditMap, fallbackPath) {
  if (!sourceEditMap) {
    return '';
  }
  if (sourceEditMap instanceof Map) {
    const entry = sourceEditMap.get(fallbackPath);
    if (typeof entry === 'string') return entry;
    if (isRecord(entry) && typeof entry.path === 'string') return entry.path;
    return fallbackPath;
  }
  if (isRecord(sourceEditMap)) {
    const entry = sourceEditMap[fallbackPath];
    if (typeof entry === 'string') return entry;
    if (isRecord(entry) && typeof entry.path === 'string') return entry.path;
    return fallbackPath;
  }
  return fallbackPath;
}

function normalizeLayoutName(layout) {
  return maybeString(layout);
}

function normalizeVariantName(layout, variant, diagnostics) {
  const normalized = maybeString(variant);
  if (!normalized) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.variant_required',
        'MornDraft v2 requires "variant".',
        '$.variant',
      ),
    );
    return '';
  }
  const variants = MORNDRAFT_FLAT_LAYOUT_VARIANTS[layout];
  if (!variants || !variants.includes(normalized)) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.invalid_variant',
        `Unsupported MornDraft variant "${normalized}" for layout "${layout}".`,
        '$.variant',
      ),
    );
    return '';
  }
  return normalized;
}

function getAllowedRootFields(layout, variant) {
  const allowed = new Set(MORNDRAFT_FLAT_COMMON_ROOT_FIELDS);
  const extraFields = MORNDRAFT_FLAT_STRUCTURAL_ROOT_FIELDS[`${layout}/${variant}`] || [];
  extraFields.forEach((field) => allowed.add(field));
  return allowed;
}

function validateRootFields(input, layout, variant, diagnostics) {
  const allowed = getAllowedRootFields(layout, variant);
  Object.keys(input).forEach((field) => {
    if (allowed.has(field)) {
      return;
    }
    const isForbidden = MORNDRAFT_FLAT_PROTOCOL_FORBIDDEN_FIELD_SET.has(field);
    diagnostics.push(
      createDiagnostic(
        isForbidden ? 'morndraft_flat.reserved_field' : 'morndraft_flat.unsupported_field',
        isForbidden
          ? `Field "${field}" belongs to the old MornDraft syntax and is not accepted by v2.`
          : `Field "${field}" is not part of the MornDraft v2 public protocol.`,
        `$.${field}`,
      ),
    );
  });
}

function getRequiredItems(input, diagnostics) {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.field_required',
        'MornDraft v2 requires "items" to be a non-empty array.',
        '$.items',
      ),
    );
    return [];
  }
  return input.items;
}

function validateItemFields(item, path, diagnostics) {
  if (!isRecord(item)) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.invalid_item',
        'MornDraft v2 items must be objects.',
        path,
      ),
    );
    return;
  }

  Object.keys(item).forEach((field) => {
    if (MORNDRAFT_FLAT_ITEM_FIELD_SET.has(field)) {
      return;
    }
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.unsupported_item_field',
        `Field "${field}" is not supported inside MornDraft v2 items.`,
        `${path}.${field}`,
      ),
    );
  });

  ['children', 'items', 'modules', 'actions', 'values'].forEach((field) => {
    const value = item[field];
    if (!Array.isArray(value)) {
      return;
    }
    value.forEach((child, index) => {
      if (isRecord(child)) {
        validateItemFields(child, `${path}.${field}[${index}]`, diagnostics);
      }
    });
  });
}

function validateItems(rawItems, diagnostics) {
  rawItems.forEach((item, index) => {
    validateItemFields(item, `$.items[${index}]`, diagnostics);
  });
}

function validateRadarItemCount(items, diagnostics) {
  const count = items.length;
  if (count >= 1 && count <= 2) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.radar_item_count',
        'metrics/radar-hex requires at least 3 items.',
        '$.items',
      ),
    );
    return;
  }
  if (count >= 12) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.radar_item_count',
        'metrics/radar-hex supports at most 11 items in v2 public syntax.',
        '$.items',
      ),
    );
    return;
  }
  if (count >= 9) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.radar_item_count',
        'metrics/radar-hex with 9-11 items may be visually dense.',
        '$.items',
        'warning',
      ),
    );
  }
}

function validateCardGridItemCount(variant, items, diagnostics) {
  const count = items.length;
  if (count >= 2 && count <= 6) {
    return;
  }
  diagnostics.push(
    createDiagnostic(
      'morndraft_flat.card_grid_item_count',
      `cards/${variant} supports 2 to 6 items; use list/workflow-list for longer content.`,
      '$.items',
    ),
  );
}

function validateLoopItemCount(items, diagnostics) {
  const count = items.length;
  if (count === 0 || (count >= 3 && count <= 6)) {
    return;
  }
  diagnostics.push(
    createDiagnostic(
      'morndraft_flat.loop_item_count',
      'flow/loop and flow/closed-loop require 3 to 6 items; the renderer derives triangle, quad, pentagon or hex loop layout from the item count.',
      '$.items',
    ),
  );
}

function validatePyramidItemCount(variant, items, diagnostics) {
  const count = items.length;
  if (count >= 3 && count <= 5) {
    return;
  }
  diagnostics.push(
    createDiagnostic(
      'morndraft_flat.pyramid_item_count',
      `map/${variant} supports 3 to 5 items; use concentric or list layouts for shorter or longer structures.`,
      '$.items',
    ),
  );
}

function validateImpossibleTriangleItemCount(items, diagnostics) {
  const count = items.length;
  if (count === 3) {
    return;
  }
  diagnostics.push(
    createDiagnostic(
      'morndraft_flat.impossible_triangle_item_count',
      'matrix/impossible-triangle requires exactly 3 items.',
      '$.items',
    ),
  );
}

function validateProcessItemCount(variant, items, diagnostics) {
  const pair = `flow/${variant}`;
  const capability = MORNDRAFT_FLAT_COMPONENT_CAPABILITIES[pair];
  const supportedItemCounts = Array.isArray(capability?.supportedItemCounts)
    ? capability.supportedItemCounts.filter((count) => Number.isFinite(count))
    : [];
  if (items.length > 0 && supportedItemCounts.length > 0) {
    if (!supportedItemCounts.includes(items.length)) {
      diagnostics.push(
        createDiagnostic(
          'morndraft_flat.process_item_count',
          `flow/${variant} supports exactly ${formatSupportedItemCounts(supportedItemCounts)} items; adjust items to one of the supported counts.`,
          '$.items',
        ),
      );
    }
    return;
  }
  const minItems = capability?.minItems;
  const maxItems = capability?.maxItems;
  if (Number.isFinite(minItems) && items.length > 0 && items.length < minItems) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.process_item_count',
        `flow/${variant} requires at least ${minItems} items; add another item or choose a simpler process component.`,
        '$.items',
      ),
    );
  }
  if (Number.isFinite(maxItems) && items.length > maxItems) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.process_item_count',
        `flow/${variant} supports at most ${maxItems} items; choose a looser process component for longer flows.`,
        '$.items',
      ),
    );
  }
}

function formatSupportedItemCounts(counts) {
  const normalized = [...new Set(counts)].sort((left, right) => left - right);
  if (normalized.length <= 1) return String(normalized[0] ?? '');
  if (normalized.length === 2) return `${normalized[0]} or ${normalized[1]}`;
  return `${normalized.slice(0, -1).join(', ')}, or ${normalized[normalized.length - 1]}`;
}

function normalizeNestedItemArray(value, { basePath, sourceEditMap }) {
  if (!Array.isArray(value)) {
    return { value: undefined, editPath: undefined };
  }
  const normalizedObjects = value
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }
      return normalizeItem(item, {
        basePath: `${basePath}[${index}]`,
        sourceEditMap,
      });
    })
    .filter(Boolean);
  if (normalizedObjects.length > 0) {
    return {
      value: JSON.stringify(normalizedObjects),
      editPath: value.map((_, index) => getEditableSourcePath(sourceEditMap, `${basePath}[${index}]`)),
    };
  }
  const listValue = parseListValue(value);
  if (listValue.length > 0) {
    return {
      value: JSON.stringify(listValue),
      editPath: value.map((_, index) => getEditableSourcePath(sourceEditMap, `${basePath}[${index}]`)),
    };
  }
  return { value: undefined, editPath: undefined };
}

function normalizeItem(item, { basePath, sourceEditMap }) {
  const normalized = {};
  const editPaths = {};

  ['label', 'value', 'note', 'badge'].forEach((field) => {
    const value = maybeString(item[field]);
    if (value) {
      normalized[field] = value;
      addPathMetadata(editPaths, field, getEditableSourcePath(sourceEditMap, `${basePath}.${field}`));
    }
  });

  [
    'role',
    'side',
    'type',
    'unit',
    'trend',
    'icon',
    'status',
    'marker',
    'fuzzy',
    'precise',
    'before',
    'after',
    'start',
    'width',
    'page',
  ].forEach((field) => {
    const value = maybeString(item[field]);
    if (value) {
      normalized[field] = value;
      addPathMetadata(editPaths, field, getEditableSourcePath(sourceEditMap, `${basePath}.${field}`));
    }
  });

  ['children', 'items', 'modules', 'actions', 'values'].forEach((field) => {
    const nested = normalizeNestedItemArray(item[field], {
      basePath: `${basePath}.${field}`,
      sourceEditMap,
    });
    if (nested.value) {
      normalized[field] = nested.value;
      addPathMetadata(editPaths, field, nested.editPath);
    }
  });

  if (!normalized.label && (normalized.value || normalized.note || normalized.badge)) {
    normalized.label = normalized.value || normalized.note || normalized.badge;
  }

  if (Object.keys(editPaths).length > 0) {
    normalized.__morndraftEditPaths = editPaths;
  }

  return normalized;
}

function setSlotValue(slots, editPaths, slotKey, value, editPath) {
  const normalized = maybeString(value);
  if (!normalized) {
    return;
  }
  slots[slotKey] = normalized;
  addPathMetadata(editPaths, slotKey, editPath);
}

function setSlotFromRootField({ input, sourceEditMap, slots, editPaths, slotKey, field }) {
  setSlotValue(
    slots,
    editPaths,
    slotKey,
    input[field],
    getEditableSourcePath(sourceEditMap, `$.${field}`),
  );
}

function setSlotFromItemFields({ item, itemIndex, sourceEditMap, slots, editPaths, slotKey, fields }) {
  if (!isRecord(item)) {
    return;
  }
  for (const field of fields) {
    const value = maybeString(item[field]);
    if (!value) {
      continue;
    }
    setSlotValue(
      slots,
      editPaths,
      slotKey,
      value,
      getEditableSourcePath(sourceEditMap, `$.items[${itemIndex}].${field}`),
    );
    return;
  }
}

function setSlotFromItemList({ item, itemIndex, sourceEditMap, slots, editPaths, slotKey, field }) {
  if (!isRecord(item) || !Array.isArray(item[field])) {
    return;
  }
  const values = parseListValue(item[field]);
  if (values.length === 0) {
    return;
  }
  slots[slotKey] = JSON.stringify(values);
  addPathMetadata(
    editPaths,
    slotKey,
    item[field].map((_, index) =>
      getEditableSourcePath(sourceEditMap, `$.items[${itemIndex}].${field}[${index}]`),
    ),
  );
}

function createPublicSlots({ input, publicLayout, publicVariant, sourceEditMap }) {
  const pair = `${publicLayout}/${publicVariant}`;
  const slots = {};
  const editPaths = {};
  const publicItems = Array.isArray(input.items) ? input.items : [];
  const firstItem = publicItems[0] ?? null;
  const secondItem = publicItems[1] ?? null;

  if (pair === 'map/mind' || pair === 'map/mind-horizontal') {
    setSlotFromRootField({ input, sourceEditMap, slots, editPaths, slotKey: 'root', field: 'root' });
  }

  if (pair === 'matrix/quadrant') {
    [
      ['axisTop', 'axisTop'],
      ['axisBottom', 'axisBottom'],
      ['axisLeft', 'axisLeft'],
      ['axisRight', 'axisRight'],
      ['center', 'center'],
    ].forEach(([slotKey, field]) => {
      setSlotFromRootField({ input, sourceEditMap, slots, editPaths, slotKey, field });
    });
  }

  if (pair === 'cards/split' || pair === 'cards/split-accent') {
    setSlotFromItemFields({
      item: firstItem,
      itemIndex: 0,
      sourceEditMap,
      slots,
      editPaths,
      slotKey: 'title',
      fields: ['label', 'value'],
    });
    setSlotFromItemFields({
      item: firstItem,
      itemIndex: 0,
      sourceEditMap,
      slots,
      editPaths,
      slotKey: 'subtitle',
      fields: ['value', 'note'],
    });
    setSlotFromItemFields({
      item: firstItem,
      itemIndex: 0,
      sourceEditMap,
      slots,
      editPaths,
      slotKey: 'body',
      fields: ['note'],
    });
  }

  if (pair === 'compare/table') {
    setSlotFromItemList({
      item: firstItem,
      itemIndex: 0,
      sourceEditMap,
      slots,
      editPaths,
      slotKey: 'columns',
      field: 'values',
    });
  }

  if (pair === 'cards/terminal') {
    setSlotFromItemFields({
      item: firstItem,
      itemIndex: 0,
      sourceEditMap,
      slots,
      editPaths,
      slotKey: 'term',
      fields: ['label', 'value'],
    });
    setSlotFromItemFields({
      item: firstItem,
      itemIndex: 0,
      sourceEditMap,
      slots,
      editPaths,
      slotKey: 'definition',
      fields: ['value', 'note'],
    });
    setSlotFromItemFields({
      item: firstItem,
      itemIndex: 0,
      sourceEditMap,
      slots,
      editPaths,
      slotKey: 'usage',
      fields: ['note'],
    });
  }

  if (pair === 'map/iceberg') {
    setSlotFromItemFields({
      item: firstItem,
      itemIndex: 0,
      sourceEditMap,
      slots,
      editPaths,
      slotKey: 'surfaceLabel',
      fields: ['badge', 'role'],
    });
    setSlotFromItemFields({
      item: firstItem,
      itemIndex: 0,
      sourceEditMap,
      slots,
      editPaths,
      slotKey: 'surface',
      fields: ['label', 'value'],
    });
    setSlotFromItemFields({
      item: secondItem,
      itemIndex: 1,
      sourceEditMap,
      slots,
      editPaths,
      slotKey: 'depthLabel',
      fields: ['badge', 'role'],
    });
    setSlotFromItemFields({
      item: secondItem || firstItem,
      itemIndex: secondItem ? 1 : 0,
      sourceEditMap,
      slots,
      editPaths,
      slotKey: 'depth',
      fields: secondItem ? ['label', 'value', 'note'] : ['note', 'value'],
    });
  }

  if (pair === 'cards/form' && isRecord(firstItem) && Array.isArray(firstItem.actions)) {
    const actions = parseListValue(firstItem.actions);
    if (actions.length > 0) {
      slots.actions = JSON.stringify(actions);
      addPathMetadata(
        editPaths,
        'actions',
        firstItem.actions.map((_, index) =>
          getEditableSourcePath(sourceEditMap, `$.items[0].actions[${index}]`),
        ),
      );
    }
  }

  return { slots, editPaths };
}

function createPublicItems({ input, publicLayout, publicVariant, sourceEditMap }) {
  const rawItems = Array.isArray(input.items) ? input.items : [];
  const normalizedItems = rawItems.map((item, index) =>
    normalizeItem(item, {
      basePath: `$.items[${index}]`,
      sourceEditMap,
    }),
  );
  const pair = `${publicLayout}/${publicVariant}`;

  if (pair === 'compare/table') {
    return normalizedItems.filter((item, index) => (
      index !== 0 ||
      !['header', 'columns', 'column'].includes(String(item.role || '').trim().toLowerCase())
    ));
  }

  if (pair === 'map/fishbone') {
    const splitIndex = Math.ceil(normalizedItems.length / 2);
    return normalizedItems.map((item, index) => {
      if (item.type) {
        return item;
      }
      return {
        ...item,
        type: item.side || item.role || (index < splitIndex ? 'top' : 'bottom'),
      };
    });
  }

  return normalizedItems;
}

function resolveDocumentSpecVariant({ mapping, publicLayout, publicVariant, itemCount }) {
  if (publicLayout === 'compare' && publicVariant === 'venn' && itemCount === 2) {
    return 'double';
  }
  return mapping.variant || '';
}

function createNormalizedInput(input, layout, variant) {
  const normalized = { ...input };
  if (layout) {
    normalized.layout = layout;
  }
  if (variant) {
    normalized.variant = variant;
  }
  return normalized;
}

export function adaptMornDraftFlatComponent(input, options = {}) {
  const diagnostics = [];
  if (!isRecord(input)) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.invalid_source',
        'MornDraft flat component input must be an object.',
        '$',
      ),
    );
    return {
      ok: false,
      diagnostics,
      documentSpec: null,
      metadata: {},
      component: null,
      normalizedInput: null,
      sourceEditMap: options.sourceEditMap,
    };
  }

  const target = normalizeTarget(options.target, diagnostics);
  const themeColorMetadata = resolveOptionsThemeColor(options, diagnostics);
  const sourceEditMap = options.sourceEditMap || null;

  const layout = normalizeLayoutName(input.layout);
  if (!layout) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.layout_required',
        'MornDraft v2 requires "layout".',
        '$.layout',
      ),
    );
  } else if (!MORNDRAFT_FLAT_LAYOUT_VARIANTS[layout]) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.unknown_layout',
        `Unsupported MornDraft layout "${layout}".`,
        '$.layout',
      ),
    );
  }

  const variant = layout && MORNDRAFT_FLAT_LAYOUT_VARIANTS[layout]
    ? normalizeVariantName(layout, input.variant, diagnostics)
    : maybeString(input.variant);

  validateRootFields(input, layout, variant, diagnostics);
  const rawItems = getRequiredItems(input, diagnostics);
  validateItems(rawItems, diagnostics);
  if (layout === 'metrics' && variant === 'radar-hex') {
    validateRadarItemCount(rawItems, diagnostics);
  }
  if (layout === 'flow' && (variant === 'loop' || variant === 'closed-loop')) {
    validateLoopItemCount(rawItems, diagnostics);
  }
  if (
    layout === 'flow' &&
    ['chain', 'steps', 'annotated', 'wrapped', 'annotated-chain'].includes(variant)
  ) {
    validateProcessItemCount(variant, rawItems, diagnostics);
  }
  if (layout === 'cards' && (variant === 'two-column' || variant === 'three-column')) {
    validateCardGridItemCount(variant, rawItems, diagnostics);
  }
  if (layout === 'map' && (variant === 'pyramid' || variant === 'pyramid-inverted')) {
    validatePyramidItemCount(variant, rawItems, diagnostics);
  }
  if (layout === 'matrix' && variant === 'impossible-triangle') {
    validateImpossibleTriangleItemCount(rawItems, diagnostics);
  }

  const pair = `${layout}/${variant}`;
  const mapping = MORNDRAFT_FLAT_INTERNAL_VARIANTS[pair] || null;
  if (layout && variant && !mapping && !diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    diagnostics.push(
      createDiagnostic(
        'morndraft_flat.invalid_variant',
        `Unsupported MornDraft pair "${pair}".`,
        '$.variant',
      ),
    );
  }

  const metadata = {
    layout: layout || null,
    variant: variant || null,
    target,
    componentType: DEFAULT_COMPONENT_TYPE,
    documentSpecLayout: mapping?.layout || null,
    ...themeColorMetadata,
  };

  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    const normalizedInput = createNormalizedInput(input, layout, variant);
    return {
      ok: false,
      diagnostics,
      documentSpec: null,
      metadata,
      component: normalizedInput,
      normalizedInput,
      sourceEditMap,
    };
  }

  const items = createPublicItems({
    input,
    publicLayout: layout,
    publicVariant: variant,
    sourceEditMap,
  });
  const slotResult = createPublicSlots({
    input,
    publicLayout: layout,
    publicVariant: variant,
    sourceEditMap,
  });
  const documentSpecVariant = resolveDocumentSpecVariant({
    mapping,
    publicLayout: layout,
    publicVariant: variant,
    itemCount: rawItems.length,
  });

  const page = {
    layout: mapping.layout,
    items,
  };
  if (documentSpecVariant) {
    page.variant = documentSpecVariant;
    metadata.documentSpecVariant = documentSpecVariant;
  }
  if (Object.keys(slotResult.slots).length > 0) {
    page.slots = slotResult.slots;
  }
  if (Object.keys(slotResult.editPaths).length > 0) {
    page.__morndraftEditPaths = {
      slots: slotResult.editPaths,
    };
  }

  const documentSpec = {
    version: DOCUMENT_SPEC_VERSION,
    target,
    componentType: MORNDRAFT_CATALOG_COMPONENT_TYPE,
    theme: {
      ...DEFAULT_SWISS_CATALOG_THEME,
    },
    pages: [page],
  };

  const validation = validateDocumentSpec(documentSpec);
  if (!validation.ok) {
    const normalizedInput = createNormalizedInput(input, layout, variant);
    return {
      ok: false,
      diagnostics: [...diagnostics, ...validation.diagnostics],
      documentSpec: null,
      metadata,
      component: normalizedInput,
      normalizedInput,
      sourceEditMap,
    };
  }

  const normalizedInput = createNormalizedInput(input, layout, variant);
  return {
    ok: true,
    diagnostics,
    documentSpec,
    metadata,
    component: normalizedInput,
    normalizedInput,
    sourceEditMap,
  };
}

export function adaptMornDraftFlatComponentSource(source, options = {}) {
  if (typeof source !== 'string') {
    return adaptMornDraftFlatComponent(source, options);
  }
  const sourceEditMap = createMornDraftFlatSourceEditMap(source);
  try {
    const parsed = JSON5.parse(source);
    return adaptMornDraftFlatComponent(parsed, {
      ...options,
      sourceEditMap: options.sourceEditMap || sourceEditMap,
    });
  } catch (error) {
    const diagnostics = [
      createDiagnostic(
        'morndraft_flat.invalid_source',
        error instanceof Error ? error.message : 'Invalid JSON source.',
        parseJsonErrorLocation(error instanceof Error ? error.message : ''),
      ),
    ];
    return {
      ok: false,
      diagnostics,
      documentSpec: null,
      metadata: {},
      component: null,
      normalizedInput: null,
      sourceEditMap,
    };
  }
}
