// Morning intelligence brief generator (Mon/Wed/Fri).
import { askJSON } from '../lib/claude.js';
import { store } from '../lib/store.js';

const DEV = {
  type: 'object',
  properties: {
    company: { type: 'string' }, what_changed: { type: 'string' }, why_it_matters: { type: 'string' },
    signal_type: { type: 'string' }, score: { type: 'number' }, recommended_response: { type: 'string' },
    source_urls: { type: 'array', items: { type: 'string' } },
  },
  required: ['company', 'what_changed', 'why_it_matters', 'signal_type', 'score', 'recommended_response', 'source_urls'],
  additionalProperties: false,
};

const SCHEMA = {
  type: 'object',
  properties: {
    executive_takeaway: { type: 'string' },
    top_developments: { type: 'array', items: DEV },
    buyer_intent_signals: { type: 'array', items: { type: 'string' } },
    messaging_shifts: { type: 'array', items: { type: 'string' } },
    focus_insite_implications: { type: 'array', items: { type: 'string' } },
    human_layer_implications: { type: 'array', items: { type: 'string' } },
    recommended_actions: { type: 'array', items: { type: 'string' } },
    content_opportunity: {
      type: 'object',
      properties: {
        hook: { type: 'string' }, jims_pov: { type: 'string' }, format: { type: 'string' },
        brand: { type: 'string' }, cta: { type: 'string' },
      },
      required: ['hook', 'jims_pov', 'format', 'brand', 'cta'],
      additionalProperties: false,
    },
    prospecting_opportunity: {
      type: 'object',
      properties: {
        company: { type: 'string' }, trigger: { type: 'string' }, target_role: { type: 'string' },
        outreach_angle: { type: 'string' }, draft_opening: { type: 'string' },
      },
      required: ['company', 'trigger', 'target_role', 'outreach_angle', 'draft_opening'],
      additionalProperties: false,
    },
  },
  required: ['executive_takeaway', 'top_developments', 'buyer_intent_signals', 'messaging_shifts',
    'focus_insite_implications', 'human_layer_implications', 'recommended_actions',
    'content_opportunity', 'prospecting_opportunity'],
  additionalProperties: false,
};

export async function generateBrief(signals) {
  const top = signals
    .filter(s => s.priority_band !== 'noise')
    .sort((a, b) => b.total_score - a.total_score)
    .slice(0, 12);
  if (!top.length) return null;

  const brief = await askJSON({
    system: [
      'You write the HawkEye morning intelligence brief for Jim (owner of Focus Insite and Human Layer AI).',
      'Concise, business-readable, decision-oriented. Executive takeaway: max 3 short paragraphs on the most important market pattern.',
      'Exactly the top 5 developments (or fewer if fewer exist). Max 3 recommended actions — the most important only.',
      'The prospecting draft is a DRAFT, never sent automatically. Only cite facts present in the signals.',
    ].join('\n'),
    user: 'Signals (JSON):\n' + JSON.stringify(top.map(s => ({
      company: s.company_name, headline: s.headline, types: s.signal_type, score: s.total_score,
      band: s.priority_band, summary: s.factual_summary, changed: s.what_changed, matters: s.why_it_matters,
      fi: s.focus_insite_implication, hl: s.human_layer_implication, action: s.recommended_action,
      buyer_intent: s.has_buyer_intent ? s.buyer_intent : null, sources: s.source_urls,
    })), null, 1),
    schema: SCHEMA,
    maxTokens: 8000,
    mock: () => mockBrief(top),
  });

  const [row] = await store.insert('hawkeye_briefs', { brief, signal_ids: top.map(s => s.id) });
  return row;
}

function mockBrief(top) {
  const first = top[0];
  return {
    executive_takeaway: 'Competitors are converging on the human-data-for-AI category, with fresh funding and healthcare positioning appearing across the watchlist this week. This validates Human Layer AI\'s thesis while compressing the window to claim the verified-human high ground. Focus Insite\'s healthcare recruiting moat is the asset to press. [mock]',
    top_developments: top.slice(0, 5).map(s => ({
      company: s.company_name, what_changed: s.what_changed, why_it_matters: s.why_it_matters,
      signal_type: (s.signal_type || [])[0] || 'competitive_threat', score: s.total_score,
      recommended_response: s.recommended_action, source_urls: s.source_urls,
    })),
    buyer_intent_signals: top.filter(s => s.has_buyer_intent).map(s =>
      `${s.company_name}: ${s.buyer_intent?.likely_need} (confidence: ${s.buyer_intent?.confidence})`),
    messaging_shifts: top.filter(s => (s.signal_type || []).includes('messaging_shift')).map(s =>
      `${s.company_name}: ${s.what_changed}`),
    focus_insite_implications: ['Healthcare recruiting is becoming a battleground — lead with verification and reach. [mock]'],
    human_layer_implications: ['Category validation is accelerating — publish the Chain-of-Human-Custody story now. [mock]'],
    recommended_actions: [
      `Review ${first?.company_name}'s move and update the battlecard`,
      'Draft healthcare-AI landing copy emphasizing verified professionals',
      'Add flagged buyer-intent companies to research list',
    ],
    content_opportunity: {
      hook: 'Everyone is suddenly selling "verified humans" — here\'s what verification actually takes. [mock]',
      jims_pov: 'Two decades of recruiting hard-to-reach humans taught us verification is a process, not a checkbox.',
      format: 'LinkedIn post + article', brand: 'humnlayer', cta: 'See how HumnLayer verifies every contributor.',
    },
    prospecting_opportunity: {
      company: first?.company_name || 'Example Co', trigger: first?.headline || 'funding news',
      target_role: 'Head of Data Operations',
      outreach_angle: 'Congratulate, then offer verified healthcare evaluators for their scaling plans.',
      draft_opening: 'Saw the news — congrats. When eval quality becomes the bottleneck, verified domain experts are the fix... [mock draft]',
    },
  };
}
