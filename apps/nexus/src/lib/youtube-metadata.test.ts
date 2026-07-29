import { describe, it, expect } from 'vitest';
import {
  buildYouTubeTitle,
  buildYouTubeDescription,
  buildYouTubeTags,
  validateChapters,
  parseChaptersFromDescription,
  formatChapterTime,
  stripBannedDashes,
  hasBannedDashes,
  tagsCharCount,
  YT_TITLE_MAX,
  YT_DESCRIPTION_MAX,
  YT_TAGS_MAX_CHARS,
} from './youtube-metadata';

describe('stripBannedDashes', () => {
  it('replaces every banned dash form the repo rules call out', () => {
    expect(stripBannedDashes('Perspective — the basics')).toBe('Perspective , the basics');
    expect(stripBannedDashes('Drawing &mdash; part 2')).toBe('Drawing , part 2');
    expect(stripBannedDashes('One -- two')).toBe('One, two');
    expect(stripBannedDashes('En dash – here')).toBe('En dash , here');
  });

  it('leaves ordinary hyphens alone', () => {
    expect(stripBannedDashes('One-point perspective')).toBe('One-point perspective');
  });

  it('detects them for validation', () => {
    expect(hasBannedDashes('Clean title')).toBe(false);
    expect(hasBannedDashes('Dirty — title')).toBe(true);
  });
});

describe('formatChapterTime', () => {
  it('uses m:ss under an hour and h:mm:ss over', () => {
    expect(formatChapterTime(0)).toBe('0:00');
    expect(formatChapterTime(134)).toBe('2:14');
    expect(formatChapterTime(700)).toBe('11:40');
    expect(formatChapterTime(3661)).toBe('1:01:01');
  });

  it('floors fractional seconds and clamps negatives', () => {
    expect(formatChapterTime(59.9)).toBe('0:59');
    expect(formatChapterTime(-5)).toBe('0:00');
  });
});

describe('buildYouTubeTitle', () => {
  const base = {
    topic: 'One Point Perspective: Boxes and Eye Level',
    exam: 'both' as const,
    subject: 'Drawing',
    language: 'ta' as const,
  };

  it('front-loads the topic and appends exam, subject, language', () => {
    expect(buildYouTubeTitle(base)).toBe(
      'One Point Perspective: Boxes and Eye Level | NATA + JEE B.Arch | Drawing | Tamil',
    );
  });

  it('never exceeds the YouTube title limit', () => {
    const title = buildYouTubeTitle({ ...base, topic: 'A'.repeat(90) });
    expect(title.length).toBeLessThanOrEqual(YT_TITLE_MAX);
  });

  it('drops trailing segments rather than truncating mid-word', () => {
    // 75 + " | NATA + JEE B.Arch" (20) = 95. Neither " | Drawing" (10) nor
    // " | Tamil" (8) fits in the remaining 5 characters.
    const title = buildYouTubeTitle({ ...base, topic: 'B'.repeat(75) });
    expect(title).toBe(`${'B'.repeat(75)} | NATA + JEE B.Arch`);
    expect(title).not.toContain('Drawing');
    expect(title).not.toContain('Tamil');
  });

  it('keeps a later segment that still fits after skipping a longer one', () => {
    // 72 + 20 = 92. " | Drawing" (10) overflows, " | Tamil" (8) lands exactly on
    // 100. Filling the space beats leaving it empty, so the skip is deliberate.
    const title = buildYouTubeTitle({ ...base, topic: 'B'.repeat(72) });
    expect(title).toBe(`${'B'.repeat(72)} | NATA + JEE B.Arch | Tamil`);
    expect(title).toHaveLength(YT_TITLE_MAX);
  });

  it('keeps the topic alone when nothing else fits', () => {
    const topic = 'C'.repeat(95);
    expect(buildYouTubeTitle({ ...base, topic })).toBe(topic);
  });

  it('handles a class with no exam or language set', () => {
    expect(buildYouTubeTitle({ topic: 'Colour Theory', exam: null, language: null })).toBe(
      'Colour Theory',
    );
  });

  it('returns an empty string when there is no topic', () => {
    expect(buildYouTubeTitle({ ...base, topic: '   ' })).toBe('');
  });

  it('strips banned dashes out of the topic', () => {
    expect(hasBannedDashes(buildYouTubeTitle({ ...base, topic: 'Shading — basics' }))).toBe(false);
  });
});

