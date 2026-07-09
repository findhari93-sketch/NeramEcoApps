/**
 * Quick Add: a copy-paste bridge to an outside AI (ChatGPT / Gemini / Claude).
 * The teacher runs the interview prompt, answers its questions, and pastes back
 * the JSON, which fills a topic's Overview (summary + classification) and
 * Activities/Drills plus resource links in one shot. Content only: no test
 * questions, no server-side AI, no cost.
 */

export interface TopicQuickAddResource {
  kind: 'link' | 'youtube';
  title: string;
  url: string;
  section: 'resource' | 'drill';
}

export interface TopicQuickAddJSON {
  summary?: string;
  activities?: string;
  drills?: string;
  priority?: 'mandatory' | 'high' | 'medium' | 'low';
  intended_delivery?: 'live' | 'self_learning' | 'either';
  estimated_sessions?: number;
  resources?: TopicQuickAddResource[];
}

export interface TopicQuickAddData {
  summary: string;
  activities: string;
  drills: string;
  priority?: TopicQuickAddJSON['priority'];
  intended_delivery?: TopicQuickAddJSON['intended_delivery'];
  estimated_sessions?: number;
  resources: TopicQuickAddResource[];
}

export interface TopicQuickAddResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data: TopicQuickAddData | null;
}

const PRIORITIES = ['mandatory', 'high', 'medium', 'low'];
const DELIVERIES = ['live', 'self_learning', 'either'];

export const TOPIC_QUICK_ADD_SCHEMA_EXAMPLE: TopicQuickAddJSON = {
  summary: 'What students can do after this class, and how the session runs (demo, guided work, review).',
  activities: '- Warm-up: 10 min quick sketch\n- Main: guided one-point perspective of a room\n- Review: pin-up and feedback',
  drills: '- 5 quick perspective boxes daily until the next class',
  priority: 'high',
  intended_delivery: 'live',
  estimated_sessions: 2,
  resources: [
    { kind: 'youtube', title: 'One-point perspective basics', url: 'https://youtu.be/xxxxxxxxxxx', section: 'resource' },
    { kind: 'link', title: 'Reference sheet (PDF)', url: 'https://example.com/sheet.pdf', section: 'resource' },
    { kind: 'link', title: 'Daily drill sheet', url: 'https://example.com/drills.pdf', section: 'drill' },
  ],
};

export const TOPIC_QUICK_ADD_PROMPT = `You are helping a teacher plan ONE class topic for an architecture-entrance coaching class (NATA / JEE B.Arch).

Step 1: Interview me. Ask these questions ONE AT A TIME and wait for my answer before moving on:
1. What is the topic, and what should students be able to do after the class?
2. How does the class run (demo, guided practice, review), and roughly how many sessions?
3. What in-class activities do you want?
4. What take-home drills or practice until the next class?
5. Any useful links or YouTube videos to attach (reference material or drills)?
6. Is this a live class, self-learning, or either, and how important is it (mandatory, high, medium or low)?

Step 2: After I answer, output ONLY a JSON object (no commentary before or after) matching this exact shape:

\`\`\`json
${JSON.stringify(TOPIC_QUICK_ADD_SCHEMA_EXAMPLE, null, 2)}
\`\`\`

Rules:
- "summary", "activities" and "drills" are plain text. Use "- " bullet lines for lists.
- "priority" is one of: mandatory, high, medium, low.
- "intended_delivery" is one of: live, self_learning, either.
- "estimated_sessions" is a whole number from 1 to 4.
- "resources" is a list; each item has "kind" ("link" or "youtube"), "title", "url" and "section" ("resource" or "drill"). Omit it if there are none.
- Leave out any field I did not give you. Do NOT invent test questions.

Begin at Step 1 now.`;

export function validateTopicQuickAdd(input: unknown): TopicQuickAddResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['Paste a single JSON object (it starts with { and ends with }).'], warnings, data: null };
  }
  const j = input as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const priority =
    typeof j.priority === 'string' && PRIORITIES.includes(j.priority)
      ? (j.priority as TopicQuickAddJSON['priority'])
      : undefined;
  if (j.priority && !priority) warnings.push(`Ignored an unknown priority ("${String(j.priority)}").`);

  const delivery =
    typeof j.intended_delivery === 'string' && DELIVERIES.includes(j.intended_delivery)
      ? (j.intended_delivery as TopicQuickAddJSON['intended_delivery'])
      : undefined;
  if (j.intended_delivery && !delivery) warnings.push(`Ignored an unknown delivery ("${String(j.intended_delivery)}").`);

  let sessions: number | undefined;
  if (j.estimated_sessions != null) {
    const n = Math.round(Number(j.estimated_sessions));
    if (Number.isFinite(n) && n >= 1 && n <= 4) sessions = n;
    else warnings.push('Ignored estimated_sessions (it must be a whole number from 1 to 4).');
  }

  const resources: TopicQuickAddResource[] = [];
  if (Array.isArray(j.resources)) {
    for (const raw of j.resources as unknown[]) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const title = str(r.title);
      const url = str(r.url);
      if (!title || !url) {
        warnings.push('Skipped a resource with no title or URL.');
        continue;
      }
      resources.push({
        kind: r.kind === 'youtube' ? 'youtube' : 'link',
        title,
        url,
        section: r.section === 'drill' ? 'drill' : 'resource',
      });
    }
  }

  const summary = str(j.summary);
  const activities = str(j.activities);
  const drills = str(j.drills);

  if (!summary && !activities && !drills && resources.length === 0 && !priority && !delivery && !sessions) {
    errors.push('Nothing to fill. The JSON had no recognised fields.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    data: errors.length
      ? null
      : { summary, activities, drills, priority, intended_delivery: delivery, estimated_sessions: sessions, resources },
  };
}

/** Tolerant parse: accepts raw JSON, a fenced ```json block, or JSON with prose around it. */
export function parseTopicQuickAdd(text: string): TopicQuickAddResult {
  const trimmed = (text || '').trim();
  if (!trimmed) return { valid: false, errors: ['Paste the JSON the AI gave you.'], warnings: [], data: null };
  let jsonText = trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    jsonText = fence[1].trim();
  } else {
    const first = jsonText.indexOf('{');
    const last = jsonText.lastIndexOf('}');
    if (first > 0 && last > first) jsonText = jsonText.slice(first, last + 1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      valid: false,
      errors: ['That is not valid JSON. Copy the whole JSON block the AI produced.'],
      warnings: [],
      data: null,
    };
  }
  return validateTopicQuickAdd(parsed);
}
