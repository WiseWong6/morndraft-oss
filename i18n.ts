import { SAMPLE_MERMAID } from './constants';
import { DEFAULT_HTML_SAMPLE } from './samples/defaultHtmlSample';
import { MIXED_MCP_ADMIN_HTML_SAMPLE } from './samples/mixedMcpAdminHtmlSample';
import type { MornDraftComponentScope } from './utils/releaseConfigTypes';

export type Locale = 'zh' | 'en';
export type SampleKey =
  | 'mixed'
  | 'morndraft'
  | 'markdown'
  | 'html'
  | 'json'
  | 'mermaid';

export type SamplePreviewLayout = {
  htmlPreviewDeliveryWidth?: number;
};

export type SampleEntry = {
  key: SampleKey;
  label: string;
  previewLayout?: SamplePreviewLayout;
};

export const LOCALE_STORAGE_KEY = 'morndraft:locale';
export const LEGACY_LOCALE_STORAGE_KEY = 'ai-artifact-desk:locale';

export const SAMPLE_KEYS: readonly SampleKey[] = [
  'mixed',
  'morndraft',
  'markdown',
  'html',
  'json',
  'mermaid',
];

const SAMPLE_LABELS: Record<Locale, Record<SampleKey, string>> = {
  zh: {
    mixed: 'Mixed',
    morndraft: 'MornDraft',
    markdown: 'Markdown',
    html: 'HTML',
    json: 'JSON',
    mermaid: 'Mermaid',
  },
  en: {
    mixed: 'Mixed',
    morndraft: 'MornDraft',
    markdown: 'Markdown',
    html: 'HTML',
    json: 'JSON',
    mermaid: 'Mermaid',
  },
};

const SAMPLE_PREVIEW_LAYOUTS: Partial<Record<SampleKey, SamplePreviewLayout>> = {
  html: { htmlPreviewDeliveryWidth: 790 },
};

const EN_SAMPLE_MIXED = `# Mixed Artifact Example

This sample covers the current MornDraft preview syntax: Markdown, image links, tables, quotes, plain code, JSON, JSON5, Mermaid, and HTML preview.

## 1. Markdown, Image, Table

![MornDraft placeholder](https://placehold.co/640x320.png)

| Syntax | Rendering |
|---|---|
| Markdown | Rich document |
| Image URL | Responsive image |
| Code fence without language | Plain code block |

> A mixed document should keep every artifact isolated without breaking the surrounding Markdown.

## 2. Plain Code
\`\`\`
function greet(name) {
  return 'Hello, ' + name;
}
\`\`\`

## 3. JSON
JSON code blocks are parsed and formatted automatically:
\`\`\`json
{
  "project": "MornDraft",
  "features": ["Markdown", "Image", "Code", "HTML", "JSON", "JSON5", "Mermaid"],
  "version": 2.0
}
\`\`\`

## 4. JSON5
\`\`\`json5
{
  project: 'MornDraft',
  trailingComma: true,
  features: ['human review', 'agent handoff'],
}
\`\`\`

## 5. Mermaid - Flowchart
\`\`\`mermaid
graph LR
  A[Input] --> B{Detect type}
  B -->|Markdown| C[Render document]
  B -->|HTML| D[Iframe preview]
  B -->|JSON| E[Format and highlight]
  B -->|Mermaid| F[Generate diagram]
\`\`\`

## 6. HTML Preview
\`\`\`html-preview
${MIXED_MCP_ADMIN_HTML_SAMPLE}
\`\`\`
`;

const EN_SAMPLE_MARKDOWN = `# Markdown Example

## Text Formatting
This is **bold**, *italic*, ~~strikethrough~~, and \`inline code\`.

## Lists
- Item one
- Item two
  - Nested item
  - Another nested item

1. First
2. Second
3. Third

## Table

| Feature | Status |
|---------|--------|
| Markdown | Ready |
| HTML | Ready |
| JSON | Ready |
| Mermaid | Ready |

## Blockquote

> The best way to predict the future is to invent it.
> - Alan Kay

## Code Block
\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`
`;

const EN_SAMPLE_HTML = DEFAULT_HTML_SAMPLE;

const EN_SAMPLE_JSON = `\`\`\`json
{
  "name": "Jane Doe",
  "role": "Product Engineer",
  "hobbies": ["reading", "hiking", "building tools"],
  "address": {
    "street": "123 Main St",
    "city": "Anytown"
  }
}
\`\`\``;

