import type { LucideIcon } from 'lucide-react';
import {
  Blocks,
  ChartArea,
  ChartGantt,
  ChartNetwork,
  ChartNoAxesCombined,
  ChartScatter,
  ChevronRight,
  Clock3,
  Columns3,
  GitBranch,
  Layers3,
  ListTree,
  Network,
  Radar,
  Route,
  Rows3,
  Table2,
  Triangle,
  Waypoints,
  Workflow,
} from 'lucide-react';
import {
  createMornDraftHtmlSource,
  MORNDRAFT_FLAT_PUBLIC_CATEGORIES,
} from '@morndraft/core';
import { MORNDRAFT_FLAT_ADAPTER_FIXTURES } from '../../packages/core/fixtures/morndraft-flat-adapter-fixtures.js';
import type { MornDraftComponentScope } from '../../utils/releaseConfigTypes';

export type FinalInsertCommandCategory = 'Markdown' | 'MornDraft';

export type FinalInsertTableGrid = {
  defaultColumns: number;
  defaultRows: number;
  maxColumns: number;
  maxRows: number;
};

export type FinalInsertCommand = {
  artifactKind?: 'html' | 'morndraft';
  category: FinalInsertCommandCategory;
  children?: readonly FinalInsertCommand[];
  disabledReason?: string;
  icon: LucideIcon;
  id: string;
  keywords: readonly string[];
  label: string;
  mornDraftComponent?: MornDraftTemplate;
  source?: string;
  tableGrid?: FinalInsertTableGrid;
};

export const FINAL_INSERT_TABLE_GRID_MAX_COLUMNS = 10;
export const FINAL_INSERT_TABLE_GRID_MAX_ROWS = 8;

type MornDraftTemplate = Record<string, unknown>;

const mornDraftHtmlFence = (component: MornDraftTemplate) => {
  const result = createMornDraftHtmlSource(component);
  if (!result.ok || !result.markdown) {
    throw new Error('Invalid MornDraft insert template.');
  }
  return result.markdown;
};

const processItems = (labels: readonly string[]) =>
  labels.map((label, index) => ({
    label,
    note: `阶段 ${index + 1}`,
  }));

const architectureItems = [
  { label: '应用层', modules: ['Web', 'Editor', 'Preview'] },
  { label: '服务层', modules: ['Auth', 'Drafts', 'Delivery'] },
  { label: '基础层', modules: ['DB', 'Storage', 'Queue'] },
];

const complexArchitectureItems = [
  { label: '应用', modules: ['应用管理', '资源配置', 'Agent框架', 'Multi-Agent编排'] },
  {
    label: '资源',
    items: [
      { label: '提示词', items: ['Prompt配置', '模型配置', '变量应用', '自动化'] },
      { label: '工具接入', items: ['内部API接入', 'MCP接入', '工具注册', '调用监控'] },
      { label: 'Skills组件', items: ['调用框架', 'Skills注册', 'Skills市场', 'Skills推荐'] },
      { label: '知识库', items: ['上传解析', '召回配置', '切片配置', '召回测试'] },
    ],
  },
  { label: '评测', modules: ['评测集', '评测指标', '评测任务'] },
  { label: '追踪', modules: ['Trace上报', '业务质检', '用户反馈', '数据看板'] },
  {
    label: '基础设施',
    items: [
      { label: '模型管理', items: ['供应商管理', '模型管理', '路由策略', '成本监控'] },
      { label: '日志治理', items: ['审计日志', '操作日志', '登录日志', '异常日志'] },
      { label: '权限管理', items: ['组织架构', '角色管理', '功能权限', '操作权限'] },
    ],
  },
];

const createMornDraftLeaf = (
  id: string,
  label: string,
  keywords: readonly string[],
  icon: LucideIcon,
  component: MornDraftTemplate,
): FinalInsertCommand => ({
  artifactKind: 'html',
  category: 'MornDraft',
  icon,
  id,
  keywords: ['morndraft', '组件', label, ...keywords],
  label,
  mornDraftComponent: component,
  source: mornDraftHtmlFence(component),
});

const createMornDraftGroup = (
  id: string,
  label: string,
  keywords: readonly string[],
  icon: LucideIcon,
  children: readonly FinalInsertCommand[],
): FinalInsertCommand => ({
  category: 'MornDraft',
  children,
  icon,
  id,
  keywords: ['morndraft', label, ...keywords],
  label,
});

