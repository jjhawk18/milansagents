// Stage 10-11: Publishing — WordPress REST API for articles, GHL/Zapier
// webhooks for social distribution (LinkedIn / X / Facebook / Instagram) and
// email. Only content with status 'approved' ever reaches this stage.
import { store } from '../lib/store.js';
import { config, DRY_RUN } from '../config.js';

export async function publishApproved() {
  const approved = await store.select('content', { status: 'approved' });
  console.log(`[publish] ${approved.length} approved item(s) queued`);
  const results = [];
  for (const item of approved) {
    const ref = item.format === 'article'
      ? await publishToWordPress(item)
      : await publishToSocial(item);
    await store.update('content', item.id, {
      status: 'published',
      published_at: new Date().toISOString(),
      publish_ref: ref,
    });
    results.push({ id: item.id, format: item.format, ref });
  }
  return results;
}

async function publishToWordPress(item) {
  if (DRY_RUN || !config.wordpress.url) {
    console.log(`[publish] (dry-run) WordPress draft: "${item.title}"`);
    return { mock: true, channel: 'wordpress' };
  }
  const auth = Buffer.from(`${config.wordpress.user}:${config.wordpress.appPassword}`).toString('base64');
  const res = await fetch(`${config.wordpress.url}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Basic ${auth}` },
    body: JSON.stringify({
      title: item.title,
      content: item.body,
      status: 'draft', // publish as WP draft; final button-press stays human
      slug: item.seo?.slug,
      excerpt: item.seo?.meta_description,
    }),
  });
  if (!res.ok) throw new Error(`WordPress publish failed: ${res.status} ${await res.text()}`);
  const post = await res.json();
  return { wordpress_id: post.id, permalink: post.link };
}

async function publishToSocial(item) {
  const webhook = config.ghlWebhookUrl || config.zapierSocialWebhookUrl;
  if (DRY_RUN || !webhook) {
    console.log(`[publish] (dry-run) social → ${item.format}: "${(item.title || item.body).slice(0, 60)}"`);
    return { mock: true, channel: item.format };
  }
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: item.format, brand: item.brand, title: item.title, body: item.body }),
  });
  if (!res.ok) throw new Error(`Social webhook failed: ${res.status}`);
  return { webhook: true, channel: item.format };
}
