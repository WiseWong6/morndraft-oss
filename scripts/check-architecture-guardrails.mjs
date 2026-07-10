/* global console, process */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatBudgetReport,
  loadArchitectureGuardrailsConfig,
  runArchitectureGuardrails,
} from './architecture-guardrails-lib.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const configPath = path.join(scriptDir, 'architecture-guardrails.config.json');
const isReportMode = process.argv.includes('--report');

const config = await loadArchitectureGuardrailsConfig(configPath);
const result = await runArchitectureGuardrails(projectDir, config);

if (isReportMode) {
  console.log('[architecture-guardrails] Soft warning report:');
  console.log(formatBudgetReport(result.budgetReports, { softOnly: true }));
  if (result.findings.length > 0) {
    console.log('\n[architecture-guardrails] Hard findings:');
    for (const finding of result.findings) {
      console.log(`- ${finding}`);
    }
  }
} else if (result.findings.length > 0) {
  console.error('[architecture-guardrails] Case-by-case/module boundary risks found:');
  for (const finding of result.findings) {
    console.error(`- ${finding}`);
  }
  process.exitCode = 1;
} else {
  console.log('[architecture-guardrails] Module budgets, sample-marker scan, and core purity passed.');
}
