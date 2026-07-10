# MornDraft OSS

MornDraft OSS is the public local-first client for previewing, reviewing, correcting, copying, exporting, and handing off AI-generated artifacts before delivery.

## What is included

- Public preview syntax: Markdown, code blocks, JSON/JSON5, Mermaid, HTML preview, and MornDraft flat components.
- Local import/export and public all-open delivery behavior.
- Final toolbar Syntax and More menu; More includes About, language, theme, and OSS AI config.
- Browser-local OpenAI-compatible AI configuration: Base URL, API Key, and separate generate/modify/summarize models.

## What is intentionally excluded

The OSS edition does not include draft box, account login, cloud drafts, avatar/profile editing, subscriptions, payment checkout, hosted/private AI providers, AI usage ledger, MCP, admin apps, telemetry, SMS, private APIs, or hosted public share links.

## Development

```bash
npm install
npm run dev
npm run build:oss
MORNDRAFT_BUILD_PRESET=oss-full npm run check:public-surface
```

## Security

Use GitHub Security Advisories for private vulnerability reports. Do not post secrets or private draft content in public issues.

## License

Apache-2.0. See [LICENSE](./LICENSE).