const EN_SAMPLE_MERMAID = `# Mermaid Diagram Examples

> Examples covering the common Mermaid 11 diagram types used to validate rendering, export, and copy flows.

---

## 1. Flowchart
\`\`\`mermaid
graph TD
  A[Start] --> B{Working?}
  B -- Yes --> C[Ship]
  B -- No --> D[Debug]
  D --> B
  C --> E[Celebrate]
\`\`\`

## 2. Sequence Diagram
\`\`\`mermaid
sequenceDiagram
    autonumber
    participant Client
    participant API
    participant Database
    Client->>API: Request data
    API->>Database: Query
    Database-->>API: Result
    API-->>Client: Response
\`\`\`

## 3. State Diagram
\`\`\`mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Reviewing : submit
    Reviewing --> Published : approve
    Reviewing --> Draft : request changes
    Published --> [*]
\`\`\`

## 4. User Journey
\`\`\`mermaid
journey
    title First order journey
    section Discover
      See campaign: 5: User
      Open detail: 4: User
    section Evaluate
      Read reviews: 4: User
      Compare price: 3: User
    section Order
      Fill address: 3: User
      Choose payment: 4: User
    section Delivery
      Receive notice: 5: System
      Confirm receipt: 5: User
\`\`\`

---

## 5. Class Diagram
\`\`\`mermaid
classDiagram
    class Animal {
        +int age
        +String gender
        +isMammal()
        +mate()
    }
    class Duck {
        +String beakColor
        +swim()
        +quack()
    }
    class Fish {
        -int sizeInFeet
        -canEat()
    }
    class Zebra {
        +bool is_wild
        +run()
    }
    Animal <|-- Duck
    Animal <|-- Fish
    Animal <|-- Zebra
\`\`\`

## 6. ER Diagram
\`\`\`mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    CUSTOMER {
        string name
        string email
    }
    ORDER {
        int id
        string address
    }
\`\`\`

## 7. C4 Context
\`\`\`mermaid
C4Context
    title Content platform context
    Person(editor, "Content editor", "Writes and publishes articles")
    Person(ops, "Operations", "Reviews growth metrics")
    System(platform, "Content Platform", "Plans, generates, reviews, and distributes content")
    System_Ext(llm, "LLM Service", "Summarizes and rewrites drafts")
    System_Ext(cms, "Publishing CMS", "Receives final content")
    SystemDb_Ext(warehouse, "Data Warehouse", "Stores content and behavior metrics")
    Rel(editor, platform, "Uses daily")
    Rel(ops, platform, "Reviews")
    Rel(platform, llm, "Generates content")
    Rel(platform, cms, "Publishes")
    Rel(platform, warehouse, "Syncs data")
\`\`\`

## 8. Architecture
\`\`\`mermaid
architecture-beta
    group entry_group(cloud)[Entry]
    group app_group(cloud)[App]
    group data_group(cloud)[Data]
    service gateway(internet)[Gateway] in entry_group
    service web(server)[Web] in entry_group
    service api(server)[API] in app_group
    service worker(server)[Worker] in app_group
    service cache(database)[Redis] in data_group
    service db(database)[Postgres] in data_group
    service storage(disk)[Storage] in data_group
    gateway:B -- T:web
    web:R -- L:api
    api:B -- T:db
    api:R -- L:cache
    worker:B -- T:storage
\`\`\`

---

## 9. Pie Chart
\`\`\`mermaid
pie title Team focus
    "Discovery" : 24
    "Design" : 16
    "Build" : 38
    "QA" : 14
    "Retro" : 8
\`\`\`

## 10. Quadrant Chart
\`\`\`mermaid
quadrantChart
    title AI roadmap evaluation
    x-axis Low value --> High value
    y-axis Low effort --> High effort
    quadrant-1 Big bets
    quadrant-2 Plan carefully
    quadrant-3 Defer
    quadrant-4 Fast pilots
    Smart search: [0.86, 0.42]
    Auto summary: [0.74, 0.28]
    Conversational BI: [0.79, 0.76]
    AI tutor: [0.58, 0.64]
    Voice clone: [0.33, 0.83]
\`\`\`

## 11. XY Chart
\`\`\`mermaid
xychart-beta
    title "Conversion after release"
    x-axis [W1, W2, W3, W4, W5, W6]
    y-axis "Users" 0 --> 140
    bar [52, 66, 79, 94, 108, 118]
    line [45, 58, 72, 88, 101, 112]
\`\`\`

## 12. Sankey
\`\`\`mermaid
sankey-beta
    %% source,target,value
    A, X, 10
    A, Y, 5
    B, X, 7
    B, Y, 8
    X, Z, 12
    Y, Z, 13
\`\`\`

## 13. Treemap
\`\`\`mermaid
treemap
    title Content traffic sources
    "Total" : 1580
      "Organic" : 720
        "SEO" : 320
        "Community" : 220
        "Referrals" : 180
      "Campaigns" : 520
        "Live partners" : 240
        "Group sharing" : 160
        "Events" : 120
      "Paid" : 340
        "Search ads" : 190
        "Feeds" : 150
\`\`\`

## 14. Venn
\`\`\`mermaid
venn-beta
    title Cross-functional capability
    set Product:10
    set Engineering:12
    union Product,Engineering["Reliable delivery"]:5
\`\`\`

---

## 15. Gantt
\`\`\`mermaid
gantt
    title Feature rollout
    dateFormat  YYYY-MM-DD
    axisFormat  %m/%d
    section Discovery
    Interviews      :done, a1, 2026-05-01, 3d
    Design review   :done, a2, after a1, 2d
    section Build
    Frontend        :active, a3, after a2, 5d
    API integration :a4, after a2, 5d
    section Release
    Regression test :a5, after a3, 3d
    Beta release    :milestone, a6, after a5, 0d
\`\`\`

## 16. Git Graph
\`\`\`mermaid
gitGraph
    commit id: "init"
    branch develop
    checkout develop
    commit id: "layout"
    branch feature-auth
    checkout feature-auth
    commit id: "login-ui"
    commit id: "oauth"
    checkout develop
    merge feature-auth
    branch feature-billing
    checkout feature-billing
    commit id: "pricing"
    commit id: "checkout"
    checkout develop
    merge feature-billing
    checkout main
    merge develop
    branch hotfix-copy
    checkout hotfix-copy
    commit id: "hero-fix"
    checkout main
    merge hotfix-copy
\`\`\`

## 17. Requirement Diagram
\`\`\`mermaid
requirementDiagram
    requirement secure_login {
        id: 1
        text: "Users must sign in securely"
        risk: high
        verifymethod: test
    }
    requirement mfa_support {
        id: 2
        text: "Sensitive actions require MFA"
        risk: medium
        verifymethod: demonstration
    }
    requirement audit_trace {
        id: 3
        text: "Critical actions keep audit logs"
        risk: medium
        verifymethod: inspection
    }
    element auth_service {
        type: simulation
    }
    element security_center {
        type: simulation
    }
    secure_login - satisfies -> auth_service
    mfa_support - satisfies -> auth_service
    audit_trace - satisfies -> security_center
\`\`\`

## 18. Kanban
\`\`\`mermaid
kanban
    id1[Todo]
        id2[Design database schema]
        id3[Write API docs]
    id4[In Progress]
        id5[Implement auth module]
    id6[Done]
        id7[Project setup]
        id8[Dev environment]
\`\`\`

## 19. Ishikawa
\`\`\`mermaid
ishikawa-beta
    Slow website - root cause analysis
    Server
        High CPU
        Low memory
    Network
        Limited bandwidth
        CDN misconfiguration
    Frontend
        Uncompressed images
        Large JS bundle
    Database
        Slow queries
        Missing indexes
\`\`\`

---

## 20. Mindmap
\`\`\`mermaid
mindmap
  root((Tech stack))
    Frontend
      React
        Next.js
        Remix
      Vue
        Nuxt
      Svelte
    Backend
      Node.js
        Express
        NestJS
      Python
        Django
        FastAPI
      Go
    Database
      SQL
        PostgreSQL
        MySQL
      NoSQL
        MongoDB
        Redis
\`\`\`

## 21. Timeline
\`\`\`mermaid
timeline
    title Product milestones
    2023 Q2 : Project kickoff
            : First MVP
    2023 Q4 : Seed users
            : Content workflow
    2024 Q2 : Team edition
            : AI generation
    2024 Q4 : Open API
            : 100k monthly active users
\`\`\`

## 22. Block Diagram
\`\`\`mermaid
block-beta
  columns 3
  input["Input"]
  process["Process"]
  output["Output"]
  input --> process
  process --> output
  space
  space
  feedback["Feedback"]
  feedback -.-> input
  feedback -.-> process
  feedback -.-> output
\`\`\`

## 23. Packet Diagram
\`\`\`mermaid
packet-beta
    title TCP header
    0-15: "Source Port"
    16-31: "Destination Port"
    32-63: "Sequence Number"
    64-95: "Acknowledgment Number"
    96-99: "Data Offset"
    100-105: "Reserved"
    106: "URG"
    107: "ACK"
    108: "PSH"
    109: "RST"
    110: "SYN"
    111: "FIN"
    112-127: "Window Size"
    128-143: "Checksum"
    144-159: "Urgent Pointer"
    160-319: "Options (optional)"
\`\`\`
`;

export const ZH_SAMPLES: Record<Exclude<SampleKey, 'morndraft'>, string> = {
  mixed: `# 混合内容示例

这个案例覆盖当前 MornDraft Preview 支持的语法：Markdown、图片链接、表格、引用、无语言代码块、JSON、JSON5、Mermaid 和 HTML preview。

## 1. Markdown、图片、表格

![MornDraft 占位图](https://placehold.co/640x320.png)

| 语法 | 渲染结果 |
|---|---|
| Markdown | 富文本正文 |
| 图片链接 | 自适应图片 |
| 无语言代码块 | 普通代码块 |

> mixed 文档里每个 artifact 都应该互不污染，同时保留周围 Markdown 排版。

## 2. 无语言代码块
\`\`\`
function greet(name) {
  return 'Hello, ' + name;
}
\`\`\`

## 3. JSON
JSON 代码块会自动解析并格式化：
\`\`\`json
{
  "project": "MornDraft",
  "features": ["Markdown", "Image", "Code", "HTML", "JSON", "JSON5", "Mermaid"],
  "version": 2.0
}
\`\`\`

## 4. JSON5
\`\`\`json5
{
  project: 'MornDraft',
  trailingComma: true,
  features: ['人工验收', 'Agent 交接'],
}
\`\`\`

## 5. Mermaid — 流程图
\`\`\`mermaid
graph LR
  A[输入] --> B{识别类型}
  B -->|Markdown| C[渲染文档]
  B -->|HTML| D[Iframe]
  B -->|JSON| E[格式化高亮]
  B -->|Mermaid| F[生成图表]
\`\`\`

## 6. HTML Preview
\`\`\`html-preview
${MIXED_MCP_ADMIN_HTML_SAMPLE}
\`\`\`
`,
  markdown: `# Markdown Example

## Text Formatting
This is **bold**, *italic*, ~~strikethrough~~, and \`inline code\`.

## Lists
- Item one
- Item two
  - Nested item
  - Another nested

1. First
2. Second
3. Third

## Table

| Feature | Status |
|---------|--------|
| Markdown | ✅ |
| HTML | ✅ |
| JSON | ✅ |
| Mermaid | ✅ |

## Blockquote

> The best way to predict the future is to invent it.
> — Alan Kay

## Code Block
\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`
`,
  html: DEFAULT_HTML_SAMPLE,
  json: `\`\`\`json
{
  "name": "John Doe",
  "age": 30,
  "hobbies": ["reading", "hiking", "coding"],
  "address": {
    "street": "123 Main St",
    "city": "Anytown"
  }
}
\`\`\``,
  mermaid: SAMPLE_MERMAID,
};

export const EN_SAMPLES: Record<Exclude<SampleKey, 'morndraft'>, string> = {
  mixed: EN_SAMPLE_MIXED,
  markdown: EN_SAMPLE_MARKDOWN,
  html: EN_SAMPLE_HTML,
  json: EN_SAMPLE_JSON,
  mermaid: EN_SAMPLE_MERMAID,
};

export const SAMPLES_BY_LOCALE: Record<Locale, Record<Exclude<SampleKey, 'morndraft'>, string>> = {
  zh: ZH_SAMPLES,
  en: EN_SAMPLES,
};

const lazySampleSourcePromises = new Map<string, Promise<string>>();

const getSampleSourceCacheKey = (
  locale: Locale,
  key: SampleKey,
  scope: MornDraftComponentScope,
) => `${locale}:${key}:${scope}`;

export const getSampleByKey = (locale: Locale, key: Exclude<SampleKey, 'morndraft'>) => SAMPLES_BY_LOCALE[locale][key];

export const loadSampleSource = (
  locale: Locale,
  key: SampleKey,
  scope: MornDraftComponentScope = 'showcase',
): Promise<string> => {
  if (key !== 'morndraft') return Promise.resolve(getSampleByKey(locale, key));

  const cacheKey = getSampleSourceCacheKey(locale, key, scope);
  const cachedPromise = lazySampleSourcePromises.get(cacheKey);
  if (cachedPromise) return cachedPromise;

  const samplePromise = import('./samples/morndraftSampleSource')
    .then((module) => module.buildMornDraftSampleSource(scope))
    .catch((error) => {
      lazySampleSourcePromises.delete(cacheKey);
      throw error;
    });
  lazySampleSourcePromises.set(cacheKey, samplePromise);
  return samplePromise;
};

