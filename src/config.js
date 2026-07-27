import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

// Load .env if present (real env vars take precedence)
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export const DRY_RUN = process.env.DRY_RUN === 'true';

export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  tavilyApiKey: process.env.TAVILY_API_KEY,
  rssFeeds: (process.env.RSS_FEEDS || '').split(',').map(s => s.trim()).filter(Boolean),
  wordpress: {
    url: process.env.WORDPRESS_URL,
    user: process.env.WORDPRESS_USER,
    appPassword: process.env.WORDPRESS_APP_PASSWORD,
  },
  ghlWebhookUrl: process.env.GHL_WEBHOOK_URL,
  zapierSocialWebhookUrl: process.env.ZAPIER_SOCIAL_WEBHOOK_URL,
  dashboardPort: Number(process.env.DASHBOARD_PORT || 3000),
};

export function loadBrands() {
  const dir = path.join(ROOT, 'brands');
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}
