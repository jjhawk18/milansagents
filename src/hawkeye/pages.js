// Public page retrieval + normalization + change detection.
// Compliant by design: plain GET of publicly accessible pages, no logins, no
// anti-bot evasion, per-run limits, polite timeout.
import crypto from 'node:crypto';
import { DRY_RUN } from '../config.js';
import { limits } from './settings.js';

const NOISE_LINE = /cookie|privacy policy|all rights reserved|©|\bmenu\b|skip to content|subscribe to our newsletter/i;

export function normalizeHtml(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|footer|header|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;|&[a-z]+;/gi, ' ');
  const lines = text.split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 3 && !NOISE_LINE.test(l));
  // Dedupe repeated boilerplate lines
  const seen = new Set();
  const out = [];
  for (const l of lines) {
    if (!seen.has(l)) { seen.add(l); out.push(l); }
  }
  return out.join('\n').slice(0, limits.contentMaxChars);
}

export function contentHash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/** Line-level diff: what's in `next` but not `prev`, and vice versa. */
export function diffText(prev, next) {
  const prevLines = new Set(prev.split('\n'));
  const nextLines = new Set(next.split('\n'));
  const added = [...nextLines].filter(l => !prevLines.has(l));
  const removed = [...prevLines].filter(l => !nextLines.has(l));
  const ratio = (added.length + removed.length) / Math.max(nextLines.size, 1);
  return { ratio: Number(ratio.toFixed(3)), added_lines: added.slice(0, 25), removed_lines: removed.slice(0, 15) };
}

const SIGNIFICANT = /pricing|price|package|enterprise|launch|new service|healthcare|clinical|hipaa|ai training|training data|rlhf|evaluation|evaluator|annotat|expert|verified|partnership|acqui|funding|series [a-e]|expansion|multilingual|voice data|synthetic/i;

/** Deterministic pre-filter — only meaningful changes go to (paid) AI analysis. */
export function isMeaningfulChange(diff) {
  if (diff.ratio < 0.03) return false;                     // trivial churn
  const addedText = diff.added_lines.join(' ');
  if (diff.ratio >= 0.25) return true;                     // big rewrite
  return SIGNIFICANT.test(addedText);                      // keyword-bearing additions
}

export async function fetchPage(url, { fixture = null } = {}) {
  if (DRY_RUN) return fixture ?? `Example Co provides research recruitment services. Contact us. [fixture for ${url}]`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HawkEye-intel/0.1; +https://focusinsite.com)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = (await res.text()).slice(0, limits.contentMaxChars * 10);
    return normalizeHtml(raw);
  } finally {
    clearTimeout(t);
  }
}
