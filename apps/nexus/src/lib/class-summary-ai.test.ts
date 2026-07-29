import { describe, it, expect, vi, afterEach } from 'vitest';

// The module reads GEMINI_API_KEY into a constant at import time, so the key has
// to exist before the import runs, not merely before the first test.
vi.hoisted(() => {
  process.env.GEMINI_API_KEY = 'test-key';
});

import { buildTagList, generateClassSummary, type AllowedTag } from './class-summary-ai';

/**
 * The prompt has to carry the vocabulary. Without it the model invents its own
 * labels ("One Point Perspective" for a tag whose slug is `perspective`), which
 * is where the whole tag-matching problem started: the fix downstream can only
 * recover so much of what a blind model guesses.
 */

const TAGS: AllowedTag[] = [
  {
    slug: 'perspective',
    label: 'Perspective',
    group_type: 'subject',
    aliases: ['vanishing point', 'horizon line'],
  },
  { slug: 'shadow', label: 'Shadow', group_type: 'theme', aliases: [] },
  { slug: 'nata', label: 'NATA', group_type: 'exam', aliases: null },
];

describe('buildTagList', () => {
  it('writes one line per tag, slug first, with its aliases', () => {
    const list = buildTagList(TAGS);
    expect(list).toContain('- perspective: Perspective  (also called: vanishing point, horizon line)');
    expect(list).toContain('- shadow: Shadow');
  });

  it('leaves exam tags out: a class is never tagged with an exam name', () => {
    expect(buildTagList(TAGS)).not.toContain('nata');
  });
});

describe('generateClassSummary', () => {
  let fetchMock: any;

  const respondWith = (payload: unknown) =>
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
        }),
        { status: 200 },
      ),
    );

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const body = () => JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);

  it('puts every allowed tag in the prompt the model actually receives', async () => {
    fetchMock = respondWith({
      suggested_title: 'One Point Perspective Basics',
      short_description: 'Short.',
      detailed_description: 'Longer.',
      bullets: ['Drew a horizon line'],
      tag_slugs: ['perspective'],
      new_tags: [],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateClassSummary({
      transcript: [{ start: 0, end: 5, text: 'we drew the horizon line' }],
      fallbackTitle: 'Class by Ar Hari Babu',
      tags: TAGS,
    });

    const prompt = body().contents[0].parts.at(-1).text as string;
    expect(prompt).toContain('- perspective: Perspective');
    expect(prompt).toContain('vanishing point');
    expect(prompt).toContain('Pick tag_slugs ONLY from this list');
    expect(prompt).toContain('[0:00] we drew the horizon line');
    expect(result.tag_slugs).toEqual(['perspective']);
    expect(result.new_tags).toEqual([]);
  });

  it('tells the model to propose labels when there is no registry to pick from', async () => {
    fetchMock = respondWith({ suggested_title: 'T', bullets: [], tag_slugs: [], new_tags: [] });
    vi.stubGlobal('fetch', fetchMock);

    await generateClassSummary({ transcript: [], fallbackTitle: 'T', tags: [] });

    expect(body().contents[0].parts.at(-1).text).toContain('There is no tag list available');
  });

  it('reads the old suggested_tags shape as proposals rather than losing them', async () => {
    // A model that ignores the new schema still has to produce something the
    // server-side resolver can normalize; dropping these silently untagged the class.
    fetchMock = respondWith({
      suggested_title: 'Shadows',
      short_description: 'S',
      detailed_description: 'D',
      bullets: [],
      suggested_tags: [{ label: 'Vanishing Point', group_type: 'theme' }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateClassSummary({ transcript: [], fallbackTitle: 'T', tags: TAGS });

    expect(result.tag_slugs).toEqual([]);
    expect(result.new_tags).toEqual([{ label: 'Vanishing Point', group_type: 'theme' }]);
  });

  it('survives a model that fences its JSON or omits the tag fields', async () => {
    fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '```json\n{"suggested_title":"Isometric Cubes","short_description":"a","detailed_description":"b","bullets":["one"]}\n```',
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateClassSummary({ transcript: [], fallbackTitle: 'T', tags: TAGS });

    expect(result.suggested_title).toBe('Isometric Cubes');
    expect(result.tag_slugs).toEqual([]);
    expect(result.new_tags).toEqual([]);
  });
});
