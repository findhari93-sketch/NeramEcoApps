import { describe, it, expect } from 'vitest';
import {
  applyDrawingPartsToWrite,
  findPart,
  withPartKeys,
  applyPartSolutionImages,
  mirroredPartSolution,
  composeDrawingPartsText,
  drawingPartsChipLabel,
  drawingPartsSummary,
  normalizeDrawingParts,
  partNumberLabel,
  readDrawingParts,
  stripPartSolutions,
  suggestDrawingParts,
  totalPartMarks,
} from './drawing-parts';

// ---------------------------------------------------------------------------
// The printed texts, copied from production rows (JEE Paper 2)
// ---------------------------------------------------------------------------

const Q81_2014 =
  '1(a) Draw a rectangular frame of size 140 mm × 210 mm. In this frame, compose an aesthetic 3-dimensional composition, appropriate to the size of the frame, comprising cubes, cones and cylinders. There is no restriction of numbers, sizes, placement and direction of these solids. Colour your composition to make it visually exciting. [20 marks]\n\n1(b) Draw the graphic given below, such that it is rotated clockwise at an angle of 90 degrees about the point "A". Care should be taken to get the same sizes of all lines in the new rotated position. [20 marks]';
const Q81_2014_HI =
  '1(a) 140 मि.मी. × 210 मि.मी. का आयताकार फ्रेम बनाइए। इस फ्रेम में एक सौन्दर्यात्मक त्रिविम संयोजन को बनाएँ जिसका आकार आयत के उपयुक्त हो, जिसमें घनों, शंकुओं और बेलनों का प्रयोग हो। [20 अंक]\n\n1(b) नीचे दी गई आलेखी को, बिन्दु "A" से घड़ी की दिशा में, 90 डिग्री पर घुमा कर बनाएँ। [20 अंक]';

const Q82_2014 =
  'Draw from memory a balloon seller, selling balloons to a group of small children.\n\nOR\n\nDraw from memory a scene of a group of village women around a handpump with their pitchers/utensils for filling water.';
const Q82_2014_HI =
  'स्मरण शक्ति से, एक गुब्बारे बेचने वाले को, एक छोटे बच्चों के समूह को गुब्बारे बेचते हुए चित्रित करें।\n\nअथवा\n\nस्मरण शक्ति से, गाँव की महिलाओं के एक समूह को एक हैंड पम्प के गिर्द पानी भरने के लिए अपने घड़ों और बर्तनों के साथ चित्रित करें।';

const Q83_2019_S1 =
  '(c) Make a beautiful colorful design for male shirting material. 30 Marks\nOR\nDraw a picture of your favourite film star as realistic as possible.\nOR\nDraw from memory a picture of your school showing the surroundings.';
const Q83_2019_S1_HI =
  '(c) नर कमीज़ों के कपड़े के लिए एक सुंदर रंगीन डिज़ाइन बनायें। 30 Marks\nया\nयथासंभव यथार्थवादी के रूप में अपने पसंदीदा फिल्म स्टार की एक तस्वीर बनाएं।\nया\nयादृच्छिक दिखाते हुए अपने स्कूल की एक तस्वीर स्मृति से ड्रा करें।';

const Q3_2019_S2 =
  'In the space provided for the answer of this question attempt any ONE of the following: (a) Design and draw an appropriate pattern for a square table cloth. Color or shade it to enhance its visual quality. OR (b) Draw a picture of a classroom looking towards the teacher from behind the students. OR (c) Draw from imagination a picture of an officer sitting in his office.';

const Q2_2021 =
  "Draw a scene of a Kite festival by using colors. OR Draw a Harmonic three dimensional composition with the following two types of objects. (i) CUBOID A : SIZE 2 cm × 2 cm × 2 cm, 5 Nos. (ii) CUBOID B : SIZE 5 cm × 2 cm × 2 cm, 4 Nos. Use 'Cool Colorscheme' for composition.";

const Q81_2022_S2 =
  '(A) Draw a proportionate sketch of given Reference Image. Use black and white Pencil rendering technique for shading. OR (B) Decode the given reference image and create balance composition. Use black and white rendering technique.';

const SINGLE_2019_S1 =
  '(a) In the space provided in the answer sheet for this question, draw margin lines to form a frame. In this frame create an aesthetic composition using only curved lines. The shapes created by these curved lines can be of any size, and may be placed separate, overlapping or within each other.';

// ---------------------------------------------------------------------------
// suggestDrawingParts
// ---------------------------------------------------------------------------

