import { describe, it, expect } from 'vitest';
import {
  buildVideoMetaPrompt,
  parseVideoMeta,
  parseChapterTime,
  validateVideoMeta,
  validateVideoMetaPatch,
  CLASS_VIDEO_META_EXAMPLE,
  MAX_PROMPT_TRANSCRIPT_CHARS,
  type AllowedTag,
} from './class-video-meta-schema';

const TAGS: AllowedTag[] = [
  { slug: 'drawing', label: 'Drawing', group_type: 'subject', aliases: ['sketching', 'shading'] },
  { slug: 'perspective', label: 'Perspective', group_type: 'subject', aliases: ['vanishing point'] },
  { slug: 'aptitude', label: 'Aptitude', group_type: 'subject', aliases: null },
  { slug: 'nata', label: 'NATA', group_type: 'exam', aliases: null },
];

const GOOD = {
  topic_phrase: 'One Point Perspective: Boxes and Eye Level',
  hook: 'Learn how to set an eye level and build boxes in one point perspective.',
  bullets: ['Setting the horizon line', 'Constructing cubes'],
  chapters: [
    { time: '0:00', label: 'Introduction' },
    { time: '2:14', label: 'Horizon line' },
    { time: '11:40', label: 'First box' },
  ],
  tag_slugs: ['drawing', 'perspective'],
  search_terms: ['one point perspective', 'vanishing point'],
  category: 'drawing',
  exam: 'both',
  language: 'ta_en',
  difficulty: 'beginner',
};

describe('buildVideoMetaPrompt', () => {
  const cls = {
    title: 'Day 13 Perspective drawing',
    description: 'Intro to one point perspective',
    scheduled_date: '2026-07-12',
    summary_bullets: ['Drew boxes', 'Talked about eye level'],
  };

  it('inlines the class facts so the teacher pastes only once', () => {
    const prompt = buildVideoMetaPrompt({ cls, tutorName: 'Sudharshini', transcript: 'hello', tags: TAGS });
    expect(prompt).toContain('Day 13 Perspective drawing');
    expect(prompt).toContain('2026-07-12');
    expect(prompt).toContain('Sudharshini');
    expect(prompt).toContain('Drew boxes');
  });

  it('lists the allowed tags with their aliases, and leaves exam tags out', () => {
    const prompt = buildVideoMetaPrompt({ cls, transcript: 'x', tags: TAGS });
    expect(prompt).toContain('- perspective: Perspective');
    expect(prompt).toContain('also called: vanishing point');
    // Exam is a filter, not a topic, so it is not offered as a topic tag.
    expect(prompt).not.toContain('- nata: NATA');
  });

  it('embeds the transcript and caps it at the paste limit', () => {
    const prompt = buildVideoMetaPrompt({
      cls, tags: TAGS, transcript: 'y'.repeat(MAX_PROMPT_TRANSCRIPT_CHARS + 5000),
    });
    expect(prompt).toContain('Transcript of the class');
    expect(prompt.length).toBeLessThan(MAX_PROMPT_TRANSCRIPT_CHARS + 6000);
  });

  it('tells the AI not to invent chapters when there is no transcript', () => {
    const prompt = buildVideoMetaPrompt({ cls, tags: TAGS, transcript: null });
    expect(prompt).toContain('no transcript');
    expect(prompt).toContain('Do not invent chapters');
  });

  it('carries the repo content rule into the prompt', () => {
    const prompt = buildVideoMetaPrompt({ cls, tags: TAGS, transcript: 'x' });
    expect(prompt).toContain('Never use an em dash');
  });

  it('ships the output schema so the model has an exact shape to copy', () => {
    const prompt = buildVideoMetaPrompt({ cls, tags: TAGS, transcript: 'x' });
    expect(prompt).toContain(JSON.stringify(CLASS_VIDEO_META_EXAMPLE, null, 2));
  });
});

