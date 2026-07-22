#!/usr/bin/env node
// Pipeline orchestrator + CLI.
//
//   node src/pipeline.js run [--source=fixtures] [--url=https://...]
//   node src/pipeline.js publish-approved
//
// Flow: discover → cluster → verify → score → (gate) → angles → generate → QC
// → approval queue (dashboard) → publish → analytics.
import { discover } from './stages/discover.js';
import { clusterItems } from './stages/cluster.js';
import { verifyStory } from './stages/verify.js';
import { scoreStory, SCORE_THRESHOLD } from './stages/score.js';
import { generateAngles } from './stages/angles.js';
import { generateContent } from './stages/generate.js';
import { qcContent } from './stages/qc.js';
import { publishApproved } from './stages/publish.js';
import { DRY_RUN } from './config.js';
import { store } from './lib/store.js';

async function run(opts) {
  console.log(`\n=== Newsjack pipeline run ${DRY_RUN ? '(DRY RUN — no API keys needed)' : ''} ===\n`);

  // 1. Discovery
  const items = await discover(opts);
  if (!items.length) { console.log('Nothing new. Done.'); return; }

  // 2. Dedup + clustering
  const stories = await clusterItems(items);

  // 3-4. Verify + score, gate on threshold
  const qualified = [];
  for (const story of stories) {
    const verified = await verifyStory(story);
    if (verified.status === 'rejected') continue;
    const scored = await scoreStory(verified);
    if (scored.newsjack_score >= SCORE_THRESHOLD && scored.score_breakdown.best_brands.length) {
      qualified.push(scored);
    } else {
      console.log(`[gate] skipped (score ${scored.newsjack_score} < ${SCORE_THRESHOLD} or no brand fit)`);
    }
  }
  console.log(`\n[gate] ${qualified.length}/${stories.length} stories passed verification + scoring\n`);

  // 5-8. RAG → angles → content → QC
  let queued = 0;
  for (const story of qualified) {
    const angles = await generateAngles(story);
    for (const angle of angles) {
      const drafts = await generateContent(story, angle);
      for (const draft of drafts) {
        const checked = await qcContent(story, draft);
        if (checked.status === 'pending_approval') queued += 1;
      }
    }
    await store.update('stories', story.id, { status: 'drafted' });
  }

  console.log(`\n=== Done. ${queued} draft(s) in the approval queue. ===`);
  console.log(DRY_RUN
    ? 'Review them: npm run demo:dashboard  →  http://localhost:3000'
    : 'Review them: npm run dashboard  →  http://localhost:3000');
}

const [, , command, ...rest] = process.argv;
const opts = {};
for (const arg of rest) {
  const m = arg.match(/^--([^=]+)=(.*)$/);
  if (m) {
    if (m[1] === 'url') (opts.manualUrls ||= []).push(m[2]);
    else opts[m[1]] = m[2];
  }
}

if (command === 'run') {
  run(opts).catch(err => { console.error(err); process.exit(1); });
} else if (command === 'publish-approved') {
  publishApproved()
    .then(r => console.log(`[publish] published ${r.length} item(s)`))
    .catch(err => { console.error(err); process.exit(1); });
} else {
  console.log('Usage: node src/pipeline.js run [--source=fixtures] [--url=...] | publish-approved');
}
