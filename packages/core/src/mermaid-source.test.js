import test from 'node:test';
import assert from 'node:assert/strict';

import { getMermaidDiagramType, normalizeMermaidSourceForRender } from './mermaid-source.js';

test('getMermaidDiagramType skips Mermaid frontmatter', () => {
  const source = `---
title: Demo
---
sequenceDiagram
A->>B: hi`;

  assert.equal(getMermaidDiagramType(source), 'sequenceDiagram');
});

test('normalizeMermaidSourceForRender joins gantt duration soft wraps', () => {
  const source = `gantt
    title MornDraft 演进路线
    dateFormat YYYY-MM

    section 已完成 v1
    Markdown 渲染           :done, v1a, 2026-01-01,
30d`;

  assert.match(
    normalizeMermaidSourceForRender(source),
    /Markdown 渲染\s+:done, v1a, 2026-01-01, 30d/,
  );
});

test('normalizeMermaidSourceForRender joins gantt date soft wraps', () => {
  const source = `gantt
    section 规划中
    文件管理/多 Tab          :planned, v3a,
2026-06-01, 30d`;

  assert.match(
    normalizeMermaidSourceForRender(source),
    /文件管理\/多 Tab\s+:v3a, 2026-06-01, 30d/,
  );
});

test('normalizeMermaidSourceForRender removes unsupported planned gantt status', () => {
  const source = `gantt
    section 规划中
    Agent API 接口           :planned, v3d, 2026-07-15, 30d`;

  assert.match(
    normalizeMermaidSourceForRender(source),
    /Agent API 接口\s+:v3d, 2026-07-15, 30d/,
  );
});

test('normalizeMermaidSourceForRender leaves non-gantt diagrams unchanged', () => {
  const source = `sequenceDiagram
    participant U as 用户
    U->>T: 点击,
下一行`;

  assert.equal(normalizeMermaidSourceForRender(source), source);
});

test('normalizeMermaidSourceForRender converts block-beta chains to flowchart before render', () => {
  const source = `block-beta
columns 5
Brief["需求简报"] --> Draft["草稿生成"] --> Review["编辑审校"] --> Publish["发布上线"] --> Metrics["效果回收"]`;

  assert.equal(
    normalizeMermaidSourceForRender(source),
    `flowchart LR
Brief["需求简报"]
Draft["草稿生成"]
Review["编辑审校"]
Publish["发布上线"]
Metrics["效果回收"]
Brief --> Draft
Draft --> Review
Review --> Publish
Publish --> Metrics`,
  );
});

test('normalizeMermaidSourceForRender ignores block-beta columns when converting to flowchart', () => {
  const source = `block-beta
columns 7
Brief["需求简报"] --> Draft["草稿生成"] --> Review["编辑审校"]`;

  assert.equal(
    normalizeMermaidSourceForRender(source),
    `flowchart LR
Brief["需求简报"]
Draft["草稿生成"]
Review["编辑审校"]
Brief --> Draft
Draft --> Review`,
  );
});

test('normalizeMermaidSourceForRender converts existing block nodes and edges to flowchart', () => {
  const source = `block-beta
columns 3
Brief["需求简报"]
Draft["草稿生成"]
Brief --> Draft`;

  assert.equal(
    normalizeMermaidSourceForRender(source),
    `flowchart LR
Brief["需求简报"]
Draft["草稿生成"]
Brief --> Draft`,
  );
});

test('normalizeMermaidSourceForRender converts the built-in Chinese block sample to flowchart', () => {
  const source = `block-beta
  columns 3
  input["输入"]
  process["处理"]
  output["输出"]
  input --> process
  process --> output
  space
  space
  feedback["反馈"]
  feedback -.-> input
  feedback -.-> process
  feedback -.-> output`;

  assert.equal(
    normalizeMermaidSourceForRender(source),
    `flowchart LR
  input["输入"]
  process["处理"]
  output["输出"]
  input --> process
  process --> output
  feedback["反馈"]
  feedback -.-> input
  feedback -.-> process
  feedback -.-> output`,
  );
});