export const prefetchSampleSource = (
  locale: Locale,
  key: SampleKey,
  scope: MornDraftComponentScope = 'showcase',
) => {
  void loadSampleSource(locale, key, scope).catch(() => undefined);
};

export const getSamplePreviewLayout = (key: SampleKey) => SAMPLE_PREVIEW_LAYOUTS[key];

export const getSampleEntries = (locale: Locale) =>
  SAMPLE_KEYS.map((key) => ({
    key,
    label: SAMPLE_LABELS[locale][key],
    previewLayout: getSamplePreviewLayout(key),
  }));

export const normalizeLocale = (value: unknown): Locale | null =>
  value === 'zh' || value === 'en' ? value : null;

export const detectBrowserLocale = (languages?: readonly string[] | string | null): Locale => {
  const languageList = Array.isArray(languages)
    ? languages
    : typeof languages === 'string'
      ? [languages]
      : [];
  return languageList.some((language) => /^zh\b|^zh-/i.test(language)) ? 'zh' : 'en';
};

const getBrowserLanguages = (): readonly string[] => {
  if (typeof navigator === 'undefined') return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
};

const getLocalStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const getStoredLocale = (storage: Storage | null = getLocalStorage()): Locale | null => {
  try {
    const stored = normalizeLocale(storage?.getItem(LOCALE_STORAGE_KEY));
    if (stored) return stored;

    const legacyStored = normalizeLocale(storage?.getItem(LEGACY_LOCALE_STORAGE_KEY));
    if (legacyStored) {
      storage?.setItem(LOCALE_STORAGE_KEY, legacyStored);
      storage?.removeItem(LEGACY_LOCALE_STORAGE_KEY);
      return legacyStored;
    }
  } catch {
    return null;
  }
  return null;
};

export const saveLocale = (locale: Locale, storage: Storage | null = getLocalStorage()) => {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore unavailable storage, such as private browsing restrictions.
  }
};

export const getInitialLocale = (
  options: { storage?: Storage | null; languages?: readonly string[] | string | null } = {},
): Locale => {
  const stored = getStoredLocale(options.storage ?? getLocalStorage());
  if (stored) return stored;
  return detectBrowserLocale(options.languages ?? getBrowserLanguages());
};