describe('buildYouTubeDescription', () => {
  const parts = {
    hook: 'Learn how to set an eye level and build boxes in one point perspective.',
    bullets: ['Setting the horizon line', 'Constructing cubes above eye level'],
    chapters: [
      { t: 0, label: 'Introduction' },
      { t: 134, label: 'Horizon line and vanishing point' },
      { t: 700, label: 'Building the first box' },
    ],
    topics: ['Drawing', 'Perspective'],
    searchTerms: ['one point perspective', 'vanishing point', 'eye level'],
    exam: 'both' as const,
    difficulty: 'beginner' as const,
    language: 'ta_en' as const,
    classDate: '2026-07-12',
    tutorName: 'Sudharshini',
  };

  it('opens with the hook, because YouTube only shows the first lines in search', () => {
    expect(buildYouTubeDescription(parts).startsWith(parts.hook)).toBe(true);
  });

  it('starts the chapter list at 0:00 so YouTube builds real chapters', () => {
    const out = buildYouTubeDescription(parts);
    expect(out).toContain('Chapters\n0:00 Introduction');
    expect(out).toContain('2:14 Horizon line and vanishing point');
  });

  it('writes the metadata block and the search terms line', () => {
    const out = buildYouTubeDescription(parts);
    expect(out).toContain('Topic: Drawing, Perspective');
    expect(out).toContain('Exam: NATA, JEE B.Arch Paper 2');
    expect(out).toContain('Level: Beginner');
    expect(out).toContain('Language: Tamil and English');
    expect(out).toContain('Class date: 12 July 2026');
    expect(out).toContain('Tutor: Sudharshini');
    expect(out).toContain('Search terms: one point perspective, vanishing point, eye level');
  });

  it('always ends with the channel footer', () => {
    expect(buildYouTubeDescription(parts).trimEnd().endsWith(
      'Neram Classes, architecture entrance coaching for NATA and JEE B.Arch.',
    )).toBe(true);
  });

  it('omits sections it has no data for', () => {
    const out = buildYouTubeDescription({
      ...parts, chapters: [], bullets: [], searchTerms: [], tutorName: null,
    });
    expect(out).not.toContain('Chapters');
    expect(out).not.toContain('In this class:');
    expect(out).not.toContain('Search terms:');
    expect(out).not.toContain('Tutor:');
  });

  it('stays inside the 5000 character limit and keeps the footer', () => {
    const out = buildYouTubeDescription({
      ...parts,
      bullets: Array.from({ length: 200 }, (_, i) => `A very long bullet number ${i} `.repeat(6)),
    });
    expect(out.length).toBeLessThanOrEqual(YT_DESCRIPTION_MAX);
    expect(out).toContain('Neram Classes, architecture entrance coaching');
  });

  it('contains no banned dashes even when the AI supplied them', () => {
    const out = buildYouTubeDescription({
      ...parts,
      hook: 'Perspective — the fast way',
      bullets: ['Step one &mdash; horizon'],
    });
    expect(hasBannedDashes(out)).toBe(false);
  });
});

describe('validateChapters', () => {
  const ok = [
    { t: 0, label: 'Intro' },
    { t: 60, label: 'Middle' },
    { t: 200, label: 'End' },
  ];

  it('accepts a well formed list', () => {
    expect(validateChapters(ok)).toEqual([]);
  });

  it('accepts an empty list, chapters are optional', () => {
    expect(validateChapters([])).toEqual([]);
  });

  it('rejects a list that does not start at 0:00', () => {
    const problems = validateChapters([{ t: 30, label: 'Intro' }, ...ok.slice(1)]);
    expect(problems.some((p) => p.message.includes('0:00'))).toBe(true);
  });

  it('rejects fewer than three chapters', () => {
    const problems = validateChapters(ok.slice(0, 2));
    expect(problems.some((p) => p.message.includes('at least 3'))).toBe(true);
  });

  it('rejects chapters closer than ten seconds', () => {
    const problems = validateChapters([
      { t: 0, label: 'Intro' },
      { t: 5, label: 'Too soon' },
      { t: 200, label: 'End' },
    ]);
    expect(problems.some((p) => p.message.includes('10 seconds'))).toBe(true);
  });

  it('rejects out of order chapters', () => {
    const problems = validateChapters([
      { t: 0, label: 'Intro' },
      { t: 300, label: 'Later' },
      { t: 100, label: 'Earlier' },
    ]);
    expect(problems.some((p) => p.message.includes('not after'))).toBe(true);
  });

  it('rejects a blank label', () => {
    const problems = validateChapters([...ok.slice(0, 2), { t: 300, label: '  ' }]);
    expect(problems.some((p) => p.message.includes('needs a label'))).toBe(true);
  });
});

