// Seed watchlist — clearly-marked EXAMPLE entries, fully editable/deletable in
// the dashboard. These are representative companies operating publicly in the
// relevant spaces; inclusion does not assert a competitive/buyer relationship.
import { store } from '../lib/store.js';

const SEED = [
  { name: 'Sago (Schlesinger Group)', website: 'https://sago.com', business: 'focus_insite', priority: 1,
    categories: ['focus_insite_competitor', 'market_research_company'],
    description: 'Large research recruitment & fieldwork provider.',
    urls: [{ kind: 'services', url: 'https://sago.com/en/solutions/' }] },
  { name: 'L&E Research', website: 'https://www.leresearch.com', business: 'focus_insite', priority: 2,
    categories: ['focus_insite_competitor', 'market_research_company'],
    description: 'Qualitative recruitment and facilities.',
    urls: [] },
  { name: 'Fieldwork', website: 'https://www.fieldwork.com', business: 'focus_insite', priority: 2,
    categories: ['focus_insite_competitor', 'market_research_company'],
    description: 'Focus group facilities and recruitment.',
    urls: [] },
  { name: 'Respondent', website: 'https://www.respondent.io', business: 'focus_insite', priority: 2,
    categories: ['focus_insite_competitor', 'research_technology_platform'],
    description: 'B2B research participant marketplace.',
    urls: [] },
  { name: 'User Interviews', website: 'https://www.userinterviews.com', business: 'focus_insite', priority: 2,
    categories: ['focus_insite_competitor', 'research_technology_platform'],
    description: 'Participant recruitment platform for UX research.',
    urls: [{ kind: 'pricing', url: 'https://www.userinterviews.com/pricing' }] },
  { name: 'Prolific', website: 'https://www.prolific.com', business: 'both', priority: 1,
    categories: ['humnlayer_competitor', 'research_technology_platform', 'data_annotation_company'],
    description: 'Vetted participant pool for research and AI tasks.',
    urls: [] },
  { name: 'Scale AI', website: 'https://scale.com', business: 'humnlayer', priority: 1,
    categories: ['humnlayer_competitor', 'data_annotation_company'],
    description: 'Data engine for AI: annotation, RLHF, evals.',
    urls: [] },
  { name: 'Surge AI', website: 'https://www.surgehq.ai', business: 'humnlayer', priority: 1,
    categories: ['humnlayer_competitor', 'data_annotation_company'],
    description: 'Human data / RLHF workforce for AI labs.',
    urls: [] },
  { name: 'Appen', website: 'https://www.appen.com', business: 'humnlayer', priority: 2,
    categories: ['humnlayer_competitor', 'data_annotation_company'],
    description: 'AI training data and crowd workforce.',
    urls: [] },
  { name: 'Mercor', website: 'https://mercor.com', business: 'humnlayer', priority: 1,
    categories: ['humnlayer_competitor', 'staffing_talent_platform', 'expert_network'],
    description: 'Expert talent marketplace for AI labs.',
    urls: [] },
  { name: 'GLG', website: 'https://glginsights.com', business: 'both', priority: 3,
    categories: ['adjacent_threat', 'expert_network'],
    description: 'Expert network — adjacent to expert sourcing for AI.',
    urls: [] },
  { name: 'Invisible Technologies', website: 'https://www.invisible.co', business: 'humnlayer', priority: 2,
    categories: ['adjacent_threat', 'data_annotation_company'],
    description: 'AI operations and training-data outsourcing.',
    urls: [] },
];

export async function seedIfEmpty() {
  const existing = await store.select('hawkeye_companies');
  if (existing.length) return existing;
  const rows = SEED.map(c => ({
    ...c,
    active: true,
    is_seed: true,
    notes: 'SEED EXAMPLE — review, edit, or delete. Inclusion does not assert a verified relationship.',
  }));
  const inserted = await store.insert('hawkeye_companies', rows);
  console.log(`[hawkeye] seeded ${inserted.length} example watchlist companies (editable in dashboard)`);
  return inserted;
}
