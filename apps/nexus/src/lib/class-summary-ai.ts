/**
 * Turn a class transcript (and any drawings made in class) into the wrap-up:
 * a real title, a short brief, a detailed paragraph, a point-by-point list of
 * what was done, and the subject/theme tags it should carry.
 *
 * Runs on the shared GEMINI_API_KEY only (same free key as drawing feedback and
 * class recaps). No paid fallback: on a quota error it throws and the route
 * turns that into a "try again shortly" the teacher can work around by typing.
 *
 * Multimodal on purpose. A drawing class is often better summarized from the
 * board work (isometric cubes, orthographic projections) than from the words,
 * so class images are passed alongside the transcript.
 */

import type { TranscriptEntry } from '@neram/database';
import { generateGeminiText } from '@neram/ai';

// Keep the prompt within a comfortable window even for a long class.
const MAX_TRANSCRIPT_CHARS = 48000;

export interface ClassImageInput {
  base64: string;
  mimeType: string;
}

export interface SuggestedTag {
  label: string;
  group_type: 'subject' | 'theme';
}

/** A tag from the shared registry, as the model is allowed to see it. */
export interface AllowedTag {
  slug: string;
  label: string;
  group_type: string;
  aliases?: string[] | null;
}

export interface ClassSummary {
  suggested_title: string;
  short_description: string;
  detailed_description: string;
  bullets: string[];
  /** Slugs chosen from the registry the prompt listed. */
  tag_slugs: string[];
  /** Ideas the registry could not express. Resolved again server-side before use. */
  new_tags: SuggestedTag[];
}

const SYSTEM_INSTRUCTION = `You are the teaching assistant for Neram Classes, an architecture-entrance coaching program (NATA and JEE B.Arch). You are given the transcript of one live class, and sometimes photos of the drawings done in that class. Write a concise record of what the class actually taught.

Rules:
1. Write in clear, simple English aimed at a school student, even though the class is spoken in a mix of Tamil and English.
2. Completely ignore meeting boilerplate: join links, meeting IDs, passcodes, "who has submitted", roll-call, "can you hear me", and similar chatter. Summarize only the teaching.
3. suggested_title: the real topic of the class in 3 to 8 words (for example "Isometric Subtractive Cubes"), never a generic name like "Class by ...".
4. short_description: one or two plain sentences a student can scan.
5. detailed_description: one short paragraph (3 to 5 sentences) for a student who wants more.
6. bullets: 3 to 8 short points, each one thing that was taught or done, in the order it happened.
7. tag_slugs: 2 to 5 slugs, chosen ONLY from the tag list given in the message. Use the slug on the left of the colon, exactly as written. These are what make the class findable later, so prefer an existing tag that is close over inventing a new one.
8. new_tags: leave this empty unless the class genuinely taught something no tag in the list can express. At most 2, each with a short Title Case label (1 to 3 words) that will be reusable across future classes. group_type is "subject" for the discipline and "theme" for the specific idea. Never a new tag for an exam name, a date, a class number, or a teacher name.
9. If the transcript is too thin to tell what was taught, still return your best guess from whatever signal exists (title, images); never return empty strings.
10. Never use an em dash, a double dash, or the &mdash; entity in any text you write. Use commas, colons, periods, or parentheses instead.

Respond ONLY with a JSON object of this exact shape (no markdown, no code fences):
{
  "suggested_title": "string",
  "short_description": "string",
  "detailed_description": "string",
  "bullets": ["string"],
  "tag_slugs": ["string"],
  "new_tags": [{"label": "string", "group_type": "theme"}]
}`;

function buildTranscriptText(transcript: TranscriptEntry[]): string {
  const text = transcript
    .map((e) => {
      const mm = Math.floor(e.start / 60);
      const ss = Math.floor(e.start % 60);
      return `[${mm}:${ss.toString().padStart(2, '0')}] ${e.text}`;
    })
    .join('\n');
  return text.length > MAX_TRANSCRIPT_CHARS ? text.slice(0, MAX_TRANSCRIPT_CHARS) : text;
}

