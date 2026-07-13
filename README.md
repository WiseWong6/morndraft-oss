# MornDraft OSS

MornDraft OSS is the public local-first client for previewing, reviewing, and correcting AI-generated artifacts before delivery.

## What is included

- Public preview syntax: Markdown, code blocks, JSON/JSON5, Mermaid, HTML preview, and MornDraft flat components.
- Source and Final editing backed by one canonical Source document.
- Browser-local file import with optional local image embedding.
- Browser-local OpenAI-compatible AI using a user-supplied Base URL and API Key, with separate generate, modify, and summarize models.
- 29 Syntax examples, 30 MornDraft flat insertions, and the More menu for About, language, theme, and AI settings.

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
