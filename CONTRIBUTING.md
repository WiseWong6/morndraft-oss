# Contributing

Thanks for improving MornDraft OSS. Keep changes inside the public client boundary.

## Public boundary

- Allowed: editor, preview, syntax rendering, import/export, language, theme, examples, About, Final toolbar Syntax and More menu, browser-local OpenAI-compatible AI configuration, documentation, and public governance files.
- Not allowed: draft box, account/login, cloud drafts, payment, hosted/private AI providers, AI usage ledger, MCP, telemetry, admin surfaces, hosted links, SMS, private APIs, secrets, and private operational docs.

## Checks

Run these before opening a pull request:

```bash
npm run lint
npm run typecheck
npm run check:oss-distribution
npm run check:workflow-pins
npm run check:licenses:release
npm test
npm run build:oss
MORNDRAFT_BUILD_PRESET=oss-full npm run check:public-surface
```
