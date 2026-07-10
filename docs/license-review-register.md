# MornDraft OSS License Review Register

This engineering register is projected from the private repository review register for the exact public `package-lock.json`; generation is not a new legal opinion.

## Projected Manual Review and Metadata Overrides

| 包名 | 版本 | 许可证 | direct or transitive | 进入生产包 | 是否修改 | 义务 | 结论 | 证据 |
|---|---:|---|---|---|---|---|---|---|
| @typescript-eslint/typescript-estree/node_modules/minimatch | 10.2.4 | BlueOak-1.0.0 | transitive via typescript-eslint | No; dev/lint tooling only | No | Keep license link or notice in third-party register; no source availability obligation for MornDraft code | Approved | node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch/package.json; npm explain minimatch |
| argparse | 2.0.1 | Python-2.0 | transitive via ESLint/js-yaml | No; dev/lint tooling only | No | Keep Python-2.0 notice/attribution if redistributed | Approved | node_modules/argparse/LICENSE; npm explain argparse |
| caniuse-lite | 1.0.30001799 | CC-BY-4.0 | transitive via Browserslist/Babel/Vite | No; dev/build target data only | No | Attribution required if redistributed; keep package notice in third-party register | Approved | node_modules/caniuse-lite/LICENSE; npm explain caniuse-lite |
| dompurify | 3.4.11 | (MPL-2.0 OR Apache-2.0) | transitive via mermaid | Yes; runtime dependency tree for Mermaid rendering | No | Use Apache-2.0 license path; keep notice/attribution; no source availability obligation for MornDraft code under Apache path | Approved | node_modules/dompurify/LICENSE; npm explain dompurify |
| lightningcss | 1.32.0 | MPL-2.0 | transitive via Tailwind/Vite | No; dev/build tooling only | No | MPL notice; if MornDraft ever distributes modified Lightning CSS files or binaries, confirm source availability for those files | Approved | node_modules/lightningcss/LICENSE; npm explain lightningcss |
| lightningcss-android-arm64 | 1.32.0 | MPL-2.0 | transitive optional platform package via lightningcss | No; dev/build tooling only | No | MPL notice; if redistributed, confirm source availability for covered files | Approved | node_modules/lightningcss-android-arm64/package.json; package-lock.json |
| lightningcss-darwin-arm64 | 1.32.0 | MPL-2.0 | transitive optional platform package via lightningcss | No; dev/build tooling only | No | MPL notice; if redistributed, confirm source availability for covered files | Approved | node_modules/lightningcss-darwin-arm64/package.json; package-lock.json |
| lightningcss-darwin-x64 | 1.32.0 | MPL-2.0 | transitive optional platform package via lightningcss | No; dev/build tooling only | No | MPL notice; if redistributed, confirm source availability for covered files | Approved | node_modules/lightningcss-darwin-x64/package.json; package-lock.json |
| lightningcss-freebsd-x64 | 1.32.0 | MPL-2.0 | transitive optional platform package via lightningcss | No; dev/build tooling only | No | MPL notice; if redistributed, confirm source availability for covered files | Approved | node_modules/lightningcss-freebsd-x64/package.json; package-lock.json |
| lightningcss-linux-arm-gnueabihf | 1.32.0 | MPL-2.0 | transitive optional platform package via lightningcss | No; dev/build tooling only | No | MPL notice; if redistributed, confirm source availability for covered files | Approved | node_modules/lightningcss-linux-arm-gnueabihf/package.json; package-lock.json |
| lightningcss-linux-arm64-gnu | 1.32.0 | MPL-2.0 | transitive optional platform package via lightningcss | No; dev/build tooling only | No | MPL notice; if redistributed, confirm source availability for covered files | Approved | node_modules/lightningcss-linux-arm64-gnu/package.json; package-lock.json |
| lightningcss-linux-arm64-musl | 1.32.0 | MPL-2.0 | transitive optional platform package via lightningcss | No; dev/build tooling only | No | MPL notice; if redistributed, confirm source availability for covered files | Approved | node_modules/lightningcss-linux-arm64-musl/package.json; package-lock.json |
| lightningcss-linux-x64-gnu | 1.32.0 | MPL-2.0 | transitive optional platform package via lightningcss | No; dev/build tooling only | No | MPL notice; if redistributed, confirm source availability for covered files | Approved | node_modules/lightningcss-linux-x64-gnu/package.json; package-lock.json |
| lightningcss-linux-x64-musl | 1.32.0 | MPL-2.0 | transitive optional platform package via lightningcss | No; dev/build tooling only | No | MPL notice; if redistributed, confirm source availability for covered files | Approved | node_modules/lightningcss-linux-x64-musl/package.json; package-lock.json |
| lightningcss-win32-arm64-msvc | 1.32.0 | MPL-2.0 | transitive optional platform package via lightningcss | No; dev/build tooling only | No | MPL notice; if redistributed, confirm source availability for covered files | Approved | node_modules/lightningcss-win32-arm64-msvc/package.json; package-lock.json |
| lightningcss-win32-x64-msvc | 1.32.0 | MPL-2.0 | transitive optional platform package via lightningcss | No; dev/build tooling only | No | MPL notice; if redistributed, confirm source availability for covered files | Approved | node_modules/lightningcss-win32-x64-msvc/package.json; package-lock.json |
| khroma | 2.1.0 | MIT | transitive via mermaid | Yes; runtime dependency tree for Mermaid rendering | No | Keep MIT notice | Approved | node_modules/khroma/license |

## Runtime Font Assets

The public distribution includes Noto Sans SC and Noto Serif SC WOFF2 assets under OFL-1.1. The evidence file is `public/fonts/noto-sc/OFL-1.1.txt`.

A legal owner must confirm this projected register before the first remote public release and after any dependency or asset change.
