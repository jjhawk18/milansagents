// Stage 8: Quality control — facts, sources, copyright, voice, claims, SEO.
// A fresh-context reviewer pass; drafts that fail go to qc_failed instead of
// the approval queue.
import { askJSON } from '../lib/claude.js';
import { store } from '../lib/store.js';
import { loadBrands } from '../config.js';

const CHECKS = ['facts', 'sources', 'copyright', 'voice', 'claims', 'seo'];

const SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    checks: {
      type: 'object',
      properties: Object.fromEntries(CHECKS.map(c => [c, {
        type: 'object',
        properties: { pass: { type: 'boolean' }, note: { type: 'string' } },
        required: ['pass', 'note'],
        additionalProperties: false,
      }])),
      required: CHECKS,
      additionalProperties: false,
    },
    notes: { type: 'string' },
  },
  required: ['passed', 'checks', 'notes'],
  additionalProperties: false,
};

export async function qcContent(story, draft) {
  const brand = loadBrands().find(b => b.key === draft.brand);
  const report = await askJSON({
    system: [
      'You are a strict content QC reviewer. Check each dimension:',
      '- facts: every factual statement traces to a verified claim',
      '- sources: the news is attributed; no fabricated citations',
      '- copyright: no verbatim copying from source articles; original framing',
      '- voice: matches the brand voice guide',
      '- claims: violates none of the banned-claims policy',
      '- seo: title/meta/keywords are sane for the format',
      'Fail the draft if facts, claims, or copyright fail. Voice/seo failures are warnings unless severe.',
    ].join('\n'),
    user: [
      `Brand voice: ${brand.voice}`,
      `Banned claims: ${brand.banned_claims.join('; ')}`,
      `Verified claims: ${JSON.stringify(story.verification?.claims || [])}`,
      `Format: ${draft.format}`,
      '',
      `Title: ${draft.title}`,
      `Body:\n${draft.body}`,
      `SEO: ${JSON.stringify(draft.seo)}`,
    ].join('\n'),
    schema: SCHEMA,
    mock: () => ({
      passed: true,
      checks: Object.fromEntries(CHECKS.map(c => [c, { pass: true, note: `${c} OK [mock]` }])),
      notes: 'All checks passed. [mock QC — DRY_RUN]',
    }),
  });

  const status = report.passed ? 'pending_approval' : 'qc_failed';
  await store.update('content', draft.id, { qc_report: report, status });
  console.log(`[qc] ${draft.brand}/${draft.format} → ${status}`);
  return { ...draft, qc_report: report, status };
}