describe('parseChaptersFromDescription', () => {
  const good = [
    'Some intro line',
    '',
    'Chapters',
    '0:00 Introduction',
    '2:14 Horizon line',
    '11:40 First box',
    '',
    'Topic: Drawing',
  ].join('\n');

  it('reads a well formed list back out', () => {
    expect(parseChaptersFromDescription(good)).toEqual([
      { t: 0, label: 'Introduction' },
      { t: 134, label: 'Horizon line' },
      { t: 700, label: 'First box' },
    ]);
  });

  it('round-trips what buildYouTubeDescription writes', () => {
    const chapters = [
      { t: 0, label: 'Intro' },
      { t: 90, label: 'Middle' },
      { t: 300, label: 'End' },
    ];
    const description = buildYouTubeDescription({
      hook: 'A hook', bullets: [], chapters, topics: [], searchTerms: [],
      exam: null, difficulty: null, language: null,
    });
    expect(parseChaptersFromDescription(description)).toEqual(chapters);
  });

  it('handles h:mm:ss for a long class', () => {
    const out = parseChaptersFromDescription(
      '0:00 Start\n45:00 Middle\n1:01:01 Late section',
    );
    expect(out[2]).toEqual({ t: 3661, label: 'Late section' });
  });

  it('returns nothing when YouTube itself would not render chapters', () => {
    // Fewer than three, not starting at 0:00, or closer than ten seconds apart.
    expect(parseChaptersFromDescription('0:00 A\n1:00 B')).toEqual([]);
    expect(parseChaptersFromDescription('0:30 A\n1:00 B\n2:00 C')).toEqual([]);
    expect(parseChaptersFromDescription('0:00 A\n0:05 B\n2:00 C')).toEqual([]);
  });

  it('ignores a timestamp mentioned mid-sentence', () => {
    const out = parseChaptersFromDescription(
      'We start at 0:00 and it runs long.\nAnother normal line.',
    );
    expect(out).toEqual([]);
  });

  it('ignores a timestamp with no label', () => {
    expect(parseChaptersFromDescription('0:00\n2:00 B\n4:00 C')).toEqual([]);
  });

  it('handles null and empty descriptions', () => {
    expect(parseChaptersFromDescription(null)).toEqual([]);
    expect(parseChaptersFromDescription('')).toEqual([]);
  });
});

describe('buildYouTubeTags', () => {
  it('orders topics first, then search terms, then exam', () => {
    const tags = buildYouTubeTags({
      topics: ['Perspective'],
      searchTerms: ['vanishing point'],
      exam: 'nata',
    });
    expect(tags.slice(0, 3)).toEqual(['Perspective', 'vanishing point', 'NATA']);
  });

  it('drops case insensitive duplicates', () => {
    const tags = buildYouTubeTags({
      topics: ['Perspective'],
      searchTerms: ['perspective', 'PERSPECTIVE', 'eye level'],
      exam: null,
    });
    expect(tags.filter((t) => t.toLowerCase() === 'perspective')).toHaveLength(1);
    expect(tags).toContain('eye level');
  });

  it('stays inside the 500 character budget', () => {
    const tags = buildYouTubeTags({
      topics: Array.from({ length: 80 }, (_, i) => `topic number ${i} with padding`),
      searchTerms: [],
      exam: 'both',
    });
    expect(tagsCharCount(tags)).toBeLessThanOrEqual(YT_TAGS_MAX_CHARS);
  });

  it('removes commas and quotes, which would split a tag in Studio', () => {
    const tags = buildYouTubeTags({
      topics: ['Drawing, sketching', 'a "quoted" tag'],
      searchTerms: [],
      exam: null,
    });
    expect(tags.some((t) => t.includes(','))).toBe(false);
    expect(tags.some((t) => t.includes('"'))).toBe(false);
  });

  it('skips blanks instead of emitting empty tags', () => {
    const tags = buildYouTubeTags({ topics: ['', '   '], searchTerms: [], exam: null });
    expect(tags.every((t) => t.length > 0)).toBe(true);
  });
});
