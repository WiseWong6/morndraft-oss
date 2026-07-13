# Contributing

Thanks for improving MornDraft OSS. Keep changes inside the public client boundary.

## Public boundary

- Allowed: Source/Final editing, preview, syntax rendering, local import, language, theme, examples, About, Syntax and More menus, documentation, and public governance files.
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
