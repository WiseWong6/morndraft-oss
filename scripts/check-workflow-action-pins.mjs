/* global console, process */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ACTION_SHA_PATTERN = /^[0-9a-f]{40}$/i;

export function validateWorkflowActionPins({ relativePath, content }) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  let checkoutCount = 0;
  let checkoutCredentialGuards = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const usesMatch = lines[index].match(/^\s*-?\s*uses:\s*["']?([^\s"']+)["']?/);
    if (!usesMatch) continue;
    const action = usesMatch[1];
    if (action.startsWith('./') || action.startsWith('docker://')) continue;
    const separatorIndex = action.lastIndexOf('@');
    const reference = separatorIndex >= 0 ? action.slice(separatorIndex + 1) : '';
    if (!ACTION_SHA_PATTERN.test(reference)) {
      findings.push(`${relativePath}:${index + 1}: action must be pinned to a full commit SHA (${action})`);
    }
    if (!action.startsWith('actions/checkout@')) continue;
    checkoutCount += 1;
    const followingBlock = lines.slice(index + 1, index + 7).join('\n');
    if (/persist-credentials:\s*false\b/.test(followingBlock)) checkoutCredentialGuards += 1;
  }

  const jobCount = lines.filter(line => /^\s+runs-on:\s*\S+\s*$/.test(line)).length;
  const timeoutCount = lines.filter(line => /^\s+timeout-minutes:\s*[1-9][0-9]*\s*$/.test(line)).length;
  if (jobCount > 0 && timeoutCount < jobCount) {
    findings.push(`${relativePath}: every job must declare timeout-minutes (${timeoutCount}/${jobCount})`);
  }
  if (!/^permissions:\s*$/m.test(content)) {
    findings.push(`${relativePath}: workflow must declare explicit top-level permissions`);
  }
  if (/^permissions:\s*write-all\s*$/m.test(content) || /^\s+contents:\s*write\s*$/m.test(content)) {
    findings.push(`${relativePath}: workflow permissions are broader than the public checks require`);
  }
  if (checkoutCredentialGuards !== checkoutCount) {
    findings.push(`${relativePath}: every checkout step must set persist-credentials: false`);
  }
  return findings;
}

export async function checkWorkflowDirectory(projectDir) {
  const workflowDir = path.join(projectDir, '.github', 'workflows');
  const entries = await readdir(workflowDir, { withFileTypes: true });
  const findings = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
    const relativePath = `.github/workflows/${entry.name}`;
    findings.push(...validateWorkflowActionPins({
      relativePath,
      content: await readFile(path.join(workflowDir, entry.name), 'utf8'),
    }));
  }
  return findings;
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectDir = path.resolve(scriptDir, '..');
  const findings = await checkWorkflowDirectory(projectDir);
  if (findings.length > 0) {
    console.error('[workflow-pins] Workflow hardening violations found:');
    for (const finding of findings) console.error(`- ${finding}`);
    process.exitCode = 1;
    return;
  }
  console.log('[workflow-pins] All third-party actions use full commit SHAs; timeouts and checkout credential guards are present.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
