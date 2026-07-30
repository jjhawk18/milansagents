// HawkEye configuration — env-overridable cost & behavior limits.
export const enabled = process.env.HAWKEYE_ENABLED !== 'false';

export const limits = {
  maxCompaniesPerRun: num('HAWKEYE_MAX_COMPANIES_PER_RUN', 15),
  maxUrlsPerCompany: num('HAWKEYE_MAX_URLS_PER_COMPANY', 4),
  maxAiCallsPerRun: num('HAWKEYE_MAX_AI_CALLS_PER_RUN', 20),
  maxSearchesPerCompany: num('HAWKEYE_MAX_SEARCHES_PER_COMPANY', 1),
  contentMaxChars: num('HAWKEYE_CONTENT_MAX_CHARS', 30000),
  minSignalScore: num('HAWKEYE_MIN_SIGNAL_SCORE', 25),
  perDomainDelayMs: num('HAWKEYE_PER_DOMAIN_DELAY_MS', 1500),
};

function num(key, fallback) {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export function priorityBand(total) {
  if (total >= 80) return 'critical';
  if (total >= 65) return 'high';
  if (total >= 45) return 'medium';
  if (total >= 25) return 'low';
  return 'noise';
}

/** Recompute total deterministically; weak evidence caps the ceiling. */
export function computeTotal(s) {
  const clamp = (v, max) => Math.max(0, Math.min(Number(v) || 0, max));
  const relevance = clamp(s.strategic_relevance_score, 25);
  const revenue = clamp(s.revenue_potential_score, 25);
  const threat = clamp(s.competitive_threat_score, 20);
  const urgency = clamp(s.urgency_score, 15);
  const evidence = clamp(s.evidence_confidence_score, 15);
  let total = relevance + revenue + threat + urgency + evidence;
  if (evidence < 8) total = Math.min(total, 64);   // weak evidence can never be Critical/High
  return { relevance, revenue, threat, urgency, evidence, total };
}