describe('parseChapterTime', () => {
  it('reads m:ss and h:mm:ss', () => {
    expect(parseChapterTime('0:00')).toBe(0);
    expect(parseChapterTime('2:14')).toBe(134);
    expect(parseChapterTime('1:01:01')).toBe(3661);
  });

  it('accepts a raw second count from either a number or a string', () => {
    expect(parseChapterTime(134)).toBe(134);
    expect(parseChapterTime('134')).toBe(134);
  });

  it('rejects nonsense rather than guessing', () => {
    expect(parseChapterTime('soon')).toBeNull();
    expect(parseChapterTime('1:2:3:4')).toBeNull();
    expect(parseChapterTime('')).toBeNull();
    expect(parseChapterTime(-5)).toBeNull();
    expect(parseChapterTime(null)).toBeNull();
  });
});

describe('parseVideoMeta', () => {
  it('accepts raw JSON', () => {
    const result = parseVideoMeta(JSON.stringify(GOOD), TAGS);
    expect(result.valid).toBe(true);
    expect(result.data?.tagSlugs).toEqual(['drawing', 'perspective']);
  });

  it('accepts a fenced block, which is what chatbots actually return', () => {
    const result = parseVideoMeta('```json\n' + JSON.stringify(GOOD) + '\n```', TAGS);
    expect(result.valid).toBe(true);
  });

  it('accepts JSON wrapped in chatbot prose', () => {
    const result = parseVideoMeta(`Here you go!\n${JSON.stringify(GOOD)}\nHope that helps.`, TAGS);
    expect(result.valid).toBe(true);
  });

  it('reports empty and unparseable input clearly', () => {
    expect(parseVideoMeta('', TAGS).errors[0]).toContain('Paste the JSON');
    expect(parseVideoMeta('not json at all', TAGS).errors[0]).toContain('not valid JSON');
  });
});

describe('validateVideoMeta', () => {
  it('converts chapter timestamps to seconds and sorts them', () => {
    const result = validateVideoMeta({ ...GOOD, chapters: [
      { time: '11:40', label: 'Third' },
      { time: '0:00', label: 'First' },
      { time: '2:14', label: 'Second' },
    ] }, TAGS);
    expect(result.data?.chapters).toEqual([
      { t: 0, label: 'First' },
      { t: 134, label: 'Second' },
      { t: 700, label: 'Third' },
    ]);
  });

  it('drops an unusable chapter but keeps the rest', () => {
    const result = validateVideoMeta({ ...GOOD, chapters: [
      ...GOOD.chapters,
      { time: 'later on', label: 'Broken' },
    ] }, TAGS);
    expect(result.valid).toBe(true);
    expect(result.data?.chapters).toHaveLength(3);
    expect(result.warnings.some((w) => w.includes('1 chapter'))).toBe(true);
  });

  it('warns instead of failing when chapters break a YouTube rule', () => {
    // The teacher can still fix this by hand. Blocking the save would send them
    // back to the chatbot for something they can edit in place.
    const result = validateVideoMeta({ ...GOOD, chapters: [
      { time: '0:30', label: 'Late start' },
      { time: '2:14', label: 'Second' },
      { time: '11:40', label: 'Third' },
    ] }, TAGS);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('0:00'))).toBe(true);
  });

  it('drops a tag that is not in the registry, and says which one', () => {
    const result = validateVideoMeta({ ...GOOD, tag_slugs: ['drawing', 'made_up_tag'] }, TAGS);
    expect(result.valid).toBe(true);
    expect(result.data?.tagSlugs).toEqual(['drawing']);
    expect(result.warnings.some((w) => w.includes('made_up_tag'))).toBe(true);
  });

  it('deduplicates tags and lowercases search terms', () => {
    const result = validateVideoMeta({
      ...GOOD,
      tag_slugs: ['drawing', 'DRAWING', 'drawing'],
      search_terms: ['Vanishing Point', 'vanishing point', 'Eye Level'],
    }, TAGS);
    expect(result.data?.tagSlugs).toEqual(['drawing']);
    expect(result.data?.searchTerms).toEqual(['vanishing point', 'eye level']);
  });

  it('blanks an invalid enum with a warning instead of failing', () => {
    const result = validateVideoMeta({ ...GOOD, exam: 'gate', difficulty: 'very hard' }, TAGS);
    expect(result.valid).toBe(true);
    expect(result.data?.exam).toBeNull();
    expect(result.data?.difficulty).toBeNull();
    expect(result.warnings.some((w) => w.includes('gate'))).toBe(true);
  });

  it('fails when the topic phrase is missing, since nothing can be titled', () => {
    const result = validateVideoMeta({ ...GOOD, topic_phrase: '  ' }, TAGS);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('topic_phrase'))).toBe(true);
  });

  it('rejects a non-object paste', () => {
    expect(validateVideoMeta([GOOD], TAGS).valid).toBe(false);
    expect(validateVideoMeta('a string', TAGS).valid).toBe(false);
  });

  it('cleans em dashes the model slipped in rather than rejecting the whole paste', () => {
    const result = validateVideoMeta({
      ...GOOD,
      topic_phrase: 'Perspective — the basics',
      bullets: ['Step one &mdash; horizon'],
    }, TAGS);
    expect(result.valid).toBe(true);
    expect(result.data?.topicPhrase).not.toContain('—');
    expect(result.data?.bullets[0]).not.toContain('&mdash;');
  });

  it('warns about every empty soft field so the teacher knows what to fill', () => {
    const result = validateVideoMeta({ topic_phrase: 'Something' }, TAGS);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes('hook'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('bullets'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('topic tags'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('search_terms'))).toBe(true);
  });
});

