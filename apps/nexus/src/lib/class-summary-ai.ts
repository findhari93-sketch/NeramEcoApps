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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Same fallback order drawing-ai uses; the first that answers wins.
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

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

export interface ClassSummary {
  suggested_title: string;
  short_description: string;
  detailed_description: string;
  bullets: string[];
  suggested_tags: SuggestedTag[];
}

const SYSTEM_INSTRUCTION = `You are the teaching assistant for Neram Classes, an architecture-entrance coaching program (NATA and JEE B.Arch). You are given the transcript of one live class, and sometimes photos of the drawings done in that class. Write a concise record of what the class actually taught.

Rules:
1. Write in clear, simple English aimed at a school student, even though the class is spoken in a mix of Tamil and English.
2. Completely ignore meeting boilerplate: join links, meeting IDs, passcodes, "who has submitted", roll-call, "can you hear me", and similar chatter. Summarize only the teaching.
3. suggested_title: the real topic of the class in 3 to 8 words (for example "Isometric Subtractive Cubes"), never a generic name like "Class by ...".
4. short_description: one or two plain sentences a student can scan.
5. detailed_description: one short paragraph (3 to 5 sentences) for a student who wants more.
6. bullets: 3 to 8 short points, each one thing that was taught or done, in the order it happened.
7. suggested_tags: 2 to 5 tags that make this class findable later. group_type is "subject" for the discipline (for example Drawing, Aptitude, Mathematics, Perspective) and "theme" for the specific idea (for example Isometric, Orthographic Projection, Shadow). Labels must be short (1 to 3 words), reusable across classes, and Title Case. Do not invent exam names as tags.
8. If the transcript is too thin to tell what was taught, still return your best guess from whatever signal exists (title, images); never return empty strings.
9. Never use an em dash, a double dash, or the &mdash; entity in any text you write. Use commas, colons, periods, or parentheses instead.

Respond ONLY with a JSON object of this exact shape (no markdown, no code fences):
{
  "suggested_title": "string",
  "short_description": "string",
  "detailed_description": "string",
  "bullets": ["string"],
  "suggested_tags": [{"label": "string", "group_type": "subject"}]
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

function buildPrompt(transcript: TranscriptEntry[], fallbackTitle: string, hasImages: boolean): string {
  const transcriptText = transcript.length
    ? buildTranscriptText(transcript)
    : '(no transcript text available)';
  const imageNote = hasImages
    ? '\nThe attached images are drawings done during this class. Use them to understand what was taught, especially for a drawing class.'
    : '';
  return `Scheduled title (may be a placeholder): "${fallbackTitle}"
${imageNote}

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
  const tags = Array.isArray(parsed.suggested_tags)
    ? parsed.suggested_tags
        .map((t: any) => ({
          label: String(t?.label || '').trim(),
          group_type: t?.group_type === 'subject' ? 'subject' : 'theme',
        }))
        .filter((t: SuggestedTag) => t.label)
    : [];

  return {
    suggested_title: String(parsed.suggested_title || '').trim(),
    short_description: String(parsed.short_description || '').trim(),
    detailed_description: String(parsed.detailed_description || '').trim(),
    bullets,
    suggested_tags: tags,
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
}): Promise<ClassSummary> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const images = input.images || [];
  const prompt = buildPrompt(input.transcript, input.fallbackTitle || 'Untitled class', images.length > 0);

  const parts: Array<Record<string, unknown>> = [
    ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
    { text: prompt },
  ];

  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.4,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) throw new Error('AI returned an empty response');
      return extractJson(text);
    }

    const errBody = await res.json().catch(() => ({}));

    if (res.status === 400 || res.status === 403) {
      console.error(`Gemini summary auth error (${res.status}):`, JSON.stringify(errBody));
      throw new Error(`Gemini API key invalid or unauthorized (${res.status}). Check GEMINI_API_KEY.`);
    }

    // 404 (model gone) or 429 (rate limited): try the next model, then give up.
    if (res.status === 404 || res.status === 429) {
      if (i < MODELS.length - 1) continue;
      if (res.status === 429) throw new Error('Gemini API 429: rate limit reached on all models');
    }

    console.error(`Gemini summary error (${res.status}) on ${model}:`, JSON.stringify(errBody));
    throw new Error(`Gemini API error: ${res.status}`);
  }

  throw new Error('Gemini API: all models exhausted');
}
