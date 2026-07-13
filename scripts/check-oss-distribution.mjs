/* global console, process */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

import {
  analyzeLicenseEntries,
  parseLicenseReviewRegister,
  parseThirdPartyDirectNotices,
  readDirectDependencyEntriesFromLock,
  readLicenseEntriesFromLock,
  validateLicenseCompliance,
  validateThirdPartyDirectNotices,
} from './check-license-compliance.mjs';
import { checkWorkflowDirectory } from './check-workflow-action-pins.mjs';
import {
  isDeclaredOssPath,
  normalizeExternalPackageSpecifier,
  readOssDistributionManifest,
} from './oss-public-distribution.mjs';
import { resolveOssSourceClosure } from './oss-public-source-closure.mjs';
import { serializePublicPackageLock } from './oss-public-lockfile.mjs';
import { PROFILE_CAPABILITIES } from '../packages/core/src/oss-capabilities.js';

const IGNORED_DIRECTORIES = new Set(['.git', '.vite', 'artifacts', 'dist', 'node_modules', 'output']);
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.svg', '.ts', '.tsx', '.txt', '.xml', '.yml', '.yaml']);
const SOURCE_SCAN_IGNORED = new Set([
  'profiles/oss-public-distribution.json',
  'scripts/check-oss-distribution.mjs',
  'scripts/check-oss-distribution.test.mjs',
  'scripts/check-public-surface.mjs',
]);
const SECRET_SCAN_IGNORED = new Set([
  'scripts/check-oss-distribution.mjs',
  'scripts/check-oss-distribution.test.mjs',
]);
const PUBLIC_MODULE_SOURCE_PREFIXES = Object.freeze([
  'apps/web-oss/src/',
  'components/public-workspace/',
  'packages/core/src/',
  'packages/features-personal/src/ai/',
  'packages/public-delivery/src/',
  'packages/web-shell/src/',
]);
export const PUBLIC_DELIVERY_RUNTIME_DEPENDENCIES = Object.freeze([
  'html2canvas',
  'modern-screenshot',
  'pdf-lib',
]);
const PUBLIC_DELIVERY_SOURCE_PREFIX = 'packages/public-delivery/src/';
const OSS_E2E_SCRIPT_PATH = 'scripts/test-oss-e2e.mjs';
const OSS_E2E_SCRIPT_COMMAND = `node ${OSS_E2E_SCRIPT_PATH} --candidate .`;
const PUBLIC_MODULE_FORBIDDEN_PATTERNS = Object.freeze([
  ['private application component', /\b(?:AppImpl|DraftSidebar)\b/u],
  ['private subsystem import', /(?:from\s*|import\s*\()\s*['"`][^'"`]*(?:\/(?:account|auth|billing|drafts?|entitlement|mcp|quota|moderation|telemetry|hosted|watermark|upgrade))(?:\/|['"`])/iu],
  ['private subsystem symbol', /\b(?:Account\w*|Auth(?:Client|Adapter|Provider|User)|Billing\w*|Draft(?:Sidebar|Store|Box|Api|Client)|Entitlement\w*|MCP[A-Za-z_]\w*|Mcp[A-Za-z_]\w*|Quota\w*|Moderation\w*|Telemetry\w*|Hosted\w*|Watermark\w*|Upgrade\w*)\b/u],
  ['private workspace package', /@morndraft\/(?:features-(?:pro|ide)|workspace-private)\b/u],
  ['private MornDraft API', /\/api\//u],
]);

export const SOURCE_MARKER_PATTERNS = Object.freeze({
  'private API surface': /\/api\/(?:dev\/)?(?:ai|auth|billing|drafts|editor|hosted-link|internal\/admin-data|mcp|me|sms|telemetry)\b/gi,
  'private dependency marker': /(?:@modelcontextprotocol\/sdk|@paddle\/paddle-node-sdk|@alicloud\/(?:dypnsapi20170525|green20220302)|@volcengine\/openapi|better-auth|node-postgres|pg-native|["'`]resend["'`]|node_modules\/resend)/gi,
  'private AI provider or usage marker': /(?:DeepSeek|DEEPSEEK|ai_usage_events|aiTokenUsage|usageLedger|AI_USAGE_LEDGER)/g,
  'hosted share link marker': /(?:\/delivery\/hosted-link|hostedLinkHtmlOptimizer|privateHostedLink|HOSTED_LINK_|hostedLinkView|hostedLink|shareLinkUpgradeToast)/g,
  'private payment marker': /(?:alipay|paddle|subscriptionCheckout|subscriptionCouponCenter)/gi,
  'private entitlement or account-plan implementation marker': /(?:MORNDRAFT_(?:ACCOUNT_PLANS|ACCOUNT_REGIONS|ENTITLEMENTS|QUOTA_METERS|USAGE_EVENT_TYPES)|FREE_MORNDRAFT_FLAT_LAYOUT_STYLES|resolveMornDraftFlatLayoutTier|(?:acct|token)_(?:free|pro)_mcp)/g,
  'private workspace package marker': /(?:@morndraft\/features-(?:pro|ide)|packages\/features-(?:pro|ide)|@morndraft\/features-personal(?!\/ai\b)|packages\/features-personal(?!\/src\/ai(?:\/|\b)))/g,
  'production filesystem or storage credential marker': /(?:\/etc\/morndraft\/prod\.env|VOLCENGINE_TOS_ACCESS_KEY_(?:ID|SECRET)|AWS4-HMAC-SHA256)/g,
  'production asset mutation marker': /(?:uploadCommand|deleteTosObjects|parseListObjectsResponse|buildDeleteObjectsXml)/g,
});

const sortedUniqueStrings = (values) => [...new Set(values)].sort();

export function collectPublicDeliveryModuleSpecifiers(content) {
  const specifiers = [];
  const sourceFile = ts.createSourceFile(
    'public-module.tsx',
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression
      && ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

export function validateCandidateScriptImportClosure({
  filePaths,
  manifest,
  scriptSources,
}) {
  const findings = [];
  const allowedPackages = new Set([
    ...(manifest.runtimeDependencies ?? []),
    ...(manifest.devDependencies ?? []),
  ]);
  for (const [relativePath, content] of Object.entries(scriptSources ?? {})) {
    for (const specifier of collectPublicDeliveryModuleSpecifiers(content)) {
      if (specifier.startsWith('.')) {
        const resolvedPath = path.posix.normalize(path.posix.join(
          path.posix.dirname(relativePath),
          specifier,
        ));
        if (
          resolvedPath === '..'
          || resolvedPath.startsWith('../')
          || path.posix.isAbsolute(resolvedPath)
          || !filePaths.has(resolvedPath)
        ) {
          findings.push(`${relativePath}: script import is missing from the OSS candidate: ${specifier}`);
        }
        continue;
      }
      const packageName = normalizeExternalPackageSpecifier(specifier);
      if (packageName && !allowedPackages.has(packageName)) {
        findings.push(`${relativePath}: script imports undeclared OSS dependency ${packageName}`);
      }
    }
  }
  return findings;
}

export function validatePublicDeliverySourceContract({
  declaredDependencies,
  externalSpecifiers,
  localImportSpecifiers,
  sourceFiles,
}) {
  const findings = [];
  const allowedDependencies = [...PUBLIC_DELIVERY_RUNTIME_DEPENDENCIES].sort();
  const declared = sortedUniqueStrings(declaredDependencies ?? []);
  const external = sortedUniqueStrings(externalSpecifiers ?? []);
  if (JSON.stringify(declared) !== JSON.stringify(allowedDependencies)) {
    findings.push(
      `public-delivery dependencies must be exactly ${allowedDependencies.join(', ')}; found ${declared.join(', ') || 'none'}`,
    );
  }
  if (JSON.stringify(external) !== JSON.stringify(allowedDependencies)) {
    const workspaceImports = external.filter(specifier => specifier.startsWith('@morndraft/'));
    if (workspaceImports.length > 0) {
      findings.push(`public-delivery forbids workspace imports: ${workspaceImports.join(', ')}`);
    }
    const unsupported = external.filter(specifier => !allowedDependencies.includes(specifier));
    if (unsupported.length > 0) {
      findings.push(`public-delivery imports unsupported external packages: ${unsupported.join(', ')}`);
    }
    const missing = allowedDependencies.filter(specifier => !external.includes(specifier));
    if (missing.length > 0) {
      findings.push(`public-delivery does not import its declared runtime dependencies: ${missing.join(', ')}`);
    }
  }
  const nonRelativeImports = sortedUniqueStrings(localImportSpecifiers ?? [])
    .filter(specifier => !specifier.startsWith('.'));
  if (nonRelativeImports.length > 0) {
    findings.push(`public-delivery local imports must be relative: ${nonRelativeImports.join(', ')}`);
  }
  const escapedSourceFiles = sortedUniqueStrings(sourceFiles ?? [])
    .filter(relativePath => !relativePath.startsWith(PUBLIC_DELIVERY_SOURCE_PREFIX));
  if (escapedSourceFiles.length > 0) {
    findings.push(`public-delivery relative source closure escaped its package: ${escapedSourceFiles.join(', ')}`);
  }
  return findings;
}

const SECRET_PATTERNS = Object.freeze([
  ['private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['Aliyun access key', /\bLTAI[A-Za-z0-9]{12,}\b/g],
  ['OpenAI-style secret key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ['assigned production secret', /\bMORNDRAFT_[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|KEY)\s*=\s*[^\s'"$<]{8,}/g],
]);

function repoPath(baseDir, filePath) {
  return path.relative(baseDir, filePath).split(path.sep).join('/');
}

export async function collectDistributionFiles(projectDir) {
  const files = [];
  const symlinks = [];
  const nestedReservedDirectories = [];
  async function walk(directory, isRoot = false) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const entryPath = path.join(directory, entry.name);
      const relativePath = repoPath(projectDir, entryPath);
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
        if (!isRoot) nestedReservedDirectories.push(relativePath);
        continue;
      }
      if (entry.isSymbolicLink()) {
        symlinks.push(relativePath);
      } else if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile()) {
        files.push({ path: entryPath, relativePath });
      }
    }
  }
  await walk(projectDir, true);
  return { files, nestedReservedDirectories, symlinks };
}

function sameStringSet(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

export function validatePublicPackageContract({ filePaths, packageJson, manifest }) {
  const findings = [];
  if (packageJson.name !== manifest.packageName) findings.push(`package.json name must be ${manifest.packageName}`);
  if (packageJson.private !== true) findings.push('package.json must use private: true to block accidental npm publication');
  if (packageJson.license !== 'Apache-2.0') findings.push('package.json license must be Apache-2.0');
  if (packageJson.morndraftDistribution !== manifest.profile) {
    findings.push(`package.json morndraftDistribution must be ${manifest.profile}`);
  }
  if (packageJson.engines?.node !== '>=22') findings.push('package.json engines.node must be >=22');
  if (!sameStringSet(Object.keys(packageJson.dependencies ?? {}), manifest.runtimeDependencies)) {
    findings.push('package.json runtime dependencies must exactly match the OSS manifest');
  }
  if (!sameStringSet(Object.keys(packageJson.devDependencies ?? {}), manifest.devDependencies)) {
    findings.push('package.json dev dependencies must exactly match the OSS manifest');
  }
  const testScript = packageJson.scripts?.test ?? '';
  if (!testScript || /[*?{}]/.test(testScript)) {
    findings.push('package.json test script must list a nonzero explicit test set without globs');
  }
  for (const testFile of manifest.testFiles) {
    if (!testScript.includes(testFile)) findings.push(`package.json test script is missing ${testFile}`);
  }
  if (packageJson.scripts?.['test:e2e:oss'] !== OSS_E2E_SCRIPT_COMMAND) {
    findings.push(`package.json test:e2e:oss must be exactly ${OSS_E2E_SCRIPT_COMMAND}`);
  }
  if (!manifest.copyFiles?.includes(OSS_E2E_SCRIPT_PATH)) {
    findings.push(`${OSS_E2E_SCRIPT_PATH} must be declared in the positive OSS manifest`);
  }
  if (filePaths && !filePaths.has(OSS_E2E_SCRIPT_PATH)) {
    findings.push(`${OSS_E2E_SCRIPT_PATH} is missing from the OSS candidate`);
  }
  if (!packageJson.scripts?.['build:oss']?.includes(`MORNDRAFT_BUILD_PRESET=${manifest.buildPreset}`)) {
    findings.push(`package.json build:oss must force ${manifest.buildPreset}`);
  }
  if (packageJson.scripts?.typecheck !== 'tsc --noEmit') {
    findings.push('package.json must expose the deterministic tsc --noEmit typecheck gate');
  }
  if (!packageJson.scripts?.prepublishOnly?.includes('not as an npm package')) {
    findings.push('package.json must include the OSS npm publication guard');
  }
  return findings;
}

export function validateScorecardWorkflow(workflowText) {
  const findings = [];
  if (!/^permissions: read-all\s*$/m.test(workflowText)) {
    findings.push('OpenSSF Scorecard workflow must keep global permissions read-only');
  }
  if (!/^ {4}permissions:\s*$[\s\S]*?^ {6}contents: read\s*$[\s\S]*?^ {6}security-events: write\s*$[\s\S]*?^ {6}id-token: write\s*$/m.test(workflowText)) {
    findings.push('OpenSSF Scorecard write permissions must be scoped to the scorecard job');
  }
  if (!/ossf\/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a\b/.test(workflowText)) {
    findings.push('OpenSSF Scorecard action must use the verified v2.4.3 commit, not its annotated tag object');
  }
  if (!/github\/codeql-action\/upload-sarif@02c5e83432fe5497fd85b873b6c9f16a8578e1d9\b/.test(workflowText)) {
    findings.push('Scorecard SARIF upload must use the verified CodeQL v3.37.0 commit, not its annotated tag object');
  }
  return findings;
}

export function validateCodeqlWorkflow(workflowText) {
  const findings = [];
  for (const action of ['init', 'analyze']) {
    if (!new RegExp(`github/codeql-action/${action}@02c5e83432fe5497fd85b873b6c9f16a8578e1d9\\b`).test(workflowText)) {
      findings.push(`CodeQL ${action} must use the verified v3.37.0 commit, not its annotated tag object`);
    }
  }
  return findings;
}

export function validateNestedPackageDependencies({ packageJson, relativePath, manifest }) {
  const findings = [];
  const declaredExternalDependencies = new Set([
    ...manifest.runtimeDependencies,
    ...manifest.devDependencies,
  ]);
  for (const dependencyType of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, version] of Object.entries(packageJson[dependencyType] ?? {})) {
      const isDeclaredWorkspaceLink = manifest.workspacePackages.includes(name) && String(version).startsWith('file:');
      if (!isDeclaredWorkspaceLink && !declaredExternalDependencies.has(name)) {
        findings.push(`${relativePath}: ${dependencyType} contains undeclared OSS dependency ${name}`);
      }
    }
  }
  return findings;
}

export function validateTsconfigPathTargets({ tsconfig, filePaths }) {
  const findings = [];
  const paths = tsconfig?.compilerOptions?.paths;
  if (!paths || typeof paths !== 'object' || Array.isArray(paths)) {
    return ['tsconfig.json must declare explicit OSS path aliases'];
  }

  for (const [alias, targets] of Object.entries(paths)) {
    if (!Array.isArray(targets) || targets.length === 0) {
      findings.push(`tsconfig.json path ${alias} must have at least one target`);
      continue;
    }
    for (const target of targets) {
      if (typeof target !== 'string' || !target || target.includes('*')) {
        findings.push(`tsconfig.json path ${alias} must use a literal file target`);
        continue;
      }
      const normalizedTarget = path.posix.normalize(target.replace(/^\.\//, ''));
      if (
        normalizedTarget === '..'
        || normalizedTarget.startsWith('../')
        || path.posix.isAbsolute(normalizedTarget)
        || !filePaths.has(normalizedTarget)
      ) {
        findings.push(`tsconfig.json path ${alias} points to missing target ${target}`);
      }
    }
  }
  return findings;
}

export function findSensitiveText(relativePath, content) {
  const findings = [];
  for (const [label, pattern] of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push(`${relativePath}: ${label}`);
  }
  return findings;
}

export function validatePublicModuleSourceBoundary(
  relativePath,
  content,
  { resolvedSource = false } = {},
) {
  if (
    (!resolvedSource && !PUBLIC_MODULE_SOURCE_PREFIXES.some((prefix) => relativePath.startsWith(prefix)))
    || /\.test\.[cm]?[jt]sx?$/u.test(relativePath)
  ) return [];
  const findings = [];
  if (collectPublicDeliveryModuleSpecifiers(content).includes('@morndraft/core')) {
    findings.push(`${relativePath}: broad @morndraft/core import; use @morndraft/core/oss-public`);
  }
  for (const [label, pattern] of PUBLIC_MODULE_FORBIDDEN_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) findings.push(`${relativePath}: ${label}`);
  }
  return findings;
}

export function validateResolvedSourceClosure({ actualFiles, manifest, recordedFiles }) {
  const findings = [];
  if ((recordedFiles ?? []).length === 0) {
    findings.push('profiles/oss-public-distribution.json must record the exporter-resolved source closure');
  }
  if (!sameStringSet(actualFiles ?? [], recordedFiles ?? [])) {
    const actual = new Set(actualFiles ?? []);
    const recorded = new Set(recordedFiles ?? []);
    const missing = [...actual].filter(file => !recorded.has(file));
    const stale = [...recorded].filter(file => !actual.has(file));
    findings.push(
      `exporter-resolved source closure is stale (missing: ${missing.join(', ') || 'none'}; extra: ${stale.join(', ') || 'none'})`,
    );
  }
  for (const relativePath of actualFiles ?? []) {
    if (!isDeclaredOssPath(manifest, relativePath)) {
      findings.push(`${relativePath}: resolved OSS source is outside the positive distribution manifest`);
    }
  }
  return findings;
}

export async function validatePublicDeliveryPackageBoundary({ files, projectDir }) {
  const sourceFiles = files.filter(file => (
    file.relativePath.startsWith(PUBLIC_DELIVERY_SOURCE_PREFIX)
    && /\.[cm]?[jt]sx?$/u.test(file.relativePath)
    && !/\.test\.[cm]?[jt]sx?$/u.test(file.relativePath)
  ));
  const externalSpecifiers = [];
  const localImportSpecifiers = [];
  const escapedRelativeImports = [];
  for (const file of sourceFiles) {
    const content = await readFile(file.path, 'utf8');
    for (const specifier of collectPublicDeliveryModuleSpecifiers(content)) {
      if (!specifier.startsWith('.')) {
        externalSpecifiers.push(specifier);
        continue;
      }
      localImportSpecifiers.push(specifier);
      const resolvedImport = path.posix.normalize(path.posix.join(
        path.posix.dirname(file.relativePath),
        specifier,
      ));
      if (!resolvedImport.startsWith(PUBLIC_DELIVERY_SOURCE_PREFIX)) {
        escapedRelativeImports.push(`${file.relativePath} -> ${specifier}`);
      }
    }
  }
  const packageJson = JSON.parse(await readFile(
    path.join(projectDir, 'packages', 'public-delivery', 'package.json'),
    'utf8',
  ));
  const findings = validatePublicDeliverySourceContract({
    declaredDependencies: Object.keys(packageJson.dependencies ?? {}),
    externalSpecifiers,
    localImportSpecifiers,
    sourceFiles: sourceFiles.map(file => file.relativePath),
  });
  if (escapedRelativeImports.length > 0) {
    findings.push(`public-delivery relative imports escaped its package: ${escapedRelativeImports.join(', ')}`);
  }
  return findings;
}

function countPattern(content, pattern) {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(content)) {
    count += 1;
    if (pattern.lastIndex === 0) pattern.lastIndex += 1;
  }
  return count;
}

async function validateSourceMarkers({ files, manifest }) {
  const findings = [];
  const actual = new Map();
  for (const file of files) {
    if (SOURCE_SCAN_IGNORED.has(file.relativePath) || !TEXT_EXTENSIONS.has(path.extname(file.relativePath))) continue;
    const content = await readFile(file.path, 'utf8');
    for (const [label, pattern] of Object.entries(SOURCE_MARKER_PATTERNS)) {
      const count = countPattern(content, pattern);
      if (count > 0) actual.set(`${label}\0${file.relativePath}`, count);
    }
  }

  for (const [label, allowances] of Object.entries(manifest.sourceMarkerAllowances)) {
    if (!SOURCE_MARKER_PATTERNS[label]) {
      findings.push(`manifest has unknown source marker label ${label}`);
      continue;
    }
    for (const [relativePath, expectedCount] of Object.entries(allowances)) {
      const key = `${label}\0${relativePath}`;
      const actualCount = actual.get(key) ?? 0;
      if (actualCount !== expectedCount) {
        findings.push(`${relativePath}: ${label} allowance expected ${expectedCount}, found ${actualCount}`);
      }
      actual.delete(key);
    }
  }
  for (const [key, count] of actual) {
    const [label, relativePath] = key.split('\0');
    findings.push(`${relativePath}: unreviewed ${label} occurrence count ${count}`);
  }
  return findings;
}

async function validateProfiles(projectDir, manifest) {
  const findings = [];
  const profileDir = path.join(projectDir, 'profiles');
  const profileFiles = (await readdir(profileDir))
    .filter(fileName => fileName.endsWith('.json'))
    .sort();
  const expectedProfileFiles = ['build-presets.json', 'oss-public-distribution.json', `${manifest.profile}.json`].sort();
  if (!sameStringSet(profileFiles, expectedProfileFiles)) {
    findings.push(`profiles must contain only ${expectedProfileFiles.join(', ')}; found ${profileFiles.join(', ')}`);
  }
  const profile = JSON.parse(await readFile(path.join(profileDir, `${manifest.profile}.json`), 'utf8'));
  if (profile.id !== manifest.profile || profile.securityBoundary !== 'public-client') {
    findings.push(`${manifest.profile} profile must use id ${manifest.profile} and public-client security boundary`);
  }
  if (!sameStringSet(profile.allowedPackages ?? [], manifest.workspacePackages)) {
    findings.push(`${manifest.profile} profile allowedPackages must exactly match the public workspace package manifest`);
  }
  if (!sameStringSet(profile.capabilities ?? [], PROFILE_CAPABILITIES.oss ?? [])) {
    findings.push(`${manifest.profile} profile capabilities must exactly match the minimal OSS capability registry`);
  }
  const buildPresets = JSON.parse(await readFile(path.join(profileDir, 'build-presets.json'), 'utf8'));
  if (buildPresets.schemaVersion !== 1 || buildPresets.presets?.length !== 1) {
    findings.push('public build presets must contain exactly one schemaVersion 1 preset');
  } else if (
    buildPresets.presets[0].id !== manifest.buildPreset ||
    buildPresets.presets[0].profile !== manifest.profile
  ) {
    findings.push(`public build preset must be ${manifest.buildPreset} -> ${manifest.profile}`);
  }
  return findings;
}

async function validateLicenseProjection(projectDir, lock) {
  const registerEntries = parseLicenseReviewRegister(
    await readFile(path.join(projectDir, 'docs', 'license-review-register.md'), 'utf8'),
  );
  const analysis = analyzeLicenseEntries(readLicenseEntriesFromLock(lock));
  const validation = validateLicenseCompliance(analysis, { registerEntries, release: true });
  const notices = parseThirdPartyDirectNotices(
    await readFile(path.join(projectDir, 'THIRD_PARTY_NOTICES.md'), 'utf8'),
  );
  return [
    ...validation.messages,
    ...validateThirdPartyDirectNotices(readDirectDependencyEntriesFromLock(lock), notices),
  ];
}

export async function checkOssDistribution(projectDir) {
  const findings = [];
  const manifest = await readOssDistributionManifest(projectDir);
  const { files, nestedReservedDirectories, symlinks } = await collectDistributionFiles(projectDir);
  for (const symlink of symlinks) findings.push(`${symlink}: symbolic links are forbidden in the OSS source distribution`);
  for (const reservedDirectory of nestedReservedDirectories) {
    findings.push(`${reservedDirectory}: nested generated or repository directory is forbidden`);
  }

  const filePaths = new Set(files.map(file => file.relativePath));
  let actualResolvedSourceFiles = [];
  try {
    const resolved = await resolveOssSourceClosure({ manifest, projectDir });
    actualResolvedSourceFiles = resolved.files;
    findings.push(...validateResolvedSourceClosure({
      actualFiles: resolved.files,
      manifest,
      recordedFiles: manifest.resolvedSourceClosure ?? [],
    }));
    const undeclaredExternalPackages = resolved.externalPackages.filter(
      packageName => !manifest.runtimeDependencies.includes(packageName),
    );
    if (undeclaredExternalPackages.length > 0) {
      findings.push(`resolved OSS source imports undeclared runtime dependencies: ${undeclaredExternalPackages.join(', ')}`);
    }
  } catch (cause) {
    findings.push(`failed to recompute the OSS source closure: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  const resolvedSourceClosure = new Set(actualResolvedSourceFiles);
  const requiredFiles = new Set(manifest.requiredFiles);
  for (const requiredFile of manifest.requiredFiles) {
    if (!filePaths.has(requiredFile)) findings.push(`${requiredFile}: required OSS distribution file is missing`);
  }
  for (const file of files) {
    if (!isDeclaredOssPath(manifest, file.relativePath) && !requiredFiles.has(file.relativePath)) {
      findings.push(`${file.relativePath}: file is outside the positive OSS distribution manifest`);
    }
    if (/^(?:\.env(?:\.|$)|\.npmrc$)|\.(?:key|pem|p12|pfx)$/i.test(path.basename(file.relativePath))) {
      findings.push(`${file.relativePath}: secret-bearing file type is forbidden`);
    }
    if (TEXT_EXTENSIONS.has(path.extname(file.relativePath)) && !SECRET_SCAN_IGNORED.has(file.relativePath)) {
      const content = await readFile(file.path, 'utf8');
      findings.push(...findSensitiveText(file.relativePath, content));
      findings.push(...validatePublicModuleSourceBoundary(file.relativePath, content, {
        resolvedSource: resolvedSourceClosure.has(file.relativePath),
      }));
    }
  }
  const candidateScriptSources = Object.fromEntries(await Promise.all(files
    .filter(file => (
      /^scripts\/.*\.(?:js|mjs)$/u.test(file.relativePath)
      && !/\.test\.(?:js|mjs)$/u.test(file.relativePath)
    ))
    .map(async file => [file.relativePath, await readFile(file.path, 'utf8')])));
  findings.push(...validateCandidateScriptImportClosure({
    filePaths,
    manifest,
    scriptSources: candidateScriptSources,
  }));
  findings.push(...await validatePublicDeliveryPackageBoundary({ files, projectDir }));

  const actualTests = files
    .map(file => file.relativePath)
    .filter(relativePath => /\.test\.[cm]?[jt]sx?$/.test(relativePath))
    .sort();
  if (actualTests.length === 0) findings.push('OSS distribution must contain at least one executable test');
  if (!sameStringSet(actualTests, manifest.testFiles)) {
    findings.push(`OSS test set must exactly match the manifest (${actualTests.length}/${manifest.testFiles.length})`);
  }

  const packageJson = JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf8'));
  findings.push(...validatePublicPackageContract({ filePaths, packageJson, manifest }));
  const tsconfig = JSON.parse(await readFile(path.join(projectDir, 'tsconfig.json'), 'utf8'));
  findings.push(...validateTsconfigPathTargets({ tsconfig, filePaths }));
  for (const file of files.filter(entry => /^packages\/[^/]+\/package\.json$/.test(entry.relativePath))) {
    findings.push(...validateNestedPackageDependencies({
      packageJson: JSON.parse(await readFile(file.path, 'utf8')),
      relativePath: file.relativePath,
      manifest,
    }));
  }
  const lockPath = path.join(projectDir, 'package-lock.json');
  const lockText = await readFile(lockPath, 'utf8');
  const lock = JSON.parse(lockText);
  const expectedLockText = serializePublicPackageLock({ sourceLock: lock, publicPackageJson: packageJson });
  if (lockText !== expectedLockText) {
    findings.push('package-lock.json must be the canonical dependency closure of package.json with no orphan/private packages');
  }
  findings.push(...await validateProfiles(projectDir, manifest));
  findings.push(...await validateLicenseProjection(projectDir, lock));
  findings.push(...await validateSourceMarkers({ files, manifest }));
  findings.push(...await checkWorkflowDirectory(projectDir));
  findings.push(...validateScorecardWorkflow(
    await readFile(path.join(projectDir, '.github', 'workflows', 'scorecard.yml'), 'utf8'),
  ));
  findings.push(...validateCodeqlWorkflow(
    await readFile(path.join(projectDir, '.github', 'workflows', 'codeql.yml'), 'utf8'),
  ));
  return findings;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectDir = path.resolve(scriptDir, '..');
  const findings = await checkOssDistribution(projectDir);
  if (findings.length > 0) {
    console.error('[oss-distribution] Public source distribution violations found:');
    for (const finding of findings) console.error(`- ${finding}`);
    process.exitCode = 1;
    return;
  }
  console.log('[oss-distribution] Positive manifest, canonical lock, tests, profile, source markers, secrets, licenses, and workflows verified.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
