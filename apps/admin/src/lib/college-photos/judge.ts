/**
 * Picks the best cover photo and logo with Gemini vision, through @neram/ai
 * (feature admin.college-photo-pick, so it counts against the AI budget and
 * obeys the kill switch).
 *
 * Returns null when the AI is blocked or fails; the caller then falls back to
 * the rule-based order, using only Wikimedia-curated images.
 */
import { AiBlockedError, generateGeminiText, type GeminiPart } from '@neram/ai';
import { downloadImage, judgeThumb } from './images';
import type { Candidate, CollegeForPhotos } from './types';

export interface JudgeResult {
  /** Acceptable covers, best first (indexes into the covers passed in). */
  covers: number[];
  logos: number[];
}

const SYSTEM = `You choose photos for a college directory page that students use to pick an architecture college.
Judge each numbered image strictly.

A good COVER is a real photograph of this college's campus: the outside of its buildings, entrance gate, campus grounds or an aerial view, in daylight, sharp, landscape.
Reject as a cover: logos, text banners, posters, admission adverts, collages, screenshots, maps, people as the main subject (portraits, crowds, events, classrooms full of students), interiors, stock photos, rendered 3D drawings, watermarked images, and photos that clearly show a different place.

A good LOGO is this college's emblem or crest on a plain background, readable, not a photo, not a generic icon.

Reply with JSON only: {"covers":[indexes of acceptable covers, best first],"logos":[indexes of acceptable logos, best first]}. Use [] when none is acceptable. Never include a rejected image.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    covers: { type: 'ARRAY', items: { type: 'INTEGER' } },
    logos: { type: 'ARRAY', items: { type: 'INTEGER' } },
  },
  required: ['covers', 'logos'],
};

/** The first {...} in a reply, for the odd model that wraps JSON in a sentence or a code fence. */
export function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error(`no JSON in reply: ${raw.slice(0, 120)}`);
    return JSON.parse(raw.slice(start, end + 1));
  }
}

export async function judgeCandidates(
  college: CollegeForPhotos,
  covers: Candidate[],
  logos: Candidate[],
): Promise<JudgeResult | null> {
  const parts: GeminiPart[] = [
    {
      text: `College: ${college.name}${college.city ? `, ${college.city}` : ''}${college.state ? `, ${college.state}` : ''}.`,
    },
  ];
  const seen = { covers: [] as number[], logos: [] as number[] };

  const addImages = async (list: Candidate[], label: 'COVER' | 'LOGO', into: number[]) => {
    for (let i = 0; i < list.length; i++) {
      try {
        const data = await judgeThumb(await downloadImage(list[i].thumbUrl || list[i].url, 12_000));
        parts.push({ text: `${label} candidate ${i}:` }, { inline_data: { mime_type: 'image/jpeg', data } });
        into.push(i);
      } catch {
        // Unreachable or not an image: it simply is not offered to the judge.
      }
    }
  };
  await addImages(covers, 'COVER', seen.covers);
  await addImages(logos, 'LOGO', seen.logos);
  if (seen.covers.length === 0 && seen.logos.length === 0) return { covers: [], logos: [] };

  try {
    const raw = await generateGeminiText({
      feature: 'admin.college-photo-pick',
      systemInstruction: SYSTEM,
      parts,
      temperature: 0,
      // Thinking models spend part of this before answering; 200 cut answers off.
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    });
    const parsed = parseJsonObject(raw) as Partial<JudgeResult>;
    const keep = (xs: unknown, allowed: number[]) =>
      Array.isArray(xs) ? [...new Set(xs.filter((x): x is number => Number.isInteger(x) && allowed.includes(x as number)))] : [];
    return { covers: keep(parsed.covers, seen.covers), logos: keep(parsed.logos, seen.logos) };
  } catch (err) {
    console.warn(
      `[college-photos] judge ${err instanceof AiBlockedError ? `blocked (${err.reason})` : 'failed'} for ${college.slug}:`,
      (err as Error).message,
    );
    return null;
  }
}
