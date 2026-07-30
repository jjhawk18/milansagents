// Approval dashboard — review QC'd drafts, approve/reject, trigger publish.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { store } from '../src/lib/store.js';
import { config, ROOT } from '../src/config.js';
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

// Agent hub home + per-agent pages
app.get('/', (_req, res) => res.sendFile(path.join(here, 'home.html')));
app.get('/newsjack', (_req, res) => res.sendFile(path.join(here, 'index.html')));

app.get('/api/agents', async (_req, res) => {
  const registry = JSON.parse(fs.readFileSync(path.join(here, 'agents.json'), 'utf8'));
  const out = [];
  for (const agent of registry) {
    const info = { ...agent };
    try { info.last_activity = fs.statSync(path.join(ROOT, agent.log)).mtime; } catch { info.last_activity = null; }
    info.next_run = agent.timer ? await nextTimerRun(agent.timer) : null;
    if (agent.key === 'newsjack') {
      const content = await store.select('content');
      info.counts = {
        pending: content.filter(c => c.status === 'pending_approval').length,
        approved: content.filter(c => c.status === 'approved').length,
        published: content.filter(c => c.status === 'published').length,
      };
    }
    out.push(info);
  }
  res.json(out);
});

function nextTimerRun(timer) {
  return new Promise(resolve => {
    execFile('systemctl', ['show', timer, '--property=NextElapseUSecRealtime', '--value'],
      (err, stdout) => resolve(err ? null : (stdout.trim() || null)));
  });
}

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

// Behind a reverse proxy (Caddy/nginx), set DASHBOARD_BIND=127.0.0.1 so the
// dashboard is only reachable through the proxy, never directly by IP:port.
const bind = process.env.DASHBOARD_BIND || '0.0.0.0';
// ---------------- HawkEye (competitor & market intelligence) ----------------
app.get('/hawkeye', (_req, res) => res.sendFile(path.join(here, 'hawkeye.html')));

app.get('/api/hawkeye/companies', async (_req, res) => {
  res.json(await store.select('hawkeye_companies'));
});
app.post('/api/hawkeye/companies', async (req, res) => {
  const { name, website } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const [row] = await store.insert('hawkeye_companies', {
    name, website: website || '', description: req.body.description || '',
    categories: req.body.categories || [], business: req.body.business || 'both',
    priority: Number(req.body.priority) || 3, active: true,
    urls: req.body.urls || [], notes: req.body.notes || '', is_seed: false,
  });
  res.json(row);
});
app.post('/api/hawkeye/companies/:id', async (req, res) => {
  res.json(await store.update('hawkeye_companies', req.params.id, req.body));
});
app.delete('/api/hawkeye/companies/:id', async (req, res) => {
  res.json({ deleted: await store.delete('hawkeye_companies', req.params.id) });
});

app.get('/api/hawkeye/signals', async (_req, res) => {
  const signals = await store.select('hawkeye_signals');
  signals.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
  res.json(signals);
});
app.post('/api/hawkeye/signals/:id/status', async (req, res) => {
  res.json(await store.update('hawkeye_signals', req.params.id, { status: req.body.status }));
});

app.get('/api/hawkeye/briefs', async (_req, res) => {
  const briefs = await store.select('hawkeye_briefs');
  briefs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(briefs);
});

app.get('/api/hawkeye/changes', async (_req, res) => {
  const snaps = (await store.select('hawkeye_snapshots')).filter(s => s.meaningful && !s.dismissed);
  const companies = await store.select('hawkeye_companies');
  const byId = Object.fromEntries(companies.map(c => [c.id, c.name]));
  snaps.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(snaps.map(s => ({ ...s, company_name: byId[s.company_id] || 'unknown' })));
});
app.post('/api/hawkeye/changes/:id/dismiss', async (req, res) => {
  res.json(await store.update('hawkeye_snapshots', req.params.id, { dismissed: true }));
});

app.get('/api/hawkeye/runs', async (_req, res) => {
  const runs = await store.select('hawkeye_runs');
  runs.sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
  res.json(runs.slice(0, 20));
});

// Trigger a scan in the background (whole watchlist or one company)
app.post('/api/hawkeye/scan', async (req, res) => {
  const args = [path.join(ROOT, 'src/hawkeye/run.js')];
  if (req.body?.company_id) args.push(`--company=${req.body.company_id}`);
  if (req.body?.second_pass) args.push('--second-pass');
  const logPath = path.join(ROOT, 'logs', 'hawkeye.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const out = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', out, out], env: process.env });
  child.unref();
  res.json({ started: true, log: 'logs/hawkeye.log' });
});

app.listen(config.dashboardPort, bind, () => {
  console.log(`Approval dashboard → http://${bind === '0.0.0.0' ? 'localhost' : bind}:${config.dashboardPort}`);
});