describe('suggestDrawingParts', () => {
  it('splits 2014 Q81 into two compulsory parts with their marks', () => {
    const s = suggestDrawingParts(Q81_2014)!;
    expect(s.parts.mode).toBe('all');
    expect(s.parts.stem).toBeNull();
    expect(s.parts.items).toHaveLength(2);
    expect(s.parts.items[0]).toMatchObject({ id: 'a', label: 'A', marks: 20 });
    expect(s.parts.items[0].text.startsWith('Draw a rectangular frame')).toBe(true);
    expect(s.parts.items[0].text.endsWith('visually exciting.')).toBe(true);
    expect(s.parts.items[1]).toMatchObject({ id: 'b', label: 'B', marks: 20 });
    expect(s.parts.items[1].text.startsWith('Draw the graphic given below')).toBe(true);
    expect(s.questionMarks).toBeNull();
  });

  it('carries the 2014 Q81 Hindi into the matching parts', () => {
    const s = suggestDrawingParts(Q81_2014, Q81_2014_HI)!;
    expect(s.parts.items[0].text_hi?.startsWith('140 मि.मी.')).toBe(true);
    expect(s.parts.items[0].text_hi?.includes('अंक')).toBe(false);
    expect(s.parts.items[1].text_hi?.startsWith('नीचे दी गई आलेखी')).toBe(true);
  });

  it('splits 2014 Q82 into either/or options, Hindi on अथवा', () => {
    const s = suggestDrawingParts(Q82_2014, Q82_2014_HI)!;
    expect(s.parts.mode).toBe('any_one');
    expect(s.parts.items.map((p) => p.text)).toEqual([
      'Draw from memory a balloon seller, selling balloons to a group of small children.',
      'Draw from memory a scene of a group of village women around a handpump with their pitchers/utensils for filling water.',
    ]);
    expect(s.parts.items[1].text_hi?.startsWith('स्मरण शक्ति से, गाँव')).toBe(true);
  });

  it('reads three options, a label and question marks from 2019 Session 1 (c)', () => {
    const s = suggestDrawingParts(Q83_2019_S1, Q83_2019_S1_HI)!;
    expect(s.parts.mode).toBe('any_one');
    expect(s.parts.items).toHaveLength(3);
    expect(s.parts.items[0].text).toBe('Make a beautiful colorful design for male shirting material.');
    expect(s.parts.items[0].marks).toBeNull();
    expect(s.questionMarks).toBe(30);
    // या on its own line is the paper's OR.
    expect(s.parts.items[2].text_hi?.startsWith('यादृच्छिक')).toBe(true);
  });

  it('drops the "attempt any ONE" instruction, which the mode already says (2019 Session 2)', () => {
    const s = suggestDrawingParts(Q3_2019_S2)!;
    expect(s.parts.mode).toBe('any_one');
    expect(s.parts.stem).toBeNull();
    expect(s.parts.items).toHaveLength(3);
    expect(s.parts.items[0].text.startsWith('Design and draw')).toBe(true);
    expect(s.parts.items[2].text).toBe('Draw from imagination a picture of an officer sitting in his office.');
  });

  it('never splits on (i) and (ii) inside an option (2021 Q2)', () => {
    const s = suggestDrawingParts(Q2_2021)!;
    expect(s.parts.mode).toBe('any_one');
    expect(s.parts.items).toHaveLength(2);
    expect(s.parts.items[1].text).toContain('(i) CUBOID A');
    expect(s.parts.items[1].text).toContain('(ii) CUBOID B');
  });

  it('strips (A) and (B) labels from 2022 Session 2', () => {
    const s = suggestDrawingParts(Q81_2022_S2)!;
    expect(s.parts.items[0].text.startsWith('Draw a proportionate sketch')).toBe(true);
    expect(s.parts.items[1].text.startsWith('Decode the given reference image')).toBe(true);
  });

  it('returns null for a single task, even one that starts with (a)', () => {
    expect(suggestDrawingParts(SINGLE_2019_S1)).toBeNull();
    expect(suggestDrawingParts('Draw a proportionate sketch of the image given below in detail.')).toBeNull();
    expect(suggestDrawingParts('')).toBeNull();
    expect(suggestDrawingParts(null)).toBeNull();
  });

  it('leaves Hindi blank when it does not split the same way', () => {
    const s = suggestDrawingParts(Q82_2014, 'एक ही वाक्य बिना विकल्प के।')!;
    expect(s.parts.items.every((p) => p.text_hi == null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// normalize, compose, write
// ---------------------------------------------------------------------------

describe('normalizeDrawingParts', () => {
  it('relabels by position and drops marks in any_one mode', () => {
    const r = normalizeDrawingParts({
      mode: 'any_one',
      items: [
        { id: 'c', label: 'C', text: ' First ', marks: 30 },
        { id: 'z', label: 'Z', text: 'Second', solution_image_url: ' https://x/y.png ' },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.parts.items.map((p) => [p.id, p.label, p.text, p.marks])).toEqual([
      ['a', 'A', 'First', null],
      ['b', 'B', 'Second', null],
    ]);
    expect(r.parts.items[1].solution_image_url).toBe('https://x/y.png');
  });

  it('refuses a bad mode, too few or too many parts, and an empty part', () => {
    expect(normalizeDrawingParts({ mode: 'some', items: [{ text: 'a' }, { text: 'b' }] }).ok).toBe(false);
    expect(normalizeDrawingParts({ mode: 'all', items: [{ text: 'a' }] }).ok).toBe(false);
    expect(
      normalizeDrawingParts({ mode: 'all', items: [1, 2, 3, 4, 5].map((n) => ({ text: String(n) })) }).ok,
    ).toBe(false);
    const empty = normalizeDrawingParts({ mode: 'all', items: [{ text: 'a' }, { text: '  ' }] });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toContain('Part B');
    expect(normalizeDrawingParts(null).ok).toBe(false);
    expect(readDrawingParts({ mode: 'all' })).toBeNull();
  });
});

describe('composeDrawingPartsText', () => {
  it('rebuilds an either/or question with OR lines', () => {
    const parts = suggestDrawingParts(Q3_2019_S2)!.parts;
    const text = composeDrawingPartsText(parts)!;
    expect(text.startsWith('(A) Design and draw')).toBe(true);
    expect(text.split('\n\nOR\n\n')).toHaveLength(3);
  });

  it('rebuilds compulsory parts with their marks, and Hindi only when complete', () => {
    const parts = suggestDrawingParts(Q81_2014, Q81_2014_HI)!.parts;
    const en = composeDrawingPartsText(parts, 'en')!;
    expect(en).toContain('[20 marks]\n\n(B) Draw the graphic');
    const hi = composeDrawingPartsText(parts, 'hi')!;
    expect(hi).toContain('[20 अंक]');

    parts.items[1].text_hi = null;
    expect(composeDrawingPartsText(parts, 'hi')).toBeNull();
  });
});

describe('applyDrawingPartsToWrite', () => {
  it('rebuilds text, sums marks and mirrors the first solution', () => {
    const parts = suggestDrawingParts(Q81_2014)!.parts;
    parts.items[1].solution_image_url = 'https://cdn/b.png';
    const body: Record<string, unknown> = {
      question_format: 'DRAWING_PROMPT',
      question_text: 'stale',
      question_text_hi: 'पुराना',
      drawing_parts: parts,
    };
    expect(applyDrawingPartsToWrite(body)).toEqual({ ok: true });
    expect(body.question_text).toContain('(A) Draw a rectangular frame');
    // Parts carry no Hindi, so the stored Hindi is not overwritten.
    expect(body.question_text_hi).toBe('पुराना');
    expect(body.drawing_marks).toBe(40);
    expect(body.solution_image_url).toBe('https://cdn/b.png');
    expect(body.solution_video_url).toBeNull();
  });

  it('uses the stored format when the body does not say, and refuses a non-drawing', () => {
    const parts = suggestDrawingParts(Q82_2014)!.parts;
    expect(applyDrawingPartsToWrite({ drawing_parts: parts }, 'DRAWING_PROMPT').ok).toBe(true);
    const mcq = applyDrawingPartsToWrite({ drawing_parts: parts }, 'MCQ');
    expect(mcq.ok).toBe(false);
  });

  it('leaves a body without parts, or clearing parts, alone', () => {
    const plain: Record<string, unknown> = { question_text: 'x' };
    expect(applyDrawingPartsToWrite(plain).ok).toBe(true);
    expect(plain).toEqual({ question_text: 'x' });
    const cleared: Record<string, unknown> = { drawing_parts: null, question_text: 'merged' };
    expect(applyDrawingPartsToWrite(cleared, 'MCQ').ok).toBe(true);
    expect(cleared.question_text).toBe('merged');
  });

  it('does not set marks when a part is missing them', () => {
    const parts = suggestDrawingParts(Q81_2014)!.parts;
    parts.items[1].marks = null;
    const body: Record<string, unknown> = { question_format: 'DRAWING_PROMPT', drawing_parts: parts };
    applyDrawingPartsToWrite(body);
    expect('drawing_marks' in body).toBe(false);
  });
});

describe('screen helpers', () => {
  it('strips solutions for a test payload', () => {
    const parts = suggestDrawingParts(Q82_2014)!.parts;
    parts.items[0].solution_image_url = 'https://cdn/a.png';
    parts.items[0].solution_video_url = 'https://video';
    const stripped = stripPartSolutions(parts)!;
    expect(JSON.stringify(stripped)).not.toContain('https://');
    expect(stripped.items[0]).not.toHaveProperty('solution_image_url');
    expect(stripPartSolutions(null)).toBeNull();
  });

  it('words the mode for people', () => {
    const anyOne = suggestDrawingParts(Q83_2019_S1)!.parts;
    const all = suggestDrawingParts(Q81_2014)!.parts;
    expect(drawingPartsSummary(anyOne)).toBe('Attempt any one of 3');
    expect(drawingPartsSummary(all)).toBe('Answer both parts');
    expect(drawingPartsChipLabel(anyOne)).toBe('Any 1 of 3');
    expect(drawingPartsChipLabel(all)).toBe('2 parts');
    expect(partNumberLabel(81, all.items[1])).toBe('81B');
    expect(partNumberLabel(null, all.items[1])).toBe('B');
    expect(totalPartMarks(all)).toBe(40);
    expect(totalPartMarks(anyOne)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Per-part solution images
// ---------------------------------------------------------------------------

function twoParts(a: string | null, b: string | null) {
  return {
    mode: 'any_one' as const,
    stem: null,
    stem_hi: null,
    items: [
      { id: 'a', label: 'A', text: 'Draw a balloon seller.', text_hi: null, marks: null,
        solution_image_url: a, solution_video_url: null },
      { id: 'b', label: 'B', text: 'Draw women at a handpump.', text_hi: null, marks: null,
        solution_image_url: b, solution_video_url: null },
    ],
  };
}

describe('mirroredPartSolution', () => {
  it('takes the first part that has one', () => {
    expect(mirroredPartSolution(twoParts(null, 'https://x/b.png'))).toEqual({
      solution_image_url: 'https://x/b.png',
      solution_video_url: null,
    });
  });

  it('is null when no part has one', () => {
    expect(mirroredPartSolution(twoParts(null, null)).solution_image_url).toBeNull();
  });
});

describe('applyPartSolutionImages', () => {
  it('merges one part and leaves the others alone', () => {
    const result = applyPartSolutionImages(twoParts('https://x/a.png', null), {
      b: 'https://x/b.png',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.drawing_parts.items.map((p) => p.solution_image_url)).toEqual([
      'https://x/a.png',
      'https://x/b.png',
    ]);
    // Part A's text is untouched: pasting a picture is not a rewrite.
    expect(result.drawing_parts.items[0].text).toBe('Draw a balloon seller.');
  });

  it('re-applies the mirror so the question column follows the parts', () => {
    const cleared = applyPartSolutionImages(twoParts('https://x/a.png', 'https://x/b.png'), {
      a: null,
    });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    // A is gone, so the mirror moves to B rather than going stale on A.
    expect(cleared.solution_image_url).toBe('https://x/b.png');

    const emptied = applyPartSolutionImages(twoParts('https://x/a.png', null), { a: null });
    expect(emptied.ok).toBe(true);
    if (!emptied.ok) return;
    expect(emptied.solution_image_url).toBeNull();
  });

  it('ignores a part id the question no longer has', () => {
    // A teacher re-split the question in another tab. The paste into the parts
    // that survived still lands.
    const result = applyPartSolutionImages(twoParts(null, null), {
      a: 'https://x/a.png',
      d: 'https://x/d.png',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.drawing_parts.items).toHaveLength(2);
    expect(result.drawing_parts.items[0].solution_image_url).toBe('https://x/a.png');
  });

  it('refuses a question that is not split into parts', () => {
    const result = applyPartSolutionImages(null, { a: 'https://x/a.png' });
    expect(result).toEqual({ ok: false, error: 'This question is not split into parts.' });
  });
});

/**
 * A part's own figure, and an identity that survives a re-split.
 *
 * 2014 Q81 is "draw a frame of cubes and cones" OR "rotate the graphic below".
 * One image was stored for the pair and printed above both, so whichever part
 * the student picked, they were shown a figure belonging to the other one.
 *
 * `id` is the position, so deleting part A renames B to A. That was safe while
 * nothing pointed at a part; a student's drawing does, so it is stored against
 * `key`, which is minted once on write and never reassigned.
 */
describe('per-part figures and stable keys', () => {
  const partsWith = (over: Record<string, unknown>[]) => ({
    mode: 'any_one' as const,
    items: [
      { text: 'Draw a rectangular frame of cubes, cones and cylinders.', ...over[0] },
      { text: 'Rotate the graphic 90 degrees about point A.', ...over[1] },
    ],
  });

  it('keeps a figure on the part it belongs to', () => {
    const result = normalizeDrawingParts(
      partsWith([{}, { image_url: 'https://x/rotate.png' }]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.parts.items[0].image_url).toBeNull();
    expect(result.parts.items[1].image_url).toBe('https://x/rotate.png');
  });

  it('never mints a key while reading', () => {
    // readDrawingParts runs on every render. A key minted here would point a
    // student's drawing somewhere new each time the page drew itself.
    const parts = readDrawingParts(partsWith([{}, {}]));
    expect(parts?.items.every((i) => !i.key)).toBe(true);
  });

  it('mints a key for every part on write', () => {
    const body: Record<string, unknown> = {
      question_format: 'DRAWING_PROMPT',
      drawing_parts: partsWith([{}, {}]),
    };
    expect(applyDrawingPartsToWrite(body)).toEqual({ ok: true });
    const written = body.drawing_parts as { items: { key?: string | null }[] };
    expect(written.items[0].key).toBeTruthy();
    expect(written.items[1].key).toBeTruthy();
    expect(written.items[0].key).not.toBe(written.items[1].key);
  });

  it('leaves a key that already exists alone', () => {
    const kept = withPartKeys({
      mode: 'any_one',
      items: [
        { id: 'a', label: 'A', key: 'p-old-a', text: 'one' },
        { id: 'b', label: 'B', text: 'two' },
      ],
    });
    expect(kept.items[0].key).toBe('p-old-a');
    expect(kept.items[1].key).toBeTruthy();
    expect(kept.items[1].key).not.toBe('p-old-a');
  });

  it('a deleted part renumbers the rest but does not move their keys', () => {
    const before = withPartKeys({
      mode: 'any_one',
      items: [
        { id: 'a', label: 'A', text: 'one' },
        { id: 'b', label: 'B', text: 'two' },
      ],
    });
    const keyOfB = before.items[1].key;

    // Part A is removed. The old B is now in position A.
    const after = normalizeDrawingParts({
      mode: 'any_one',
      items: [before.items[1], { text: 'three' }],
    });
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.parts.items[0].id).toBe('a');
    expect(after.parts.items[0].key).toBe(keyOfB);
  });

  it('gives the same keys every time, so a re-import does not re-file work', () => {
    const write = () => {
      const body: Record<string, unknown> = {
        question_format: 'DRAWING_PROMPT',
        drawing_parts: partsWith([{}, {}]),
      };
      applyDrawingPartsToWrite(body);
      return (body.drawing_parts as { items: { key?: string | null }[] }).items.map((i) => i.key);
    };
    // A random key would differ on every parse, and importing the same paper
    // file twice would then point every drawing handed in at a new part.
    expect(write()).toEqual(write());
    expect(write()).toEqual(['a', 'b']);
  });

  it('never hands a retired key to a new part', () => {
    const grown = withPartKeys({
      mode: 'any_one',
      items: [
        // The old B, now sitting in position A after A was deleted.
        { id: 'a', label: 'A', key: 'b', text: 'was B' },
        { id: 'b', label: 'B', text: 'brand new' },
      ],
    });
    expect(grown.items[0].key).toBe('b');
    expect(grown.items[1].key).not.toBe('b');
  });

  it('keeps a part figure and key when the solutions are stripped for a test', () => {
    const stripped = stripPartSolutions({
      mode: 'any_one',
      items: [
        { id: 'a', label: 'A', key: 'a', text: 'Draw a frame of cubes.' },
        {
          id: 'b',
          label: 'B',
          key: 'b',
          text: 'Rotate the graphic below.',
          image_url: 'https://x/rotate.png',
          solution_image_url: 'https://x/answer.png',
        },
      ],
    });
    // The figure is the question here, not the answer. Dropping it with the
    // solutions would leave "rotate the graphic below" with no graphic.
    expect(stripped?.items[1].image_url).toBe('https://x/rotate.png');
    expect(stripped?.items[1].key).toBe('b');
    expect(stripped?.items[1].solution_image_url ?? null).toBeNull();
  });

  it('finds a part by its key before its position', () => {
    const parts = withPartKeys({
      mode: 'any_one',
      items: [
        { id: 'a', label: 'A', key: 'p-one', text: 'one' },
        { id: 'b', label: 'B', key: 'p-two', text: 'two' },
      ],
    });
    expect(findPart(parts, 'p-two')?.text).toBe('two');
    expect(findPart(parts, 'b')?.text).toBe('two');
    expect(findPart(parts, 'z')).toBeNull();
    expect(findPart(null, 'a')).toBeNull();
  });
});
