const freezeItems = (items) => Object.freeze(items.map((item) => Object.freeze(item)));

export const MORNDRAFT_FLAT_ADAPTER_FIXTURES = Object.freeze([
  Object.freeze({
    id: 'flow-chain',
    title: '流程链路',
    input: Object.freeze({
      layout: 'flow',
      variant: 'chain',
      items: freezeItems([
        { label: '识别', note: '确认目标' },
        { label: '分析', note: '拆解约束' },
        { label: '执行', note: '完成实现' },
        { label: '交付', note: '验证结果' },
      ]),
    }),
    expectedLayout: 'process',
    expectedVariant: 'arrow',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'flow-steps',
    title: '分步流程',
    input: Object.freeze({
      layout: 'flow',
      variant: 'steps',
      items: freezeItems([
        { label: '确认' },
        { label: '设计' },
        { label: '实现' },
        { label: '复核' },
      ]),
    }),
    expectedLayout: 'process',
    expectedVariant: 'plain',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'flow-annotated',
    title: '注释步骤',
    input: Object.freeze({
      layout: 'flow',
      variant: 'annotated',
      items: freezeItems([
        { label: '识别', badge: 'Step 01', note: '确认范围' },
        { label: '分析', badge: 'Step 02', note: '拆解约束' },
        { label: '执行', badge: 'Step 03', note: '完成实现' },
        { label: '交付', badge: 'Step 04', note: '验证结果' },
      ]),
    }),
    expectedLayout: 'process',
    expectedVariant: 'annotated',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'flow-wrapped',
    title: '换行流程',
    input: Object.freeze({
      layout: 'flow',
      variant: 'wrapped',
      items: freezeItems([
        { label: '需求' },
        { label: '设计' },
        { label: '开发' },
        { label: '测试' },
        { label: '发布' },
        { label: '复盘' },
      ]),
    }),
    expectedLayout: 'process',
    expectedVariant: 'wrap',
    expectedItems: 6,
  }),
  Object.freeze({
    id: 'flow-annotated-chain',
    title: '注释链路',
    input: Object.freeze({
      layout: 'flow',
      variant: 'annotated-chain',
      items: freezeItems([
        { label: '识别', badge: 'Stage 01', note: '输入与目标' },
        { label: '分析', badge: 'Stage 02', note: '结构与约束' },
        { label: '执行', badge: 'Stage 03', note: '实现与联调' },
        { label: '交付', badge: 'Stage 04', note: '验收与发布' },
      ]),
    }),
    expectedLayout: 'process',
    expectedVariant: 'annotated-arrow',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'flow-timeline',
    title: '横向时间线',
    input: Object.freeze({
      layout: 'flow',
      variant: 'timeline',
      items: freezeItems([
        { label: '启动', note: '确认范围' },
        { label: '推进', note: '实现核心链路' },
        { label: '交付', note: '完成验证' },
      ]),
    }),
    expectedLayout: 'timeline',
    expectedVariant: 'horizontal',
    expectedItems: 3,
  }),
  Object.freeze({
    id: 'flow-timeline-vertical',
    title: '垂直时间线',
    input: Object.freeze({
      layout: 'flow',
      variant: 'timeline-vertical',
      items: freezeItems([
        { label: '2024', value: '验证原型', note: '完成核心交互' },
        { label: '2025', value: '内测发布', note: '覆盖交付链路' },
        { label: '2026', value: '正式上线', note: '建立稳定验收' },
      ]),
    }),
    expectedLayout: 'timeline',
    expectedVariant: 'vertical',
    expectedItems: 3,
  }),
  Object.freeze({
    id: 'flow-loop',
    title: '循环流程',
    input: Object.freeze({
      layout: 'flow',
      variant: 'loop',
      items: freezeItems([
        { label: '计划' },
        { label: '执行' },
        { label: '检查' },
        { label: '改进' },
      ]),
    }),
    expectedLayout: 'process-loop',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'flow-closed-loop',
    title: '闭环流程',
    input: Object.freeze({
      layout: 'flow',
      variant: 'closed-loop',
      items: freezeItems([
        { label: '输入' },
        { label: '处理' },
        { label: '反馈' },
        { label: '优化' },
      ]),
    }),
    expectedLayout: 'process-loop',
    expectedVariant: 'closed-loop',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'flow-journey',
    title: '用户旅程',
    input: Object.freeze({
      layout: 'flow',
      variant: 'journey',
      items: freezeItems([
        { label: '发现' },
        { label: '评估' },
        { label: '决策', badge: '关键' },
        { label: '使用' },
        { label: '推荐' },
      ]),
    }),
    expectedLayout: 'journey',
    expectedItems: 5,
  }),
  Object.freeze({
    id: 'flow-gantt',
    title: '甘特图',
    input: Object.freeze({
      layout: 'flow',
      variant: 'gantt',
      items: freezeItems([
        { label: '调研', start: 0, width: 24 },
        { label: '设计', start: 20, width: 28 },
        { label: '开发', start: 42, width: 36 },
        { label: '验证', start: 74, width: 18 },
      ]),
    }),
    expectedLayout: 'gantt',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'compare-vs',
    title: '双方案对比',
    input: Object.freeze({
      layout: 'compare',
      variant: 'vs',
      items: freezeItems([
        { label: '当前方案', value: '成本低，流程分散' },
        { label: '目标方案', value: '结构统一，便于交付' },
      ]),
    }),
    expectedLayout: 'vs',
    expectedItems: 2,
  }),
  Object.freeze({
    id: 'compare-before-after',
    title: '前后对比',
    input: Object.freeze({
      layout: 'compare',
      variant: 'before-after',
      items: freezeItems([
        { label: 'Before', value: '流程分散，依赖人工整理' },
        { label: 'After', value: '结构统一，可持续编辑交付' },
      ]),
    }),
    expectedLayout: 'before-after',
    expectedItems: 2,
  }),
  Object.freeze({
    id: 'compare-verification',
    title: '验证对比',
    input: Object.freeze({
      layout: 'compare',
      variant: 'verification',
      items: freezeItems([
        { fuzzy: '模糊输入', precise: '明确结构' },
        { fuzzy: '人工验收', precise: '稳定 diagnostics' },
      ]),
    }),
    expectedLayout: 'before-after',
    expectedVariant: 'verification',
    expectedItems: 2,
  }),
  Object.freeze({
    id: 'compare-table',
    title: '对比表格',
    input: Object.freeze({
      layout: 'compare',
      variant: 'table',
      items: freezeItems([
        { role: 'header', values: Object.freeze(['维度', '当前方案', '目标方案']) },
        { values: Object.freeze(['结构', '分散', '统一']) },
        { values: Object.freeze(['交付', '手工整理', '可复用导出']) },
        { values: Object.freeze(['验收', '依赖人工', '自动 diagnostics']) },
      ]),
    }),
    expectedLayout: 'comparison-table',
    expectedItems: 3,
  }),
  Object.freeze({
    id: 'compare-swot',
    title: 'SWOT 分析',
    input: Object.freeze({
      layout: 'compare',
      variant: 'swot',
      items: freezeItems([
        { label: '优势', value: '复用性强' },
        { label: '劣势', value: '初期成本高' },
        { label: '机会', value: '提升交付效率' },
        { label: '风险', value: '兼容性需要验证' },
      ]),
    }),
    expectedLayout: 'swot',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'compare-venn',
    title: '三圆韦恩图',
    input: Object.freeze({
      layout: 'compare',
      variant: 'venn',
      items: freezeItems([
        { label: '产品' },
        { label: '技术' },
        { label: '业务' },
      ]),
    }),
    expectedLayout: 'venn',
    expectedItems: 3,
  }),
  Object.freeze({
    id: 'compare-venn-two',
    title: '双圆韦恩图',
    input: Object.freeze({
      layout: 'compare',
      variant: 'venn-two',
      items: freezeItems([
        { label: '产品' },
        { label: '技术' },
      ]),
    }),
    expectedLayout: 'venn',
    expectedVariant: 'double',
    expectedItems: 2,
  }),
  Object.freeze({
    id: 'matrix-quadrant',
    title: '四象限矩阵',
    input: Object.freeze({
      layout: 'matrix',
      variant: 'quadrant',
      axisTop: '高价值',
      axisBottom: '低价值',
      axisLeft: '低成本',
      axisRight: '高成本',
      center: '优先级',
      items: freezeItems([
        { label: '优先推进', value: '高价值低成本', marker: 'Q1' },
        { label: '谨慎规划', value: '高价值高成本', marker: 'Q2' },
        { label: '暂缓处理', value: '低价值高成本', marker: 'Q3' },
        { label: '快速验证', value: '低价值低成本', marker: 'Q4' },
      ]),
    }),
    expectedLayout: 'quadrant-axis',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'matrix-impossible-triangle',
    title: '不可能三角',
    input: Object.freeze({
      layout: 'matrix',
      variant: 'impossible-triangle',
      items: freezeItems([
        { label: '成本' },
        { label: '效率' },
        { label: '质量' },
      ]),
    }),
    expectedLayout: 'impossible-triangle',
    expectedItems: 3,
  }),
  Object.freeze({
    id: 'matrix-grid',
    title: '网格矩阵',
    input: Object.freeze({
      layout: 'matrix',
      variant: 'grid',
      items: freezeItems([
        { label: '输入', note: '整理需求和素材' },
        { label: '处理', note: '结构化生成内容' },
        { label: '预览', note: '检查视觉和语义' },
        { label: '交付', note: '复制或导出成品' },
      ]),
    }),
    expectedLayout: 'matrix',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'metrics-stats',
    title: '指标卡片',
    input: Object.freeze({
      layout: 'metrics',
      variant: 'stats',
      items: freezeItems([
        { label: '转化率', value: '38%', trend: '+6.2%' },
        { label: '交付数', value: '24', unit: '项' },
      ]),
    }),
    expectedLayout: 'stat-card',
    expectedItems: 2,
  }),
  Object.freeze({
    id: 'metrics-radar-hex',
    title: '雷达图',
    input: Object.freeze({
      layout: 'metrics',
      variant: 'radar-hex',
      items: freezeItems([
        { label: '创新' },
        { label: '性能' },
        { label: '易用' },
        { label: '稳定' },
        { label: '安全' },
        { label: '扩展' },
      ]),
    }),
    expectedLayout: 'radar-hex',
    expectedItems: 6,
  }),
  Object.freeze({
    id: 'map-mind',
    title: '思维导图',
    input: Object.freeze({
      layout: 'map',
      variant: 'mind',
      root: '知识结构',
      items: freezeItems([
        { label: '输入', children: Object.freeze(['Markdown', '图片']) },
        { label: '处理', children: Object.freeze(['解析', '渲染']) },
        { label: '交付', children: Object.freeze(['复制', '导出']) },
      ]),
    }),
    expectedLayout: 'mind-map',
    expectedItems: 3,
  }),
  Object.freeze({
    id: 'map-mind-horizontal',
    title: '横向思维导图',
    input: Object.freeze({
      layout: 'map',
      variant: 'mind-horizontal',
      root: '产品架构',
      items: freezeItems([
        { label: '输入' },
        { label: '处理' },
        { label: '交付' },
        { label: '反馈' },
      ]),
    }),
    expectedLayout: 'mind-map',
    expectedVariant: 'horizontal',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'map-architecture',
    title: '分层架构图',
    input: Object.freeze({
      layout: 'map',
      variant: 'architecture',
      items: freezeItems([
        { label: '应用层', modules: Object.freeze(['Web', 'App', 'API']) },
        { label: '服务层', modules: Object.freeze(['Auth', 'Search', 'Queue']) },
        { label: '基础层', modules: Object.freeze(['DB', 'Cache', 'CDN']) },
        { label: '基建层', modules: Object.freeze(['K8s', 'CI/CD', '监控']) },
      ]),
    }),
    expectedLayout: 'architecture',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'map-platform-architecture',
    title: '平台架构图',
    input: Object.freeze({
      layout: 'map',
      variant: 'platform-architecture',
      items: freezeItems([
        {
          label: '应用',
          modules: Object.freeze(['应用管理', '资源配置', 'Agent框架', 'Multi-Agent编排']),
        },
        {
          label: '资源',
          items: Object.freeze([
            {
              label: '提示词',
              items: Object.freeze(['Prompt配置', '模型配置', '变量应用', '自动化']),
            },
            {
              label: '工具接入',
              items: Object.freeze(['内部API接入', 'MCP接入', '工具注册', '调用监控']),
            },
            {
              label: 'Skills组件',
              items: Object.freeze(['调用框架', 'Skills注册', 'Skills市场', 'Skills推荐']),
            },
            {
              label: '知识库',
              items: Object.freeze(['上传解析', '召回配置', '切片配置', '召回测试']),
            },
          ]),
        },
        { label: '评测', modules: Object.freeze(['评测集', '评测指标', '评测任务']) },
        { label: '追踪', modules: Object.freeze(['Trace上报', '业务质检', '用户反馈', '数据看板']) },
        {
          label: '基础设施',
          items: Object.freeze([
            {
              label: '模型管理',
              items: Object.freeze(['供应商管理', '模型管理', '路由策略', '成本监控']),
            },
            {
              label: '日志治理',
              items: Object.freeze(['审计日志', '操作日志', '登录日志', '异常日志']),
            },
            {
              label: '权限管理',
              items: Object.freeze(['组织架构', '角色管理', '功能权限', '操作权限']),
            },
          ]),
        },
      ]),
    }),
    expectedLayout: 'arch-platform',
    expectedItems: 5,
  }),
  Object.freeze({
    id: 'map-platform-architecture-complex',
    title: '复杂平台架构图',
    input: Object.freeze({
      layout: 'map',
      variant: 'platform-architecture-complex',
      items: freezeItems([
        {
          label: '应用',
          modules: Object.freeze(['应用管理', '资源配置', 'Agent框架', 'Multi-Agent编排']),
        },
        {
          label: '资源',
          items: Object.freeze([
            {
              label: '提示词',
              items: Object.freeze(['Prompt配置', '模型配置', '变量应用', '自动化']),
            },
            {
              label: '工具接入',
              items: Object.freeze(['内部API接入', 'MCP接入', '工具注册', '调用监控']),
            },
            {
              label: 'Skills组件',
              items: Object.freeze(['调用框架', 'Skills注册', 'Skills市场', 'Skills推荐']),
            },
            {
              label: '知识库',
              items: Object.freeze(['上传解析', '召回配置', '切片配置', '召回测试']),
            },
          ]),
        },
        { label: '评测', modules: Object.freeze(['评测集', '评测指标', '评测任务']) },
        { label: '追踪', modules: Object.freeze(['Trace上报', '业务质检', '用户反馈', '数据看板']) },
        {
          label: '基础设施',
          items: Object.freeze([
            {
              label: '模型管理',
              items: Object.freeze(['供应商管理', '模型管理', '路由策略', '成本监控']),
            },
            {
              label: '日志治理',
              items: Object.freeze(['审计日志', '操作日志', '登录日志', '异常日志']),
            },
            {
              label: '权限管理',
              items: Object.freeze(['组织架构', '角色管理', '功能权限', '操作权限']),
            },
          ]),
        },
      ]),
    }),
    expectedLayout: 'arch-platform-complex-v',
    expectedItems: 5,
  }),
  Object.freeze({
    id: 'map-fishbone',
    title: '鱼骨图',
    input: Object.freeze({
      layout: 'map',
      variant: 'fishbone',
      items: freezeItems([
        { label: '人员不足', side: 'top' },
        { label: '流程混乱', side: 'top' },
        { label: '沟通断层', side: 'top' },
        { label: '工具落后', side: 'bottom' },
        { label: '环境复杂', side: 'bottom' },
        { label: '标准缺失', side: 'bottom' },
      ]),
    }),
    expectedLayout: 'fishbone',
    expectedItems: 6,
  }),
  Object.freeze({
    id: 'map-iceberg',
    title: '冰山图',
    input: Object.freeze({
      layout: 'map',
      variant: 'iceberg',
      items: freezeItems([
        {
          badge: '表层',
          label: '交付结果不稳定',
        },
        {
          badge: '深层',
          label: '缺少统一结构和验证链路',
        },
      ]),
    }),
    expectedLayout: 'iceberg',
    expectedItems: 2,
  }),
  Object.freeze({
    id: 'map-pyramid',
    title: '金字塔',
    input: Object.freeze({
      layout: 'map',
      variant: 'pyramid',
      items: freezeItems([
        { label: '愿景' },
        { label: '战略' },
        { label: '能力' },
        { label: '系统' },
        { label: '流程' },
      ]),
    }),
    expectedLayout: 'pyramid',
    expectedItems: 5,
  }),
  Object.freeze({
    id: 'map-pyramid-inverted',
    title: '倒金字塔',
    input: Object.freeze({
      layout: 'map',
      variant: 'pyramid-inverted',
      items: freezeItems([
        { label: '广泛触达' },
        { label: '意向线索' },
        { label: '深度洽谈' },
        { label: '方案确认' },
        { label: '最终交付' },
      ]),
    }),
    expectedLayout: 'pyramid',
    expectedVariant: 'inverted',
    expectedItems: 5,
  }),
  Object.freeze({
    id: 'map-concentric',
    title: '同心圆',
    input: Object.freeze({
      layout: 'map',
      variant: 'concentric',
      items: freezeItems([
        { label: '数据层' },
        { label: '服务层' },
        { label: '应用层' },
      ]),
    }),
    expectedLayout: 'concentric',
    expectedItems: 3,
  }),
  Object.freeze({
    id: 'map-concentric-top',
    title: '顶部对齐同心圆',
    input: Object.freeze({
      layout: 'map',
      variant: 'concentric-top',
      items: freezeItems([
        { label: '核心能力' },
        { label: '平台服务' },
        { label: '生态触点' },
      ]),
    }),
    expectedLayout: 'concentric',
    expectedVariant: 'align-top',
    expectedItems: 3,
  }),
  Object.freeze({
    id: 'map-concentric-bottom',
    title: '底部对齐同心圆',
    input: Object.freeze({
      layout: 'map',
      variant: 'concentric-bottom',
      items: freezeItems([
        { label: '基础层' },
        { label: '服务层' },
        { label: '体验层' },
      ]),
    }),
    expectedLayout: 'concentric',
    expectedVariant: 'align-bottom',
    expectedItems: 3,
  }),
  Object.freeze({
    id: 'cards-list',
    title: '列表卡片',
    input: Object.freeze({
      layout: 'cards',
      variant: 'list',
      items: freezeItems([
        { label: '梳理需求' },
        { label: '设计结构' },
        { label: '完成实现' },
        { label: '验证交付' },
      ]),
    }),
    expectedLayout: 'list-card',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'cards-workflow-list',
    title: '工作流列表',
    input: Object.freeze({
      layout: 'cards',
      variant: 'workflow-list',
      items: freezeItems([
        { label: '输入', value: '整理需求和素材' },
        { label: '结构化', value: '生成可编辑 Source' },
        { label: '验收', value: '检查 preview 与导出' },
      ]),
    }),
    expectedLayout: 'list-card',
    expectedVariant: 'workflow',
    expectedItems: 3,
  }),
  Object.freeze({
    id: 'cards-toc',
    title: '目录卡片',
    input: Object.freeze({
      layout: 'cards',
      variant: 'toc',
      items: freezeItems([
        { label: '概览', items: Object.freeze(['背景', '目标']), page: '01' },
        { label: '方案', items: Object.freeze(['设计', '实施']), page: '02' },
        { label: '验收', items: Object.freeze(['测试', '发布']), page: '03' },
      ]),
    }),
    expectedLayout: 'toc-card',
    expectedItems: 3,
  }),
  Object.freeze({
    id: 'cards-form',
    title: '表单卡片',
    input: Object.freeze({
      layout: 'cards',
      variant: 'form',
      items: freezeItems([
        {
          label: '对象',
          value: '客户或项目名称',
          actions: Object.freeze(['登记', '提醒', '生成总结']),
        },
        { label: '状态', value: '当前进度与风险' },
        { label: '下一步', value: '明确负责人和时间' },
      ]),
    }),
    expectedLayout: 'form-card',
    expectedItems: 3,
  }),
  Object.freeze({
    id: 'cards-alert',
    title: '提示卡片',
    input: Object.freeze({
      layout: 'cards',
      variant: 'alert',
      items: freezeItems([
        { label: '注意', value: '发布前请完成预览和导出验证', type: 'warning' },
        { label: '完成', value: '核心路径已通过检查', type: 'success' },
      ]),
    }),
    expectedLayout: 'alert-box',
    expectedItems: 2,
  }),
  Object.freeze({
    id: 'cards-terminal',
    title: '术语卡片',
    input: Object.freeze({
      layout: 'cards',
      variant: 'terminal',
      items: freezeItems([
        {
          label: 'npm run check:ci',
          value: '运行 lint、typecheck、test、profiles、architecture 和 licenses',
          note: '合入 dev 前执行完整检查',
        },
      ]),
    }),
    expectedLayout: 'terminal-box',
    expectedItems: 1,
  }),
  Object.freeze({
    id: 'cards-two-column',
    title: '双栏分栏',
    input: Object.freeze({
      layout: 'cards',
      variant: 'two-column',
      items: freezeItems([
        { label: '背景', value: '说明问题和上下文' },
        { label: '方案', value: '说明核心做法' },
        { label: '收益', value: '说明预期结果' },
        { label: '风险', value: '说明约束和验证点' },
      ]),
    }),
    expectedLayout: 'two-col',
    expectedItems: 4,
  }),
  Object.freeze({
    id: 'cards-three-column',
    title: '三栏分栏',
    input: Object.freeze({
      layout: 'cards',
      variant: 'three-column',
      items: freezeItems([
        { label: '设计', value: '统一视觉语言' },
        { label: '开发', value: '组件化实现' },
        { label: '交付', value: '完成验证发布' },
        { label: '复盘', value: '沉淀可复用案例' },
        { label: '扩展', value: '补充更多结构组件' },
      ]),
    }),
    expectedLayout: 'three-col',
    expectedItems: 5,
  }),
  Object.freeze({
    id: 'cards-split',
    title: '垂直分栏',
    input: Object.freeze({
      layout: 'cards',
      variant: 'split',
      items: freezeItems([
        {
          label: '垂直分栏',
          value: '从信息到交付',
          note: '上半部分承载核心结论，下半部分展开关键依据与下一步动作',
        },
      ]),
    }),
    expectedLayout: 'split-v',
    expectedItems: 1,
  }),
  Object.freeze({
    id: 'cards-split-accent',
    title: '强调分栏',
    input: Object.freeze({
      layout: 'cards',
      variant: 'split-accent',
      items: freezeItems([
        {
          label: '关键结论',
          value: '语法收口不等于能力裁剪',
          note: '保持 v2 入口简单，同时覆盖既有 renderer 能力。',
        },
      ]),
    }),
    expectedLayout: 'split-v',
    expectedVariant: 'accent',
    expectedItems: 1,
  })
]);
