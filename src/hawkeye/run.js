#!/usr/bin/env node
// HawkEye scan orchestrator.
//   node src/hawkeye/run.js                 # scan active watchlist + generate brief
//   node src/hawkeye/run.js --company=<id>  # scan a single company (no brief)
import { store } from '../lib/store.js';
import { seedIfEmpty } from './seed.js';
import { collectCompany } from './collect.js';
import { analyzeEvidence, findDuplicate, getAiCalls, resetAiCalls } from './analyze.js';
import { generateBrief } from './brief.js';
import { enabled, limits } from './settings.js';
import { DRY_RUN } from '../config.js';

export async function runScan({ companyId = null } = {}) {
  if (!enabled) { console.log('[hawkeye] HAWKEYE_ENABLED=false — skipping'); return null; }
  resetAiCalls();
  await seedIfEmpty();

  const [run] = await store.insert('hawkeye_runs', {
    status: 'running', companies_scanned: 0, signals_created: 0, ai_calls: 0,
    errors: [], started_at: new Date().toISOString(),
  });

  let companies = (await store.select('hawkeye_companies'))
    .filter(c => c.active !== false)
    .sort((a, b) => (a.priority || 3) - (b.priority || 3));
  if (companyId) companies = companies.filter(c => c.id === companyId);
  companies = companies.slice(0, limits.maxCompaniesPerRun);

  console.log(`[hawkeye] scanning ${companies.length} company(ies) ${DRY_RUN ? '(DRY RUN)' : ''}`);
  const errors = [];
  const createdSignals = [];
  const recent = await store.select('hawkeye_signals');

  for (const company of companies) {
    try {
      const evidence = await collectCompany(company);
      for (const bundle of evidence) {
        if (getAiCalls() >= limits.maxAiCallsPerRun) {
          console.warn(`[hawkeye] AI call cap (${limits.maxAiCallsPerRun}) reached — remaining evidence deferred to next run`);
          break;
        }
        const signal = await analyzeEvidence(company, bundle);

        const dup = findDuplicate(signal, [...recent, ...createdSignals]);
        if (dup) {
          const mergedUrls = [...new Set([...(dup.source_urls || []), ...signal.source_urls])];
          await store.update('hawkeye_signals', dup.id, { source_urls: mergedUrls });
          console.log(`[hawkeye] duplicate merged into existing signal: ${signal.headline.slice(0, 60)}`);
          continue;
        }
        if (signal.priority_band === 'noise' || signal.total_score < limits.minSignalScore) {
          signal.status = 'noise';
        }
        const [row] = await store.insert('hawkeye_signals', { ...signal, run_id: run.id });
        createdSignals.push(row);
        console.log(`[hawkeye] ${signal.priority_band.toUpperCase().padEnd(8)} ${signal.total_score}/100  ${company.name}: ${signal.headline.slice(0, 70)}`);
      }
      await store.update('hawkeye_companies', company.id, { last_checked: new Date().toISOString() });
    } catch (err) {
      errors.push({ company: company.name, error: String(err.message).slice(0, 300) });
      console.warn(`[hawkeye] company scan failed (continuing): ${company.name} — ${err.message}`);
    }
  }

  // Brief only on full watchlist runs
  let brief = null;
  const briefWorthy = createdSignals.filter(s => s.status !== 'noise');
  if (!companyId && briefWorthy.length) {
    try {
      brief = await generateBrief(briefWorthy);
      console.log(`[hawkeye] brief generated with ${briefWorthy.length} signal(s)`);
    } catch (err) {
      errors.push({ company: '(brief)', error: String(err.message).slice(0, 300) });
      console.warn(`[hawkeye] brief generation failed: ${err.message}`);
    }
  }

  await store.update('hawkeye_runs', run.id, {
    status: errors.length ? (createdSignals.length ? 'partial' : 'failed') : 'completed',
    companies_scanned: companies.length,
    signals_created: createdSignals.length,
    ai_calls: getAiCalls(),
    errors,
    finished_at: new Date().toISOString(),
  });

  console.log(`\n[hawkeye] done: ${createdSignals.length} signal(s), ${getAiCalls()} AI call(s), ${errors.length} error(s)${brief ? ', brief ready' : ''}`);
  return { run, signals: createdSignals, brief };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const companyArg = process.argv.find(a => a.startsWith('--company='));
  const secondPass = process.argv.includes('--second-pass'); // DRY_RUN demo: simulate page changes
  if (secondPass) globalThis.__hawkeyeSecondPass = true;
  runScan({ companyId: companyArg ? companyArg.split('=')[1] : null })
    .catch(err => { console.error(err); process.exit(1); });
}