describe('validateVideoMetaPatch', () => {
  it('accepts a clean payload', () => {
    expect(validateVideoMetaPatch({
      yt_title: 'Perspective basics | NATA',
      yt_description: 'Short description',
      yt_tags: ['perspective', 'drawing'],
      chapters: [
        { t: 0, label: 'Intro' },
        { t: 60, label: 'Middle' },
        { t: 200, label: 'End' },
      ],
      language: 'ta',
      exam: 'nata',
      difficulty: 'beginner',
      category: 'drawing',
      status: 'ready',
    })).toEqual([]);
  });

  it('catches a title the teacher edited past the YouTube limit', () => {
    const errors = validateVideoMetaPatch({ yt_title: 'x'.repeat(101) });
    expect(errors.some((e) => e.includes('101'))).toBe(true);
  });

  it('catches an over-long description and an over-long tag list', () => {
    expect(validateVideoMetaPatch({ yt_description: 'x'.repeat(5001) })).toHaveLength(1);
    expect(validateVideoMetaPatch({
      yt_tags: Array.from({ length: 60 }, (_, i) => `a-fairly-long-tag-${i}`),
    })).toHaveLength(1);
  });

  it('catches em dashes the teacher typed by hand', () => {
    expect(validateVideoMetaPatch({ yt_title: 'Perspective — basics' })).toHaveLength(1);
    expect(validateVideoMetaPatch({ yt_description: 'Line one — line two' })).toHaveLength(1);
  });

  it('rejects chapters that break YouTube rules, since this is the last gate', () => {
    const errors = validateVideoMetaPatch({
      chapters: [{ t: 30, label: 'Late' }, { t: 60, label: 'B' }, { t: 200, label: 'C' }],
    });
    expect(errors.some((e) => e.includes('0:00'))).toBe(true);
  });

  it('rejects malformed chapter entries', () => {
    const errors = validateVideoMetaPatch({ chapters: [{ t: '0', label: 'Intro' }] });
    expect(errors.some((e) => e.includes('numeric time'))).toBe(true);
  });

  it('rejects unknown enum values and statuses', () => {
    expect(validateVideoMetaPatch({ language: 'fr' })).toHaveLength(1);
    expect(validateVideoMetaPatch({ exam: 'gate' })).toHaveLength(1);
    expect(validateVideoMetaPatch({ category: 'physics' })).toHaveLength(1);
    expect(validateVideoMetaPatch({ status: 'live' })).toHaveLength(1);
  });

  it('allows clearing an optional field with null', () => {
    expect(validateVideoMetaPatch({ language: null, exam: null, difficulty: null })).toEqual([]);
  });
});
