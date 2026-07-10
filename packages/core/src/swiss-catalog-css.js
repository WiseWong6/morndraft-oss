// Generated from the Swiss Editorial component catalog snapshot
// Source of truth: Swiss Editorial component catalog COMPONENT_CSS.

export const SWISS_CATALOG_COMPONENT_CSS = `/* Swiss Card 样式 - Adapted for square iframe preview */
.swiss-card {
    width: 600px;
    min-height: 600px;
    border-radius: 0 !important;
    overflow: hidden;
    position: relative;
    font-family: 'Noto Sans SC', 'Noto Serif SC', -apple-system, sans-serif;
    flex-shrink: 0;
}

.swiss-card--cover {
    background: #f2efe9;
    color: #1a1a1a;
}

.swiss-card--body {
    background: #ffffff;
    color: #1a1a1a;
}

.swiss-card__content {
    padding: 60px;
    min-height: 600px;
    display: flex;
    flex-direction: column;
}

.swiss-card--cover .swiss-card__content {
    justify-content: center;
}

/* 标题 - 封面 */
.swiss-card h1 {
    font-family: 'Noto Serif SC', 'Songti SC', 'SimSun', serif !important;
    font-size: 52px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.02em;
    margin-bottom: 24px;
    color: #1a1a1a;
}

/* H2 - 章节标题，带底部边框 */
.swiss-card h2 {
    font-family: 'Noto Sans SC', -apple-system, sans-serif !important;
    font-size: 34px;
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 20px;
    padding-bottom: 12px;
    border-bottom: 3px solid #d95e00;
    color: #d95e00;
}

/* H3 */
.swiss-card h3 {
    font-family: 'Noto Sans SC', -apple-system, sans-serif !important;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.3;
    margin-bottom: 16px;
    color: #d95e00;
}

/* H4 */
.swiss-card h4 {
    font-family: 'Noto Sans SC', -apple-system, sans-serif !important;
    font-size: 22px;
    font-weight: 700;
    line-height: 1.4;
    margin-bottom: 14px;
    color: #d95e00;
}

/* H5 */
.swiss-card h5 {
    font-family: 'Noto Sans SC', -apple-system, sans-serif !important;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.4;
    margin-bottom: 12px;
    color: #d95e00;
}

/* H6 */
.swiss-card h6 {
    font-family: 'Noto Sans SC', -apple-system, sans-serif !important;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.4;
    margin-bottom: 10px;
    color: #d95e00;
}

/* 正文 */
.swiss-card p {
    font-size: 17px;
    font-weight: 300;
    line-height: 1.8;
    margin-bottom: 16px;
    text-align: justify;
    color: #1a1a1a;
}

/* 加粗 */
.swiss-card strong {
    font-weight: 700;
    color: #d95e00;
}

/* 强调 */
.swiss-card em {
    font-style: italic;
    color: #d95e00;
}

/* 引用 */
.swiss-card blockquote {
    margin: 32px 0;
    padding: 0 0 0 24px;
    border-left: 3px solid #d95e00;
    font-size: 16px;
    font-weight: 400;
    line-height: 1.8;
    color: #444;
    letter-spacing: 0.02em;
}

.swiss-card blockquote p {
    margin-bottom: 12px;
    text-align: left;
}

.swiss-card blockquote p:last-child {
    margin-bottom: 0;
}

/* 代码块 - macOS 窗口风格 */
.swiss-card .code-block {
    background: #1a1a2e;
    border-radius: 12px;
    overflow: hidden;
    margin: 24px 0;
}

.swiss-card .code-header {
    background: #2b2b43;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    display: flex;
    align-items: center;
}

.swiss-card .code-dots {
    display: flex;
    gap: 6px;
}

.swiss-card .code-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
}

.swiss-card .code-dot.red { background: #ff5f56; }
.swiss-card .code-dot.yellow { background: #ffbd2e; }
.swiss-card .code-dot.green { background: #27c93f; }

.swiss-card .code-lang {
    margin-left: auto;
    font-size: 12px;
    color: #a9afc5;
    font-family: 'Noto Sans SC', sans-serif;
}

.swiss-card pre {
    background: #1a1a2e;
    color: #e4e4e7;
    padding: 16px 20px;
    margin: 0;
    font-family: 'SF Mono', 'JetBrains Mono', Monaco, monospace;
    font-size: 14px;
    line-height: 1.7;
    overflow-x: auto;
    border-radius: 0 0 12px 12px;
}

.swiss-card code {
    font-family: 'SF Mono', 'JetBrains Mono', Monaco, monospace;
}

.swiss-card pre code {
    background: none;
    padding: 0;
}

.swiss-card p code {
    background: rgba(217, 94, 0, 0.1);
    color: #d95e00;
    padding: 3px 10px;
    font-size: 15px;
    border-radius: 4px;
}

/* 链接 */
.swiss-card a {
    color: #d95e00;
    text-decoration: none;
    border-bottom: 1px solid #d95e00;
}

/* 列表 */
.swiss-card ul, .swiss-card ol {
    margin: 24px 0;
    padding-left: 32px;
}

.swiss-card li {
    font-size: 17px;
    font-weight: 300;
    line-height: 1.8;
    margin-bottom: 8px;
}

.swiss-card ul li::marker {
    color: #d95e00;
}

/* 分割线 */
.swiss-card hr {
    border: none;
    height: 2px;
    background: #d95e00;
    margin: 36px 0;
    width: 80px;
    margin-left: 0;
}

/* 图片 */
.swiss-card img {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 24px auto;
}

/* 表格 */
.swiss-card table {
    width: 100%;
    border-collapse: collapse;
    margin: 24px 0;
    font-size: 15px;
}

.swiss-card th, .swiss-card td {
    padding: 14px 18px;
    text-align: left;
    border-bottom: 1px solid rgba(26, 26, 26, 0.1);
}

.swiss-card th {
    font-weight: 700;
    color: #d95e00;
    background: rgba(217, 94, 0, 0.05);
}

/* 极简表格样式 - 可通过 table.alt 类使用 */
.swiss-card table.alt {
    border-top: 2px solid #1a1a1a;
    border-bottom: 2px solid #1a1a1a;
}

.swiss-card table.alt th {
    color: #1a1a1a;
    background: none;
    border-bottom: 1px solid #1a1a1a;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    font-size: 13px;
}

.swiss-card table.alt td {
    border-bottom: 1px solid rgba(26, 26, 26, 0.08);
}

.swiss-card table.alt tr:last-child td {
    border-bottom: none;
}

/* 封面元信息 */
.cover-meta {
    font-size: 14px;
    font-weight: 300;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #d95e00;
    margin-top: auto;
}

.cover-date {
    font-size: 13px;
    color: #666;
    margin-top: 16px;
}

/* 分隔提示 */
.divider-hint {
    text-align: center;
    color: #444;
    font-size: 12px;
    padding: 8px;
}

/* ===== PPT 布局样式 ===== */
.swiss-card .layout-grid {
    display: grid;
    gap: 20px;
    margin: 20px 0;
}

/* 2列布局 */
.swiss-card .two-col {
    grid-template-columns: 1fr 1fr;
    gap: 24px;
}

/* 3列布局 */
.swiss-card .three-col {
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
}

.swiss-card .card-grid {
    display: grid;
    gap: 18px;
    margin: 16px 0;
}

.swiss-card .card-grid--two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.swiss-card .card-grid--three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.swiss-card .card-grid-item {
    min-width: 0;
    overflow-wrap: anywhere;
}

.swiss-card .card-grid-item--plain {
    padding: 18px;
    background: #fff;
    border: 1px solid rgba(26, 26, 26, 0.18);
    border-left: 4px solid #d95e00;
    border-radius: 8px !important;
}

.swiss-card .card-grid-item--plain h4 {
    margin: 0 0 8px;
    font-size: 14px;
    line-height: 1.4;
    color: #1a1a1a;
}

.swiss-card .card-grid-item--plain p {
    margin: 0;
    font-size: 12px;
    line-height: 1.65;
    color: #555;
}

@media (max-width: 420px) {
    .swiss-card .card-grid--two,
    .swiss-card .card-grid--three {
        grid-template-columns: 1fr;
    }
}

/* 左右对比布局 */
.swiss-card .vs-grid {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 16px;
}
.swiss-card .vs-grid .vs-side {
    min-width: 0;
    width: fit-content;
    max-width: 100%;
}
.swiss-card .vs-grid .vs-side--left {
    justify-self: end;
    text-align: right;
}
.swiss-card .vs-grid .vs-side--right {
    justify-self: start;
    text-align: left;
}
.swiss-card .vs-grid .vs-side--left h4,
.swiss-card .vs-grid .vs-side--left p {
    text-align: right;
}
.swiss-card .vs-grid .vs-side--right h4,
.swiss-card .vs-grid .vs-side--right p {
    text-align: left;
}
.swiss-card .vs-grid .vs-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    font-size: 24px;
    color: #d95e00;
    font-weight: 700;
}

/* 流程链 */
.swiss-card .process-chain {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin: 0;
    width: 100%;
}
.swiss-card .process-chain .step {
    flex: 1 1 0;
    min-width: 64px;
    text-align: center;
    padding: 16px 10px;
    background: rgba(217,94,0,0.05);
    border-radius: 8px;
    font-size: 14px;
    line-height: 1.35;
    word-break: keep-all;
    overflow-wrap: normal;
}
.swiss-card .process-chain .arrow {
    flex: 0 0 auto;
    color: #d95e00;
    font-size: 20px;
}
.swiss-card .process-chain[data-density="wrap"] {
    flex-wrap: wrap;
    row-gap: 14px;
}
.swiss-card .process-chain[data-density="wrap"] .step {
    flex: 0 1 calc((100% - 88px) / 4);
    min-width: 112px;
}
.swiss-card .process-chain[data-density="wrap"] .arrow {
    display: none;
}
.swiss-card .process-annotated-stack {
    display: flex;
    flex-direction: column;
    gap: 18px;
    margin: 20px 0;
}
.swiss-card .process-annotated-grid {
    display: grid;
    grid-template-columns: repeat(var(--annotated-count, 4), minmax(0, 1fr));
    column-gap: 10px;
    align-items: stretch;
    overflow: visible;
}
.swiss-card .process-annotated-item {
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 10px;
    min-width: 0;
}
.swiss-card .process-annotated-grid--plain .process-annotated-item:not(:last-child)::after {
    content: '→';
    position: absolute;
    top: 26px;
    right: -10px;
    transform: translate(50%, -50%);
    color: #d95e00;
    font-size: 20px;
    font-weight: 700;
    z-index: 2;
}
.swiss-card .process-annotated-grid .step-node {
    text-align: center;
    padding: 16px 8px;
    background: rgba(217,94,0,0.05);
    font-size: 14px;
    min-height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow-wrap: anywhere;
}
.swiss-card .process-annotated-grid .caption-node {
    align-self: stretch;
    padding: 12px 12px 10px;
    background: #fff;
    border: 0.5px solid #d95e00;
    border-radius: 8px !important;
}
.swiss-card .process-annotated-grid .caption-label {
    display: block;
    margin-bottom: 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #d95e00;
}
.swiss-card .process-annotated-grid .caption-node p {
    margin: 0;
    font-size: 11px;
    line-height: 1.6;
    color: #444;
    overflow-wrap: anywhere;
}
/* 蛇形换行流程：4 / 6 / 8 分别为每行 2 / 3 / 4 个 */
.swiss-card .process-chain[data-type="wrap"] {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas:
        "s1 s2"
        "s4 s3";
    gap: 24px 32px;
    position: relative;
    padding: 10px 20px;
    overflow: visible;
}
.swiss-card .process-chain[data-type="wrap"][data-count="4"] {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas:
        "s1 s2"
        "s4 s3";
}
.swiss-card .process-chain[data-type="wrap"][data-count="6"] {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-areas:
        "s1 s2 s3"
        "s6 s5 s4";
}
.swiss-card .process-chain[data-type="wrap"][data-count="8"] {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-areas:
        "s1 s2 s3 s4"
        "s8 s7 s6 s5";
}
.swiss-card .process-chain[data-type="wrap"] .step {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px 12px;
    background: rgba(217,94,0,0.08);
    border: 2px solid #d95e00;
    font-size: 13px;
    font-weight: 600;
    text-align: center;
}
.swiss-card .process-chain[data-type="wrap"] .arrow {
    display: none;
}
/* 步骤定位 - 顺时针环绕 */
.swiss-card .process-chain[data-type="wrap"] .step:nth-child(1) { grid-area: s1; }
.swiss-card .process-chain[data-type="wrap"] .step:nth-child(3) { grid-area: s2; }
.swiss-card .process-chain[data-type="wrap"] .step:nth-child(5) { grid-area: s3; }
.swiss-card .process-chain[data-type="wrap"] .step:nth-child(7) { grid-area: s4; }
.swiss-card .process-chain[data-type="wrap"] .step:nth-child(9) { grid-area: s5; }
.swiss-card .process-chain[data-type="wrap"] .step:nth-child(11) { grid-area: s6; }
.swiss-card .process-chain[data-type="wrap"] .step:nth-child(13) { grid-area: s7; }
.swiss-card .process-chain[data-type="wrap"] .step:nth-child(15) { grid-area: s8; }

/* 第一行右箭头 */
.swiss-card .process-chain[data-type="wrap"][data-count="4"] .step:nth-child(1)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="6"] .step:nth-child(1)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="8"] .step:nth-child(1)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="6"] .step:nth-child(3)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="8"] .step:nth-child(3)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="8"] .step:nth-child(5)::after {
    content: '→';
    position: absolute;
    right: -26px;
    top: 50%;
    transform: translateY(-50%);
    color: #d95e00;
    font-size: 16px;
    font-weight: bold;
}
/* 第一行最后一项向下折行 */
.swiss-card .process-chain[data-type="wrap"][data-count="4"] .step:nth-child(3)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="6"] .step:nth-child(5)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="8"] .step:nth-child(7)::after {
    content: '↓';
    position: absolute;
    left: 50%;
    bottom: -26px;
    transform: translateX(-50%);
    color: #d95e00;
    font-size: 16px;
    font-weight: bold;
}
/* 最后一项向上回到起点，沿用折行箭头样式 */
.swiss-card .process-chain[data-type="wrap"][data-count="4"] .step:nth-child(7)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="6"] .step:nth-child(11)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="8"] .step:nth-child(15)::after {
    content: '↑';
    position: absolute;
    left: 50%;
    top: -26px;
    transform: translateX(-50%);
    color: #d95e00;
    font-size: 16px;
    font-weight: bold;
}
/* 第二行左箭头 */
.swiss-card .process-chain[data-type="wrap"][data-count="4"] .step:nth-child(5)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="6"] .step:nth-child(7)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="6"] .step:nth-child(9)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="8"] .step:nth-child(9)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="8"] .step:nth-child(11)::after,
.swiss-card .process-chain[data-type="wrap"][data-count="8"] .step:nth-child(13)::after {
    content: '←';
    position: absolute;
    left: -26px;
    top: 50%;
    transform: translateY(-50%);
    color: #d95e00;
    font-size: 16px;
    font-weight: bold;
    z-index: 2;
}

/* 流程链 - 彩色箭头形状变体 */
.swiss-card .process-chain[data-type="arrow"] {
    display: flex;
    align-items: center;
    gap: 0;
    margin: 20px 0;
    justify-content: center;
    flex-wrap: nowrap;
}
.swiss-card .process-chain[data-type="arrow"] .arrow {
    display: none;
}
.swiss-card .process-chain[data-type="arrow"] .step {
    flex: 1 1 0;
    min-width: 0;
    text-align: center;
    padding: 15px 8px;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    position: relative;
    margin-right: 8px;
    border-radius: 0 !important;
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%);
    white-space: nowrap;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 52px;
    overflow: hidden;
    text-shadow: 0 1px 1px rgba(0,0,0,0.16);
}
.swiss-card .process-chain[data-type="arrow"] .step:first-child {
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%);
    border-radius: 0 !important;
    padding-left: 12px;
}
.swiss-card .process-chain[data-type="arrow"] .step:last-child {
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%);
    margin-right: 0;
    border-radius: 0 !important;
    padding-left: 18px;
    padding-right: 18px;
}
/* 步骤颜色 - 由 renderer 按 item index 循环分配，避免新增项丢色 */
.swiss-card .process-chain[data-type="arrow"] .step.tone-1 { background: rgb(181, 135, 255); }
.swiss-card .process-chain[data-type="arrow"] .step.tone-2 { background: rgb(76, 181, 249); }
.swiss-card .process-chain[data-type="arrow"] .step.tone-3 { background: rgb(83, 184, 219); }
.swiss-card .process-chain[data-type="arrow"] .step.tone-4 { background: rgb(85, 186, 124); }
.swiss-card .process-chain[data-type="arrow"] .step.tone-5 { background: rgb(245, 166, 35); }
.swiss-card .process-chain[data-type="arrow"] .step.tone-6 { background: rgb(219, 82, 92); }
.swiss-card .process-chain[data-type="arrow"] .step.tone-7 { background: rgb(105, 118, 134); }
.swiss-card .process-chain[data-type="arrow"] .step.tone-8 { background: rgb(42, 157, 143); }

/* 5+ 步骤变体 - 缩小字体和 padding 以适应宽度 */
.swiss-card .process-chain[data-type="arrow"]:has(.step:nth-child(9)) .step {
    font-size: 12px;
    padding: 12px 5px;
    min-height: 44px;
}
.swiss-card .process-chain[data-type="arrow"]:has(.step:nth-child(9)) .step:first-child {
    padding-left: 8px;
}
.swiss-card .process-chain[data-type="arrow"]:has(.step:nth-child(9)) .step:last-child {
    padding-left: 12px;
    padding-right: 12px;
}
.swiss-card .process-chain[data-type="arrow"][data-count="6"] .step,
.swiss-card .process-chain[data-type="arrow"][data-count="7"] .step {
    font-size: 12px;
    letter-spacing: 0;
}
.swiss-card .process-chain[data-type="arrow"][data-density="wrap"] {
    flex-wrap: wrap;
    gap: 10px;
}
.swiss-card .process-chain[data-type="arrow"][data-density="wrap"] .step {
    flex: 0 1 calc((100% - 24px) / 3);
    min-width: 140px;
    margin-right: 0;
    clip-path: none;
    border-radius: 8px !important;
    padding: 12px 10px;
}
.swiss-card .process-chain[data-type="arrow"][data-density="wrap"] .step:first-child,
.swiss-card .process-chain[data-type="arrow"][data-density="wrap"] .step:last-child {
    clip-path: none;
    border-radius: 8px !important;
    padding-left: 10px;
    padding-right: 10px;
}
.swiss-card .process-annotated-grid--arrow .step-node {
    margin-right: 0;
    padding: 16px 12px;
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%);
    background: #999;
}
.swiss-card .process-annotated-grid--arrow .step-node.tone-1 { background: rgb(181, 135, 255); }
.swiss-card .process-annotated-grid--arrow .step-node.tone-2 { background: rgb(76, 181, 249); }
.swiss-card .process-annotated-grid--arrow .step-node.tone-3 { background: rgb(83, 184, 219); }
.swiss-card .process-annotated-grid--arrow .step-node.tone-4 { background: rgb(85, 186, 124); }
.swiss-card .process-annotated-grid--arrow .step-node.tone-5 { background: rgb(245, 166, 35); }
.swiss-card .process-annotated-grid--arrow .step-node.tone-6 { background: rgb(219, 82, 92); }

@media (max-width: 420px) {
    .swiss-card .process-annotated-grid {
        grid-template-columns: 1fr;
        row-gap: 12px;
    }
    .swiss-card .process-annotated-grid--plain .process-annotated-item:not(:last-child)::after {
        content: '↓';
        top: auto;
        right: 50%;
        bottom: -18px;
        transform: translate(50%, 50%);
    }
}

/* 循环流程 */
.swiss-card .process-loop {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin: 20px 0;
}
.swiss-card .process-loop .loop-item {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    background: rgba(217,94,0,0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    text-align: center;
    border: 2px solid #d95e00;
}

.swiss-card .process-loop.process-loop-closed .loop-item {
    z-index: 1;
    background: #fff7ec;
    border-color: #d95e00;
    box-shadow: 0 0 0 6px rgba(217,94,0,0.08);
}

.swiss-card .process-loop.process-loop-closed::before {
    display: none;
}

.swiss-card .process-loop .loop-closed-path {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
}

/* 维度矩阵 */
.swiss-card .matrix-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 16px 0;
}
.swiss-card .matrix-grid .cell {
    padding: 16px;
    background: rgba(217,94,0,0.05);
    border-left: 3px solid #d95e00;
}
.swiss-card .matrix-grid .cell h4 {
    font-size: 14px;
    margin-bottom: 8px;
}
.swiss-card .matrix-grid .cell p {
    font-size: 12px;
    margin: 0;
}

/* 时间轴 - 基础样式 */
.swiss-card .timeline {
    position: relative;
    margin: 20px 0;
}

/* 竖版时间轴 - 点线在左，时间和内容在右 */
.swiss-card .timeline[data-type="vertical"] {
    padding-left: 30px;
}
.swiss-card .timeline[data-type="vertical"]::before {
    content: '';
    position: absolute;
    left: 8px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #d95e00;
}
.swiss-card .timeline[data-type="vertical"] .item {
    position: relative;
    padding-bottom: 24px;
    padding-left: 24px;
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 16px;
}
.swiss-card .timeline[data-type="vertical"] .item::before {
    content: '';
    position: absolute;
    left: -26px;
    top: 6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #d95e00;
}
.swiss-card .timeline[data-type="vertical"] .item .year {
    font-size: 12px;
    color: #d95e00;
    font-weight: 600;
    min-width: 70px;
    flex-shrink: 0;
}
.swiss-card .timeline[data-type="vertical"] .item p {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: #1a1a1a;
    flex: 0 0 auto;
    width: 80px;
}
.swiss-card .timeline[data-type="vertical"] .item .desc {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: #666;
    flex: 1;
    font-style: italic;
}

/* 横版时间轴 */
.swiss-card .timeline[data-type="horizontal"] {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    padding-left: 0;
    padding-top: 24px;
}
.swiss-card .timeline[data-type="horizontal"]::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 8px;
    height: 2px;
    background: #d95e00;
}
.swiss-card .timeline[data-type="horizontal"] .item {
    position: relative;
    padding-bottom: 0;
    padding-left: 0;
    text-align: center;
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
}
.swiss-card .timeline[data-type="horizontal"] .item::before {
    content: '';
    position: absolute;
    left: 50%;
    top: -20px;
    transform: translateX(-50%);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #d95e00;
}
.swiss-card .timeline[data-type="horizontal"] .item .year {
    font-size: 11px;
    color: #d95e00;
    font-weight: 600;
    margin-bottom: 4px;
    text-align: center;
    width: 100%;
    overflow-wrap: anywhere;
}
.swiss-card .timeline[data-type="horizontal"] .item p {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    text-align: center;
    width: 100%;
    overflow-wrap: anywhere;
}

/* 同心层 - 圆叠加 */
.swiss-card .concentric {
    position: relative;
    height: 260px;
    margin: 12px 0;
}
.swiss-card .concentric .layer {
    position: absolute;
    left: 50%;
    border-radius: 50%;
    border: 2px solid #d95e00;
    background: rgba(217,94,0,0.05);
    font-size: 12px;
    font-weight: 600;
    color: #d95e00;
    transform: translateX(-50%);
}
/* 圆环尺寸 */
.swiss-card .concentric .layer-1 { width: 100px; height: 100px; z-index: 3; }
.swiss-card .concentric .layer-2 { width: 180px; height: 180px; z-index: 2; }
.swiss-card .concentric .layer-3 { width: 260px; height: 260px; z-index: 1; }

/* 文字基础样式 - 水平居中 */
.swiss-card .concentric .layer-text {
    position: absolute;
    left: 50%;
    transform: translate(-50%, -50%);
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
    color: #d95e00;
}

/* ========== 中心对齐 ========== */
/* 所有圆心重合在容器中心 */
.swiss-card .concentric.align-center .layer { top: 50%; transform: translate(-50%, -50%); }

/* ========== 顶部对齐 ========== */
/* 圆顶对齐 */
.swiss-card .concentric.align-top .layer { top: 0; transform: translateX(-50%); }

/* ========== 底部对齐 ========== */
/* 圆底对齐 - 整体旋转180度，与顶部对齐对应 */
.swiss-card .concentric.align-bottom .layer { bottom: 0; top: auto; transform: translateX(-50%); }

/* ========== 中心对齐 + 文字在圆环下方 ========== */
/* 圆环中心对齐 */
.swiss-card .concentric.align-center-text-bottom .layer { top: 50%; transform: translate(-50%, -50%); }

/* 金字塔 - ECharts 漏斗图风格 (正三角) */
.swiss-card .pyramid {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 32px 0;
    filter: drop-shadow(0 4px 12px rgba(0,0,0,0.08));
}
.swiss-card .pyramid .level {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-weight: 600;
    font-size: 13px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
    letter-spacing: 0.02em;
    transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    cursor: pointer;
    position: relative;
}
.swiss-card .pyramid .level:hover {
    filter: brightness(1.1);
    transform: scale(1.02);
    z-index: 10;
}
/* 正三角金字塔 - 宽度递增：108, 216, 324, 432, 540 (每层增加108px，保持斜率一致) */
.swiss-card .pyramid .level-1 {
    width: 108px;
    height: 72px;
    background: #5470c6;
    clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
    padding-top: 12px;
}
.swiss-card .pyramid .level-2 {
    width: 216px;
    height: 72px;
    background: #91cc75;
    /* 顶部108, 底部216 -> 54/216 = 25% */
    clip-path: polygon(25% 0%, 75% 0%, 100% 100%, 0% 100%);
    margin-top: -1px;
}
.swiss-card .pyramid .level-3 {
    width: 324px;
    height: 72px;
    background: #fac858;
    /* 顶部216, 底部324 -> 54/324 = 16.67% */
    clip-path: polygon(16.67% 0%, 83.33% 0%, 100% 100%, 0% 100%);
    margin-top: -1px;
}
.swiss-card .pyramid .level-4 {
    width: 432px;
    height: 72px;
    background: #ee6666;
    /* 顶部324, 底部432 -> 54/432 = 12.5% */
    clip-path: polygon(12.5% 0%, 87.5% 0%, 100% 100%, 0% 100%);
    margin-top: -1px;
}
.swiss-card .pyramid .level-5 {
    width: 540px;
    height: 72px;
    background: #73c0de;
    /* 顶部432, 底部540 -> 54/540 = 10% */
    clip-path: polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%);
    margin-top: -1px;
}

/* 倒金字塔 (顶层大底层小) - 宽度递减：540, 432, 324, 216, 108 */
.swiss-card .pyramid[data-type="inverted"] .level-1 {
    width: 540px;
    height: 72px;
    background: #5470c6;
    clip-path: polygon(0% 0%, 100% 0%, 90% 100%, 10% 100%);
}
.swiss-card .pyramid[data-type="inverted"] .level-2 {
    width: 432px;
    height: 72px;
    background: #91cc75;
    clip-path: polygon(0% 0%, 100% 0%, 87.5% 100%, 12.5% 100%);
    margin-top: -1px;
}
.swiss-card .pyramid[data-type="inverted"] .level-3 {
    width: 324px;
    height: 72px;
    background: #fac858;
    clip-path: polygon(0% 0%, 100% 0%, 83.33% 100%, 16.67% 100%);
    margin-top: -1px;
}
.swiss-card .pyramid[data-type="inverted"] .level-4 {
    width: 216px;
    height: 72px;
    background: #ee6666;
    clip-path: polygon(0% 0%, 100% 0%, 75% 100%, 25% 100%);
    margin-top: -1px;
}
.swiss-card .pyramid[data-type="inverted"] .level-5 {
    width: 108px;
    height: 72px;
    background: #73c0de;
    clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
    margin-top: -1px;
    padding-bottom: 12px;
}

/* 倒金字塔按可见层数重排，确保增减后外轮廓仍闭合为完整三角形 */
.swiss-card .pyramid[data-type="inverted"][data-count="3"] .level-1 {
    width: 540px;
    clip-path: polygon(0% 0%, 100% 0%, 83.33% 100%, 16.67% 100%);
}
.swiss-card .pyramid[data-type="inverted"][data-count="3"] .level-2 {
    width: 360px;
    clip-path: polygon(0% 0%, 100% 0%, 75% 100%, 25% 100%);
}
.swiss-card .pyramid[data-type="inverted"][data-count="3"] .level-3 {
    width: 180px;
    clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
    padding-bottom: 12px;
}
.swiss-card .pyramid[data-type="inverted"][data-count="4"] .level-1 {
    width: 540px;
    clip-path: polygon(0% 0%, 100% 0%, 87.5% 100%, 12.5% 100%);
}
.swiss-card .pyramid[data-type="inverted"][data-count="4"] .level-2 {
    width: 405px;
    clip-path: polygon(0% 0%, 100% 0%, 83.33% 100%, 16.67% 100%);
}
.swiss-card .pyramid[data-type="inverted"][data-count="4"] .level-3 {
    width: 270px;
    clip-path: polygon(0% 0%, 100% 0%, 75% 100%, 25% 100%);
}
.swiss-card .pyramid[data-type="inverted"][data-count="4"] .level-4 {
    width: 135px;
    clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
    padding-bottom: 12px;
}
.swiss-card .pyramid[data-type="inverted"][data-count="5"] .level-1 {
    width: 540px;
    clip-path: polygon(0% 0%, 100% 0%, 90% 100%, 10% 100%);
}
.swiss-card .pyramid[data-type="inverted"][data-count="5"] .level-2 {
    width: 432px;
    clip-path: polygon(0% 0%, 100% 0%, 87.5% 100%, 12.5% 100%);
}
.swiss-card .pyramid[data-type="inverted"][data-count="5"] .level-3 {
    width: 324px;
    clip-path: polygon(0% 0%, 100% 0%, 83.33% 100%, 16.67% 100%);
}
.swiss-card .pyramid[data-type="inverted"][data-count="5"] .level-4 {
    width: 216px;
    clip-path: polygon(0% 0%, 100% 0%, 75% 100%, 25% 100%);
}
.swiss-card .pyramid[data-type="inverted"][data-count="5"] .level-5 {
    width: 108px;
    clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
    padding-bottom: 12px;
}
/* 鱼骨图 - 简约瑞士风格 */
/* 鱼骨图 - 经典鱼骨结构 */
.swiss-card .fishbone {
    margin: 40px 0;
    position: relative;
    padding: 60px 20px 20px;
    min-height: 200px;
}
/* 鱼头 - 问题结果 */
.swiss-card .fishbone .head {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    padding: 16px 24px;
    background: #d95e00;
    color: #fff;
    font-weight: 600;
    font-size: 14px;
    border-radius: 0 8px 8px 0;
    z-index: 10;
}
/* 主骨 - 水平主线 */
.swiss-card .fishbone .spine {
    position: absolute;
    left: 0;
    right: 80px;
    top: 50%;
    height: 3px;
    background: #d95e00;
    transform: translateY(-50%);
}
/* 上分支容器 */
.swiss-card .fishbone .ribs-top {
    position: absolute;
    left: 40px;
    right: 100px;
    top: 0;
    height: 50%;
    display: flex;
    justify-content: space-around;
    align-items: flex-start;
}
/* 下分支容器 */
.swiss-card .fishbone .ribs-bottom {
    position: absolute;
    left: 40px;
    right: 100px;
    bottom: 0;
    height: 50%;
    display: flex;
    justify-content: space-around;
    align-items: flex-end;
}
/* 肋骨 - 斜线 */
.swiss-card .fishbone .rib {
    position: relative;
    font-size: 11px;
    color: #1a1a1a;
    padding: 6px 10px;
    background: rgba(217,94,0,0.08);
    border-left: 2px solid #d95e00;
    line-height: 1.3;
    white-space: nowrap;
}
/* 上肋骨 - 斜向下 */
.swiss-card .fishbone .ribs-top .rib {
    transform-origin: bottom left;
    margin-top: 20px;
}
.swiss-card .fishbone .ribs-top .rib::before {
    content: '';
    position: absolute;
    left: -2px;
    bottom: -30px;
    width: 2px;
    height: 35px;
    background: #d95e00;
    transform: rotate(-35deg);
    transform-origin: top;
}
/* 下肋骨 - 斜向上 */
.swiss-card .fishbone .ribs-bottom .rib {
    transform-origin: top left;
    margin-bottom: 20px;
}
.swiss-card .fishbone .ribs-bottom .rib::before {
    content: '';
    position: absolute;
    left: -2px;
    top: -30px;
    width: 2px;
    height: 35px;
    background: #d95e00;
    transform: rotate(35deg);
    transform-origin: bottom;
}

/* 冰山 - 单体冰山 + 外围标注 */
.swiss-card .iceberg {
    --iceberg-line: rgba(217, 94, 0, 0.64);
    --iceberg-top: #75c0df;
    --iceberg-top-facet: #4aa9cd;
    --iceberg-bottom: #547da5;
    --iceberg-bottom-facet: #3b658e;
    display: grid;
    grid-template-columns: minmax(150px, 1fr) minmax(240px, 320px) minmax(150px, 1fr);
    grid-template-rows: minmax(420px, auto);
    align-items: center;
    column-gap: 12px;
    min-height: 460px;
    margin: 12px 0;
}
.swiss-card .iceberg__callout {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: min(180px, 100%);
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid rgba(217, 94, 0, 0.34);
    border-radius: 8px !important;
    text-align: center;
    z-index: 3;
}
.swiss-card .iceberg__callout::before {
    content: '';
    position: absolute;
    top: 50%;
    width: 8px;
    height: 8px;
    background: #d95e00;
    border-radius: 50%;
    transform: translateY(-50%);
}
.swiss-card .iceberg__callout::after {
    content: '';
    position: absolute;
    top: 50%;
    width: 34px;
    height: 1.5px;
    background: linear-gradient(90deg, rgba(217,94,0,0.72), rgba(217,94,0,0));
    transform: translateY(-50%);
}
.swiss-card .iceberg__callout strong {
    display: block;
    font-size: 12px;
    line-height: 1.1;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #d95e00;
}
.swiss-card .iceberg__callout span {
    display: block;
    font-size: 13px;
    line-height: 1.7;
    color: #303030;
    white-space: normal;
    overflow-wrap: anywhere;
}
.swiss-card .iceberg__callout--surface {
    grid-column: 1;
    grid-row: 1;
    justify-self: end;
    align-self: start;
    margin-top: 72px;
}
.swiss-card .iceberg__callout--surface::before {
    right: -4px;
}
.swiss-card .iceberg__callout--surface::after {
    left: 100%;
}
.swiss-card .iceberg__callout--depth {
    grid-column: 3;
    grid-row: 1;
    justify-self: start;
    align-self: end;
    margin-bottom: 72px;
}
.swiss-card .iceberg__callout--depth::before {
    left: -4px;
}
.swiss-card .iceberg__callout--depth::after {
    right: 100%;
    background: linear-gradient(90deg, rgba(217,94,0,0), rgba(217,94,0,0.72));
}
.swiss-card .iceberg__visual {
    grid-column: 2;
    grid-row: 1;
    width: min(320px, 100%);
    min-height: 340px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
}
.swiss-card .iceberg__stage {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
}
.swiss-card .iceberg__stage::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 8%;
    width: 186px;
    height: 28px;
    transform: translateX(-50%);
    background: radial-gradient(circle, rgba(36, 67, 101, 0.22), rgba(36, 67, 101, 0));
    pointer-events: none;
}
.swiss-card .iceberg__waterline {
    position: absolute;
    left: -12%;
    right: -12%;
    top: 41.43%;
    height: 2px;
    background: linear-gradient(90deg, rgba(84,125,165,0), rgba(84,125,165,0.95) 18%, rgba(84,125,165,0.95) 82%, rgba(84,125,165,0));
    z-index: 2;
}
.swiss-card .iceberg__waterline::before,
.swiss-card .iceberg__waterline::after {
    content: '';
    position: absolute;
    top: -1px;
    width: 38px;
    height: 4px;
    background: rgba(217, 94, 0, 0.42);
}
.swiss-card .iceberg__waterline::before { left: 14%; }
.swiss-card .iceberg__waterline::after { right: 14%; }
.swiss-card .iceberg__art {
    width: 100%;
    height: auto;
    position: relative;
    z-index: 1;
}
.swiss-card .iceberg__shadow {
    fill: rgba(41, 66, 95, 0.10);
}
.swiss-card .iceberg__mass--top {
    fill: var(--iceberg-top);
}
.swiss-card .iceberg__facet--top {
    fill: var(--iceberg-top-facet);
}
.swiss-card .iceberg__mass--bottom {
    fill: var(--iceberg-bottom);
}
.swiss-card .iceberg__facet--bottom {
    fill: var(--iceberg-bottom-facet);
}
.swiss-card .iceberg__edge {
    fill: none;
    stroke: rgba(255, 255, 255, 0.55);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
}
@media (max-width: 420px) {
    .swiss-card .iceberg {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto auto;
        justify-items: center;
        gap: 0;
        min-height: auto;
    }
    .swiss-card .iceberg__callout {
        width: min(340px, 100%);
    }
    .swiss-card .iceberg__callout::before {
        left: 50%;
        transform: translateX(-50%);
    }
    .swiss-card .iceberg__callout::after {
        left: 50%;
        width: 1.5px;
        transform: translateX(-50%);
        background: linear-gradient(180deg, rgba(217,94,0,0.72), rgba(217,94,0,0));
    }
    .swiss-card .iceberg__callout--surface {
        grid-column: 1;
        grid-row: 1;
        justify-self: center;
        align-self: auto;
        margin-top: 0;
        margin-bottom: -12px;
    }
    .swiss-card .iceberg__callout--surface::before {
        right: auto;
        bottom: -4px;
    }
    .swiss-card .iceberg__callout--surface::after {
        top: 100%;
        height: 38px;
    }
    .swiss-card .iceberg__callout--depth {
        grid-column: 1;
        grid-row: 3;
        justify-self: center;
        align-self: auto;
        margin-top: -18px;
        margin-bottom: 0;
    }
    .swiss-card .iceberg__callout--depth::before {
        left: auto;
        top: -4px;
    }
    .swiss-card .iceberg__callout--depth::after {
        right: auto;
        bottom: 100%;
        height: 46px;
        background: linear-gradient(180deg, rgba(217,94,0,0), rgba(217,94,0,0.72));
    }
    .swiss-card .iceberg__visual {
        grid-column: 1;
        grid-row: 2;
        min-height: 300px;
    }
    .swiss-card .iceberg__waterline {
        left: -6%;
        right: -6%;
    }
}

/* 旅程 - 客户购买旅程风格 */
.swiss-card .journey {
    margin: 28px 0;
    position: relative;
}

.swiss-card .journey .path {
    width: 100%;
}

.swiss-card .journey .journey-svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
}

.swiss-card .journey .journey-track {
    fill: none;
    stroke: rgba(217, 94, 0, 0.48);
    stroke-width: 3;
    stroke-dasharray: 8 4;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.swiss-card .journey .journey-ring {
    fill: none;
    stroke: #d95e00;
    stroke-width: 2;
}

.swiss-card .journey .journey-core {
    fill: #d95e00;
    stroke: #fff;
    stroke-width: 3;
}

.swiss-card .journey .journey-point--milestone {
    filter: url(#journeyMilestoneShadow);
}

.swiss-card .journey .journey-point--milestone .journey-core {
    fill: #fff;
    stroke: #d95e00;
    stroke-width: 4;
}

.swiss-card .journey .journey-label {
    fill: #1a1a1a;
    font-size: 20px;
    font-weight: 500;
    text-anchor: middle;
}

.swiss-card .journey .journey-badge-bg {
    fill: rgba(217, 94, 0, 0.12);
}

.swiss-card .journey .journey-badge-text {
    fill: #d95e00;
    font-size: 16px;
    font-weight: 700;
    text-anchor: middle;
}

/* 维恩图 - 逻辑关联风格 */
.swiss-card .venn {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 300px;
    position: relative;
}
.swiss-card .venn .v-circle {
    width: 180px;
    height: 180px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    border: 2px solid #d95e00;
    opacity: 0.8;
    font-weight: 700;
    font-size: 18px;
}
.swiss-card .venn .v-a {
    background: rgba(217,94,0,0.1);
    left: calc(50% - 90px - 40px);
    top: 50%;
    transform: translateY(-50%);
}
.swiss-card .venn .v-b {
    background: rgba(0,0,0,0.1);
    left: calc(50% - 90px + 40px);
    border-color: #1a1a1a;
    top: 50%;
    transform: translateY(-50%);
}

/* 三圆维恩图 */
.swiss-card .venn-three {
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 40px 0;
    position: relative;
    height: 240px;
}
.swiss-card .venn-three .circle {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    position: absolute;
    border: 2px solid;
    opacity: 0.85;
    mix-blend-mode: multiply;
}
.swiss-card .venn-three .circle-a {
    background: rgba(217,94,0,0.18);
    border-color: #d95e00;
    color: #d95e00;
    top: 5px;
    left: calc(50% - 60px);
}
.swiss-card .venn-three .circle-b {
    background: rgba(0,0,0,0.12);
    border-color: #1a1a1a;
    color: #1a1a1a;
    top: 87px;
    left: calc(50% - 108px);
}
.swiss-card .venn-three .circle-c {
    background: rgba(100,100,100,0.18);
    border-color: #666;
    color: #666;
    top: 87px;
    left: calc(50% - 12px);
}

/* 思维导图 - SVG 覆盖层绘线 */
.swiss-card .mind-map {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 0;
    position: relative;
    transform: scale(0.8);
    transform-origin: center top;
}
.swiss-card .mind-map .mind-map-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
    z-index: 1;
}
.swiss-card .mind-map .mind-map-line {
    stroke: #d95e00;
    stroke-width: 2;
    fill: none;
    stroke-linecap: square;
    vector-effect: non-scaling-stroke;
}
.swiss-card .mind-map .root-node {
    background: #1a1a1a;
    color: #fff;
    padding: 14px 28px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 16px;
    position: relative;
    z-index: 5;
    box-shadow: 0 10px 20px rgba(0,0,0,0.1);
}
.swiss-card .mind-map .branches {
    display: flex;
    justify-content: center;
    gap: 32px;
    width: 100%;
    margin-top: 50px;
    position: relative;
}
.swiss-card .mind-map .branch {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
}
.swiss-card .mind-map .node {
    background: #fff;
    border: 2px solid #d95e00;
    padding: 10px 16px;
    font-size: 12px;
    font-weight: 600;
    margin-top: 18px;
    min-width: 100px;
    text-align: center;
    position: relative;
    box-shadow: 4px 4px 0 rgba(217,94,0,0.1);
    z-index: 2;
}

/* 竖版思维导图 - 左根右枝，3层结构 */
.swiss-card .mind-map[data-type="vertical"] {
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 80px;
    padding: 40px 30px;
    transform: scale(0.85);
    transform-origin: left center;
}

.swiss-card .mind-map[data-type="vertical"] .root-node {
    flex-shrink: 0;
}

.swiss-card .mind-map[data-type="vertical"] .branches {
    flex-direction: column;
    gap: 20px;
    margin-top: 0;
    align-items: flex-start;
    width: auto;
    position: relative;
}

.swiss-card .mind-map[data-type="vertical"] .branch {
    flex-direction: row;
    align-items: center;
    gap: 50px;
    position: relative;
}

.swiss-card .mind-map[data-type="vertical"] .node {
    margin-top: 0;
    width: 104px;
    min-width: 104px;
    height: 36px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

/* 第3层容器 */
.swiss-card .mind-map[data-type="vertical"] .sub-branches {
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
    padding-left: 40px;
}

.swiss-card .mind-map[data-type="vertical"] .sub-node {
    background: #fff;
    border: 1px solid #d95e00;
    width: 104px;
    min-width: 104px;
    height: 36px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    text-align: center;
    position: relative;
    box-shadow: 2px 2px 0 rgba(217,94,0,0.1);
    z-index: 2;
}

/* 架构图 - 垂直分层 */
.swiss-card .architecture {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 24px 0;
}
.swiss-card .arch-layer {
    background: rgba(26,26,26,0.03);
    border: 2px solid #1a1a1a;
    padding: 16px;
    position: relative;
}
.swiss-card .arch-layer::after {
    content: attr(data-layer);
    position: absolute;
    right: 12px;
    top: -10px;
    background: #1a1a1a;
    color: #fff;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
}
.swiss-card .arch-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 12px;
}
.swiss-card .arch-item {
    background: #fff;
    border: 1px solid #d95e00;
    padding: 12px 8px;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    color: #1a1a1a;
    box-shadow: 2px 2px 0 #d95e00;
}

/* 引用页 - 过渡页大字 */
.swiss-card .quote-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 60px;
    background: #f2efe9;
    position: relative;
    min-height: 400px;
    width: 100%;
}
.swiss-card .quote-page::before {
    content: '"';
    position: absolute;
    top: 20px;
    left: 40px;
    font-family: 'Noto Serif SC', serif;
    font-size: 200px;
    color: rgba(217,94,0,0.08);
    line-height: 1;
}
.swiss-card .quote-page h1 {
    font-size: 36px;
    line-height: 1.4;
    color: #1a1a1a;
    margin-bottom: 32px;
    position: relative;
    z-index: 1;
}
.swiss-card .quote-page .cite {
    font-size: 14px;
    font-weight: 300;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #d95e00;
}

/* 多因素对比表 */
.swiss-card .comparison-table {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
    font-size: 12px;
    border: 2px solid #1a1a1a;
}
.swiss-card .comparison-table th {
    background: #1a1a1a;
    color: #fff;
    padding: 12px;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}
.swiss-card .comparison-table td {
    border-bottom: 1px solid #eee;
    padding: 12px;
}
.swiss-card .comparison-table tr:hover {
    background: rgba(217,94,0,0.03);
}
.swiss-card .comparison-table .score {
    color: #d95e00;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
}

/* SWOT - 2x2 矩阵，Swiss Style 极简设计 */
.swiss-card .swot {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 20px 0;
    position: relative;
}
.swiss-card .swot .cell {
    padding: 24px 20px;
    font-size: 13px;
    background: #fff;
    position: relative;
    min-height: 140px;
}
/* 字母标识 - 大号衬线体 */
.swiss-card .swot .cell::before {
    position: absolute;
    top: 16px;
    right: 20px;
    font-family: 'Noto Serif SC', serif;
    font-size: 48px;
    font-weight: 700;
    line-height: 1;
    opacity: 0.12;
}
.swiss-card .swot .strengths::before { content: 'S'; color: #28a745; }
.swiss-card .swot .weaknesses::before { content: 'W'; color: #dc3545; }
.swiss-card .swot .opportunities::before { content: 'O'; color: #007bff; }
.swiss-card .swot .threats::before { content: 'T'; color: #ffc107; }

/* 优势 - 绿色系 */
.swiss-card .swot .strengths {
    background: #fff;
    border-left: 4px solid #28a745;
}
.swiss-card .swot .strengths h4 {
    color: #28a745;
    font-family: 'Noto Serif SC', serif;
}
/* 劣势 - 红色系 */
.swiss-card .swot .weaknesses {
    background: #fff;
    border-left: 4px solid #dc3545;
}
.swiss-card .swot .weaknesses h4 {
    color: #dc3545;
    font-family: 'Noto Serif SC', serif;
}
/* 机会 - 蓝色系 */
.swiss-card .swot .opportunities {
    background: #fff;
    border-left: 4px solid #007bff;
}
.swiss-card .swot .opportunities h4 {
    color: #007bff;
    font-family: 'Noto Serif SC', serif;
}
/* 威胁 - 橙黄色系 */
.swiss-card .swot .threats {
    background: #fff;
    border-left: 4px solid #ffc107;
}
.swiss-card .swot .threats h4 {
    color: #c9a227;
    font-family: 'Noto Serif SC', serif;
}
/* 标题样式 */
.swiss-card .swot .cell h4 {
    font-size: 14px;
    margin-bottom: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}
.swiss-card .swot .cell p {
    color: #444;
    line-height: 1.6;
    font-size: 13px;
    margin: 0;
}

/* Quadrant Axis - 坐标轴象限版 */
.swiss-card .quadrant-axis {
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 22px 26px;
    min-height: 360px;
    padding: 34px 28px;
    align-content: center;
}
.swiss-card .quadrant-axis::before,
.swiss-card .quadrant-axis::after {
    content: '';
    position: absolute;
    background: #1a1a1a;
    opacity: 0.24;
}
.swiss-card .quadrant-axis::before {
    top: 22px;
    bottom: 22px;
    left: 50%;
    width: 1.5px;
    transform: translateX(-50%);
}
.swiss-card .quadrant-axis::after {
    left: 20px;
    right: 20px;
    top: 50%;
    height: 1.5px;
    transform: translateY(-50%);
}
.swiss-card .quadrant-axis .axis-label {
    position: absolute;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #6f675f;
}
.swiss-card .quadrant-axis .axis-label.top {
    top: 0;
    left: 50%;
    transform: translateX(-50%);
}
.swiss-card .quadrant-axis .axis-label.bottom {
    bottom: 2px;
    left: 50%;
    transform: translateX(-50%);
}
.swiss-card .quadrant-axis .axis-label.left {
    left: 0;
    top: 50%;
    transform: translateY(-50%) rotate(-90deg);
    transform-origin: left center;
}
.swiss-card .quadrant-axis .axis-label.right {
    right: 0;
    top: 50%;
    transform: translateY(-50%) rotate(90deg);
    transform-origin: right center;
}
.swiss-card .quadrant-axis .axis-center {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 54px;
    height: 54px;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1a1a1a;
    color: #fff;
    font-family: 'Oswald', sans-serif;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    z-index: 2;
}
.swiss-card .quadrant-axis .quadrant {
    position: relative;
    z-index: 1;
    background: rgba(255, 255, 255, 0.9);
    padding: 16px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 112px;
}
.swiss-card .quadrant-axis .quadrant .marker {
    font-family: 'Oswald', sans-serif;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
}
.swiss-card .quadrant-axis .quadrant h4 {
    margin: 0;
    font-size: 14px;
    line-height: 1.35;
    font-weight: 700;
    font-family: 'Noto Serif SC', serif;
}
.swiss-card .quadrant-axis .quadrant p {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: #444;
}
.swiss-card .quadrant-axis .q1 { color: #2f7d32; }
.swiss-card .quadrant-axis .q2 { color: #d95e00; }
.swiss-card .quadrant-axis .q3 { color: #7b8794; }
.swiss-card .quadrant-axis .q4 { color: #1a1a1a; }

/* Impossible Triangle - 三点取舍关系 */
.swiss-card .impossible-triangle {
    position: relative;
    width: min(100%, 360px);
    height: 300px;
    margin: 12px auto 4px;
    --impossible-triangle-left-corner-x: 62px;
    --impossible-triangle-right-corner-x: 298px;
    --impossible-triangle-bottom-corner-y: 238px;
    --impossible-triangle-corner-label-gap: 30px;
}
.swiss-card .impossible-triangle-svg {
    position: absolute;
    inset: 20px 20px 30px;
    width: calc(100% - 40px);
    height: calc(100% - 50px);
    overflow: visible;
}
.swiss-card .impossible-triangle-shape {
    fill: none;
    stroke: #d95e00;
    stroke-width: 2;
    stroke-linejoin: round;
    opacity: 1;
}
.swiss-card .impossible-triangle-point {
    position: absolute;
    z-index: 1;
    width: max-content;
    max-width: 104px;
    min-height: 34px;
    padding: 4px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 0;
    color: #1a1a1a;
    font-size: 16px;
    font-weight: 400;
    line-height: 1.3;
    text-align: center;
    overflow-wrap: anywhere;
    box-shadow: none;
}
.swiss-card .impossible-triangle-point-1 {
    top: 0;
    left: 50%;
    transform: translateX(-50%);
}
.swiss-card .impossible-triangle-point-2 {
    top: calc(var(--impossible-triangle-bottom-corner-y) + var(--impossible-triangle-corner-label-gap));
    left: var(--impossible-triangle-left-corner-x);
    justify-content: flex-end;
    text-align: right;
    transform: translate(-100%, -50%);
}
.swiss-card .impossible-triangle-point-3 {
    top: calc(var(--impossible-triangle-bottom-corner-y) + var(--impossible-triangle-corner-label-gap));
    left: var(--impossible-triangle-right-corner-x);
    justify-content: flex-start;
    text-align: left;
    transform: translateY(-50%);
}

/* ===== 引用页 ===== */
.swiss-card .quote {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    padding: 48px 40px;
    position: relative;
    text-align: center;
}

/* 大号装饰引号 */
.swiss-card .quote::before {
    content: '"';
    font-family: 'Noto Serif SC', serif;
    font-size: 120px;
    color: #d95e00;
    opacity: 0.12;
    line-height: 1;
    position: absolute;
    top: 30px;
    left: 30px;
    pointer-events: none;
}

.swiss-card .quote::after {
    content: '"';
    font-family: 'Noto Serif SC', serif;
    font-size: 120px;
    color: #d95e00;
    opacity: 0.12;
    line-height: 1;
    position: absolute;
    bottom: 10px;
    right: 30px;
    pointer-events: none;
    transform: rotate(180deg);
}

/* 装饰分隔线 */
.swiss-card .quote .divider {
    width: 40px;
    height: 2px;
    background: #d95e00;
    margin-bottom: 24px;
}

/* 引用内容 */
.swiss-card .quote blockquote {
    font-family: 'Noto Serif SC', serif;
    font-size: 26px;
    font-weight: 400;
    line-height: 1.7;
    color: #1a1a1a;
    margin: 0 0 32px 0;
    padding: 0;
    border: none;
    position: relative;
    z-index: 1;
}

/* 作者信息 */
.swiss-card .quote .author {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.swiss-card .quote .author-name {
    font-size: 15px;
    font-weight: 600;
    color: #1a1a1a;
    font-style: normal;
}

.swiss-card .quote .author-title {
    font-size: 13px;
    color: #888;
    font-weight: 300;
}

/* 来源标注 */
.swiss-card .quote .source {
    margin-top: 16px;
    font-size: 11px;
    color: #d95e00;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 500;
}

/* 前后对比 */
.swiss-card .before-after {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 16px 0;
}
.swiss-card .before-after .side {
    padding: 20px;
    text-align: left;
    border-radius: 8px;
}
.swiss-card .before-after .before {
    background: rgba(40,167,69,0.1);
    border: 1px solid #28a745;
}
.swiss-card .before-after .after {
    background: rgba(220,53,69,0.1);
    border: 1px solid #dc3545;
}
.swiss-card .before-after .badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 12px;
}
/* Before/After 默认：Before绿色，After红色 */
.swiss-card .before-after .before .badge { background: #28a745; color: #fff; }
.swiss-card .before-after .after .badge { background: #dc3545; color: #fff; }

/* 变体：带箭头的 before-after（现状→目标） */
.swiss-card .before-after.with-arrow {
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
}
.swiss-card .before-after.with-arrow .arrow {
    font-size: 24px;
    color: #d95e00;
    font-weight: 700;
    padding: 0 12px;
}
/* 现状→目标：现状绿色，目标红色 */
.swiss-card .before-after.with-arrow .before .badge { background: #28a745; color: #fff; }
.swiss-card .before-after.with-arrow .after .badge { background: #dc3545; color: #fff; }

/* 无背景色变体 */
.swiss-card .before-after.no-bg .side {
    background: transparent;
    border: 1px solid #ddd;
}
.swiss-card .before-after.no-bg .before {
    border-color: #28a745;
}
.swiss-card .before-after.no-bg .after {
    border-color: #dc3545;
}
.swiss-card .before-after.no-bg .before .badge { background: transparent; color: #28a745; padding: 0; }
.swiss-card .before-after.no-bg .after .badge { background: transparent; color: #dc3545; padding: 0; }

.swiss-card .before-after--verification {
    display: grid;
    gap: 10px;
    margin: 8px 0;
}

.swiss-card .before-after--verification .compare-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr);
    gap: 8px;
    align-items: stretch;
    padding: 0;
}

.swiss-card .before-after--verification .compare-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Oswald', sans-serif;
    font-size: 14px;
    line-height: 1;
    letter-spacing: 0.08em;
    color: rgba(217, 94, 0, 0.58);
    text-align: center;
}

.swiss-card .before-after--verification .compare-side {
    position: relative;
    min-height: 54px;
    padding: 10px 10px 8px;
    display: flex;
    align-items: center;
    font-size: 9px;
    line-height: 1.4;
    overflow-wrap: break-word;
    word-break: normal;
}

.swiss-card .before-after--verification .compare-side--fuzzy {
    background: #e9e4dc;
    border: 1px solid rgba(23, 23, 23, 0.14);
    color: rgba(23, 23, 23, 0.48);
    text-decoration: line-through;
    text-decoration-color: rgba(23, 23, 23, 0.24);
}

.swiss-card .before-after--verification .compare-side--precise {
    background: #fff;
    border: 1.5px solid #1a1a1a;
    box-shadow: 2px 2px 0 rgba(217, 94, 0, 0.92);
    color: #171717;
    font-weight: 700;
}

.swiss-card .before-after--verification .compare-tag {
    position: absolute;
    left: 8px;
    top: -7px;
    padding: 2px 5px;
    font-size: 8px;
    line-height: 1;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
}

.swiss-card .before-after--verification p {
    margin: 0;
}

.swiss-card .before-after--verification .compare-side--fuzzy .compare-tag {
    background: #e9e4dc;
    border: 1px solid rgba(23, 23, 23, 0.16);
    color: rgba(23, 23, 23, 0.42);
}

.swiss-card .before-after--verification .compare-side--precise .compare-tag {
    background: #d95e00;
    color: #fff;
}

/* 甘特图 - 带时间轴 */
.swiss-card .gantt {
    margin: 20px 0;
}
/* 时间轴头部 */
.swiss-card .gantt-header {
    display: flex;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(217,94,0,0.3);
}
.swiss-card .gantt-header .label {
    width: 80px;
    font-size: 11px;
    font-weight: 600;
    color: #666;
}
.swiss-card .gantt-header .timeline {
    flex: 1;
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #666;
}
.swiss-card .gantt-header .timeline span {
    flex: 1;
    text-align: center;
    position: relative;
}
.swiss-card .gantt-header .timeline span::before {
    content: '';
    position: absolute;
    left: 50%;
    bottom: -8px;
    width: 1px;
    height: 4px;
    background: rgba(217,94,0,0.3);
}
/* 任务行 */
.swiss-card .gantt .task {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
}
.swiss-card .gantt .task-name {
    width: 80px;
    font-size: 11px;
    flex-shrink: 0;
    color: #1a1a1a;
}
.swiss-card .gantt .task-bar {
    flex: 1;
    height: 18px;
    background: rgba(217,94,0,0.08);
    position: relative;
}
.swiss-card .gantt .task-bar .fill {
    position: absolute;
    height: 100%;
    background: #d95e00;
}

/* ===== 警告框 ===== */
.swiss-card .alert-box {
    padding: 20px 24px;
    margin: 20px 0;
    border-radius: 0;
    position: relative;
    display: flex;
    gap: 16px;
    align-items: flex-start;
}

/* 左侧彩色边框 */
.swiss-card .alert-box::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
}

/* 图标样式 */
.swiss-card .alert-box .icon {
    font-size: 22px;
    line-height: 1;
    flex-shrink: 0;
    margin-top: 2px;
}

/* 内容区域 */
.swiss-card .alert-box .content {
    flex: 1;
}

.swiss-card .alert-box .content .title {
    font-size: 13px;
    font-weight: 700;
    margin-bottom: 6px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.swiss-card .alert-box .content p {
    font-size: 14px;
    line-height: 1.7;
    margin: 0;
    font-weight: 300;
}

/* 错误/危险 (红色) */
.swiss-card .alert-box.error,
.swiss-card .alert-box.danger {
    background: rgba(220, 53, 69, 0.08);
}
.swiss-card .alert-box.error::before,
.swiss-card .alert-box.danger::before {
    background: #dc3545;
}
.swiss-card .alert-box.error .icon,
.swiss-card .alert-box.danger .icon {
    color: #dc3545;
}
.swiss-card .alert-box.error .content .title,
.swiss-card .alert-box.danger .content .title {
    color: #c82333;
}
.swiss-card .alert-box.error .content p,
.swiss-card .alert-box.danger .content p {
    color: #721c24;
}

/* 警告 (黄色) */
.swiss-card .alert-box.warning {
    background: rgba(255, 193, 7, 0.12);
}
.swiss-card .alert-box.warning::before {
    background: #ffc107;
}
.swiss-card .alert-box.warning .icon {
    color: #e0a800;
}
.swiss-card .alert-box.warning .content .title {
    color: #856404;
}
.swiss-card .alert-box.warning .content p {
    color: #533f03;
}

/* 信息 (蓝色) */
.swiss-card .alert-box.info {
    background: rgba(0, 123, 255, 0.08);
}
.swiss-card .alert-box.info::before {
    background: #007bff;
}
.swiss-card .alert-box.info .icon {
    color: #007bff;
}
.swiss-card .alert-box.info .content .title {
    color: #004085;
}
.swiss-card .alert-box.info .content p {
    color: #0c5460;
}

/* 成功 (绿色) */
.swiss-card .alert-box.success {
    background: rgba(40, 167, 69, 0.08);
}
.swiss-card .alert-box.success::before {
    background: #28a745;
}
.swiss-card .alert-box.success .icon {
    color: #28a745;
}
.swiss-card .alert-box.success .content .title {
    color: #155724;
}
.swiss-card .alert-box.success .content p {
    color: #0b2e13;
}

/* 默认警告 (橙色/主色) */
.swiss-card .alert-box:not(.error):not(.danger):not(.warning):not(.info):not(.success) {
    background: rgba(217, 94, 0, 0.08);
}
.swiss-card .alert-box:not(.error):not(.danger):not(.warning):not(.info):not(.success)::before {
    background: #d95e00;
}
.swiss-card .alert-box:not(.error):not(.danger):not(.warning):not(.info):not(.success) .icon {
    color: #d95e00;
}
.swiss-card .alert-box:not(.error):not(.danger):not(.warning):not(.info):not(.success) .content .title {
    color: #d95e00;
}

/* ===== 术语框 ===== */
.swiss-card .terminal-box {
    background: #fff;
    border: 2px solid #1a1a1a;
    margin: 20px 0;
    overflow: hidden;
}

/* 术语标签头部 */
.swiss-card .terminal-box .term-header {
    background: #1a1a1a;
    padding: 14px 20px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.swiss-card .terminal-box .term-header::before {
    content: '💡';
    font-size: 14px;
}

.swiss-card .terminal-box .term-label {
    font-size: 12px;
    font-weight: 600;
    color: #fff;
}

.swiss-card .terminal-box .term-tag {
    font-size: 12px;
    font-weight: 700;
    color: #d95e00;
    margin-left: 4px;
}

/* 定义区域 */
.swiss-card .terminal-box .term-section {
    padding: 16px 20px;
    border-bottom: 1px solid #e8e8e8;
}

.swiss-card .terminal-box .term-section:last-child {
    border-bottom: none;
}

.swiss-card .terminal-box .section-label {
    font-size: 11px;
    font-weight: 700;
    color: #1a1a1a;
    letter-spacing: 0.05em;
    margin-bottom: 8px;
    display: block;
}

.swiss-card .terminal-box .section-content {
    font-size: 13px;
    line-height: 1.7;
    color: #444;
    margin: 0;
}

/* 用法：场景 → 动作 */
.swiss-card .terminal-box .usage-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #444;
}

.swiss-card .terminal-box .usage-arrow {
    color: #d95e00;
    font-weight: 700;
}

/* 示例列表 */
.swiss-card .terminal-box .example-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.swiss-card .terminal-box .example-list li {
    position: relative;
    padding-left: 16px;
    font-size: 13px;
    line-height: 1.7;
    color: #444;
    margin-bottom: 4px;
}

.swiss-card .terminal-box .example-list li::before {
    content: '•';
    position: absolute;
    left: 0;
    color: #d95e00;
    font-weight: 700;
}

/* ── 标题页卡片（正方形预览适配） ─────────────────── */
.swiss-card--titlecard .title-card {
    display: flex;
    flex-direction: column;
    justify-content: center;
    width: 100%;
    height: 600px;
    padding: 56px;
    box-sizing: border-box;
    position: relative;
    background: #fff;
    overflow: hidden;
}
.swiss-card--titlecard .title-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 6px;
    background: #d95e00;
}
.swiss-card--titlecard .title-card h2 {
    font-family: 'Noto Serif SC', serif;
    font-size: 40px;
    font-weight: 700;
    color: #1a1a1a;
    line-height: 1.2;
    margin: 0 0 16px;
    padding: 0;
    border: none;
    letter-spacing: -0.02em;
}
.swiss-card--titlecard .title-card p {
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 17px;
    font-weight: 300;
    color: #666;
    margin: 0;
    line-height: 1.6;
}

/* ── 非 1:1 封面变体 ─────────────────── */
.swiss-card__content--cover-variant {
    min-height: 600px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
        radial-gradient(circle at top right, rgba(217, 94, 0, 0.09), transparent 34%),
        linear-gradient(180deg, #f7f2ea 0%, #f0ebe3 100%);
}

.cover-variant {
    position: relative;
    overflow: hidden;
    background: #f6f1e8;
    color: #171717;
    border: 1.5px solid rgba(23, 23, 23, 0.88);
}

.cover-variant--34 {
    width: 420px;
    height: 560px;
    padding: 34px 32px 30px;
}

.cover-variant--169 {
    width: 540px;
    height: 304px;
    padding: 28px 30px;
}

.cover-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #d95e00;
}

.cover-chip::before {
    content: '';
    width: 18px;
    height: 2px;
    background: #d95e00;
}

.cover-title-serif {
    font-family: 'Noto Serif SC', serif;
    font-size: 42px;
    line-height: 1.06;
    font-weight: 900;
    letter-spacing: -0.04em;
    margin: 0;
}

.cover-title-sans {
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 34px;
    line-height: 1.08;
    font-weight: 800;
    letter-spacing: -0.03em;
    margin: 0;
}

.cover-deck {
    font-size: 13px;
    line-height: 1.7;
    color: rgba(23, 23, 23, 0.72);
    margin: 0;
}

.cover-meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(23, 23, 23, 0.62);
}

.cover-variant--editorial-34 {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 20px;
}

.cover-variant--editorial-34::after {
    content: '';
    position: absolute;
    left: 32px;
    right: 32px;
    bottom: 92px;
    height: 1px;
    background: rgba(23, 23, 23, 0.16);
}

.cover-variant--editorial-34 .cover-title-serif {
    font-size: 50px;
    max-width: 78%;
}

.cover-variant--editorial-34 .cover-index {
    position: absolute;
    right: 28px;
    top: 26px;
    font-family: 'Oswald', sans-serif;
    font-size: 76px;
    line-height: 1;
    color: rgba(217, 94, 0, 0.16);
}

.cover-variant--signal-34 {
    background: #171717;
    color: #f7f1e8;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 20px;
}

.cover-variant--signal-34 .cover-chip,
.cover-variant--signal-34 .cover-deck,
.cover-variant--signal-34 .cover-meta-row {
    color: rgba(247, 241, 232, 0.8);
}

.cover-variant--signal-34 .cover-chip::before {
    background: #f7f1e8;
}

.cover-variant--signal-34 .cover-band {
    position: absolute;
    left: 0;
    right: 0;
    top: 116px;
    height: 136px;
    background: #d95e00;
}

.cover-variant--signal-34 .cover-title-sans {
    position: relative;
    z-index: 1;
    font-size: 56px;
    line-height: 0.94;
    color: #fff7ef;
    max-width: 72%;
    margin-top: 40px;
}

.cover-variant--signal-34 .cover-foot-grid {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
}

.cover-variant--signal-34 .cover-foot-grid div {
    padding-top: 10px;
    border-top: 1px solid rgba(247, 241, 232, 0.28);
    font-size: 11px;
    line-height: 1.5;
}

.cover-variant--folio-34 {
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 18px;
}

.cover-variant--folio-34 .cover-kicker-block {
    display: inline-flex;
    padding: 8px 10px;
    background: #171717;
    color: #f7f1e8;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
}

.cover-variant--folio-34 .cover-folio-box {
    border: 1.5px solid rgba(23, 23, 23, 0.88);
    padding: 18px;
    background: rgba(255, 255, 255, 0.55);
}

.cover-variant--folio-34 .cover-folio-box h3 {
    margin: 0 0 10px;
    font-size: 16px;
    line-height: 1.4;
    color: #171717;
}

.cover-variant--folio-34 .cover-folio-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
}

.cover-variant--folio-34 .cover-folio-grid span {
    padding: 8px 10px;
    font-size: 11px;
    font-weight: 700;
    background: #ece6dc;
}

.cover-variant--claude-34 {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 24px;
    background:
        radial-gradient(circle at 86% 14%, rgba(217, 94, 0, 0.1), transparent 28%),
        #f2efe9;
}

.cover-variant--claude-34::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.38), rgba(255, 255, 255, 0)),
        repeating-linear-gradient(0deg, rgba(23, 23, 23, 0.02), rgba(23, 23, 23, 0.02) 1px, transparent 1px, transparent 10px);
    pointer-events: none;
}

.cover-variant--claude-34 .cover-topline {
    position: relative;
    z-index: 1;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(23, 23, 23, 0.46);
}

.cover-variant--claude-34 .cover-main {
    position: relative;
    z-index: 1;
    display: grid;
    align-content: center;
    gap: 18px;
}

.cover-variant--claude-34 .cover-title-serif {
    font-size: 58px;
    line-height: 0.98;
    max-width: 100%;
}

.cover-variant--claude-34 .cover-title-serif .accent-text {
    color: #d95e00;
}

.cover-variant--claude-34 .cover-kicker-sans {
    font-family: 'Oswald', sans-serif;
    font-size: 31px;
    line-height: 1.02;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: #171717;
}

.cover-variant--claude-34 .cover-deck-quote {
    max-width: 90%;
    padding-left: 18px;
    border-left: 4px solid #d95e00;
    font-size: 14px;
    line-height: 1.7;
    font-weight: 500;
    color: rgba(23, 23, 23, 0.8);
}

.cover-variant--claude-34 .cover-meta-row {
    position: relative;
    z-index: 1;
    padding-top: 16px;
    border-top: 2px solid rgba(23, 23, 23, 0.92);
    color: rgba(23, 23, 23, 0.58);
}

.cover-variant--claude-34 .cover-meta-row span:first-child {
    font-family: 'Oswald', sans-serif;
    color: #171717;
}

.cover-variant--klein-34 {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 18px;
    background: #f2efe9;
}

.cover-variant--klein-34 .cover-klein-square,
.cover-variant--klein-169 .cover-klein-square {
    width: 30px;
    height: 30px;
    background: #002fa7;
}

.cover-variant--klein-34 .cover-klein-rule,
.cover-variant--klein-169 .cover-klein-rule {
    width: 48px;
    height: 6px;
    background: #002fa7;
}

.cover-variant--klein-34 .cover-klein-header,
.cover-variant--klein-169 .cover-klein-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 2px solid rgba(23, 23, 23, 0.92);
}

.cover-variant--klein-34 .cover-klein-meta,
.cover-variant--klein-169 .cover-klein-meta {
    font-family: 'Oswald', sans-serif;
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
}

.cover-variant--klein-34 .cover-klein-meta--soft,
.cover-variant--klein-169 .cover-klein-meta--soft {
    color: rgba(23, 23, 23, 0.42);
}

.cover-variant--klein-34 .cover-klein-main {
    display: grid;
    align-content: center;
    gap: 18px;
}

.cover-variant--klein-34 .cover-klein-topic,
.cover-variant--klein-169 .cover-klein-topic {
    font-family: 'Oswald', sans-serif;
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #002fa7;
}

.cover-variant--klein-34 .cover-title-serif {
    font-size: 48px;
    line-height: 1.02;
}

.cover-variant--klein-34 .cover-klein-subtitle {
    padding-left: 16px;
    border-left: 4px solid #002fa7;
    font-family: 'Noto Serif SC', serif;
    font-size: 20px;
    line-height: 1.55;
    font-weight: 700;
}

.cover-variant--klein-34 .cover-klein-tags,
.cover-variant--klein-169 .cover-klein-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.cover-variant--klein-34 .cover-klein-tags span,
.cover-variant--klein-169 .cover-klein-tags span {
    padding: 6px 10px;
    font-family: 'Oswald', sans-serif;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
}

.cover-variant--klein-34 .cover-klein-tags span:first-child,
.cover-variant--klein-169 .cover-klein-tags span:first-child {
    background: #002fa7;
    color: #fff;
}

.cover-variant--klein-34 .cover-klein-tags span:not(:first-child),
.cover-variant--klein-169 .cover-klein-tags span:not(:first-child) {
    border: 1px solid #002fa7;
    color: #002fa7;
}

.cover-variant--klein-34 .cover-klein-footer,
.cover-variant--klein-169 .cover-klein-footer {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 16px;
    padding-top: 14px;
    border-top: 2px solid rgba(23, 23, 23, 0.92);
}

.cover-variant--klein-34 .cover-klein-author,
.cover-variant--klein-169 .cover-klein-author {
    font-family: 'Oswald', sans-serif;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #171717;
}

.cover-variant--klein-169 {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 22px;
    background: #f2efe9;
}

.cover-variant--klein-169 .cover-klein-main {
    display: grid;
    grid-template-columns: minmax(0, 1.22fr) 148px;
    gap: 22px;
    align-items: center;
}

.cover-variant--klein-169 .cover-klein-left {
    display: grid;
    gap: 16px;
}

.cover-variant--klein-169 .cover-title-serif {
    font-size: 38px;
    line-height: 1.02;
}

.cover-variant--klein-169 .cover-klein-subtitle {
    padding-left: 18px;
    border-left: 4px solid #002fa7;
    font-family: 'Noto Serif SC', serif;
    font-size: 16px;
    line-height: 1.6;
    font-weight: 700;
}

.cover-variant--klein-169 .cover-klein-side {
    display: grid;
    gap: 14px;
    align-content: center;
}

.cover-variant--klein-169 .cover-klein-side-rule {
    width: 100%;
    height: 1px;
    background: rgba(23, 23, 23, 0.14);
}

.cover-variant--klein-169 .cover-klein-index {
    font-family: 'Oswald', sans-serif;
    font-size: 68px;
    line-height: 0.9;
    color: rgba(0, 47, 167, 0.12);
    letter-spacing: -0.04em;
}

.cover-variant--klein-169 .cover-klein-side-note {
    font-size: 11px;
    line-height: 1.65;
    color: rgba(23, 23, 23, 0.56);
}

.cover-variant--broadcast-169 {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(160px, 0.7fr);
    gap: 20px;
    background:
        linear-gradient(135deg, rgba(217, 94, 0, 0.12) 0%, rgba(217, 94, 0, 0) 36%),
        #f6f1e8;
}

.cover-variant--broadcast-169 .cover-side-note {
    border-left: 1.5px solid rgba(23, 23, 23, 0.16);
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.cover-variant--broadcast-169 .cover-stat {
    font-family: 'Oswald', sans-serif;
    font-size: 42px;
    line-height: 1;
    color: #d95e00;
}

.cover-variant--launch-169 {
    display: grid;
    grid-template-columns: 1.5fr 0.9fr;
    gap: 16px;
    background: #171717;
    color: #f7f1e8;
}

.cover-variant--launch-169::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 14px;
    background: #d95e00;
}

.cover-variant--launch-169 .cover-chip,
.cover-variant--launch-169 .cover-deck,
.cover-variant--launch-169 .cover-meta-row {
    color: rgba(247, 241, 232, 0.82);
}

.cover-variant--launch-169 .cover-chip::before {
    background: #f7f1e8;
}

.cover-variant--launch-169 .cover-right-stack {
    display: grid;
    grid-template-rows: repeat(3, 1fr);
    gap: 10px;
}

.cover-variant--launch-169 .cover-right-stack div {
    border: 1px solid rgba(247, 241, 232, 0.18);
    padding: 10px 12px;
    font-size: 11px;
    line-height: 1.45;
}

.cover-variant--brief-169 {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
    gap: 20px;
}

.cover-variant--brief-169 .cover-brief-left {
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 14px;
}

.cover-variant--brief-169 .cover-brief-right {
    display: grid;
    gap: 10px;
    align-content: start;
}

.cover-variant--brief-169 .cover-note-card {
    padding: 12px;
    background: #fff;
    border: 1px solid rgba(23, 23, 23, 0.16);
}

.cover-variant--brief-169 .cover-note-card strong {
    display: block;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #d95e00;
    margin-bottom: 6px;
}

.cover-variant--brief-169 .cover-note-card span {
    display: block;
    font-size: 12px;
    line-height: 1.55;
    color: rgba(23, 23, 23, 0.78);
}

.cover-variant--report-169 {
    display: grid;
    grid-template-rows: 1fr auto;
    gap: 18px;
    background: #f2efe9;
}

.cover-variant--report-169 .cover-report-main {
    display: grid;
    align-content: center;
    gap: 18px;
    max-width: 86%;
}

.cover-variant--report-169 .cover-report-bar {
    width: 96px;
    height: 8px;
    background: #d95e00;
}

.cover-variant--report-169 .cover-title-serif {
    font-size: 26px;
    line-height: 1.2;
}

.cover-variant--report-169 .cover-title-serif .accent-text {
    display: block;
    margin-top: 4px;
    font-size: 16px;
    line-height: 1.25;
}

.cover-variant--report-169 .cover-report-subtitle {
    font-family: 'Noto Serif SC', serif;
    font-size: 12px;
    line-height: 1.45;
    font-weight: 700;
    color: rgba(23, 23, 23, 0.72);
}

.cover-variant--report-169 .cover-report-footer {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 18px;
    padding-top: 16px;
    border-top: 1px solid rgba(23, 23, 23, 0.12);
}

.cover-variant--report-169 .cover-report-meta {
    font-family: 'Oswald', sans-serif;
    font-size: 5.5px;
    line-height: 1.7;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(23, 23, 23, 0.68);
}

.cover-variant--report-169 .cover-report-quote {
    font-family: 'Noto Serif SC', serif;
    font-size: 9px;
    line-height: 1.5;
    font-style: italic;
    text-align: right;
    color: rgba(23, 23, 23, 0.76);
}

.cover-variant--openclaw-34 {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 22px;
    background: #ffffff;
}

.cover-variant--openclaw-34::before,
.cover-variant--openclaw-34::after {
    content: '';
    position: absolute;
    pointer-events: none;
}

.cover-variant--openclaw-34::before {
    width: 148px;
    height: 148px;
    right: -8px;
    top: 78px;
    border: 3px solid rgba(231, 76, 60, 0.14);
}

.cover-variant--openclaw-34::after {
    width: 66px;
    height: 66px;
    right: 68px;
    bottom: 72px;
    background: rgba(231, 76, 60, 0.08);
    pointer-events: none;
}

.cover-variant--openclaw-34 .cover-openclaw-topline {
    height: 8px;
    width: 292px;
    background: linear-gradient(90deg, #e74c3c 0%, #e74c3c 44%, #1a1a1a 44%, #1a1a1a 100%);
}

.cover-variant--openclaw-34 .cover-openclaw-main {
    display: grid;
    align-content: center;
    gap: 18px;
    position: relative;
}

.cover-variant--openclaw-34 .cover-openclaw-decor {
    position: absolute;
    top: 78px;
    left: -36px;
    width: 54px;
    height: 54px;
    background: rgba(23, 23, 23, 0.05);
}

.cover-variant--openclaw-34 .cover-openclaw-title {
    display: grid;
    gap: 10px;
    margin-top: 44px;
}

.cover-variant--openclaw-34 .cover-openclaw-line {
    display: flex;
    align-items: baseline;
    gap: 0;
    white-space: nowrap;
}

.cover-variant--openclaw-34 .cover-openclaw-word {
    font-family: 'Noto Serif SC', serif;
    font-size: 46px;
    line-height: 0.98;
    font-weight: 900;
    letter-spacing: -0.04em;
    color: #1a1a1a;
}

.cover-variant--openclaw-34 .cover-openclaw-word--accent {
    color: #e74c3c;
}

.cover-variant--openclaw-34 .cover-openclaw-guide {
    font-family: 'Noto Serif SC', serif;
    font-size: 30px;
    line-height: 1.08;
    font-weight: 700;
    letter-spacing: -0.03em;
    color: #333;
}

.cover-variant--openclaw-34 .cover-openclaw-subtitle {
    max-width: 86%;
    padding-left: 14px;
    border-left: 4px solid #e74c3c;
    font-size: 13px;
    line-height: 1.75;
    color: rgba(23, 23, 23, 0.8);
}

.cover-variant--openclaw-34 .cover-openclaw-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
}

.cover-variant--openclaw-34 .cover-openclaw-tags span {
    position: relative;
    padding-left: 12px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.5;
    color: #444;
}

.cover-variant--openclaw-34 .cover-openclaw-tags span::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    width: 6px;
    height: 6px;
    transform: translateY(-50%);
    background: #1a1a1a;
}

.cover-variant--openclaw-34 .cover-openclaw-tags span:first-child::before {
    background: #e74c3c;
}

.cover-variant--openclaw-34 .cover-meta-row {
    position: relative;
    padding-top: 16px;
    color: rgba(23, 23, 23, 0.78);
}

.cover-variant--openclaw-34 .cover-meta-row::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 3px;
    background: linear-gradient(90deg, #1a1a1a 0%, #1a1a1a 70%, #e74c3c 70%, #e74c3c 85%, transparent 85%);
}

.cover-variant--openclaw-34 .cover-meta-row span:first-child {
    color: #e74c3c;
}

/* ── iframe 全出血卡片（正方形预览适配） ─────────────────── */
.swiss-card--iframecard {
    height: 600px;
    min-height: 600px;
    overflow: hidden;
    background: #fff;
}
.swiss-card--iframecard .iframe-card {
    width: 600px;
    height: 600px;
    overflow: hidden;
    position: relative;
}
/* 被嵌入的页面 body 有 padding-top:60px，用负 margin 抵消 */
.swiss-card--iframecard iframe {
    width: 600px;
    height: 860px;
    margin-top: -60px;
    border: none;
    display: block;
}

/* ============================================
   展示类布局组件 - Display Components
   ============================================ */

/* 1. 指标卡片 - Stat Card */
.swiss-card .stat-card {
    background: #fff;
    border: 2px solid #1a1a1a;
    padding: 24px 28px;
    margin: 16px 0;
    position: relative;
}

.swiss-card .stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 4px;
    height: 100%;
    background: #d95e00;
}

.swiss-card .stat-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
}

.swiss-card .stat-card-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #666;
}

.swiss-card .stat-card-trend {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 700;
    padding: 4px 10px;
}

.swiss-card .stat-card-trend.up {
    background: #e8f5e9;
    color: #2e7d32;
}

.swiss-card .stat-card-trend.down {
    background: #ffebee;
    color: #c62828;
}

.swiss-card .stat-card-trend::before {
    content: '';
    width: 0;
    height: 0;
    border-style: solid;
}

.swiss-card .stat-card-trend.up::before {
    border-width: 0 5px 8px 5px;
    border-color: transparent transparent #2e7d32 transparent;
}

.swiss-card .stat-card-trend.down::before {
    border-width: 8px 5px 0 5px;
    border-color: #c62828 transparent transparent transparent;
}

.swiss-card .stat-card-value {
    font-family: 'Noto Serif SC', serif;
    font-size: 42px;
    font-weight: 700;
    color: #1a1a1a;
    line-height: 1.1;
    margin-bottom: 8px;
}

.swiss-card .stat-card-unit {
    font-size: 18px;
    font-weight: 400;
    color: #666;
    margin-left: 4px;
}

.swiss-card .stat-card-footer {
    font-size: 11px;
    color: #888;
    margin-top: 8px;
}

.swiss-card .stat-card-comparison {
    font-weight: 600;
    color: #1a1a1a;
}

/* 指标卡片网格布局 */
.swiss-card .stat-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin: 16px 0;
}

.swiss-card .stat-grid .stat-card {
    margin: 0;
}

.swiss-card .stat-grid .stat-card-value {
    font-size: 32px;
}

.swiss-card .toc-card {
    width: 100%;
    min-height: 460px;
    padding: 8px 4px;
    display: grid;
    grid-template-rows: auto auto 1fr;
    gap: 16px;
    background: #fff;
}

.swiss-card .toc-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.swiss-card .toc-card-tag {
    padding: 8px 10px;
    border: 2px solid #1a1a1a;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #e74c3c;
}

.swiss-card .toc-card-index {
    font-family: 'Oswald', sans-serif;
    font-size: 42px;
    line-height: 1;
    color: rgba(231, 76, 60, 0.16);
}

.swiss-card .toc-card-title {
    margin: 0;
    font-family: 'Noto Serif SC', serif;
    font-size: 34px;
    line-height: 1.02;
    letter-spacing: -0.04em;
    color: #1a1a1a;
}

.swiss-card .toc-card-subtitle {
    font-size: 12px;
    line-height: 1.7;
    color: rgba(23, 23, 23, 0.6);
    max-width: 72%;
}

.swiss-card .toc-card-list {
    display: grid;
    gap: 12px;
}

.swiss-card .toc-card-section {
    display: grid;
    gap: 6px;
}

.swiss-card .toc-card-section-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #e74c3c;
    padding-bottom: 6px;
    border-bottom: 2px solid rgba(231, 76, 60, 0.24);
}

.swiss-card .toc-card-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: end;
    padding: 7px 0;
    border-bottom: 1px solid rgba(23, 23, 23, 0.08);
}

.swiss-card .toc-card-row:last-child {
    border-bottom: none;
}

.swiss-card .toc-card-item {
    font-size: 13px;
    line-height: 1.55;
    color: #1a1a1a;
}

.swiss-card .toc-card-page {
    font-family: 'Oswald', sans-serif;
    font-size: 14px;
    letter-spacing: 0.08em;
    color: #e74c3c;
}

.swiss-card .form-card {
    width: 100%;
    min-height: 460px;
    border: 2px solid #1a1a1a;
    padding: 18px;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 14px;
    background:
        linear-gradient(180deg, rgba(231, 76, 60, 0.05), rgba(231, 76, 60, 0)),
        #fff;
}

.swiss-card .form-card-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 10px;
    border-bottom: 2px solid rgba(23, 23, 23, 0.92);
}

.swiss-card .form-card-title {
    margin: 0;
    font-family: 'Noto Serif SC', serif;
    font-size: 24px;
    line-height: 1.18;
    color: #1a1a1a;
}

.swiss-card .form-card-meta {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(23, 23, 23, 0.52);
}

.swiss-card .form-card-prompt {
    padding: 10px 12px;
    background: rgba(231, 76, 60, 0.08);
    border-left: 4px solid #e74c3c;
    font-size: 12px;
    line-height: 1.7;
    color: #2d3f6f;
}

.swiss-card .form-card-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
}

.swiss-card .form-field {
    padding: 12px 12px 10px;
    background: #f7f3ec;
    border: 1px solid rgba(23, 23, 23, 0.12);
    min-height: 84px;
}

.swiss-card .form-field--wide {
    grid-column: 1 / -1;
}

.swiss-card .form-field-label {
    display: block;
    margin-bottom: 8px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #e74c3c;
}

.swiss-card .form-field-value {
    font-size: 12px;
    line-height: 1.7;
    color: #1a1a1a;
}

.swiss-card .form-card-footer {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
}

.swiss-card .form-card-action {
    padding: 10px 12px;
    background: #1a1a1a;
    color: #fff;
    font-size: 11px;
    line-height: 1.5;
}

.swiss-card .form-card-action strong {
    display: block;
    margin-bottom: 4px;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.7);
}

/* 2. 雷达图 - Radar Chart (无外部边框) */
.swiss-card .radar {
    background: #fff;
    padding: 28px;
    margin: 16px 0;
    position: relative;
}

.swiss-card .radar--hex {
    min-height: 480px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.swiss-card .radar-hex-inner {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.swiss-card .radar-container {
    position: relative;
    width: 100%;
    height: 280px;
    display: flex;
    justify-content: center;
    align-items: center;
}

.swiss-card .radar--hex .radar-container {
    height: 364px;
}

.swiss-card .radar-svg {
    width: 260px;
    height: 260px;
}

.swiss-card .radar--hex .radar-svg {
    width: 338px;
    height: 338px;
}

.swiss-card .radar-grid {
    fill: none;
    stroke: #e0e0e0;
    stroke-width: 1;
}

.swiss-card .radar-axis {
    stroke: #ccc;
    stroke-width: 1;
}

.swiss-card .radar-data {
    fill: rgba(217, 94, 0, 0.25);
    stroke: #d95e00;
    stroke-width: 2;
}

.swiss-card .radar-point {
    fill: #d95e00;
    stroke: #fff;
    stroke-width: 2;
}

.swiss-card .radar-label {
    font-size: 10px;
    font-weight: 600;
    color: #1a1a1a;
    text-align: center;
    line-height: 1.2;
    overflow-wrap: anywhere;
    word-break: break-word;
}

.swiss-card .radar-legend {
    display: flex;
    justify-content: center;
    gap: 24px;
    margin-top: 16px;
    font-size: 11px;
}

.swiss-card .radar-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
}

.swiss-card .radar-legend-color {
    width: 12px;
    height: 12px;
    background: #d95e00;
    border: 2px solid #d95e00;
}

/* 3. 列表卡片 - List Card */
.swiss-card .list-card {
    background: #fff;
    border: 2px solid #1a1a1a;
    margin: 16px 0;
    padding: 0;
}

.swiss-card .list-card-header {
    background: #1a1a1a;
    color: #fff;
    padding: 14px 20px;
    font-family: 'Noto Serif SC', serif;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.05em;
}

.swiss-card .list-card ul,
.swiss-card .list-card ol {
    list-style: none;
    padding: 0;
    margin: 0;
}

.swiss-card .list-card li {
    padding: 14px 20px;
    border-bottom: 1px solid #e5e5e5;
    position: relative;
    font-size: 12px;
    line-height: 1.6;
    display: flex;
    align-items: flex-start;
    gap: 12px;
}

.swiss-card .list-card li:last-child {
    border-bottom: none;
}

.swiss-card .list-card li:hover {
    background: #fafafa;
}

/* 编号样式 */
.swiss-card .list-card ol li::before {
    content: counter(list-counter, decimal-leading-zero);
    counter-increment: list-counter;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    font-weight: 700;
    color: #d95e00;
    min-width: 24px;
    text-align: right;
}

.swiss-card .list-card ol {
    counter-reset: list-counter;
}

/* 无序列表图标 */
.swiss-card .list-card ul li::before {
    content: '';
    width: 6px;
    height: 6px;
    background: #d95e00;
    margin-top: 7px;
    flex-shrink: 0;
}

/* 层级缩进 */
.swiss-card .list-card li.level-2 {
    padding-left: 44px;
    background: #fafafa;
}

.swiss-card .list-card li.level-2::before {
    content: '›';
    font-size: 14px;
    color: #888;
}

.swiss-card .list-card li.level-3 {
    padding-left: 68px;
    background: #f5f5f5;
    font-size: 11px;
}

.swiss-card .list-card li.level-3::before {
    content: '»';
    font-size: 12px;
    color: #aaa;
}

/* 带图标的列表项 */
.swiss-card .list-card li.with-icon::before {
    content: attr(data-icon);
    font-size: 14px;
}

.swiss-card .list-card--workflow {
    border: 2px solid #1a1a1a;
    background: #fff;
}

.swiss-card .list-card--workflow .list-card-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 18px 12px;
    background: transparent;
    color: #171717;
    border-bottom: 2px solid #1a1a1a;
    font-size: 15px;
}

.swiss-card .list-card--workflow .workflow-kicker {
    font-family: 'Oswald', sans-serif;
    font-size: 10px;
    line-height: 1;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #d95e00;
}

.swiss-card .list-card--workflow ol li {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    gap: 14px;
    padding: 15px 18px;
    border-bottom: 1px solid rgba(23, 23, 23, 0.1);
}

.swiss-card .list-card--workflow ol li::before {
    min-width: 0;
    text-align: left;
    font-family: 'Oswald', sans-serif;
    font-size: 34px;
    line-height: 0.95;
    color: #d95e00;
}

.swiss-card .list-card--workflow .workflow-item-title {
    display: block;
    margin-bottom: 4px;
    font-family: 'Noto Serif SC', serif;
    font-size: 15px;
    line-height: 1.35;
    font-weight: 700;
    color: #171717;
}

.swiss-card .list-card--workflow .workflow-item-copy {
    display: block;
    font-size: 11px;
    line-height: 1.65;
    color: rgba(23, 23, 23, 0.72);
}

/* 4. 三栏布局 - Three Column */
.swiss-card .three-col:not(.card-grid) {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin: 16px 0;
}

.swiss-card .three-col-item {
    background: #fff;
    border: 2px solid #1a1a1a;
    padding: 20px;
    text-align: center;
    position: relative;
    transition: transform 0.2s ease;
}

.swiss-card .three-col-item:hover {
    transform: translateY(-2px);
}

.swiss-card .three-col-item::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: #d95e00;
}

.swiss-card .three-col-number {
    font-family: 'Noto Serif SC', serif;
    font-size: 36px;
    font-weight: 700;
    color: #d95e00;
    line-height: 1;
    margin-bottom: 8px;
}

.swiss-card .three-col-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #1a1a1a;
    margin-bottom: 12px;
}

.swiss-card .three-col-desc {
    font-size: 11px;
    color: #666;
    line-height: 1.5;
}

/* 三栏带图标 */
.swiss-card .three-col-icon {
    width: 48px;
    height: 48px;
    background: #1a1a1a;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    margin: 0 auto 16px;
}

/* 5. 上下分层 - Split Vertical */
.swiss-card .split-v {
    border: 2px solid #1a1a1a;
    margin: 16px 0;
    display: flex;
    flex-direction: column;
}

.swiss-card .split-v-header {
    background: #1a1a1a;
    color: #fff;
    padding: 24px 28px;
    position: relative;
}

.swiss-card .split-v-header::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 28px;
    width: 60px;
    height: 3px;
    background: #d95e00;
}

.swiss-card .split-v-title {
    font-family: 'Noto Serif SC', serif;
    font-size: 20px;
    font-weight: 700;
    line-height: 1.3;
    margin-bottom: 8px;
}

.swiss-card .split-v-subtitle {
    font-size: 12px;
    color: #888;
    font-weight: 400;
}

.swiss-card .split-v-body {
    background: #fff;
    padding: 24px 28px;
    flex: 1;
}

.swiss-card .split-v-body p {
    font-size: 12px;
    line-height: 1.8;
    color: #333;
    margin-bottom: 12px;
}

.swiss-card .split-v-body p:last-child {
    margin-bottom: 0;
}

/* 带强调的头部 */
.swiss-card .split-v.accent .split-v-header {
    background: #d95e00;
}

.swiss-card .split-v.accent .split-v-header::after {
    background: #fff;
}

.swiss-card .split-v.accent .split-v-subtitle {
    color: rgba(255, 255, 255, 0.7);
}

/* 带编号的头部 */
.swiss-card .split-v-numbered .split-v-header {
    padding-left: 72px;
}

.swiss-card .split-v-number {
    position: absolute;
    left: 24px;
    top: 50%;
    transform: translateY(-50%);
    font-family: 'JetBrains Mono', monospace;
    font-size: 36px;
    font-weight: 700;
    color: #d95e00;
    line-height: 1;
}

.swiss-card .split-v.accent .split-v-number {
    color: rgba(255, 255, 255, 0.3);
}

/* 网格式 */
.swiss-card .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin: 16px 0;
}
.swiss-card .grid .cell {
    padding: 16px;
    background: rgba(217,94,0,0.05);
    text-align: center;
    font-size: 13px;
}

/* 布局标签 */
.layout-label {
    display: inline-block;
    padding: 4px 10px;
    background: #d95e00;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    border-radius: 4px;
    margin-bottom: 12px;
    letter-spacing: 0.05em;
}

/* ===== Process Loop 变体样式 ===== */
/* 三角循环 */
.swiss-card .process-loop[data-type="triangle"] {
    position: relative;
    width: 260px;
    height: 240px;
    margin: 20px auto;
}
.swiss-card .process-loop[data-type="triangle"] .loop-item {
    position: absolute;
    width: 70px;
    height: 70px;
    border-radius: 50%;
    background: rgba(217,94,0,0.1);
    border: 2px solid #d95e00;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    color: #d95e00;
}
.swiss-card .process-loop[data-type="triangle"] .loop-item:nth-child(1) {
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
}
.swiss-card .process-loop[data-type="triangle"] .loop-item:nth-child(2) {
    bottom: 20px;
    left: 20px;
}
.swiss-card .process-loop[data-type="triangle"] .loop-item:nth-child(3) {
    bottom: 20px;
    right: 20px;
}
/* 三角连接线 */
.swiss-card .process-loop[data-type="triangle"]::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 180px;
    height: 180px;
    border: 2px dashed rgba(217,94,0,0.3);
    border-radius: 50%;
    transform: translate(-50%, -40%);
}

/* 四角循环 - 菱形布局（上、右、下、左） */
.swiss-card .process-loop[data-type="quad"] {
    position: relative;
    width: 240px;
    height: 240px;
    margin: 20px auto;
}
.swiss-card .process-loop[data-type="quad"] .loop-item {
    position: absolute;
    width: 70px;
    height: 70px;
    border-radius: 50%;
    background: rgba(217,94,0,0.1);
    border: 2px solid #d95e00;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
    color: #d95e00;
    text-align: center;
}
/* 上 */
.swiss-card .process-loop[data-type="quad"] .loop-item:nth-child(1) {
    top: 0;
    left: 50%;
    transform: translateX(-50%);
}
/* 右 */
.swiss-card .process-loop[data-type="quad"] .loop-item:nth-child(2) {
    top: 50%;
    right: 0;
    transform: translateY(-50%);
}
/* 下 */
.swiss-card .process-loop[data-type="quad"] .loop-item:nth-child(3) {
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
}
/* 左 */
.swiss-card .process-loop[data-type="quad"] .loop-item:nth-child(4) {
    top: 50%;
    left: 0;
    transform: translateY(-50%);
}
/* 四角连接线 - 虚线圆 */
.swiss-card .process-loop[data-type="quad"]::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 170px;
    height: 170px;
    border: 2px dashed rgba(217,94,0,0.3);
    border-radius: 50%;
    transform: translate(-50%, -50%);
}

/* 五角循环 - 五等分圆形 */
.swiss-card .process-loop[data-type="pentagon"] {
    position: relative;
    width: 260px;
    height: 260px;
    margin: 20px auto;
}
.swiss-card .process-loop[data-type="pentagon"] .loop-item {
    position: absolute;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: rgba(217,94,0,0.1);
    border: 2px solid #d95e00;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: #d95e00;
    text-align: center;
    transform: translate(-50%, -50%);
}
/* 五等分圆形 - 精确三角函数计算，圆心在圆周上
   中心(130px,130px), 半径90px, 角度: -90°, -18°, 54°, 126°, 198° */
.swiss-card .process-loop[data-type="pentagon"] .loop-item:nth-child(1) { top: calc(50% - 90px); left: 50%; }
.swiss-card .process-loop[data-type="pentagon"] .loop-item:nth-child(2) { top: calc(50% - 28px); left: calc(50% + 86px); }
.swiss-card .process-loop[data-type="pentagon"] .loop-item:nth-child(3) { top: calc(50% + 73px); left: calc(50% + 53px); }
.swiss-card .process-loop[data-type="pentagon"] .loop-item:nth-child(4) { top: calc(50% + 73px); left: calc(50% - 53px); }
.swiss-card .process-loop[data-type="pentagon"] .loop-item:nth-child(5) { top: calc(50% - 28px); left: calc(50% - 86px); }
/* 五边形连接线 - 虚线圆 */
.swiss-card .process-loop[data-type="pentagon"]::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 180px;
    height: 180px;
    border: 2px dashed rgba(217,94,0,0.3);
    border-radius: 50%;
    transform: translate(-50%, -50%);
}

/* 六槽循环 - 5/6 个节点使用同一套坐标，新增第 6 个时不重排前 5 个 */
.swiss-card .process-loop[data-type="hex"] {
    position: relative;
    width: 260px;
    height: 260px;
    margin: 20px auto;
}
.swiss-card .process-loop[data-type="hex"] .loop-item {
    position: absolute;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: rgba(217,94,0,0.1);
    border: 2px solid #d95e00;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 600;
    color: #d95e00;
    text-align: center;
    transform: translate(-50%, -50%);
}
.swiss-card .process-loop[data-type="hex"] .loop-item:nth-child(1) { top: calc(50% - 90px); left: 50%; }
.swiss-card .process-loop[data-type="hex"] .loop-item:nth-child(2) { top: calc(50% - 45px); left: calc(50% + 78px); }
.swiss-card .process-loop[data-type="hex"] .loop-item:nth-child(3) { top: calc(50% + 45px); left: calc(50% + 78px); }
.swiss-card .process-loop[data-type="hex"] .loop-item:nth-child(4) { top: calc(50% + 90px); left: 50%; }
.swiss-card .process-loop[data-type="hex"] .loop-item:nth-child(5) { top: calc(50% + 45px); left: calc(50% - 78px); }
.swiss-card .process-loop[data-type="hex"] .loop-item:nth-child(6) { top: calc(50% - 45px); left: calc(50% - 78px); }
.swiss-card .process-loop[data-type="hex"]::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 180px;
    height: 180px;
    border: 2px dashed rgba(217,94,0,0.3);
    border-radius: 50%;
    transform: translate(-50%, -50%);
}

/* ===== 架构图样式 ===== */
.swiss-card .architecture {
    margin: 20px 0;
    padding: 24px;
    background: #fff;
    border: 2px solid #1a1a1a;
}
.swiss-card .architecture .layer {
    margin-bottom: 20px;
    position: relative;
}
.swiss-card .architecture .layer:last-child {
    margin-bottom: 0;
}
.swiss-card .architecture .layer-title {
    font-size: 12px;
    font-weight: 700;
    color: #d95e00;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(217,94,0,0.3);
}
.swiss-card .architecture .modules {
    display: flex;
    justify-content: center;
    gap: 12px;
    flex-wrap: wrap;
}
.swiss-card .architecture .module {
    padding: 10px 16px;
    background: rgba(217,94,0,0.08);
    border: 2px solid #d95e00;
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    text-align: center;
    min-width: 80px;
}
.swiss-card .architecture .module.primary {
    background: #d95e00;
    color: #fff;
}
.swiss-card .architecture .module.secondary {
    background: rgba(217,94,0,0.15);
    border-style: dashed;
}
/* 层级连接线 */
.swiss-card .architecture .layer:not(:last-child)::after {
    content: '▼';
    position: absolute;
    bottom: -18px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 10px;
    color: #d95e00;
}

/* ===== 三圆交叉韦恩图 ===== */
/* ===== 分层架构图：基础版 / 复杂横版 / 复杂竖版 ===== */
.swiss-card .arch-platform,
.swiss-card .arch-complex-h,
.swiss-card .arch-complex-v {
    --arch-accent: #d95e00;
    --arch-ink: #1a1a1a;
    --arch-paper: #f2efe9;
    --arch-surface: #f7f3ee;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 16px 0;
}

.swiss-card .swiss-card__content.swiss-card__content--arch-base {
    padding-left: 12px;
    padding-right: 12px;
}

.swiss-card .arch-platform .ap-row,
.swiss-card .arch-complex-h .ah-row,
.swiss-card .arch-complex-v .av-row {
    position: relative;
}

.swiss-card .arch-platform .ap-row {
    display: flex;
    gap: 5px;
    align-items: stretch;
}

.swiss-card .arch-platform .ap-label {
    width: 54px;
    min-width: 54px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    text-align: center;
    line-height: 1.35;
    padding: 8px 6px;
    letter-spacing: 0.08em;
}

.swiss-card .arch-platform .ap-flat,
.swiss-card .arch-platform .ap-grid-wrap {
    flex: 1;
    min-width: 0;
    border: 1px solid rgba(26,26,26,0.14);
}

.swiss-card .arch-platform .ap-flat {
    padding: 5px;
    display: flex;
    gap: 5px;
    align-items: stretch;
}

.swiss-card .arch-platform .ap-chip {
    flex: 1;
    padding: 9px 5px;
    text-align: center;
    font-size: 10px;
    font-weight: 600;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1.3;
    white-space: nowrap;
}

.swiss-card .arch-platform .ap-grid-wrap {
    padding: 5px;
}

.swiss-card .arch-platform .ap-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
}

.swiss-card .arch-platform .ap-grid.col-4 {
    grid-template-columns: repeat(4, 1fr);
}

.swiss-card .arch-platform .ap-card {
    padding: 5px 4px;
    border: 1px solid;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.swiss-card .arch-platform .ap-card-title {
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    padding-bottom: 4px;
    border-bottom: 1px solid;
    letter-spacing: 0.04em;
    white-space: nowrap;
}

.swiss-card .arch-platform .ap-items {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
}

.swiss-card .arch-platform .ap-item {
    flex: 1 1 calc(50% - 2px);
    padding: 5px 3px;
    text-align: center;
    font-size: 10px;
    font-weight: 600;
    color: #fff;
    line-height: 1.25;
    white-space: nowrap;
}

.swiss-card .arch-complex-h {
    gap: 10px;
}

.swiss-card .arch-complex-h .ah-row {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 8px;
}

.swiss-card .arch-complex-h .ah-label {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-size: 12px;
    font-weight: 800;
    line-height: 1.3;
    padding: 12px 8px;
    border: 2px solid var(--arch-ink);
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

.swiss-card .arch-complex-h .ah-panel {
    border: 2px solid var(--arch-ink);
    background: var(--arch-surface);
    padding: 10px;
    box-shadow: 6px 6px 0 rgba(217,94,0,0.10);
    min-width: 0;
}

.swiss-card .arch-complex-h .ah-flat {
    display: grid;
    gap: 8px;
}

.swiss-card .arch-complex-h .ah-flat[data-count="4"] {
    grid-template-columns: repeat(4, 1fr);
}

.swiss-card .arch-complex-h .ah-flat[data-count="3"] {
    grid-template-columns: repeat(3, 1fr);
}

.swiss-card .arch-complex-h .ah-chip {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 8px 6px;
    border: 1px solid var(--arch-ink);
    color: #fff;
    font-size: 11px;
    line-height: 1.3;
    font-weight: 700;
}

.swiss-card .arch-complex-h .ah-grid {
    display: grid;
    gap: 8px;
}

.swiss-card .arch-complex-h .ah-grid.col-4 {
    grid-template-columns: repeat(4, 1fr);
}

.swiss-card .arch-complex-h .ah-grid.col-3 {
    grid-template-columns: repeat(3, 1fr);
}

.swiss-card .arch-complex-h .ah-card {
    border: 1px solid var(--arch-ink);
    background: rgba(255,255,255,0.76);
    min-width: 0;
}

.swiss-card .arch-complex-h .ah-card-title {
    padding: 8px 6px;
    border-bottom: 1px solid rgba(26,26,26,0.2);
    text-align: center;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.05em;
}

.swiss-card .arch-complex-h .ah-items {
    padding: 7px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
}

.swiss-card .arch-complex-h .ah-item {
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 6px 4px;
    font-size: 9px;
    line-height: 1.25;
    font-weight: 700;
    color: #fff;
    border: 1px solid rgba(26,26,26,0.12);
}

.swiss-card .arch-complex-v {
    border: 2px solid var(--arch-ink);
    background: var(--arch-paper);
    gap: 0;
    overflow: hidden;
}

.swiss-card .arch-complex-v .av-row {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    border-bottom: 2px solid var(--arch-ink);
    min-height: 74px;
}

.swiss-card .arch-complex-v .av-row:last-child {
    border-bottom: none;
}

.swiss-card .arch-complex-v .av-label {
    border-right: 2px solid var(--arch-ink);
    display: flex;
    align-items: center;
    justify-content: center;
    writing-mode: vertical-rl;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.18em;
    line-height: 1;
    padding: 8px 0;
}

.swiss-card .arch-complex-v .av-content {
    min-width: 0;
    padding: 9px 10px;
    display: flex;
    align-items: center;
}

.swiss-card .arch-complex-v .av-flat {
    width: 100%;
    display: grid;
    gap: 7px;
}

.swiss-card .arch-complex-v .av-flat[data-count="4"] {
    grid-template-columns: repeat(4, 1fr);
}

.swiss-card .arch-complex-v .av-flat[data-count="3"] {
    grid-template-columns: repeat(3, 1fr);
}

.swiss-card .arch-complex-v .av-chip {
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 6px 4px;
    border: 2px solid var(--arch-ink);
    color: #fff;
    font-size: 10px;
    line-height: 1.25;
    font-weight: 700;
}

.swiss-card .arch-complex-v .av-grid {
    width: 100%;
    display: grid;
    gap: 8px;
}

.swiss-card .arch-complex-v .av-grid.col-4 {
    grid-template-columns: repeat(4, 1fr);
}

.swiss-card .arch-complex-v .av-grid.col-3 {
    grid-template-columns: repeat(3, 1fr);
}

.swiss-card .arch-complex-v .av-card {
    border: 2px solid var(--arch-ink);
    background: rgba(255,255,255,0.9);
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.swiss-card .arch-complex-v .av-card-title {
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    border-bottom: 2px solid var(--arch-ink);
    padding: 5px 4px;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.04em;
    color: #fff;
}

.swiss-card .arch-complex-v .av-items {
    padding: 7px 6px;
    display: grid;
    gap: 5px;
}

.swiss-card .arch-complex-v .av-item {
    min-height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 3px 4px;
    border: 1px solid var(--arch-ink);
    font-size: 8px;
    line-height: 1.2;
    font-weight: 700;
    background: rgba(255,255,255,0.9);
}

.swiss-card .tone-a .arch-tone-label {
    background: rgba(217,94,0,0.10);
    color: #d95e00;
}

.swiss-card .tone-a .arch-tone-panel,
.swiss-card .tone-a .arch-tone-wrap {
    background: rgba(217,94,0,0.05);
}

.swiss-card .tone-a .arch-tone-card {
    background: rgba(217,94,0,0.06);
    border-color: rgba(217,94,0,0.18);
}

.swiss-card .tone-a .arch-tone-title {
    color: #d95e00;
}

.swiss-card .tone-a .arch-tone-fill {
    background: #d95e00;
}

.swiss-card .tone-b .arch-tone-label {
    background: rgba(26,26,26,0.08);
    color: #1a1a1a;
}

.swiss-card .tone-b .arch-tone-panel,
.swiss-card .tone-b .arch-tone-wrap {
    background: rgba(26,26,26,0.04);
}

.swiss-card .tone-b .arch-tone-card {
    background: rgba(26,26,26,0.05);
    border-color: rgba(26,26,26,0.18);
}

.swiss-card .tone-b .arch-tone-title {
    color: #1a1a1a;
}

.swiss-card .tone-b .arch-tone-fill {
    background: #2d2d2d;
}

.swiss-card .tone-c .arch-tone-label {
    background: rgba(100,100,100,0.09);
    color: #585858;
}

.swiss-card .tone-c .arch-tone-panel,
.swiss-card .tone-c .arch-tone-wrap {
    background: rgba(100,100,100,0.05);
}

.swiss-card .tone-c .arch-tone-card {
    background: rgba(100,100,100,0.05);
    border-color: rgba(100,100,100,0.18);
}

.swiss-card .tone-c .arch-tone-title {
    color: #555;
}

.swiss-card .tone-c .arch-tone-fill {
    background: #666;
}

.swiss-card .tone-d .arch-tone-label {
    background: rgba(242,239,233,1);
    color: #1a1a1a;
}

.swiss-card .tone-d .arch-tone-panel,
.swiss-card .tone-d .arch-tone-wrap {
    background: rgba(242,239,233,0.9);
}

.swiss-card .tone-d .arch-tone-card {
    background: rgba(255,255,255,0.92);
    border-color: rgba(26,26,26,0.18);
}

.swiss-card .tone-d .arch-tone-title {
    color: #1a1a1a;
}

.swiss-card .tone-d .arch-tone-fill {
    background: #1a1a1a;
}

.swiss-card .tone-e .arch-tone-label {
    background: rgba(167,124,77,0.15);
    color: #8b623b;
}

.swiss-card .tone-e .arch-tone-panel,
.swiss-card .tone-e .arch-tone-wrap {
    background: rgba(167,124,77,0.08);
}

.swiss-card .tone-e .arch-tone-card {
    background: rgba(167,124,77,0.08);
    border-color: rgba(139,98,59,0.18);
}

.swiss-card .tone-e .arch-tone-title {
    color: #8b623b;
}

.swiss-card .tone-e .arch-tone-fill {
    background: #9a7048;
}

.swiss-card .tone-a .av-item {
    background: rgba(217,94,0,0.08);
}

.swiss-card .tone-b .av-item {
    background: rgba(26,26,26,0.08);
}

.swiss-card .tone-c .av-item {
    background: rgba(124,96,80,0.10);
}

.swiss-card .tone-d .av-item {
    background: rgba(26,26,26,0.06);
}

.swiss-card .tone-e .av-item {
    background: rgba(154,112,72,0.10);
}`;
