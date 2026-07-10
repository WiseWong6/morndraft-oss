/* global console, process */
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const registerPath = path.join(projectDir, 'docs/license-review-register.md');
const noticesPath = path.join(projectDir, 'THIRD_PARTY_NOTICES.md');
const approvedConclusion = 'Approved';
const legalReviewConclusion = 'Legal review';
const replaceConclusion = 'Replace';

const allowedLicenses = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MIT',
  'MIT-0',
  'Unlicense',
]);

const licenseOverrides = new Map([
  ['@better-fetch/fetch', {
    license: 'MIT',
    evidence: 'node_modules/@better-fetch/fetch/LICENSE',
  }],
  ['format', {
    license: 'MIT',
    evidence: 'node_modules/format/package.json licenses[0].type',
  }],
  ['khroma', {
    license: 'MIT',
    evidence: 'node_modules/khroma/license',
  }],
]);

const blockedLicensePattern = /\b(?:AGPL|GPL|LGPL|SSPL|BUSL|Commons-Clause)\b/i;
const reviewLicensePattern = /\b(?:BlueOak|CC0|CC-|CDDL|EPL|MPL|Python-2\.0)\b/i;
const licenseTokenAliases = new Map([
  ['Apache2', 'Apache-2.0'],
  ['Apache-2', 'Apache-2.0'],
]);

