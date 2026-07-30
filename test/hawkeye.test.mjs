// HawkEye unit tests — run with: npm test  (node --test, no dependencies)
process.env.DRY_RUN = 'true';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHtml, contentHash, diffText, isMeaningfulChange } from '../src/hawkeye/pages.js';
import { computeTotal, priorityBand } from '../src/hawkeye/settings.js';
import { findDuplicate } from '../src/hawkeye/analyze.js';
import { store } from '../src/lib/store.js';

test('normalizeHtml strips scripts, tags, and boilerplate', () => {
  const html = `<html><script>evil()</script><nav>Menu Home</nav>
    <h1>AI Training Services</h1><p>We provide verified experts.</p>
    <footer>© 2026 All rights reserved</footer></html>`;
  const text = normalizeHtml(html);
  assert.match(text, /AI Training Services/);
  assert.match(text, /verified experts/);
  assert.doesNotMatch(text, /evil|Menu Home|rights reserved/);
});

test('contentHash is stable and content-sensitive', () => {
  assert.equal(contentHash('abc'), contentHash('abc'));
  assert.notEqual(contentHash('abc'), contentHash('abd'));
});

test('diffText finds added/removed lines with a sane ratio', () => {
  const prev = 'line one\nline two\nline three';
  const next = 'line one\nline two\nnew pricing packages for enterprise AI';
  const d = diffText(prev, next);
  assert.deepEqual(d.added_lines, ['new pricing packages for enterprise AI']);
  assert.deepEqual(d.removed_lines, ['line three']);
  assert.ok(d.ratio > 0 && d.ratio <= 1);
});

test('isMeaningfulChange: trivial churn filtered, significant additions pass', () => {
  assert.equal(isMeaningfulChange({ ratio: 0.01, added_lines: ['new pricing model'], removed_lines: [] }), false);
  assert.equal(isMeaningfulChange({ ratio: 0.05, added_lines: ['updated testimonial from a customer'], removed_lines: [] }), false);
  assert.equal(isMeaningfulChange({ ratio: 0.05, added_lines: ['New AI training data service for healthcare'], removed_lines: [] }), true);
  assert.equal(isMeaningfulChange({ ratio: 0.4, added_lines: ['totally rewritten page'], removed_lines: [] }), true);
});

test('computeTotal clamps components and caps weak-evidence scores', () => {
  const strong = computeTotal({ strategic_relevance_score: 25, revenue_potential_score: 25, competitive_threat_score: 20, urgency_score: 15, evidence_confidence_score: 15 });
  assert.equal(strong.total, 100);
  const weak = computeTotal({ strategic_relevance_score: 25, revenue_potential_score: 25, competitive_threat_score: 20, urgency_score: 15, evidence_confidence_score: 3 });
  assert.ok(weak.total <= 64, 'weak evidence must never reach High/Critical');
  const overflow = computeTotal({ strategic_relevance_score: 99, revenue_potential_score: 99, competitive_threat_score: 99, urgency_score: 99, evidence_confidence_score: 99 });
  assert.equal(overflow.total, 100);
});

test('priorityBand boundaries', () => {
  assert.equal(priorityBand(80), 'critical');
  assert.equal(priorityBand(79), 'high');
  assert.equal(priorityBand(64), 'medium');
  assert.equal(priorityBand(44), 'low');
  assert.equal(priorityBand(24), 'noise');
});

test('findDuplicate merges same-company similar headlines, keeps distinct ones', () => {
  const recent = [{ company_name: 'Scale AI', headline: 'Scale AI raises Series F funding round to expand operations', detected_date: new Date().toISOString() }];
  const dupe = { company_name: 'Scale AI', headline: 'Scale AI raises massive Series F round for expanding operations' };
  const distinct = { company_name: 'Scale AI', headline: 'Scale AI launches healthcare annotation product line' };
  const otherCo = { company_name: 'Appen', headline: 'Scale AI raises Series F funding round to expand operations' };
  assert.ok(findDuplicate(dupe, recent));
  assert.equal(findDuplicate(distinct, recent), null);
  assert.equal(findDuplicate(otherCo, recent), null);
});

test('store CRUD roundtrip for hawkeye tables (local store)', async () => {
  const [row] = await store.insert('hawkeye_companies', { name: 'Test Co', active: true, priority: 1 });
  assert.ok(row.id);
  await store.update('hawkeye_companies', row.id, { priority: 2 });
  const fetched = await store.selectById('hawkeye_companies', row.id);
  assert.equal(fetched.priority, 2);
  assert.equal(await store.delete('hawkeye_companies', row.id), true);
  assert.equal(await store.selectById('hawkeye_companies', row.id), null);
});