const createMarkdownTableGridCommand = (
  id: string,
  label: string,
  keywords: readonly string[],
  icon: LucideIcon,
): FinalInsertCommand => ({
  category: 'Markdown',
  icon,
  id,
  keywords: ['markdown', 'table', '表格', label, ...keywords],
  label,
  tableGrid: {
    defaultColumns: 3,
    defaultRows: 3,
    maxColumns: FINAL_INSERT_TABLE_GRID_MAX_COLUMNS,
    maxRows: FINAL_INSERT_TABLE_GRID_MAX_ROWS,
  },
});

const MARKDOWN_FINAL_INSERT_COMMAND_CATEGORIES: readonly FinalInsertCommandCategory[] = [
  'Markdown',
];

const MARKDOWN_FINAL_INSERT_COMMANDS: readonly FinalInsertCommand[] = [
  createMarkdownTableGridCommand('markdown-table', '表格', ['pipe', 'grid', '行列'], Table2),
];

const MORNDRAFT_FINAL_INSERT_COMMAND_CATEGORIES: readonly FinalInsertCommandCategory[] = [
  'MornDraft',
];

type MornDraftFixture = {
  id: string;
  title: string;
  input: MornDraftTemplate & {
    layout?: string;
    variant?: string;
  };
};

const getMornDraftFixturePair = (fixture: MornDraftFixture) =>
  `${fixture.input.layout}/${fixture.input.variant}`;

const MORNDRAFT_FLAT_ADAPTER_FIXTURE_BY_PAIR = new Map(
  (MORNDRAFT_FLAT_ADAPTER_FIXTURES as readonly MornDraftFixture[]).map((fixture) => [
    getMornDraftFixturePair(fixture),
    fixture,
  ]),
);

const MORN_DRAFT_GROUP_ICON_BY_CATEGORY_ID: Record<string, LucideIcon> = {
  comparison: Columns3,
  content: Blocks,
  data: ChartArea,
  flow: GitBranch,
  structure: Network,
};

const getMornDraftFixtureIcon = (fixture: MornDraftFixture): LucideIcon => {
  const { layout, variant } = fixture.input;
  if (variant === 'gantt') return ChartGantt;
  if (variant === 'radar-hex') return Radar;
  if (variant === 'impossible-triangle') return Triangle;
  if (variant === 'table') return Table2;
  if (variant?.includes('venn')) return ChartNetwork;
  if (variant === 'quadrant') return ChartScatter;
  if (variant?.includes('timeline')) return Clock3;
  if (variant?.includes('loop')) return Workflow;
  if (variant?.includes('pyramid') || variant?.includes('iceberg') || variant?.includes('concentric')) return Layers3;
  if (variant?.includes('column') || variant?.includes('split')) return Columns3;
  if (layout === 'flow') return GitBranch;
  if (layout === 'compare') return Columns3;
  if (layout === 'matrix') return Rows3;
  if (layout === 'metrics') return ChartArea;
  if (layout === 'map') return Network;
  return Blocks;
};

const createMornDraftFixtureLeaf = (fixture: MornDraftFixture): FinalInsertCommand => {
  const { layout, variant } = fixture.input;
  return createMornDraftLeaf(
    `morndraft-${fixture.id}`,
    fixture.title,
    [fixture.id, layout ?? '', variant ?? ''],
    getMornDraftFixtureIcon(fixture),
    fixture.input,
  );
};

const MORNDRAFT_ALL_PUBLIC_V2_FINAL_INSERT_COMMANDS: readonly FinalInsertCommand[] = MORNDRAFT_FLAT_PUBLIC_CATEGORIES
  .map((category) => {
    const children = category.pairs.map((pair) => {
      const fixture = MORNDRAFT_FLAT_ADAPTER_FIXTURE_BY_PAIR.get(pair);
      if (!fixture) {
        throw new Error(`Missing MornDraft final insert fixture for ${pair}.`);
      }
      return createMornDraftFixtureLeaf(fixture);
    });
    return createMornDraftGroup(
      `morndraft-${category.id}`,
      category.label,
      [category.id, category.label],
      MORN_DRAFT_GROUP_ICON_BY_CATEGORY_ID[category.id] ?? Blocks,
      children,
    );
  });