function packageNameFromPath(packagePath) {
  const normalizedPath = packagePath.replace(/^node_modules\//, '');
  const parts = normalizedPath.split('/node_modules/');
  const last = parts[parts.length - 1] ?? packagePath;
  const segments = last.split('/');
  return last.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function normalizeLicenseValue(license) {
  if (Array.isArray(license)) {
    return license.map(normalizeLicenseValue).filter(Boolean).join(' OR ') || 'UNKNOWN';
  }
  if (license && typeof license === 'object') {
    return normalizeLicenseValue(license.type ?? license.name ?? license.license ?? 'UNKNOWN');
  }
  return String(license ?? 'UNKNOWN');
}

function licenseTokens(license) {
  return normalizeLicenseValue(license)
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !['AND', 'OR', 'WITH'].includes(token))
    .map(token => licenseTokenAliases.get(token) ?? token);
}

function isAllowedLicenseExpression(license) {
  return licenseTokens(license).every(token => allowedLicenses.has(token));
}

function classifyLicense(license) {
  const normalizedLicense = normalizeLicenseValue(license);
  if (!normalizedLicense || normalizedLicense === 'UNKNOWN') return 'blocked';
  if (blockedLicensePattern.test(normalizedLicense)) return 'blocked';
  if (isAllowedLicenseExpression(normalizedLicense)) return 'allowed';
  if (reviewLicensePattern.test(normalizedLicense)) return 'review';
  return 'review';
}

export function readLicenseEntriesFromLock(lock) {
  const packages = lock.packages ?? {};
  return Object.entries(packages)
    .filter(([packagePath]) => packagePath.startsWith('node_modules/'))
    .map(([packagePath, metadata]) => {
      const name = packageNameFromPath(packagePath);
      const override = licenseOverrides.get(name) ?? licenseOverrides.get(packagePath.replace(/^node_modules\//, ''));
      const declaredLicense = normalizeLicenseValue(metadata.license ?? 'UNKNOWN');
      return {
        name,
        path: packagePath.replace(/^node_modules\//, ''),
        version: metadata.version ?? '',
        license: override?.license ?? declaredLicense,
        declaredLicense,
        overrideEvidence: override?.evidence,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function readDirectDependencyEntriesFromLock(lock) {
  const rootPackage = lock.packages?.[''] ?? {};
  const packages = lock.packages ?? {};
  const directDependencyNames = [
    ...new Set([
      ...Object.keys(rootPackage.dependencies ?? {}),
      ...Object.keys(rootPackage.devDependencies ?? {}),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  return directDependencyNames.map(name => {
    const metadata = packages[`node_modules/${name}`] ?? {};
    const override = licenseOverrides.get(name);
    const declaredLicense = normalizeLicenseValue(metadata.license ?? 'UNKNOWN');
    return {
      name,
      version: metadata.version ?? '',
      license: override?.license ?? declaredLicense,
      declaredLicense,
      overrideEvidence: override?.evidence,
    };
  });
}

export function analyzeLicenseEntries(entries) {
  const result = {
    allowed: [],
    review: [],
    blocked: [],
  };

  for (const entry of entries) {
    result[classifyLicense(entry.license)].push(entry);
  }

  return result;
}

function formatEntry(entry) {
  const version = entry.version ? `@${entry.version}` : '';
  const label = entry.path ?? entry.name;
  const override = entry.overrideEvidence && entry.declaredLicense !== entry.license
    ? `; declared ${entry.declaredLicense}; override evidence: ${entry.overrideEvidence}`
    : '';
  return `- ${label}${version}: ${entry.license}${override}`;
}

function stripMarkdownCell(value) {
  return String(value ?? '')
    .trim()
    .replace(/^`|`$/g, '')
    .trim();
}

function splitMarkdownTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map(stripMarkdownCell);
}

function isSeparatorRow(cells) {
  return cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function rowValue(headers, cells, label) {
  const index = headers.indexOf(label);
  return index >= 0 ? stripMarkdownCell(cells[index]) : '';
}

export function parseLicenseReviewRegister(markdown) {
  const entries = [];
  let headers = null;

  for (const line of String(markdown ?? '').split(/\r?\n/)) {
    const cells = splitMarkdownTableRow(line);
    if (!cells) {
      headers = null;
      continue;
    }

    if (cells.includes('包名') && cells.includes('版本') && cells.includes('结论')) {
      headers = cells;
      continue;
    }

    if (!headers || isSeparatorRow(cells)) continue;

    const packageName = rowValue(headers, cells, '包名');
    const version = rowValue(headers, cells, '版本');
    const conclusion = rowValue(headers, cells, '结论');
    if (!packageName || !version || !conclusion) continue;

    entries.push({
      packageName,
      version,
      license: rowValue(headers, cells, '许可证'),
      relationship: rowValue(headers, cells, 'direct or transitive'),
      productionPackage: rowValue(headers, cells, '进入生产包'),
      modified: rowValue(headers, cells, '是否修改'),
      obligations: rowValue(headers, cells, '义务'),
      conclusion,
      evidence: rowValue(headers, cells, '证据'),
    });
  }

  return entries;
}

export function parseThirdPartyDirectNotices(markdown) {
  const entries = [];
  let inDirectDependencies = false;
  let headers = null;

  for (const line of String(markdown ?? '').split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      inDirectDependencies = line.trim() === '## Direct Dependencies';
      headers = null;
      continue;
    }

    if (!inDirectDependencies) continue;

    const cells = splitMarkdownTableRow(line);
    if (!cells) {
      headers = null;
      continue;
    }

    if (cells.includes('Package') && cells.includes('Version') && cells.includes('License')) {
      headers = cells;
      continue;
    }

    if (!headers || isSeparatorRow(cells)) continue;

    const name = rowValue(headers, cells, 'Package');
    const version = rowValue(headers, cells, 'Version');
    const license = rowValue(headers, cells, 'License');
    if (!name || !version || !license) continue;

    entries.push({ name, version, license });
  }

  return entries;
}

export function validateThirdPartyDirectNotices(directEntries, noticeEntries) {
  const messages = [];
  const directByName = new Map(directEntries.map(entry => [entry.name, entry]));
  const noticeByName = new Map();

  for (const noticeEntry of noticeEntries) {
    if (noticeByName.has(noticeEntry.name)) {
      messages.push(`Third-party notices duplicate direct dependency entry for ${noticeEntry.name}.`);
      continue;
    }
    noticeByName.set(noticeEntry.name, noticeEntry);
  }

  for (const directEntry of directEntries) {
    const noticeEntry = noticeByName.get(directEntry.name);
    if (!noticeEntry) {
      messages.push(
        `Third-party notices missing direct dependency entry for ${directEntry.name}@${directEntry.version}.`,
      );
      continue;
    }
    if (noticeEntry.version !== directEntry.version) {
      messages.push(
        `Third-party notices version mismatch for ${directEntry.name}: expected ${directEntry.version}, found ${noticeEntry.version}.`,
      );
    }
    if (noticeEntry.license !== directEntry.license) {
      messages.push(
        `Third-party notices license mismatch for ${directEntry.name}@${directEntry.version}: expected ${directEntry.license}, found ${noticeEntry.license}.`,
      );
    }
  }

  for (const noticeEntry of noticeEntries) {
    if (!directByName.has(noticeEntry.name)) {
      messages.push(
        `Third-party notices direct dependency entry is no longer direct: ${noticeEntry.name}@${noticeEntry.version}.`,
      );
    }
  }

  return messages;
}

function entryLabel(entry) {
  const label = entry.path ?? entry.name;
  return `${label}@${entry.version}`;
}

function findRegisterEntry(registerEntries, entry) {
  const expectedPackage = entry.path ?? entry.name;
  return registerEntries.find(row =>
    row.packageName === expectedPackage &&
    row.version === entry.version
  );
}

function validateRegisteredEntry(entry, row, release, messages) {
  if (row.license && row.license !== entry.license) {
    messages.push(
      `License review register mismatch for ${entryLabel(entry)}: lockfile has ${entry.license}, register has ${row.license}.`,
    );
  }

  if (![approvedConclusion, legalReviewConclusion, replaceConclusion].includes(row.conclusion)) {
    messages.push(
      `License review register conclusion must be Approved, Replace, or Legal review for ${entryLabel(entry)}.`,
    );
    return;
  }

  if (row.conclusion === replaceConclusion) {
    messages.push(`License review register requires replacement before merge: ${entryLabel(entry)}.`);
  }

  if (release && row.conclusion !== approvedConclusion) {
    messages.push(
      `Release gate requires Approved license review for ${entryLabel(entry)}; current conclusion is ${row.conclusion}.`,
    );
  }

  if (entry.overrideEvidence) {
    if (!row.evidence) {
      messages.push(`Resolved license override requires evidence in register for ${entryLabel(entry)}.`);
    }
    if (row.license !== entry.license) {
      messages.push(
        `Resolved license override mismatch for ${entryLabel(entry)}: override is ${entry.license}, register has ${row.license}.`,
      );
    }
  }
}

export function validateLicenseCompliance(result, options = {}) {
  const registerEntries = options.registerEntries ?? [];
  const release = Boolean(options.release);
  const messages = [];
  const registerTrackedEntries = [
    ...result.review,
    ...result.allowed.filter(entry => entry.overrideEvidence),
  ];

  for (const entry of result.blocked) {
    messages.push(`Blocked license: ${entryLabel(entry)} uses ${entry.license}.`);
  }

  for (const entry of registerTrackedEntries) {
    const row = findRegisterEntry(registerEntries, entry);
    if (!row) {
      messages.push(`Missing license review register entry for ${entryLabel(entry)}.`);
      continue;
    }

    validateRegisteredEntry(entry, row, release, messages);
  }

  return {
    ok: messages.length === 0,
    messages,
  };
}

export async function validateOverrideEvidenceFiles(entries, registerEntries, rootDir = projectDir) {
  const messages = [];
  for (const entry of entries.filter(item => item.overrideEvidence)) {
    const row = findRegisterEntry(registerEntries, entry);
    if (!row?.evidence) continue;

    const evidenceCandidates = [
      row.evidence,
      entry.overrideEvidence,
    ].filter(Boolean);

    let found = false;
    for (const candidate of evidenceCandidates) {
      try {
        await access(path.resolve(rootDir, candidate));
        found = true;
        break;
      } catch {
        // Try the next candidate. Report once below if none exist.
      }
    }

    if (!found) {
      messages.push(`Resolved license override evidence file is missing for ${entryLabel(entry)}.`);
    }
  }

  return messages;
}

export function formatLicenseReport(result, validation = null) {
  const lines = [
    '[license-compliance] Package license audit',
    `Allowed licenses: ${result.allowed.length}`,
    `Manual review licenses: ${result.review.length}`,
    `Blocked licenses: ${result.blocked.length}`,
  ];

  if (result.blocked.length > 0) {
    lines.push('', 'Blocked licenses:');
    lines.push(...result.blocked.map(formatEntry));
  }

  if (result.review.length > 0) {
    lines.push('', 'Manual review licenses:');
    lines.push(...result.review.map(formatEntry));
  }

  if (validation) {
    lines.push(
      '',
      validation.ok
        ? validation.okLabel ?? 'License review register: OK'
        : validation.issueLabel ?? 'License review register issues:',
    );
    if (!validation.ok) lines.push(...validation.messages.map(message => `- ${message}`));
  }

  return lines.join('\n');
}

async function main() {
  const release = process.argv.includes('--release');
  const lockPath = path.resolve(projectDir, 'package-lock.json');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  const register = await readFile(registerPath, 'utf8');
  const registerEntries = parseLicenseReviewRegister(register);
  const result = analyzeLicenseEntries(readLicenseEntriesFromLock(lock));
  const directEntries = readDirectDependencyEntriesFromLock(lock);
  const validation = validateLicenseCompliance(result, { registerEntries, release });
  const evidenceMessages = await validateOverrideEvidenceFiles(
    result.allowed.filter(entry => entry.overrideEvidence),
    registerEntries,
  );
  const noticesMessages = release
    ? validateThirdPartyDirectNotices(
        directEntries,
        parseThirdPartyDirectNotices(await readFile(noticesPath, 'utf8')),
      )
    : [];
  const combinedValidation = {
    ok: validation.ok && evidenceMessages.length === 0 && noticesMessages.length === 0,
    messages: [...validation.messages, ...evidenceMessages, ...noticesMessages],
    okLabel: release
      ? 'License review register and third-party notices: OK'
      : 'License review register: OK',
    issueLabel: release
      ? 'License review register / third-party notices issues:'
      : 'License review register issues:',
  };
  const report = formatLicenseReport(result, combinedValidation);

  if (!combinedValidation.ok) {
    console.error(report);
    process.exitCode = 1;
    return;
  }

  console.log(report);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