const BLOCK_BETA_FLOW_SAMPLES = [
  {
    name: 'linear brief pipeline',
    source: `block-beta
columns 5
Brief["需求简报"] --> Draft["草稿生成"] --> Review["编辑审校"] --> Publish["发布上线"] --> Metrics["效果回收"]`,
  },
  {
    name: 'branching request router',
    source: `block-beta
columns 4
Request["用户请求"] --> Router["意图识别"]
Router --> Search["知识检索"]
Router --> Tool["工具调用"]
Search --> Answer["答案合成"]
Tool --> Answer
Answer --> Check["质量检查"]`,
  },
  {
    name: 'service architecture groups',
    source: `block-beta
columns 3
Client["Web 客户端"] API["API 网关"] Admin["运营后台"]

block:services:3
  columns 3
  Auth["认证服务"] Content["内容服务"] Render["渲染服务"]
end

block:data:3
  columns 3
  UserDB["用户库"] CMS["内容库"] Cache["缓存层"]
end

Client --> API
Admin --> API
API --> Auth
API --> Content
API --> Render
Content --> CMS
Auth --> UserDB
Render --> Cache`,
  },
  {
    name: 'feedback loop',
    source: `block-beta
columns 4
Collect["收集样本"] --> Label["标注问题"] --> Fix["修复规则"] --> Deploy["灰度发布"]
Deploy --> Observe["线上观察"]
Observe --> Report["问题报告"]
Report --> Label`,
  },
  {
    name: 'long document flow',
    source: `block-beta
columns 3
Upload["上传包含表格、代码块和图表的长文档"] --> Parse["结构化解析并识别内容类型"] --> Preview["生成可交互预览"]
Preview --> Export["导出为图片、SVG 或富文本"]
Parse --> Warning["检测异常格式并提示用户修正"]
Warning --> Preview`,
  },
  {
    name: 'analytics grouped flow',
    source: `block-beta
columns 4

block:source:2
  columns 2
  Logs["访问日志"] Events["埋点事件"]
end

block:compute:2
  columns 2
  Clean["清洗"] Model["归因模型"]
end

Dashboard["数据看板"] Alert["异常告警"]

Logs --> Clean
Events --> Clean
Clean --> Model
Model --> Dashboard
Model --> Alert
Alert --> Clean`,
  },
];

test('normalizeMermaidSourceForRender converts representative block-beta samples to legal flowcharts', () => {
  for (const sample of BLOCK_BETA_FLOW_SAMPLES) {
    const normalized = normalizeMermaidSourceForRender(sample.source);

    assert.match(normalized, /^flowchart LR\n/, sample.name);
    assert.doesNotMatch(normalized, /^block:/m, sample.name);
    assert.doesNotMatch(normalized, /^\s*columns\s+\d+\s*$/m, sample.name);
    assert.doesNotMatch(normalized, /^\s*space(?:\s+\d+|:\d+)?\s*$/m, sample.name);
  }
});

test('normalizeMermaidSourceForRender splits block-beta same-line nodes before flowchart render', () => {
  const normalized = normalizeMermaidSourceForRender(BLOCK_BETA_FLOW_SAMPLES[2].source);

  assert.match(normalized, /^Client\["Web 客户端"\]$/m);
  assert.match(normalized, /^API\["API 网关"\]$/m);
  assert.match(normalized, /^Admin\["运营后台"\]$/m);
  assert.doesNotMatch(normalized, /Client\["Web 客户端"\][ \t]+API\["API 网关"\]/);
});

test('normalizeMermaidSourceForRender converts block-beta groups to flowchart subgraphs', () => {
  const architecture = normalizeMermaidSourceForRender(BLOCK_BETA_FLOW_SAMPLES[2].source);
  const analytics = normalizeMermaidSourceForRender(BLOCK_BETA_FLOW_SAMPLES[5].source);

  assert.match(architecture, /^subgraph services\["services"\]$/m);
  assert.match(architecture, /^subgraph data\["data"\]$/m);
  assert.match(analytics, /^subgraph source\["source"\]$/m);
  assert.match(analytics, /^subgraph compute\["compute"\]$/m);
  assert.match(analytics, /^ {2}Logs\["访问日志"\]$/m);
  assert.match(analytics, /^ {2}Events\["埋点事件"\]$/m);
  assert.match(analytics, /^Dashboard\["数据看板"\]$/m);
  assert.match(analytics, /^Alert\["异常告警"\]$/m);
});

test('normalizeMermaidSourceForRender leaves non-block chained diagrams unchanged', () => {
  const source = `flowchart LR
Brief["需求简报"] --> Draft["草稿生成"] --> Review["编辑审校"]`;

  assert.equal(normalizeMermaidSourceForRender(source), source);
});