const MORNDRAFT_FINAL_INSERT_COMMANDS: readonly FinalInsertCommand[] = [
  createMornDraftGroup('morndraft-flow', '流程/时序', ['流程图', '流程', '时序', 'timeline', 'flowchart'], GitBranch, [
    createMornDraftLeaf('morndraft-flow-process', '流程', ['process', 'flow', 'chain'], GitBranch, {
      layout: 'flow',
      variant: 'chain',
      items: processItems(['识别', '分析', '规划', '执行']),
    }),
    createMornDraftLeaf('morndraft-flow-steps', '分步流程', ['steps', 'step', '分步'], ListTree, {
      layout: 'flow',
      variant: 'steps',
      items: [
        { label: '确认' },
        { label: '设计' },
        { label: '实现' },
        { label: '复核' },
      ],
    }),
    createMornDraftLeaf('morndraft-flow-annotated', '注释步骤', ['annotated', 'annotation', '注释'], Waypoints, {
      layout: 'flow',
      variant: 'annotated',
      items: [
        { label: '识别', badge: 'Step 01', note: '确认范围' },
        { label: '分析', badge: 'Step 02', note: '拆解约束' },
        { label: '执行', badge: 'Step 03', note: '完成实现' },
        { label: '交付', badge: 'Step 04', note: '验证结果' },
      ],
    }),
    createMornDraftLeaf('morndraft-flow-wrapped', '换行流程', ['wrapped', 'wrap', '换行'], Workflow, {
      layout: 'flow',
      variant: 'wrapped',
      items: [
        { label: '需求' },
        { label: '设计' },
        { label: '开发' },
        { label: '测试' },
        { label: '发布' },
        { label: '复盘' },
      ],
    }),
    createMornDraftLeaf('morndraft-flow-annotated-chain', '注释链路', ['annotated', 'chain', '注释链路'], GitBranch, {
      layout: 'flow',
      variant: 'annotated-chain',
      items: [
        { label: '识别', badge: 'Stage 01', note: '输入与目标' },
        { label: '分析', badge: 'Stage 02', note: '结构与约束' },
        { label: '执行', badge: 'Stage 03', note: '实现与联调' },
        { label: '交付', badge: 'Stage 04', note: '验收与发布' },
      ],
    }),
    createMornDraftLeaf('morndraft-flow-timeline', '时间线', ['timeline'], Clock3, {
      layout: 'flow',
      variant: 'timeline',
      items: [
        { label: '启动', note: '确认目标与范围' },
        { label: '推进', note: '完成核心实现' },
        { label: '交付', note: '完成验证并发布' },
      ],
    }),
    createMornDraftLeaf('morndraft-flow-cycle', '循环流程', ['cycle', 'loop', '闭环'], Workflow, {
      layout: 'flow',
      variant: 'loop',
      items: processItems(['计划', '执行', '检查', '改进']),
    }),
    createMornDraftLeaf('morndraft-flow-journey', '用户旅程（固定）', ['journey', '固定五阶段'], Route, {
      layout: 'flow',
      variant: 'journey',
      items: [
        { label: '发现' },
        { label: '评估' },
        { label: '购买', badge: '决策' },
        { label: '使用' },
        { label: '推荐' },
      ],
    }),
    createMornDraftLeaf('morndraft-data-gantt', '甘特图', ['gantt'], ChartGantt, {
      layout: 'flow',
      variant: 'gantt',
      items: [
        { label: '调研', start: 0, width: 24 },
        { label: '设计', start: 20, width: 28 },
        { label: '开发', start: 42, width: 36 },
        { label: '验证', start: 74, width: 18 },
      ],
    }),
  ]),
  createMornDraftGroup('morndraft-comparison', '对比/评估', ['对比', '评估', 'compare', 'comparison'], Columns3, [
    createMornDraftLeaf('morndraft-comparison-compare', '对比', ['compare', 'vs'], Columns3, {
      layout: 'compare',
      variant: 'vs',
      items: [
        { label: '当前方案', value: '成本低，流程分散' },
        { label: '目标方案', value: '结构统一，便于交付' },
      ],
    }),
    createMornDraftLeaf('morndraft-comparison-before-after', '前后对比', ['before', 'after'], Columns3, {
      layout: 'compare',
      variant: 'before-after',
      items: [
        { label: 'Before', value: '流程分散，依赖人工整理' },
        { label: 'After', value: '结构统一，可持续编辑交付' },
      ],
    }),
    createMornDraftLeaf('morndraft-comparison-before-after-validation', '前后对比-验证', ['validation'], Columns3, {
      layout: 'compare',
      variant: 'verification',
      items: [
        { fuzzy: '模糊输入', precise: '明确结构' },
        { fuzzy: '人工验收', precise: '稳定 diagnostics' },
      ],
    }),
    createMornDraftLeaf('morndraft-comparison-table', '对比表格', ['table', 'grid', '对比表格'], Table2, {
      layout: 'compare',
      variant: 'table',
      items: [
        { role: 'header', values: ['维度', '当前方案', '目标方案'] },
        { values: ['结构', '分散', '统一'] },
        { values: ['交付', '手工整理', '可复用导出'] },
        { values: ['验收', '依赖人工', '自动 diagnostics'] },
      ],
    }),
    createMornDraftLeaf('morndraft-comparison-swot', 'SWOT 分析', ['swot'], ChartNoAxesCombined, {
      layout: 'compare',
      variant: 'swot',
      items: [
        { label: '优势', value: '复用性强' },
        { label: '劣势', value: '初期成本高' },
        { label: '机会', value: '提升交付效率' },
        { label: '风险', value: '兼容性需要验证' },
      ],
    }),
    createMornDraftLeaf('morndraft-structure-venn', '韦恩图', ['venn'], ChartNetwork, {
      layout: 'compare',
      variant: 'venn',
      items: [
        { label: '产品' },
        { label: '技术' },
        { label: '业务' },
      ],
    }),
    createMornDraftLeaf('morndraft-comparison-venn-two', '双圆韦恩图', ['venn', 'two', '双圆'], ChartNetwork, {
      layout: 'compare',
      variant: 'venn-two',
      items: [
        { label: '产品' },
        { label: '技术' },
      ],
    }),
    createMornDraftLeaf('morndraft-comparison-quadrant', '象限图', ['quadrant'], ChartScatter, {
      layout: 'matrix',
      variant: 'quadrant',
      axisTop: '高价值',
      axisBottom: '低价值',
      axisLeft: '低成本',
      axisRight: '高成本',
      center: '优先级',
      items: [
        { label: '优先推进', value: '高价值低成本', marker: 'Q1' },
        { label: '谨慎规划', value: '高价值高成本', marker: 'Q2' },
        { label: '暂缓处理', value: '低价值高成本', marker: 'Q3' },
        { label: '快速验证', value: '低价值低成本', marker: 'Q4' },
      ],
    }),
    createMornDraftLeaf('morndraft-comparison-impossible-triangle', '不可能三角', ['impossible', 'triangle', 'tradeoff', '取舍'], Triangle, {
      layout: 'matrix',
      variant: 'impossible-triangle',
      items: [
        { label: '成本' },
        { label: '效率' },
        { label: '质量' },
      ],
    }),
    createMornDraftLeaf('morndraft-comparison-matrix', '矩阵', ['matrix', 'grid'], Rows3, {
      layout: 'matrix',
      variant: 'grid',
      items: [
        { label: '输入', note: '整理需求和素材' },
        { label: '处理', note: '结构化生成内容' },
        { label: '预览', note: '检查视觉和语义' },
        { label: '交付', note: '复制或导出成品' },
      ],
    }),
  ]),
  createMornDraftGroup('morndraft-data', '数据/可视化', ['数据', '可视化', 'data', 'visualization'], ChartArea, [
    createMornDraftLeaf('morndraft-data-stats', '统计卡片', ['stats', 'metric'], ChartArea, {
      layout: 'metrics',
      variant: 'stats',
      items: [
        { label: '转化率', value: '38%', trend: '+6.2%' },
        { label: '交付数', value: '24', unit: '项' },
      ],
    }),
    createMornDraftLeaf('morndraft-data-radar', '雷达图', ['radar'], Radar, {
      layout: 'metrics',
      variant: 'radar-hex',
      items: [
        { label: '性能' },
        { label: '扩展' },
        { label: '安全' },
        { label: '维护' },
        { label: '体验' },
      ],
    }),
  ]),
  createMornDraftGroup('morndraft-structure', '关系/结构', ['关系', '结构', 'structure', 'relation'], Network, [
    createMornDraftLeaf('morndraft-structure-mindmap', '思维导图', ['mindmap'], ListTree, {
      layout: 'map',
      variant: 'mind',
      root: '知识结构',
      items: [
        { label: '输入', children: ['Markdown', '图片'] },
        { label: '处理', children: ['解析', '渲染'] },
        { label: '交付', children: ['复制', '导出'] },
      ],
    }),
    createMornDraftLeaf('morndraft-structure-platform-architecture', '平台架构图', ['architecture', 'platform'], Network, {
      layout: 'map',
      variant: 'platform-architecture',
      items: architectureItems,
    }),
    createMornDraftLeaf('morndraft-structure-platform-architecture-complex', '复杂平台架构图', ['architecture', 'platform', 'complex', '复杂架构'], Network, {
      layout: 'map',
      variant: 'platform-architecture-complex',
      items: complexArchitectureItems,
    }),
    createMornDraftLeaf('morndraft-structure-fishbone', '鱼骨图', ['fishbone', 'ishikawa'], Waypoints, {
      layout: 'map',
      variant: 'fishbone',
      items: [
        { label: '人员不足', side: 'top' },
        { label: '流程混乱', side: 'top' },
        { label: '沟通断层', side: 'top' },
        { label: '工具落后', side: 'bottom' },
        { label: '环境复杂', side: 'bottom' },
        { label: '标准缺失', side: 'bottom' },
      ],
    }),
    createMornDraftLeaf('morndraft-structure-iceberg', '冰山图', ['iceberg'], Layers3, {
      layout: 'map',
      variant: 'iceberg',
      items: [
        {
          badge: '表层',
          label: '交付结果不稳定',
        },
        {
          badge: '深层',
          label: '缺少统一结构和验证链路',
        },
      ],
    }),
    createMornDraftLeaf('morndraft-structure-pyramid', '金字塔', ['pyramid'], Layers3, {
      layout: 'map',
      variant: 'pyramid',
      items: [
        { label: '愿景' },
        { label: '战略' },
        { label: '能力' },
        { label: '系统' },
        { label: '流程' },
      ],
    }),
    createMornDraftLeaf('morndraft-structure-concentric', '同心圆', ['concentric'], Layers3, {
      layout: 'map',
      variant: 'concentric',
      items: [
        { label: '数据层' },
        { label: '服务层' },
        { label: '应用层' },
      ],
    }),
  ]),
  createMornDraftGroup('morndraft-content', '内容/排版', ['内容', '排版', 'content', 'layout'], Blocks, [
    createMornDraftLeaf('morndraft-content-list-card', '列表卡片', ['list', 'card'], Blocks, {
      layout: 'cards',
      variant: 'list',
      items: [
        { label: '梳理需求' },
        { label: '设计结构' },
        { label: '完成实现' },
        { label: '验证交付' },
      ],
    }),
    createMornDraftLeaf('morndraft-content-columns', '分栏', ['two', 'three', 'column', 'grid', '分栏'], Columns3, {
      layout: 'cards',
      variant: 'two-column',
      items: [
        { label: '背景', value: '说明问题和上下文' },
        { label: '方案', value: '说明核心做法' },
        { label: '收益', value: '说明预期结果' },
        { label: '风险', value: '说明约束和验证点' },
      ],
    }),
  ]),
];

