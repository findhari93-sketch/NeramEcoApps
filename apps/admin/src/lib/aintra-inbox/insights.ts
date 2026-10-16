/**
 * Insights tab numbers, worked out in the browser from the conversations the
 * page already holds, so changing the range needs no extra request.
 */
import { channelLabel } from '@neram/database/analytics';
import { stateSlugFor } from '@/lib/chat-geo';
import { INTENT_LABELS, intentsOf, type Intent } from './intents';
import type { InboxConversation, InboxPerson } from './types';

export type InsightRange = '30' | '180' | 'all';

export const RANGE_LABELS: Record<InsightRange, string> = {
  '30': 'Last 30 days',
  '180': 'Last 6 months',
  all: 'Lifetime',
};

export interface Bar {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  muted?: boolean;
}

export interface Struggle {
  question: string;
  asked: number;
  flagged: number;
  conversationId: string;
}

export interface Insights {
  chatters: number;
  messages: number;
  signedIn: number;
  signedInPct: number;
  guests: number;
  guestsNoPlacePct: number;
  needsReview: number;
  noAnswer: number;
  noAnswerCredits: number;
  channels: Bar[];
  intents: Bar[];
  places: Bar[];
  /** Per @neram/geo state slug, for the map. */
  stateValues: Record<string, number>;
  stateNames: Record<string, string>;
  struggles: Struggle[];
  topIntentShare: { label: string; pct: number } | null;
}

export function rangeStart(range: InsightRange, now: Date): number {
  if (range === 'all') return -Infinity;
  return now.getTime() - Number(range) * 24 * 60 * 60 * 1000;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

/** "What are the course fees?" and "what are the course fees" are one question. */
export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const titleCase = (s: string) =>
  s.trim().replace(/\s+/g, ' ').replace(/\b([a-z])([a-z]*)/gi, (_, a: string, b: string) => a.toUpperCase() + b.toLowerCase());

export function buildInsights(
  all: InboxConversation[],
  people: InboxPerson[],
  range: InsightRange,
  now: Date
): Insights {
  const since = rangeStart(range, now);
  const convs = all.filter((c) => Date.parse(c.lastAt) >= since);
  const keys = new Set(convs.map((c) => c.personKey));
  const inRangePeople = people.filter((p) => keys.has(p.key));
  const signedIn = inRangePeople.filter((p) => !p.isGuest).length;
  const guests = inRangePeople.length - signedIn;
  const guestsNoPlace = inRangePeople.filter((p) => p.isGuest && !p.place).length;

  // Where they came from: one vote per conversation.
  const channelCounts = new Map<string, number>();
  for (const c of convs) {
    const label = channelLabel(c.channel);
    channelCounts.set(label, (channelCounts.get(label) ?? 0) + 1);
  }
  const channels: Bar[] = [...channelCounts.entries()]
    .map(([label, value]) => ({ key: label, label, value, muted: label === channelLabel(null) }))
    .sort((a, b) => Number(!!a.muted) - Number(!!b.muted) || b.value - a.value);

  // What they want: one vote per question.
  const intentCounts = new Map<Intent, number>();
  let questions = 0;
  for (const c of convs)
    for (const q of c.questions) {
      questions++;
      for (const i of intentsOf(q)) intentCounts.set(i, (intentCounts.get(i) ?? 0) + 1);
    }
  const intents: Bar[] = [...intentCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([i, value]) => ({ key: i, label: INTENT_LABELS[i], value }));

  // Top locations: one vote per person, by state (or country outside India).
  const placeCounts = new Map<string, { label: string; value: number; cities: Map<string, number> }>();
  let noPlace = 0;
  const stateValues: Record<string, number> = {};
  const stateNames: Record<string, string> = {};
  for (const p of inRangePeople) {
    const conv = convs.find((c) => c.personKey === p.key && c.place) ?? null;
    if (!conv?.place) {
      noPlace++;
      continue;
    }
    const parts = conv.place.split(', ');
    const region = conv.stateName ? titleCase(conv.stateName) : parts[parts.length - 1];
    const city = parts.length > 1 ? parts[0] : null;
    const entry = placeCounts.get(region) ?? { label: region, value: 0, cities: new Map<string, number>() };
    entry.value++;
    if (city && city !== region) entry.cities.set(city, (entry.cities.get(city) ?? 0) + 1);
    placeCounts.set(region, entry);
    const slug = stateSlugFor(conv.stateName);
    if (slug) {
      stateValues[slug] = (stateValues[slug] ?? 0) + 1;
      stateNames[slug] = region;
    }
  }
  const places: Bar[] = [...placeCounts.values()]
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((e) => ({
      key: e.label,
      label: e.label,
      value: e.value,
      sublabel: [...e.cities.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([city, n]) => `${city} ${n}`)
        .join(' · '),
    }));
  if (noPlace) places.push({ key: 'none', label: 'No location', value: noPlace, sublabel: 'older guest chats', muted: true });

  // Questions Aintra struggles with: grouped by wording; flagged = that turn needs review or got no answer.
  const groups = new Map<string, Struggle>();
  for (const c of convs) {
    c.questions.forEach((q, i) => {
      const key = normalizeQuestion(q);
      if (!key) return;
      const g = groups.get(key) ?? { question: q.trim(), asked: 0, flagged: 0, conversationId: c.id };
      g.asked++;
      const st = c.turnStatuses[i];
      if (st === 'review' || st === 'error') {
        g.flagged++;
        g.conversationId = c.id;
      }
      groups.set(key, g);
    });
  }
  const struggles = [...groups.values()]
    .filter((g) => g.flagged > 0)
    .sort((a, b) => b.flagged - a.flagged || b.asked - a.asked)
    .slice(0, 8);

  const top = intents[0];
  return {
    chatters: inRangePeople.length,
    messages: questions,
    signedIn,
    signedInPct: pct(signedIn, inRangePeople.length),
    guests,
    guestsNoPlacePct: pct(guestsNoPlace, guests),
    needsReview: convs.reduce((n, c) => n + c.reviewCount, 0),
    noAnswer: convs.reduce((n, c) => n + c.errorCount, 0),
    noAnswerCredits: convs.reduce((n, c) => n + c.creditErrorCount, 0),
    channels,
    intents,
    places,
    stateValues,
    stateNames,
    struggles,
    topIntentShare: top && questions ? { label: top.label, pct: pct(top.value, questions) } : null,
  };
}
