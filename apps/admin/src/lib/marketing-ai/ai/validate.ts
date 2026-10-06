/**
 * The evidence guard. Model output is untrusted until it passes here.
 *
 *  - An answer about an id we never sent is dropped.
 *  - An assessment that quotes a number not in the finding's own data is
 *    dropped, so the screen never shows a figure the agent made up (spec §24.3).
 *  - Ad copy is trimmed to Google's length limits and stripped of em dashes.
 */

import { pastCycleYears } from '../config';
import type { Evidence } from '../types';
import { NEGATIVE_INTENTS, type Intent, type IntentLabel } from '../rules';

const INTENTS: readonly Intent[] = ['high_intent', 'research', 'free_seeker', 'job_seeker', 'other_exam', 'other_course', 'competitor', 'unclear'];

export function validateIntents(raw: unknown, sent: Map<string, string>): Map<string, IntentLabel> {
  const out = new Map<string, IntentLabel>();
  const items = Array.isArray((raw as any)?.terms) ? (raw as any).terms : [];
  for (const item of items) {
    const id = typeof item?.id === 'string' ? item.id : '';
    const term = sent.get(id);
    if (!term || !INTENTS.includes(item.intent)) continue;
    const confidence = Math.min(1, Math.max(0, Number(item.confidence) || 0));
    let suggested: string | null = typeof item.suggested_negative === 'string' ? item.suggested_negative.trim().toLowerCase() : null;
    // A suggestion must be part of the term, and only for an intent that is a negative.
    if (!suggested || !term.toLowerCase().includes(suggested) || !NEGATIVE_INTENTS.includes(item.intent)) suggested = null;
    out.set(id, {
      intent: item.intent,
      confidence,
      reason: typeof item.reason === 'string' ? noDashes(item.reason).slice(0, 300) : '',
      suggested_negative: suggested,
    });
  }
  return out;
}

/** Every number that legitimately appears in a finding's evidence, in the forms a writer would quote it. */
export function allowedNumbers(evidence: Evidence): Set<string> {
  const nums = new Set<string>();
  const add = (n: unknown) => {
    const v = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
    if (!Number.isFinite(v)) return;
    nums.add(String(v));
    nums.add(String(Math.round(v)));
    nums.add(v.toFixed(1));
    nums.add(v.toFixed(2));
  };
  add(evidence.window.days);
  for (const r of evidence.rows) [r.impressions, r.clicks, r.cost, r.conversions, r.ctr, r.cpc, r.cpa].forEach(add);
  for (const v of Object.values(evidence.facts ?? {})) add(v);
  return nums;
}

/** True when every number in the text is in the evidence, a small count, or a year. */
export function numbersAreGrounded(text: string, allowed: Set<string>): boolean {
  const found = text.match(/\d[\d,]*(\.\d+)?/g) ?? [];
  return found.every((raw) => {
    const n = raw.replace(/,/g, '');
    const v = Number(n);
    if (v <= 12 || (v >= 2020 && v <= 2035)) return true;
    return allowed.has(n) || allowed.has(String(Math.round(v))) || allowed.has(v.toFixed(1)) || allowed.has(v.toFixed(2));
  });
}

export function validateAssessments(raw: unknown, sent: Map<string, Evidence>): Map<string, string> {
  const out = new Map<string, string>();
  const items = Array.isArray((raw as any)?.findings) ? (raw as any).findings : [];
  for (const item of items) {
    const ev = sent.get(item?.id);
    const text = typeof item?.assessment === 'string' ? noDashes(item.assessment.trim()) : '';
    if (!ev || !text) continue;
    if (!numbersAreGrounded(text, allowedNumbers(ev))) continue;
    out.set(item.id, text.slice(0, 600));
  }
  return out;
}

/** The weekly report, kept only if every number in it is one of the facts. */
export function validateWeekly(raw: unknown, facts: Record<string, number | null>): { summary: string; next_steps: string[] } | null {
  const summary = typeof (raw as any)?.summary === 'string' ? noDashes((raw as any).summary.trim()) : '';
  const steps = (Array.isArray((raw as any)?.next_steps) ? (raw as any).next_steps : []).filter((s: unknown) => typeof s === 'string' && s.trim()).map((s: string) => noDashes(s.trim()).slice(0, 240)).slice(0, 3);
  if (!summary) return null;
  const allowed = allowedNumbers({ window: { from: '', to: '', days: 7 }, rows: [], facts });
  if (![summary, ...steps].every((t) => numbersAreGrounded(t, allowed))) return null;
  return { summary: summary.slice(0, 1200), next_steps: steps };
}

/**
 * Why an ad line must not run, or null. Shared with the hard block in
 * actions.ts: a competitor's name in ad text invites a trademark complaint, and
 * a past exam year (NATA 2026 in October 2026) tells students the ad is stale.
 */
export function adTextProblem(text: string, rules: { competitors: string[]; cycleYear: number }): string | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const squeezed = text.toLowerCase().replace(/[^a-z0-9]+/g, '');
  for (const c of rules.competitors) {
    const words = c.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!words) continue;
    // "i arch" also matches "iarch" and "I-Arch"; short squeezed names only as whole words.
    if (t.includes(` ${words} `) || (words.replace(/ /g, '').length >= 5 && squeezed.includes(words.replace(/ /g, '')))) return `names the competitor "${c}"`;
  }
  const past = pastCycleYears(text, rules.cycleYear);
  if (past.length) return `names ${past.join(' and ')}, but the current exam cycle is ${rules.cycleYear}`;
  return null;
}

export function validateAdCopy(raw: unknown, rules?: { competitors: string[]; cycleYear: number }): { headlines: string[]; descriptions: string[] } | null {
  const clean = (list: unknown, max: number, limit: number) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of Array.isArray(list) ? list : []) {
      if (typeof s !== 'string') continue;
      const t = noDashes(s).replace(/\s+/g, ' ').trim();
      if (!t || t.length > max || seen.has(t.toLowerCase())) continue;
      if (rules && adTextProblem(t, rules)) continue;
      seen.add(t.toLowerCase());
      out.push(t);
      if (out.length >= limit) break;
    }
    return out;
  };
  const headlines = clean((raw as any)?.headlines, 30, 15);
  const descriptions = clean((raw as any)?.descriptions, 90, 4);
  // Google needs at least 3 headlines and 2 descriptions for a responsive search ad.
  if (headlines.length < 3 || descriptions.length < 2) return null;
  return { headlines, descriptions };
}

export function noDashes(s: string): string {
  return s.replace(/\s*[—–]\s*/g, ', ').replace(/\s--\s/g, ', ');
}