export const FINAL_INSERT_COMMAND_CATEGORIES: readonly FinalInsertCommandCategory[] = [
  ...MARKDOWN_FINAL_INSERT_COMMAND_CATEGORIES,
  ...MORNDRAFT_FINAL_INSERT_COMMAND_CATEGORIES,
];

export const FINAL_INSERT_COMMANDS: readonly FinalInsertCommand[] = [
  ...MARKDOWN_FINAL_INSERT_COMMANDS,
  ...MORNDRAFT_FINAL_INSERT_COMMANDS,
];

const ALL_PUBLIC_V2_FINAL_INSERT_COMMANDS: readonly FinalInsertCommand[] = [
  ...MARKDOWN_FINAL_INSERT_COMMANDS,
  ...MORNDRAFT_ALL_PUBLIC_V2_FINAL_INSERT_COMMANDS,
];

export const getFinalInsertCommandCategories = (
  scope: MornDraftComponentScope = 'showcase',
): readonly FinalInsertCommandCategory[] => {
  void scope;
  return FINAL_INSERT_COMMAND_CATEGORIES;
};

export const getFinalInsertCommands = (
  scope: MornDraftComponentScope = 'showcase',
): readonly FinalInsertCommand[] => (
  scope === 'allPublicV2' ? ALL_PUBLIC_V2_FINAL_INSERT_COMMANDS : FINAL_INSERT_COMMANDS
);

export const FINAL_INSERT_MENU_CHILD_ICON = ChevronRight;