/**
 * The tag registry, as one line per tag.
 *
 * Same shape the YouTube metadata prompt uses (lib/class-video-meta-schema), and
 * for the same reason: a model that is never shown the vocabulary invents its
 * own labels, and "One Point Perspective" then fails to match the `perspective`
 * tag that lists it as an alias. Aliases are included precisely so the model can
 * recognise the tag from the words a teacher actually says in class.
 */
export function buildTagList(tags: AllowedTag[]): string {
  return tags
    .filter((t) => t.group_type !== 'exam')
    .map((t) => {
      const aliases = (t.aliases || []).filter(Boolean);
      const alias = aliases.length ? `  (also called: ${aliases.join(', ')})` : '';
      return `- ${t.slug}: ${t.label}${alias}`;
    })
    .join('\n');
}

function buildPrompt(
  transcript: TranscriptEntry[],
  fallbackTitle: string,
  hasImages: boolean,
  tags: AllowedTag[],
): string {
  const transcriptText = transcript.length
    ? buildTranscriptText(transcript)
    : '(no transcript text available)';
  const imageNote = hasImages
    ? '\nThe attached images are drawings done during this class. Use them to understand what was taught, especially for a drawing class.'
    : '';
  const tagList = buildTagList(tags);
  const tagBlock = tagList
    ? `Pick tag_slugs ONLY from this list, using the slug on the left. If the class covers something no tag here can express, and only then, add it to new_tags instead.

${tagList}`
    : 'There is no tag list available. Put 2 to 4 short Title Case topic labels in new_tags and leave tag_slugs empty.';

  return `Scheduled title (may be a placeholder): "${fallbackTitle}"
${imageNote}

${tagBlock}

Transcript (with timestamps):
${transcriptText}`;
}

function extractJson(raw: string): ClassSummary {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Failed to parse AI response');
    parsed = JSON.parse(match[0]);
  }

  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets.map((b: unknown) => String(b || '').trim()).filter(Boolean)
    : [];

  const tag_slugs = Array.isArray(parsed.tag_slugs)
    ? parsed.tag_slugs.map((s: unknown) => String(s || '').trim()).filter(Boolean)
    : [];

  const asNewTags = (value: unknown): SuggestedTag[] =>
    Array.isArray(value)
      ? value
          .map((t: any) => ({
            label: String(t?.label || t || '').trim(),
            group_type: (t?.group_type === 'subject' ? 'subject' : 'theme') as 'subject' | 'theme',
          }))
          .filter((t: SuggestedTag) => t.label)
      : [];

  // A model that ignores the new schema and answers with the old
  // `suggested_tags` shape still produces something usable: those labels go
  // through the same server-side normalizer, so most of them resolve to
  // registry tags anyway rather than being created as duplicates.
  const new_tags = [...asNewTags(parsed.new_tags), ...asNewTags(parsed.suggested_tags)];

  return {
    suggested_title: String(parsed.suggested_title || '').trim(),
    short_description: String(parsed.short_description || '').trim(),
    detailed_description: String(parsed.detailed_description || '').trim(),
    bullets,
    tag_slugs,
    new_tags,
  };
}

/**
 * Call Gemini with the transcript (+ optional images) and return the parsed
 * summary. Throws with a 429/quota-tagged message on rate limits so the route
 * can map it to a friendly response.
 */
export async function generateClassSummary(input: {
  transcript: TranscriptEntry[];
  images?: ClassImageInput[];
  fallbackTitle: string;
  /** The registry the model must pick tag_slugs from. */
  tags?: AllowedTag[];
}): Promise<ClassSummary> {
  const images = input.images || [];
  const prompt = buildPrompt(
    input.transcript,
    input.fallbackTitle || 'Untitled class',
    images.length > 0,
    input.tags || [],
  );

  const parts = [
    ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
    { text: prompt },
  ];

  const text = await generateGeminiText({
    feature: 'nexus.class-summary',
    parts,
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.4,
    maxOutputTokens: 4096,
  });

  return extractJson(text);
}
