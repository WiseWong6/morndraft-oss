import type { PublicSyntaxEntry, PublicWorkspaceLocale } from './types';

const SAMPLES: Record<PublicWorkspaceLocale, readonly PublicSyntaxEntry[]> = {
  zh: [
    { id: 'markdown', label: 'Markdown', source: '# Markdown\n\n这是一段 **可编辑** 的交付内容。\n\n| 能力 | 状态 |\n|---|---|\n| Final 编辑 | 可用 |' },
    { id: 'json5', label: 'JSON5', source: "```json5\n{\n  project: 'MornDraft',\n  local: true,\n  features: ['comments', 'single quotes', 'trailing comma',],\n}\n```" },
    { id: 'mermaid', label: 'Mermaid', source: '```mermaid\nflowchart LR\n  Agent[Agent 生成] --> Review[人工审核]\n  Review --> Deliver[本地交付]\n```' },
    { id: 'html', label: 'HTML', source: '```html\n<!doctype html><html><body style="font-family:system-ui;padding:24px"><h1>HTML Preview</h1><button onclick="this.textContent=\'已运行\'">安全沙箱中的脚本</button></body></html>\n```' },
    { id: 'mixed', label: 'Mixed', source: '# Mixed\n\nMarkdown、JSON5、Mermaid 与 HTML 可以在同一份 Source 中预览。\n\n```json5\n{ready:true,}\n```' },
  ],
  en: [
    { id: 'markdown', label: 'Markdown', source: '# Markdown\n\nThis is an **editable** deliverable.\n\n| Capability | Status |\n|---|---|\n| Final editing | Ready |' },
    { id: 'json5', label: 'JSON5', source: "```json5\n{\n  project: 'MornDraft',\n  local: true,\n  features: ['comments', 'single quotes', 'trailing comma',],\n}\n```" },
    { id: 'mermaid', label: 'Mermaid', source: '```mermaid\nflowchart LR\n  Agent[Agent output] --> Review[Human review]\n  Review --> Deliver[Local delivery]\n```' },
    { id: 'html', label: 'HTML', source: '```html\n<!doctype html><html><body style="font-family:system-ui;padding:24px"><h1>HTML Preview</h1><button onclick="this.textContent=\'Running\'">Script in a safe sandbox</button></body></html>\n```' },
    { id: 'mixed', label: 'Mixed', source: '# Mixed\n\nMarkdown, JSON5, Mermaid, and HTML can coexist in one Source.\n\n```json5\n{ready:true,}\n```' },
  ],
};

export const getDefaultPublicSyntaxEntries = (locale: PublicWorkspaceLocale) => SAMPLES[locale];
