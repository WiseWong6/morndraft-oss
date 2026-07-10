import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const testFilePattern = /(?:^|[./-])test\.(?:js|mjs|ts|tsx)$/;
const packageEscapeImportPattern = /from\s+['"](?:\.\.\/){3,}/;
const rootAliasImportPattern = /from\s+['"]@\//;

export async function loadArchitectureGuardrailsConfig(configPath) {
  const content = await readFile(configPath, 'utf8');
  return JSON.parse(content);
}

export async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export function countSourceLines(content) {
  if (!content) return 0;
  const normalized = content.replace(/\r?\n$/, '');
  if (!normalized) return 0;
  return normalized.split(/\r?\n/).length;
}

export function rel(projectDir, filePath) {
  return path.relative(projectDir, filePath).split(path.sep).join('/');
}

export async function collectSourceFiles(rootPath, config) {
  const rootStat = await stat(rootPath);
  if (rootStat.isFile()) return [rootPath];

  const ignoredDirectories = new Set(config.ignoredDirectories ?? []);
  const productionExtensions = new Set(config.productionExtensions ?? ['.js', '.mjs', '.ts', '.tsx']);
  const entries = await readdir(rootPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      files.push(...await collectSourceFiles(entryPath, config));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!productionExtensions.has(path.extname(entry.name))) continue;
    if (testFilePattern.test(entry.name)) continue;
    files.push(entryPath);
  }
  return files;
}

export async function checkLineBudgets(projectDir, config) {
  const findings = [];
  const budgetReports = [];
  for (const budget of config.lineBudgets ?? []) {
    const filePath = path.join(projectDir, budget.path);
    const content = await readFile(filePath, 'utf8');
    const lines = countSourceLines(content);
    const maxLines = budget.maxLines;
    const usagePercent = maxLines > 0 ? (lines / maxLines) * 100 : 0;
    const report = {
      lines,
      maxLines,
      path: budget.path,
      rationale: budget.rationale ?? '',
      reportOnly: budget.reportOnly === true,
      softWarnPercent: budget.softWarnPercent ?? 90,
      suggestedExtractionTarget: budget.suggestedExtractionTarget ?? '',
      usagePercent,
    };
    budgetReports.push(report);
    if (lines > maxLines && report.reportOnly !== true) {
      findings.push(`${budget.path}: ${lines} lines exceeds architecture budget ${maxLines}; extract a module before adding more case-specific logic`);
    }
  }
  return { budgetReports, findings };
}

export async function checkSampleMarkers(projectDir, config) {
  const findings = [];
  const files = [];
  for (const root of config.productionRoots ?? []) {
    const rootPath = path.join(projectDir, root);
    if (!await exists(rootPath)) continue;
    files.push(...await collectSourceFiles(rootPath, config));
  }

  for (const filePath of files) {
    const relativePath = rel(projectDir, filePath);
    const content = await readFile(filePath, 'utf8');
    for (const marker of config.sampleOnlyMarkers ?? []) {
      if (content.includes(marker)) {
        findings.push(`${relativePath}: production code contains sample/acceptance marker "${marker}"`);
      }
    }
  }
  return findings;
}

export async function checkCorePurity(projectDir, config) {
  const coreDir = path.join(projectDir, 'packages/core/src');
  if (!await exists(coreDir)) return [];
  const findings = [];
  const files = (await collectSourceFiles(coreDir, config)).filter(
    (filePath) => !testFilePattern.test(path.basename(filePath)),
  );
  for (const filePath of files) {
    const content = await readFile(filePath, 'utf8');
    for (const forbiddenImport of config.forbiddenCoreImports ?? []) {
      if (content.includes(`from '${forbiddenImport}`) || content.includes(`from "${forbiddenImport}`)) {
        findings.push(`${rel(projectDir, filePath)}: core package must stay UI-independent; found import from ${forbiddenImport}`);
      }
    }
  }
  return findings;
}

export async function checkPackageBoundaries(projectDir, config) {
  const packagesDir = path.join(projectDir, 'packages');
  if (!await exists(packagesDir)) return [];
  const findings = [];
  const files = await collectSourceFiles(packagesDir, config);

  for (const filePath of files) {
    const relativePath = rel(projectDir, filePath);
    const content = await readFile(filePath, 'utf8');
    if (packageEscapeImportPattern.test(content)) {
      findings.push(`${relativePath}: package source must not import back into the root app via ../../../`);
    }
    if (rootAliasImportPattern.test(content)) {
      findings.push(`${relativePath}: package source must not import root app files through @/`);
    }
  }
  return findings;
}

export async function checkForbiddenFileImports(projectDir, config) {
  const findings = [];
  for (const item of config.forbiddenFileImports ?? []) {
    const filePath = path.join(projectDir, item.path);
    const content = await readFile(filePath, 'utf8');
    for (const forbiddenImport of item.imports ?? []) {
      const singleQuoted = `from '${forbiddenImport}'`;
      const doubleQuoted = `from "${forbiddenImport}"`;
      if (content.includes(singleQuoted) || content.includes(doubleQuoted)) {
        findings.push(`${item.path}: import from ${forbiddenImport} belongs in a focused preview module, not the orchestration shell`);
      }
    }
  }
  return findings;
}

export async function runArchitectureGuardrails(projectDir, config) {
  const { budgetReports, findings: lineFindings } = await checkLineBudgets(projectDir, config);
  const findings = [
    ...lineFindings,
    ...await checkSampleMarkers(projectDir, config),
    ...await checkCorePurity(projectDir, config),
    ...await checkPackageBoundaries(projectDir, config),
    ...await checkForbiddenFileImports(projectDir, config),
  ];

  const softWarnings = budgetReports
    .filter((report) => (
      report.usagePercent >= report.softWarnPercent &&
      (report.lines <= report.maxLines || report.reportOnly)
    ))
    .sort((a, b) => b.usagePercent - a.usagePercent);

  return {
    budgetReports: budgetReports.sort((a, b) => b.usagePercent - a.usagePercent),
    findings,
    softWarnings,
  };
}

export function formatBudgetReport(budgetReports, { softOnly = false } = {}) {
  const rows = softOnly
    ? budgetReports.filter((report) => (
        report.usagePercent >= report.softWarnPercent &&
        (report.lines <= report.maxLines || report.reportOnly)
      ))
    : budgetReports;
  if (rows.length === 0) {
    return '[architecture-guardrails] No files are above their soft warning threshold.';
  }
  return rows
    .map((report) => {
      const percent = report.usagePercent.toFixed(1);
      const details = [
        `${report.path}: ${report.lines}/${report.maxLines} lines (${percent}%)${report.reportOnly ? ' [report-only]' : ''}`,
        report.rationale ? `reason: ${report.rationale}` : '',
        report.suggestedExtractionTarget ? `next: ${report.suggestedExtractionTarget}` : '',
      ].filter(Boolean);
      return details.join('\n  ');
    })
    .join('\n');
}