export const TRANSLATIONS = {
  zh: {
    appTitle: 'MornDraft',
    documentTitle: '初稿-Morndraft',
    tagline: '',
    back: '返回',
    backHome: '返回主站',
    more: '更多',
    samples: '语法案例',
    feedback: {
      trigger: '问题反馈',
      offsiteTitle: '即将离开本站',
      offsiteMessage: '你即将前往外部链接，是否继续访问？',
      offsiteCancel: '取消',
      offsiteConfirm: '继续访问',
    },
    aboutButton: '关于',
    switchLanguage: 'Switch to English',
    switchToDarkTheme: '切换到黑夜模式',
    switchToLightTheme: '切换到白天模式',
    languageBadge: 'EN',
    mobile: {
      openDrafts: '打开草稿',
      openSamples: '打开语法',
      closeSheet: '关闭浮层',
      draftsTitle: '草稿和个人中心',
      draftSearchPlaceholder: '搜索草稿',
      draftSearchNoResults: '没有匹配的草稿',
      samplesTitle: '语法',
      emptyTitle: '交付前先看清',
      emptySubtitle: '预览、定位、修正，再带走。',
      promptPlaceholder: '粘贴或输入要交付的内容...',
      send: '生成预览',
      upload: '上传',
      uploadSuccess: '已上传并生成预览',
      recommendedSamples: '推荐语法',
      showcaseTabs: 'Showcase 示例',
      showcaseMore: 'More',
      viewSource: '源码',
      viewPreview: '预览',
      switchToSource: '切换到源码',
      switchToPreview: '切换到预览',
      sourceTitle: 'Editor',
      pasteCode: '粘贴代码',
      pasteEmpty: '剪贴板没有可预览内容',
      pasteFailed: '无法读取剪贴板内容',
      uploadFile: '上传文件',
      draftSaveLoginRequiredToast: '预览已生成，登录后才能保存到草稿',
      draftSaveUnavailableToast: '预览已生成，但当前保存不可用',
      draftSaveFailedToast: '预览已生成，但草稿保存失败，请稍后重试',
      pdfLeaveNotice: '正在生成 PDF，手机浏览器可能会离开当前页进入系统预览或下载。',
    },
    drafts: {
      title: 'Drafts',
      collapse: '收起草稿箱',
      expand: '展开草稿箱',
      newDraft: '新建草稿',
      refresh: '刷新草稿',
      empty: '暂无草稿',
      loading: '加载草稿中...',
      loadMore: '加载更多草稿',
      loadingMore: '正在加载更多...',
      saving: '保存中...',
      offline: '当前离线，更改已保存在本机',
      recovered: '已恢复本机未保存的更改',
      unavailable: '草稿箱不可用',
      loginRequired: '登录后使用草稿箱',
      quota: (used: number, limit: number | null) => (
        limit === null
          ? `${used.toLocaleString('zh-CN')} 个草稿`
          : `${used.toLocaleString('zh-CN')} / ${limit.toLocaleString('zh-CN')} 个草稿`
      ),
      conflict: '草稿已在其他会话更新',
      keepLocalChanges: '保留本机更改',
      useServerVersion: '使用云端版本',
      error: '草稿保存失败',
      open: '打开草稿',
      rename: '重命名草稿',
      renamePlaceholder: '请输入草稿标题',
      cancel: '取消',
      delete: '删除草稿',
      confirmDelete: (title: string) => `删除「${title}」？`,
      deleteDialogTitle: '删除草稿',
      deleteDialogDescription: (title: string) => `确定删除「${title}」吗？删除后无法恢复。`,
      deleteDialogCancel: '取消',
      deleteDialogConfirm: '删除',
      importDraft: '上传',
      importLocalMarkdown: '导入本地 Markdown',
      importDropHint: '松开导入为草稿',
      importing: '正在导入...',
      importSuccess: '已导入为草稿',
      importFailed: '草稿导入失败',
      untitled: '未命名草稿',
      updatedAt: (value: string) => `更新于 ${value}`,
    },
    editor: {
      title: '源码',
      switchToFinal: '切到交付',
      backToTop: '回到顶部',
      clear: '清空',
      copied: '已复制',
      copySource: '复制',
      downloadSource: '下载',
      importFile: '上传',
      importFileTitle: '上传文件到 Editor',
      importingFile: '导入中...',
      importSuccess: '已导入到 Editor',
      importDropHint: '松开导入到 Editor',
      importUnsupportedFile: '暂不支持此文件类型',
      importLocalMarkdownRequired: '文件包含本地相对图片，请使用同一上传入口的本地导入。',
      importTooManyFiles: '一次最多导入 10 个文件',
      importFileTooLarge: '文件超过导入大小限制',
      importBatchTooLarge: '文件总大小超过导入限制',
      importEmpty: '没有可导入内容',
      placeholder: '输入、粘贴，支持Markdown、HTML、Mermaid、JSON等语法，支持拖拽上传',
      placeholderFlatDisabled: '输入、粘贴，支持Markdown、HTML、Mermaid、JSON等语法，支持拖拽上传',
      syntaxError: '语法错误：',
      characters: '字符',
      charactersShort: '字',
      tokens: 'tokens',
      approximate: '约 ',
      metricsAria: (characters: number, tokens: number) => `${characters.toLocaleString('zh-CN')} 字符，约 ${tokens.toLocaleString('zh-CN')} tokens`,
      jumpToPreviewArtifact: (line: number) => `定位预览中的第 ${line.toLocaleString('zh-CN')} 行产物`,
      jumpToSourceLine: (line: number) => `定位到第 ${line.toLocaleString('zh-CN')} 行`,
      searchPlaceholder: '搜索源码',
      searchPrevious: '上一个匹配',
      searchNext: '下一个匹配',
      searchClear: '清除搜索',
      searchNoMatches: '无匹配',
      searchMatchStatus: (current: number, total: number) => `${current.toLocaleString('zh-CN')} / ${total.toLocaleString('zh-CN')}`,
      fix: '修复',
      fixAll: '一键修复',
      pendingFixInlineHint: '//候选尚未写入 · 顶部采用或 Esc 取消',
      pendingFixToast: '修复候选尚未写入源码',
      fixApplied: '已修复',
      undoFix: '撤回',
      acceptFixShortcut: '采用',
      cancelFixShortcut: '取消',
      undoFixShortcut: '撤回',
      undoFixShortcutHint: 'Ctrl+Z / Cmd+Z 撤回',
      closeFixToast: '关闭修复提示',
      diagnosticConsoleTitle: (issues: number, fixes: number) => `${issues.toLocaleString('zh-CN')} 个问题，${fixes.toLocaleString('zh-CN')} 个可修复项`,
      diagnosticDialogTitle: '错误提示',
      closeDiagnosticDialog: '关闭错误提示',
      diagnosticPanelTitle: (issues: number, fixes: number) => `${issues.toLocaleString('zh-CN')} 个问题，${fixes.toLocaleString('zh-CN')} 个可修复`,
      errorLine: (line: number) => `第 ${line.toLocaleString('zh-CN')} 行`,
    },
    preview: {
      locale: 'zh',
      documentTitle: 'MornDraft',
      title: '交付',
      charactersShort: '字',
      tokens: 'tokens',
      htmlMetricsPrefix: 'HTML',
      metricsAria: (
        characters: number,
        tokens: number,
        htmlStatus: 'idle' | 'building' | 'ready' | 'error' = 'ready',
      ) => {
        const htmlStatusText = htmlStatus === 'building'
          ? '，HTML 包体正在本地估算'
          : htmlStatus === 'error'
            ? '，HTML 包体估算失败，当前显示上一轮或空状态'
            : '';
        return `交付 HTML 包体 ${characters.toLocaleString('zh-CN')} 字符，约 ${tokens.toLocaleString('zh-CN')} tokens${htmlStatusText}。这是本地导出 HTML 的体积估算，不消耗导出额度`;
      },
      diagnosticConsoleTitle: (issues: number, fixes: number) => `${issues.toLocaleString('zh-CN')} 个问题，${fixes.toLocaleString('zh-CN')} 个可修复项`,
      diagnosticDialogTitle: '错误提示',
      closeDiagnosticDialog: '关闭错误提示',
      diagnosticPanelTitle: (issues: number, fixes: number) => `${issues.toLocaleString('zh-CN')} 个问题，${fixes.toLocaleString('zh-CN')} 个可修复`,
      fixAll: '一键修复',
      jumpToSourceLine: (line: number) => `定位到第 ${line.toLocaleString('zh-CN')} 行`,
      switchToSource: '查看源码',
      backToTop: '回到顶部',
      expandEditor: '展开编辑器',
      collapseEditor: '收起编辑器',
      expandBlock: '展开区块',
      collapseBlock: '折叠区块',
      enterBlockFullscreen: '全屏显示区块',
      exitBlockFullscreen: '退出全屏',
      artifactMap: '目录',
      openArtifactMap: '打开目录导航',
      closeArtifactMap: '折叠目录导航',
      artifactMapEmpty: '暂无目录项',
      expandArtifact: (title: string) => `展开 ${title}`,
      collapseArtifact: (title: string) => `折叠 ${title}`,
      deliveryDisplayOptions: '交付显示选项',
      deliveryA4Pagination: '分页',
      deliveryA4PaginationToggle: '按 A4 纸分页',
      deliveryCode: '代码',
      deliveryCodeToggle: '显示代码',
      deliveryArtifactMap: '目录',
      deliveryArtifactMapToggle: '显示目录',
      previewFontFamily: '字体',
      previewFontSize: '字号',
      previewTextColor: '颜色',
      previewLineHeight: '行间距',
      previewLineHeightCompact: '紧凑',
      previewLineHeightBalanced: '均衡',
      previewLineHeightDefault: '默认',
      previewLineHeightLoose: '宽松',
      previewLetterSpacing: '字间距',
      previewLetterSpacingDefault: '默认',
      previewLetterSpacingSoft: '微松',
      previewLetterSpacingLoose: '宽松',
      previewLetterSpacingTitle: '标题感',
      previewTextAlign: '对齐',
      previewAlignLeft: '居左',
      previewAlignCenter: '居中',
      previewAlignRight: '居右',
      previewFormatToolbar: '交付编辑工具',
      previewEditSelectionRequired: '请选中内容进行编辑',
      previewEditUnavailable: '当前内容不能在交付侧编辑，请到源码区修改',
      previewBlockFormat: '段落样式',
      previewParagraph: '正文',
      previewHeading1: '标题 1',
      previewHeading2: '标题 2',
      previewHeading3: '标题 3',
      previewHeading4: '标题 4',
      previewHeading5: '标题 5',
      previewHeading6: '标题 6',
      previewQuoteBlock: '引用',
      previewBulletList: '项目符号',
      previewNumberList: '编号列表',
      previewMixedBlockFormat: '混合段落',
      previewBoldSelection: '加粗选区',
      previewItalicSelection: '斜体选区',
      previewUnderlineSelection: '下划线选区',
      previewStrikeSelection: '删除线选区',
      previewInlineCodeSelection: '行内代码选区',
      previewHighlightSelection: '高亮选区',
      previewSubscriptSelection: '下标选区',
      previewSuperscriptSelection: '上标选区',
      previewEditInSource: '到源码区编辑',
      previewReadonlyBlock: '此区块请到源码区编辑',
      previewImageInserted: '图片已插入',
      previewImageInsertFailed: '图片插入失败',
      previewImageSelected: '图片已选中',
      previewImageUnsupportedFile: '暂不支持此图片类型',
      previewImageFileTooLarge: '图片超过上传大小限制',
      previewImageModerationRejected: '图片未通过内容审核，请更换后重试。',
      previewAiSelectionToolbar: 'AI 选区工具',
      previewAiSummarizeSelection: '总结',
      previewAiModifySelection: '修改',
      previewAiClose: '关闭 AI 选区工具',
      previewAiApply: '采用',
      previewAiApplied: '已应用 AI 修改',
      previewAiAppliedCanUndo: '已应用，可撤回',
      previewAiUndoShortcutHint: 'Esc / Ctrl+Z / Cmd+Z 撤回',
      previewAiCopyResult: '复制',
      previewAiGenerateAction: (action: string) => `生成${action}`,
      previewAiInstructionLabel: (action: string) => `${action}要求`,
      previewAiInstructionPlaceholder: (action: string) => `补充你希望如何${action}`,
      previewAiContinueFollowUp: '追问',
      previewAiFollowUpPlaceholder: '追问，例如：再短一点、换成表格、补充风险',
      previewAiSummarizeFollowUpPlaceholder: '追问总结，例如：再短一点、列出要点、补充结论',
      previewAiModifyFollowUpPlaceholder: '追问修改，例如：换成表格、语气更正式、补充风险',
      previewAiFollowUpSend: '发送',
      previewAiFollowUpEmpty: '请输入追问内容',
      previewAiCandidateNotApplied: '采用前不会写回正文',
      previewAiMornDraftHtmlFallbackNotice: '采用后会转为 HTML Source，样式可直接编辑，但不再使用 MornDraft JSON 结构化编辑',
      previewAiLoginRequired: '登录后可使用 AI 处理选区',
      previewAiOriginal: '原文',
      previewAiProviderUnavailable: 'AI 服务暂未开启，请稍后再试',
      previewAiQuotaExhausted: '本月 AI 次数已用完，请升级或等额度刷新',
      previewAiResultReady: 'AI 结果已生成',
      previewAiModifyReady: 'AI 修改建议已生成',
      previewAiRequestFailed: 'AI 处理失败',
      previewAiRequestDenied: (status: number) => `后端拒绝 AI 请求（${status}）`,
      previewAiEmptyResponse: 'AI 未返回可用内容',
      previewAiNoChange: 'AI 结果与当前内容相同，无需采用',
      previewAiSelectionChanged: '内容已变化，请重新选择后再应用',
      previewAiSuggestion: '建议',
      previewAiUndo: '撤回',
      previewAiUndoApplied: '已撤回 AI 修改',
      previewAiUpgradeRequired: '当前账号未开通 AI 修订能力，请升级 Pro 后使用',
      previewAiSlashGenerate: (instruction: string) => `用 AI 生成：“${instruction}”`,
      previewAiSlashGenerateEmpty: '用 AI 生成内容',
      previewAiSlashGenerateNow: '生成',
      previewAiSlashStartDraft: 'AI 生成',
      previewAiSlashDraftTitle: '输入 /AI 指令后生成可编辑内容',
      previewAiSlashComposerLabel: 'AI 生成需求',
      previewAiSlashInstructionPlaceholder: '输入生成要求，Enter 换行，⌘/Ctrl+Enter 生成',
      previewAiSlashInlinePlaceholder: '请输入你的生成要求',
      previewAiSlashEmptyInstruction: '请输入 AI 生成需求',
      previewAiSlashInstructionTooLong: 'AI 输入内容过长，请拆分后重试',
      previewAiSlashThoughtLabel: '思考',
      previewAiSlashThinkingLoading: '思考中',
      previewAiSlashThinkingReady: '思考完成',
      previewAiSlashThinkingEmpty: '暂无思考内容',
      previewAiSlashThinkingWaiting: '等待思考内容',
      previewAiModelThinkingLabel: '思考内容',
      previewAiSlashThoughtSummaryLabel: '生成思路',
      previewAiSlashProgressLabel: '思考状态',
      previewAiSlashClarificationTitle: 'AI 需要补充信息',
      previewAiSlashClarificationPlaceholder: '补充关键信息，或输入“你先推断”',
      previewAiSlashClarificationContinue: '继续生成',
      previewAiSlashClarificationEmpty: '请输入补充信息',
      previewAiSlashResultReady: 'AI 生成内容已准备好，确认后采用',
      previewAiSlashResultLabel: '生成内容',
      previewAiSlashApply: '采用',
      previewAiSlashGenerateTitle: '根据当前 / 指令生成可编辑内容',
      previewAiSlashGenerating: 'AI 生成中',
      previewAiSlashChanged: '指令已变化，请重新输入 / 指令',
      previewAiSlashPending: (instruction: string) => `按 Enter 用 AI 生成：“${instruction}”`,
      previewAiSlashStop: '终止',
      previewAiSlashCancel: '取消',
      previewAiSlashCancelled: '已取消 AI 生成',
      previewAiSlashInserted: '已采用 AI 生成内容',
      searchPlaceholder: '搜索源码',
      searchPrevious: '上一个匹配',
      searchNext: '下一个匹配',
      searchClear: '清除搜索',
      searchNoMatches: '无匹配',
      searchMatchStatus: (current: number, total: number) => `${current.toLocaleString('zh-CN')} / ${total.toLocaleString('zh-CN')}`,
      copyJson: '复制 JSON',
      copyRichText: '复制富文本',
      copyMenu: '复制',
      copyToWechat: '复制到公众号',
      copyToWechatCopied: '已复制到公众号',
      copyJsonCopied: '已复制 JSON',
      copied: '已复制',
      copySource: '复制',
      copySourceOption: '源码',
      copyImage: '复制图片',
      copyImageOption: '图片',
      copyImagePro: '高清复制',
      copySvgOption: 'SVG',
      copySvgCopied: '已复制 SVG 源码',
      copySvgFailed: '复制 SVG 失败',
      copyMermaidImages: (count: number) => `复制 ${count} 张 Mermaid 图片`,
      generating: '生成中...',
      imageCopied: '已复制图片',
      imagePagesZipReady: '已生成分页图片压缩包',
      pasteToConfirm: '待粘贴确认',
      copyFailed: '复制失败',
      generatingImage: '正在生成图片...',
      generatingScreenshot: '正在生成截图...',
      copyingImage: '正在写入剪贴板...',
      mermaidImagesCopied: (count: number) => `已复制 ${count} 张 Mermaid 图片到富文本剪贴板`,
      mermaidImagesUnavailable: 'Mermaid 图片已写入富文本剪贴板，但当前浏览器不支持回读校验，请直接粘贴确认。',
      mermaidImagesMismatch: '已复制 Mermaid 多图到富文本剪贴板；飞书和微信聊天窗通常不支持多图富文本粘贴，请优先粘贴到富文本编辑器。',
      copyMermaidImagesFailed: '复制 Mermaid 图片失败',
      copyMixedScreenshotFailed: '复制混合预览截图失败',
      copyMarkdownScreenshotFailed: '复制 Markdown 预览截图失败',
      copyHtmlScreenshotFailed: '复制 HTML 预览截图失败',
      mobileImageCopyFallbackTitle: '图片已生成',
      mobileImageCopyFallbackDescription: '浏览器未允许写入剪贴板，图片已准备好，请打开新窗口获取。',
      mobileImageCopyFallbackTooLarge: '图片已生成，但文件过大，无法交付，请改用 PDF 或压缩内容后重试。',
      mobileImageDownloadLabel: '下载 PNG',
      mobileImageShareOpened: '已打开系统分享，可从分享面板保存或发送图片。',
      mobileDeliveryReadyTitle: '文件已准备好',
      mobileDeliveryLeavingHint: '将打开新窗口获取文件；当前页面不会展示完整图片、PDF 或 HTML。',
      mobileDeliveryCancel: '取消',
      mobileDeliveryOpenImage: '打开图片',
      mobileDeliveryOpenPdf: '打开',
      mobileDeliveryOpenHtml: '打开',
      mobileDeliveryPopupBlocked: '浏览器拦截了新窗口，请允许弹窗后重试。',
      mobileHtmlReadyTitle: 'HTML 已生成',
      mobileHtmlReadyDescription: '请点下面按钮打开或保存HTML，点击将打开新窗口获取文件。',
      closeImagePreview: '关闭图片预览',
      previewNotReady: 'Preview is not ready',
      htmlPreviewNotReady: 'HTML preview is not ready',
      noMermaidReady: 'No Mermaid diagrams are ready to copy',
      mermaidTimeout: (pending: number, seconds: number) =>
        `Mermaid render timeout: ${pending} diagram(s) still pending after ${seconds}s`,
      fix: '修复',
      aiFix: 'AI Fix',
      aiFixing: 'AI 修复中...',
      aiFixFailed: 'AI Fix 修复失败',
      cancelFix: '取消',
      undoFix: '撤回',
      fixApplied: '已修复',
      closeFixToast: '关闭修复提示',
      fixReviewTitle: '修复候选',
      fixReviewDescription: (count: number) => `候选尚未写入。采用后将应用 ${count.toLocaleString('zh-CN')} 个修复。`,
      syntaxError: '语法错误',
      codeBlockLabel: '代码',
      codeLines: (count: number) => `${count.toLocaleString('zh-CN')} 行`,
      errorLine: (line: number) => `第 ${line.toLocaleString('zh-CN')} 行`,
      jumpToErrorLine: (line: number) => `定位到第 ${line.toLocaleString('zh-CN')} 行`,
      sourceErrorLine: (line: number) => `源码 第 ${line.toLocaleString('zh-CN')} 行`,
      jumpToSourceErrorLine: (line: number) => `回到源码第 ${line.toLocaleString('zh-CN')} 行`,
      artifactErrorEditableHint: '可直接修改上方原文，修正后会恢复预览。',
      artifactErrorReadOnlyHint: '可点击源码行回到 Source 修改，修正后会恢复预览。',
      artifactErrorSourceLabel: (language: string) => `原文（${language || 'code'}）`,
      invalidJson: 'JSON 内容有误',
      jsonParseError: 'JSON 解析失败',
      htmlPreview: 'HTML 预览',
      htmlPreviewRichCopyFallback: '这段 HTML 预览包含完整页面、脚本或外链样式，不适合直接复制为富文本。请使用分享图片或 HTML 交付。',
      documentSpec: 'DocumentSpec',
      documentSpecPreview: '表达文档预览',
      documentSpecInvalid: 'DocumentSpec 校验失败',
      morndraftComponent: 'MornDraft',
      morndraftComponentPreview: '表达组件预览',
      morndraftComponentInvalid: 'MornDraft 组件校验失败',
      zoomIn: '放大',
      zoomOut: '缩小',
      resetZoom: '重置',
      downloadSvg: 'Download SVG',
      downloadPng: 'Download PNG',
      openPreview: '预览',
      openPreviewFailed: '预览打开失败',
      exportHtmlFile: '导出 HTML 文件',
      exportMenu: '导出',
      exportHtml: '导出 HTML',
      exportPdf: '导出 PDF',
      mobilePdfReadyTitle: 'PDF已生成',
      mobilePdfReadyDescription: '请点下面按钮打开或保存PDF，点击将打开新窗口获取文件。',
      mobilePdfOpenLabel: '打开 / 下载 PDF',
      closePdfPreview: '关闭 PDF 交付',
      exported: '已导出',
      exportPdfCaptureFailed: '导出 PDF 失败：截图生成失败或预览未 ready',
      exportPdfFailed: '导出 PDF 失败',
      rendering: '渲染中...',
      renderingMermaid: (ready: number, total: number) => `渲染 Mermaid ${ready}/${total}`,
      openMermaidLightbox: '查看 Mermaid 大图',
      closeMermaidLightbox: '关闭 Mermaid 大图',
      empty: 'Enter Markdown, HTML, JSON, or Mermaid syntax...',
      generatingPreview: '生成预览中...',
      editHtml: '编辑 HTML',
      finishEditing: '完成编辑',
      editMermaidLabels: '编辑',
      mermaidEditTitle: '编辑 Mermaid 文案',
      cancelEditing: '取消',
      mermaidNoLabels: '当前图表没有可安全编辑的文案',
      mermaidEditUnavailable: '当前图表类型暂不支持文案编辑',
      mermaidValidationFailed: 'Mermaid 语法校验失败，已保留编辑内容',
      mermaidReadOnlyLabel: '只读',
      mermaidEditorNodeTab: '节点',
      mermaidEditorEdgeTab: '边',
      mermaidEditorAllTab: '全部',
      mermaidEditorSearchPlaceholder: '搜索标签',
      mermaidEditorChecked: '已校验',
      mermaidEditorPending: '待保存',
      mermaidEditorChecking: '校验中',
      mermaidEditorNoMatches: '无匹配标签',
      mermaidEditorEditableCount: (count: number) => `${count} 个可编辑标签`,
      nodeLabels: '节点标签',
      edgeLabels: '边标签',
      participantLabels: '参与者',
      messageLabels: '消息',
    },
    about: {
      title: '关于 MornDraft',
      close: '关闭',
      problemTitle: '',
      problems: [
        '一站支持 Markdown、Mermaid、JSON、HTML、图片、网站混合内容预览、审核、复制和导出。',
      ],
      coffeeTitle: '赞赏',
      followTitle: '关注我',
      rewardAlt: '赞赏码',
      qrcodeAlt: '公众号二维码',
      support: '如果这个工具对你有帮助，可以支持 MornDraft 持续迭代。',
      confirm: '知道了',
    },
  },
  en: {
    appTitle: 'MornDraft',
    documentTitle: '初稿-Morndraft',
    tagline: '',
    back: 'Back',
    backHome: 'Back home',
    more: 'More',
    samples: 'Syntax guide',
    feedback: {
      trigger: 'Feedback',
      offsiteTitle: 'Leaving this site',
      offsiteMessage: 'You are about to go to an external site. Do you want to continue?',
      offsiteCancel: 'Cancel',
      offsiteConfirm: 'Continue',
    },
    aboutButton: 'About',
    switchLanguage: '切换到中文',
    switchToDarkTheme: 'Switch to dark mode',
    switchToLightTheme: 'Switch to light mode',
    languageBadge: '中',
    mobile: {
      openDrafts: 'Open drafts',
      openSamples: 'Open samples',
      closeSheet: 'Close sheet',
      draftsTitle: 'Drafts and account',
      draftSearchPlaceholder: 'Search drafts',
      draftSearchNoResults: 'No matching drafts',
      samplesTitle: 'Samples',
      emptyTitle: 'Preview before delivery',
      emptySubtitle: 'Preview, locate, revise, then take it with you.',
      promptPlaceholder: 'Paste or type the content you want to deliver...',
      send: 'Generate preview',
      upload: 'Upload',
      uploadSuccess: 'Uploaded and previewed',
      recommendedSamples: 'Recommended samples',
      showcaseTabs: 'Sample categories',
      showcaseMore: 'More',
      viewSource: 'Source',
      viewPreview: 'Preview',
      switchToSource: 'Switch to source',
      switchToPreview: 'Switch to preview',
      sourceTitle: 'Editor',
      pasteCode: 'Paste code',
      pasteEmpty: 'Clipboard has no previewable content',
      pasteFailed: 'Unable to read clipboard',
      uploadFile: 'Upload file',
      draftSaveLoginRequiredToast: 'Preview generated. Sign in to save it as a draft.',
      draftSaveUnavailableToast: 'Preview generated, but saving is currently unavailable.',
      draftSaveFailedToast: 'Preview generated, but draft save failed. Try again later.',
      pdfLeaveNotice: 'Generating PDF. Your mobile browser may leave this page for system preview or download.',
    },
    drafts: {
      title: 'Drafts',
      collapse: 'Collapse drafts',
      expand: 'Expand drafts',
      newDraft: 'New draft',
      refresh: 'Refresh drafts',
      empty: 'No drafts yet',
      loading: 'Loading drafts...',
      loadMore: 'Load more drafts',
      loadingMore: 'Loading more...',
      saving: 'Saving...',
      offline: 'Offline. Changes are safe on this device.',
      recovered: 'Recovered unsaved changes from this device',
      unavailable: 'Draft Box unavailable',
      loginRequired: 'Sign in to use drafts',
      quota: (used: number, limit: number | null) => (
        limit === null
          ? `${used.toLocaleString('en-US')} draft${used === 1 ? '' : 's'}`
          : `${used.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')} drafts`
      ),
      conflict: 'Draft changed in another session',
      keepLocalChanges: 'Keep local changes',
      useServerVersion: 'Use cloud version',
      error: 'Draft save failed',
      open: 'Open draft',
      rename: 'Rename draft',
      renamePlaceholder: 'Enter draft title',
      cancel: 'Cancel',
      delete: 'Delete draft',
      confirmDelete: (title: string) => `Delete "${title}"?`,
      deleteDialogTitle: 'Delete draft',
      deleteDialogDescription: (title: string) => `Delete "${title}"? This cannot be undone.`,
      deleteDialogCancel: 'Cancel',
      deleteDialogConfirm: 'Delete',
      importDraft: 'Upload',
      importLocalMarkdown: 'Import local Markdown',
      importDropHint: 'Drop to import as a draft',
      importing: 'Importing...',
      importSuccess: 'Imported as draft',
      importFailed: 'Draft import failed',
      untitled: 'Untitled draft',
      updatedAt: (value: string) => `Updated ${value}`,
    },
    editor: {
      title: 'Source',
      switchToFinal: 'Switch to final view',
      backToTop: 'Back to top',
      clear: 'Clear',
      copied: 'Copied',
      copySource: 'Copy',
      downloadSource: 'Download',
      importFile: 'Upload',
      importFileTitle: 'Upload file to Editor',
      importingFile: 'Importing...',
      importSuccess: 'Imported into Editor',
      importDropHint: 'Drop to import into Editor',
      importUnsupportedFile: 'This file type is not supported',
      importLocalMarkdownRequired: 'This file references local images. Use local import from the same upload entry.',
      importTooManyFiles: 'Import up to 10 files at a time',
      importFileTooLarge: 'File exceeds the import size limit',
      importBatchTooLarge: 'Selected files exceed the import size limit',
      importEmpty: 'No importable content',
      placeholder: 'Type or paste. Supports Markdown, HTML, Mermaid, JSON and more. Drag & drop supported.',
      placeholderFlatDisabled: 'Type or paste. Supports Markdown, HTML, Mermaid, JSON and more. Drag & drop supported.',
      syntaxError: 'Syntax Error:',
      characters: 'chars',
      charactersShort: 'chars',
      tokens: 'tokens',
      approximate: 'approx. ',
      metricsAria: (characters: number, tokens: number) => `${characters.toLocaleString('en-US')} characters, approximately ${tokens.toLocaleString('en-US')} tokens`,
      jumpToPreviewArtifact: (line: number) => `Locate line ${line.toLocaleString('en-US')} in preview`,
      jumpToSourceLine: (line: number) => `Jump to line ${line.toLocaleString('en-US')}`,
      searchPlaceholder: 'Search source',
      searchPrevious: 'Previous match',
      searchNext: 'Next match',
      searchClear: 'Clear search',
      searchNoMatches: 'No matches',
      searchMatchStatus: (current: number, total: number) => `${current.toLocaleString('en-US')} / ${total.toLocaleString('en-US')}`,
      fix: 'Fix',
      fixAll: 'Fix all',
      pendingFixInlineHint: '//Candidate not applied · Use the top action or Esc to cancel',
      pendingFixToast: 'Repair candidate has not been applied',
      fixApplied: 'Fixed',
      undoFix: 'Undo',
      acceptFixShortcut: 'Apply',
      cancelFixShortcut: 'Cancel',
      undoFixShortcut: 'Undo',
      undoFixShortcutHint: 'Ctrl+Z / Cmd+Z undo',
      closeFixToast: 'Close repair notice',
      diagnosticConsoleTitle: (issues: number, fixes: number) => `${issues.toLocaleString('en-US')} issue(s), ${fixes.toLocaleString('en-US')} fixable`,
      diagnosticDialogTitle: 'Error tips',
      closeDiagnosticDialog: 'Close error tips',
      diagnosticPanelTitle: (issues: number, fixes: number) => `${issues.toLocaleString('en-US')} issue(s), ${fixes.toLocaleString('en-US')} fixable`,
      errorLine: (line: number) => `Line ${line.toLocaleString('en-US')}`,
    },
    preview: {
      locale: 'en',
      documentTitle: 'MornDraft',
      title: 'Final view',
      charactersShort: 'chars',
      tokens: 'tokens',
      htmlMetricsPrefix: 'HTML',
      metricsAria: (
        characters: number,
        tokens: number,
        htmlStatus: 'idle' | 'building' | 'ready' | 'error' = 'ready',
      ) => {
        const htmlStatusText = htmlStatus === 'building'
          ? ', HTML package size is being estimated locally'
          : htmlStatus === 'error'
            ? ', HTML package size estimate failed and the current value is the previous or empty state'
            : '';
        return `Final HTML package ${characters.toLocaleString('en-US')} characters, approximately ${tokens.toLocaleString('en-US')} tokens${htmlStatusText}. This is estimated from local exported HTML and does not consume export quota`;
      },
      diagnosticConsoleTitle: (issues: number, fixes: number) => `${issues.toLocaleString('en-US')} issue(s), ${fixes.toLocaleString('en-US')} fixable`,
      diagnosticDialogTitle: 'Error tips',
      closeDiagnosticDialog: 'Close error tips',
      diagnosticPanelTitle: (issues: number, fixes: number) => `${issues.toLocaleString('en-US')} issue(s), ${fixes.toLocaleString('en-US')} fixable`,
      fixAll: 'Fix all',
      jumpToSourceLine: (line: number) => `Jump to line ${line.toLocaleString('en-US')}`,
      switchToSource: 'View source',
      backToTop: 'Back to top',
      expandEditor: 'Expand editor',
      collapseEditor: 'Collapse editor',
      expandBlock: 'Expand block',
      collapseBlock: 'Collapse block',
      enterBlockFullscreen: 'Open block fullscreen',
      exitBlockFullscreen: 'Exit fullscreen',
      artifactMap: 'Map',
      openArtifactMap: 'Open artifact map',
      closeArtifactMap: 'Collapse artifact map',
      artifactMapEmpty: 'No map items yet',
      expandArtifact: (title: string) => `Expand ${title}`,
      collapseArtifact: (title: string) => `Collapse ${title}`,
      deliveryDisplayOptions: 'Delivery display options',
      deliveryA4Pagination: 'Pages',
      deliveryA4PaginationToggle: 'Paginate as A4 pages',
      deliveryCode: 'Code',
      deliveryCodeToggle: 'Show code',
      deliveryArtifactMap: 'Map',
      deliveryArtifactMapToggle: 'Show table of contents',
      previewFontFamily: 'Font',
      previewFontSize: 'Size',
      previewTextColor: 'Color',
      previewLineHeight: 'Line spacing',
      previewLineHeightCompact: 'Compact',
      previewLineHeightBalanced: 'Balanced',
      previewLineHeightDefault: 'Body default',
      previewLineHeightLoose: 'Loose',
      previewLetterSpacing: 'Letter spacing',
      previewLetterSpacingDefault: 'Default',
      previewLetterSpacingSoft: 'Soft',
      previewLetterSpacingLoose: 'Loose',
      previewLetterSpacingTitle: 'Title',
      previewTextAlign: 'Alignment',
      previewAlignLeft: 'Align left',
      previewAlignCenter: 'Align center',
      previewAlignRight: 'Align right',
      previewFormatToolbar: 'Final view editing tools',
      previewEditSelectionRequired: 'Select content to edit.',
      previewEditUnavailable: 'This content cannot be edited in the final view. Edit the source instead.',
      previewBlockFormat: 'Block style',
      previewParagraph: 'Paragraph',
      previewHeading1: 'Heading 1',
      previewHeading2: 'Heading 2',
      previewHeading3: 'Heading 3',
      previewHeading4: 'Heading 4',
      previewHeading5: 'Heading 5',
      previewHeading6: 'Heading 6',
      previewQuoteBlock: 'Quote',
      previewBulletList: 'Bulleted list',
      previewNumberList: 'Numbered list',
      previewMixedBlockFormat: 'Mixed blocks',
      previewBoldSelection: 'Bold selection',
      previewItalicSelection: 'Italic selection',
      previewUnderlineSelection: 'Underline selection',
      previewStrikeSelection: 'Strikethrough selection',
      previewInlineCodeSelection: 'Inline code selection',
      previewHighlightSelection: 'Highlight selection',
      previewSubscriptSelection: 'Subscript selection',
      previewSuperscriptSelection: 'Superscript selection',
      previewEditInSource: 'Edit in source',
      previewReadonlyBlock: 'Edit this block in source',
      previewImageInserted: 'Image inserted',
      previewImageInsertFailed: 'Could not insert image',
      previewImageSelected: 'Image selected',
      previewImageUnsupportedFile: 'This image type is not supported',
      previewImageFileTooLarge: 'Image exceeds the upload size limit',
      previewImageModerationRejected: 'This image did not pass moderation. Choose another image and try again.',
      previewAiSelectionToolbar: 'AI selection tools',
      previewAiSummarizeSelection: 'Summarize',
      previewAiModifySelection: 'Modify',
      previewAiClose: 'Close AI selection tools',
      previewAiApply: 'Apply',
      previewAiApplied: 'AI change applied',
      previewAiAppliedCanUndo: 'Applied. You can undo it.',
      previewAiUndoShortcutHint: 'Esc / Ctrl+Z / Cmd+Z undo',
      previewAiCopyResult: 'Copy',
      previewAiGenerateAction: (action: string) => `Generate ${action}`,
      previewAiInstructionLabel: (action: string) => `${action} request`,
      previewAiInstructionPlaceholder: (action: string) => `Add how you want to ${action.toLowerCase()}`,
      previewAiContinueFollowUp: 'Follow up',
      previewAiFollowUpPlaceholder: 'Follow up, e.g. make it shorter, turn it into a table, add risks',
      previewAiSummarizeFollowUpPlaceholder: 'Follow up on the summary, e.g. make it shorter, list key points, add a conclusion',
      previewAiModifyFollowUpPlaceholder: 'Follow up on the edit, e.g. turn it into a table, make it more formal, add risks',
      previewAiFollowUpSend: 'Send',
      previewAiFollowUpEmpty: 'Type a follow-up',
      previewAiCandidateNotApplied: 'Nothing is written back until you apply',
      previewAiMornDraftHtmlFallbackNotice: 'Applying converts this block to HTML Source; styles remain directly editable, but MornDraft JSON structured editing is no longer used',
      previewAiLoginRequired: 'Sign in to use AI on selected text.',
      previewAiOriginal: 'Original',
      previewAiProviderUnavailable: 'AI service is not enabled yet. Try again later.',
      previewAiQuotaExhausted: 'Your monthly AI quota is used up. Upgrade or wait for the quota refresh.',
      previewAiResultReady: 'AI result generated',
      previewAiModifyReady: 'AI revision ready',
      previewAiRequestFailed: 'AI request failed',
      previewAiRequestDenied: (status: number) => `Backend denied AI request (${status})`,
      previewAiEmptyResponse: 'AI did not return usable content',
      previewAiNoChange: 'The AI result matches the current content. Nothing to apply.',
      previewAiSelectionChanged: 'Content changed. Select the text again before applying.',
      previewAiSuggestion: 'Suggestion',
      previewAiUndo: 'Undo',
      previewAiUndoApplied: 'AI change undone',
      previewAiUpgradeRequired: 'AI revision is available on Pro. Upgrade to use it.',
      previewAiSlashGenerate: (instruction: string) => `Generate with AI: "${instruction}"`,
      previewAiSlashGenerateEmpty: 'Generate with AI',
      previewAiSlashGenerateNow: 'Generate',
      previewAiSlashStartDraft: 'AI generate',
      previewAiSlashDraftTitle: 'Type an /AI instruction to generate editable content',
      previewAiSlashComposerLabel: 'AI generation request',
      previewAiSlashInstructionPlaceholder: 'Type a request. Enter adds a line; Cmd/Ctrl+Enter generates.',
      previewAiSlashInlinePlaceholder: 'Type your generation request',
      previewAiSlashEmptyInstruction: 'Type an AI generation request',
      previewAiSlashInstructionTooLong: 'The AI input is too long. Please split it and try again.',
      previewAiSlashThoughtLabel: 'Thinking',
      previewAiSlashThinkingLoading: 'Thinking',
      previewAiSlashThinkingReady: 'Thinking complete',
      previewAiSlashThinkingEmpty: 'No thinking yet',
      previewAiSlashThinkingWaiting: 'Waiting for thinking details',
      previewAiModelThinkingLabel: 'Thinking details',
      previewAiSlashThoughtSummaryLabel: 'Generation approach',
      previewAiSlashProgressLabel: 'Thinking status',
      previewAiSlashClarificationTitle: 'AI needs more context',
      previewAiSlashClarificationPlaceholder: 'Add key context, or type "infer it first"',
      previewAiSlashClarificationContinue: 'Continue',
      previewAiSlashClarificationEmpty: 'Add the missing context',
      previewAiSlashResultReady: 'AI generated content is ready to apply',
      previewAiSlashResultLabel: 'Generated content',
      previewAiSlashApply: 'Apply',
      previewAiSlashGenerateTitle: 'Generate editable content from the current slash instruction',
      previewAiSlashGenerating: 'Generating with AI',
      previewAiSlashChanged: 'The instruction changed. Type the slash instruction again.',
      previewAiSlashPending: (instruction: string) => `Press Enter to generate with AI: "${instruction}"`,
      previewAiSlashStop: 'Stop',
      previewAiSlashCancel: 'Cancel',
      previewAiSlashCancelled: 'AI generation cancelled',
      previewAiSlashInserted: 'Applied AI generated content',
      searchPlaceholder: 'Search source',
      searchPrevious: 'Previous match',
      searchNext: 'Next match',
      searchClear: 'Clear search',
      searchNoMatches: 'No matches',
      searchMatchStatus: (current: number, total: number) => `${current.toLocaleString('en-US')} / ${total.toLocaleString('en-US')}`,
      copyJson: 'Copy JSON',
      copyRichText: 'Copy rich text',
      copyMenu: 'Copy',
      copyToWechat: 'Copy to rich editor',
      copyToWechatCopied: 'Copied to rich editor',
      copyJsonCopied: 'Copied JSON',
      copied: 'Copied',
      copySource: 'Copy',
      copySourceOption: 'Source',
      copyImage: 'Copy image',
      copyImageOption: 'Image',
      copyImagePro: 'Copy HD image',
      copySvgOption: 'SVG',
      copySvgCopied: 'SVG source copied',
      copySvgFailed: 'Failed to copy SVG',
      copyMermaidImages: (count: number) => `Copy ${count} Mermaid image${count === 1 ? '' : 's'}`,
      generating: 'Generating...',
      imageCopied: 'Image copied',
      imagePagesZipReady: 'Paginated image ZIP generated',
      pasteToConfirm: 'Paste to confirm',
      copyFailed: 'Copy failed',
      generatingImage: 'Generating image...',
      generatingScreenshot: 'Generating screenshot...',
      copyingImage: 'Writing to clipboard...',
      mermaidImagesCopied: (count: number) => `Copied ${count} Mermaid image${count === 1 ? '' : 's'} as rich HTML`,
      mermaidImagesUnavailable: 'Mermaid images were written to the clipboard, but this browser cannot verify the result. Paste to confirm.',
      mermaidImagesMismatch: 'Copied Mermaid images as rich HTML. Some chat apps may not support multi-image rich paste; prefer a document editor.',
      copyMermaidImagesFailed: 'Failed to copy Mermaid images',
      copyMixedScreenshotFailed: 'Failed to copy mixed preview screenshot',
      copyMarkdownScreenshotFailed: 'Failed to copy Markdown preview screenshot',
      copyHtmlScreenshotFailed: 'Failed to copy HTML preview screenshot',
      mobileImageCopyFallbackTitle: 'Image generated',
      mobileImageCopyFallbackDescription: 'This browser did not allow clipboard image writes. The image is ready; open it in a new window.',
      mobileImageCopyFallbackTooLarge: 'Image generated, but it is too large to deliver. Use PDF or compress the content and try again.',
      mobileImageDownloadLabel: 'Download PNG',
      mobileImageShareOpened: 'System share opened. Save or send the image from the share sheet.',
      mobileDeliveryReadyTitle: 'File ready',
      mobileDeliveryLeavingHint: 'A new window will open for the file. The full image, PDF, or HTML will not be shown on this page.',
      mobileDeliveryCancel: 'Cancel',
      mobileDeliveryOpenImage: 'Open image',
      mobileDeliveryOpenPdf: 'Open',
      mobileDeliveryOpenHtml: 'Open',
      mobileDeliveryPopupBlocked: 'The browser blocked the new window. Allow popups and try again.',
      mobileHtmlReadyTitle: 'HTML generated',
      mobileHtmlReadyDescription: 'Tap the button below to open or save the HTML. A new window will open for the file.',
      closeImagePreview: 'Close image preview',
      previewNotReady: 'Preview is not ready',
      htmlPreviewNotReady: 'HTML preview is not ready',
      noMermaidReady: 'No Mermaid diagrams are ready to copy',
      mermaidTimeout: (pending: number, seconds: number) =>
        `Mermaid render timeout: ${pending} diagram(s) still pending after ${seconds}s`,
      fix: 'Fix',
      aiFix: 'AI Fix',
      aiFixing: 'AI Fixing...',
      aiFixFailed: 'AI Fix failed',
      cancelFix: 'Cancel',
      undoFix: 'Undo',
      fixApplied: 'Fixed',
      closeFixToast: 'Close repair notice',
      fixReviewTitle: 'Repair candidate',
      fixReviewDescription: (count: number) => `Not applied yet. Apply ${count.toLocaleString('en-US')} fix${count === 1 ? '' : 'es'} after review.`,
      syntaxError: 'Syntax error',
      codeBlockLabel: 'Code',
      codeLines: (count: number) => `${count.toLocaleString('en-US')} line${count === 1 ? '' : 's'}`,
      errorLine: (line: number) => `line ${line.toLocaleString('en-US')}`,
      jumpToErrorLine: (line: number) => `Jump to line ${line.toLocaleString('en-US')}`,
      sourceErrorLine: (line: number) => `Source line ${line.toLocaleString('en-US')}`,
      jumpToSourceErrorLine: (line: number) => `Jump to source line ${line.toLocaleString('en-US')}`,
      artifactErrorEditableHint: 'Edit the original source above. The preview will recover after the syntax is fixed.',
      artifactErrorReadOnlyHint: 'Click the source line to edit in Source. The preview will recover after the syntax is fixed.',
      artifactErrorSourceLabel: (language: string) => `Original (${language || 'code'})`,
      invalidJson: 'Invalid JSON',
      jsonParseError: 'JSON Parse Error:',
      htmlPreview: 'HTML Preview',
      htmlPreviewRichCopyFallback: 'This HTML preview contains a full page, scripts, or external styles, so it is not suitable for direct rich-text copy. Share an image or HTML instead.',
      documentSpec: 'DocumentSpec',
      documentSpecPreview: 'Expression document preview',
      documentSpecInvalid: 'Invalid DocumentSpec',
      morndraftComponent: 'MornDraft',
      morndraftComponentPreview: 'Expression component preview',
      morndraftComponentInvalid: 'Invalid MornDraft component',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      resetZoom: 'Reset zoom',
      downloadSvg: 'Download SVG',
      downloadPng: 'Download PNG',
      openPreview: 'Preview',
      openPreviewFailed: 'Preview failed to open',
      exportHtmlFile: 'Export HTML file',
      exportMenu: 'Export',
      exportHtml: 'Export HTML',
      exportPdf: 'Export PDF',
      mobilePdfReadyTitle: 'PDF generated',
      mobilePdfReadyDescription: 'Tap the button below to open or save the PDF. A new window will open for the file.',
      mobilePdfOpenLabel: 'Open / download PDF',
      closePdfPreview: 'Close PDF handoff',
      exported: 'Exported',
      exportPdfCaptureFailed: 'Failed to export PDF: screenshot capture failed or preview is not ready',
      exportPdfFailed: 'Failed to export PDF',
      rendering: 'Rendering...',
      renderingMermaid: (ready: number, total: number) => `Rendering Mermaid ${ready}/${total}`,
      openMermaidLightbox: 'Open large Mermaid diagram',
      closeMermaidLightbox: 'Close large Mermaid diagram',
      empty: 'Enter Markdown, HTML, JSON, or Mermaid syntax...',
      generatingPreview: 'Generating preview...',
      editHtml: 'Edit HTML',
      finishEditing: 'Finish Editing',
      editMermaidLabels: 'Edit',
      mermaidEditTitle: 'Edit Mermaid Labels',
      cancelEditing: 'Cancel',
      mermaidNoLabels: 'This diagram has no safely editable labels',
      mermaidEditUnavailable: 'This Mermaid diagram type is not editable yet',
      mermaidValidationFailed: 'Mermaid syntax validation failed; edits are preserved',
      mermaidReadOnlyLabel: 'Read-only',
      mermaidEditorNodeTab: 'Nodes',
      mermaidEditorEdgeTab: 'Edges',
      mermaidEditorAllTab: 'All',
      mermaidEditorSearchPlaceholder: 'Search labels',
      mermaidEditorChecked: 'Checked',
      mermaidEditorPending: 'Unsaved',
      mermaidEditorChecking: 'Checking',
      mermaidEditorNoMatches: 'No matching labels',
      mermaidEditorEditableCount: (count: number) => `${count} editable labels`,
      nodeLabels: 'Node Labels',
      edgeLabels: 'Edge Labels',
      participantLabels: 'Participants',
      messageLabels: 'Messages',
    },
    about: {
      title: 'About MornDraft',
      close: 'Close',
      problemTitle: '',
      problems: [
        'MornDraft is a delivery editor for agent artifacts, sitting after agents generate and before humans deliver.',
        'Bring Markdown, Mermaid, JSON, HTML, and mixed content into one place to preview, review, copy, and export.',
        'It does not replace your IDE or agent; it adds the visual check and lightweight delivery step before handoff.',
      ],
      coffeeTitle: 'Sponsor',
      followTitle: 'Follow',
      rewardAlt: 'Reward QR code',
      qrcodeAlt: 'WeChat public account QR code',
      support: 'If this tool helps you, you can support continued MornDraft iteration.',
      confirm: 'Got it',
    },
  },
} as const;

export type ArtifactDeskTranslations = (typeof TRANSLATIONS)[Locale];
export type EditorTranslations = ArtifactDeskTranslations['editor'];
export type ArtifactPreviewTranslations = ArtifactDeskTranslations['preview'];
export type AboutTranslations = ArtifactDeskTranslations['about'];
export type DraftTranslations = ArtifactDeskTranslations['drafts'];
