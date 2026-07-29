// Approval dashboard — review QC'd drafts, approve/reject, trigger publish.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store } from '../src/lib/store.js';
import { config } from '../src/config.js';
import { publishApproved } from '../src/stages/publish.js';
import { recordEvent, learningSummary } from '../src/stages/analytics.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Basic auth when DASHBOARD_PASSWORD is set (required for internet-facing
// deployments; leave unset for localhost-only use).
const PASSWORD = process.env.DASHBOARD_PASSWORD;
if (PASSWORD) {
  app.use((req, res, next) => {
    const b64 = (req.headers.authorization || '').split(' ')[1] || '';
    const [, pass] = Buffer.from(b64, 'base64').toString().split(':');
    if (pass === PASSWORD) return next();
    res.set('WWW-Authenticate', 'Basic realm="newsjack"');
    res.status(401).send('Authentication required');
  });
}

app.get('/', (_req, res) => res.sendFile(path.join(here, 'index.html')));

// Queue: everything pending approval, plus recent decisions for context
app.get('/api/queue', async (_req, res) => {
  const content = await store.select('content');
  const stories = await store.select('stories');
  const angles = await store.select('angles');
  const storyById = Object.fromEntries(stories.map(s => [s.id, s]));
  const angleById = Object.fromEntries(angles.map(a => [a.id, a]));
  const enriched = content.map(c => ({
    ...c,
    story: storyById[c.story_id] || null,
    angle: angleById[c.angle_id] || null,
  }));
  res.json(enriched);
});

app.post('/api/content/:id/decision', async (req, res) => {
  const { decision, notes, reviewer, editedBody } = req.body; // 'approved' | 'rejected'
  const patch = { status: decision };
  if (editedBody) patch.body = editedBody;
  const updated = await store.update('content', req.params.id, patch);
  await store.insert('approvals', {
    content_id: req.params.id,
    decision: editedBody ? 'edited' : decision,
    reviewer: reviewer || 'dashboard',
    notes: notes || null,
  });
  res.json(updated);
});

app.post('/api/publish', async (_req, res) => {
  try {
    const results = await publishApproved();
    res.json({ published: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics intake (point GHL/Zapier/WordPress webhooks here) + summary
app.post('/api/analytics', async (req, res) => {
  await recordEvent(req.body);
  res.json({ ok: true });
});
app.get('/api/analytics/summary', async (_req, res) => {
  res.json(await learningSummary());
});

app.listen(config.dashboardPort, () => {
  console.log(`Approval dashboard → http://localhost:${config.dashboardPort}`);
});
