import { describe, it, expect } from 'vitest';
import { answerTitle, isLongAnswer, parseAintraAnswer, plainInline } from './parse';

/** The reply from the screenshot that started the redesign (2026-10-15), rows joined on one line. */
const SCREENSHOT_REPLY = `At Neram Classes, we offer structured coaching programs. Here are our exact fee details:

| Course | Duration | Installment | Single Payment | | :--- | :--- | :--- | :--- | | Crash Course | 3 months | — | ₹15,000 | | 1-Year Program | 12 months | ₹30,000 | ₹25,000 | | 2-Year Program | 24 months | ₹35,000 | ₹30,000 |

We offer scholarship opportunities.`;

describe('parseAintraAnswer', () => {
  it('rebuilds the table whose rows arrived on one line', () => {
    const { blocks } = parseAintraAnswer(SCREENSHOT_REPLY);
    const table = blocks.find((b) => b.type === 'table');
    expect(table).toEqual({
      type: 'table',
      header: ['Course', 'Duration', 'Installment', 'Single Payment'],
      align: ['left', 'left', 'left', 'left'],
      rows: [
        ['Crash Course', '3 months', 'Not available', '₹15,000'],
        ['1-Year Program', '12 months', '₹30,000', '₹25,000'],
        ['2-Year Program', '24 months', '₹35,000', '₹30,000'],
      ],
    });
    expect(blocks[0]).toMatchObject({ type: 'paragraph' });
    expect(blocks[blocks.length - 1]).toMatchObject({ type: 'paragraph', text: 'We offer scholarship opportunities.' });
  });

  it('reads a normal GFM table with alignment', () => {
    const { blocks } = parseAintraAnswer('| College | Fee |\n|:---|---:|\n| SPA | ₹1,00,000 |\n| NIT | ₹1,50,000 |');
    expect(blocks).toEqual([
      {
        type: 'table',
        header: ['College', 'Fee'],
        align: ['left', 'right'],
        rows: [
          ['SPA', '₹1,00,000'],
          ['NIT', '₹1,50,000'],
        ],
      },
    ]);
  });

  it('pads and trims rows to the header width', () => {
    const { blocks } = parseAintraAnswer('| A | B |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |');
    expect(blocks[0]).toMatchObject({ rows: [['1', ''], ['1', '2']] });
  });

  it('lets text and list lines share a block (the old renderer could not)', () => {
    const { blocks } = parseAintraAnswer('Online classes:\n- Alternate days\n- 7:00 PM to 8:30 PM\nJoin anytime.');
    expect(blocks).toEqual([
      { type: 'paragraph', text: 'Online classes:' },
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          { text: 'Alternate days', depth: 0 },
          { text: '7:00 PM to 8:30 PM', depth: 0 },
        ],
      },
      { type: 'paragraph', text: 'Join anytime.' },
    ]);
  });

  it('reads numbered lists, nested bullets and headings', () => {
    const { blocks } = parseAintraAnswer('### How to apply\n3. Fill the form\n  - takes 5 minutes\n4. Pay the fee');
    expect(blocks).toEqual([
      { type: 'heading', level: 3, text: 'How to apply' },
      {
        type: 'list',
        ordered: true,
        start: 3,
        items: [
          { text: 'Fill the form', depth: 0 },
          { text: 'takes 5 minutes', depth: 1 },
          { text: 'Pay the fee', depth: 0 },
        ],
      },
    ]);
  });

  it('keeps single line breaks inside a paragraph', () => {
    const { blocks } = parseAintraAnswer('Phone: +91 91761 37043\nEmail: info@neramclasses.com');
    expect(blocks).toEqual([{ type: 'paragraph', text: 'Phone: +91 91761 37043\nEmail: info@neramclasses.com' }]);
  });

  it('reads quotes, rules and code', () => {
    const { blocks } = parseAintraAnswer('> Tip: start early\n\n---\n\n```\nNATA = Part A + Part B\n```');
    expect(blocks).toEqual([
      { type: 'quote', text: 'Tip: start early' },
      { type: 'hr' },
      { type: 'code', text: 'NATA = Part A + Part B' },
    ]);
  });

  describe('directives', () => {
    it('turns [[fees]] into a fee block, all programs or the ones named', () => {
      expect(parseAintraAnswer('Here you go:\n[[fees]]').blocks[1]).toEqual({ type: 'fees', ids: null });
      expect(parseAintraAnswer('[[fees:1-year, 2-year]]').blocks[0]).toEqual({ type: 'fees', ids: ['1-year', '2-year'] });
    });

    it('merges one-per-program [[fees:x]] lines into a single set of cards (seen live, 2026-10-15)', () => {
      expect(parseAintraAnswer('Programs:\n\n[[fees:crash]]\n[[fees:1-year]]\n[[fees:2-year]]\n\nMore.').blocks).toEqual([
        { type: 'paragraph', text: 'Programs:' },
        { type: 'fees', ids: ['crash', '1-year', '2-year'] },
        { type: 'paragraph', text: 'More.' },
      ]);
      expect(parseAintraAnswer('[[fees:crash]]\n[[fees]]').blocks).toEqual([{ type: 'fees', ids: null }]);
    });

    it('keeps only known CTA actions, once each', () => {
      expect(parseAintraAnswer('[[cta:apply,demo,apply,teleport]]').blocks).toEqual([
        { type: 'cta', actions: ['apply', 'demo'] },
      ]);
      expect(parseAintraAnswer('[[cta:teleport]]').blocks).toEqual([]);
    });

    it('collects up to three suggestions, even when written at the end of a sentence', () => {
      const parsed = parseAintraAnswer('Anything else? [[suggest: Is there EMI? | Scholarships? | Demo? | Fourth?]]');
      expect(parsed.blocks).toEqual([{ type: 'paragraph', text: 'Anything else?' }]);
      expect(parsed.suggestions).toEqual(['Is there EMI?', 'Scholarships?', 'Demo?']);
    });

    it('drops directives it does not know', () => {
      expect(parseAintraAnswer('Hi\n[[confetti]]').blocks).toEqual([{ type: 'paragraph', text: 'Hi' }]);
    });
  });

  describe('dashes (no em dashes on the site)', () => {
    it('turns a spaced em dash into a comma and a spaced en dash range into "to"', () => {
      const { blocks } = parseAintraAnswer('Online classes — the best choice. Office: 9:00 AM – 6:00 PM. Self—paced.');
      expect(blocks[0]).toEqual({
        type: 'paragraph',
        text: 'Online classes, the best choice. Office: 9:00 AM to 6:00 PM. Self, paced.',
      });
    });

    it('leaves hyphenated words and list dashes alone', () => {
      const { blocks } = parseAintraAnswer('- 1-Year Program\n- 2-Year Program');
      expect(blocks[0]).toMatchObject({ items: [{ text: '1-Year Program' }, { text: '2-Year Program' }] });
    });
  });

  describe('while streaming', () => {
    it('holds back an unfinished directive', () => {
      const parsed = parseAintraAnswer('Here are the fees:\n[[fe', { streaming: true });
      expect(parsed.blocks).toEqual([{ type: 'paragraph', text: 'Here are the fees:' }]);
      // "[" and "[suggest: ...]]" arrived in two deltas in a live answer.
      expect(parseAintraAnswer('Apply today.\n\n[', { streaming: true }).blocks).toEqual([
        { type: 'paragraph', text: 'Apply today.' },
      ]);
    });

    it('holds back an unfinished table row and a header still waiting for its separator', () => {
      expect(parseAintraAnswer('Fees:\n| Course | Fe', { streaming: true }).blocks).toEqual([
        { type: 'paragraph', text: 'Fees:' },
      ]);
      expect(parseAintraAnswer('Fees:\n| Course | Fee |\n', { streaming: true }).blocks).toEqual([
        { type: 'paragraph', text: 'Fees:' },
      ]);
    });

    it('shows complete table rows as they arrive', () => {
      const parsed = parseAintraAnswer('| A | B |\n|---|---|\n| 1 | 2 |\n| 3 |', { streaming: true });
      expect(parsed.blocks[0]).toMatchObject({ type: 'table', rows: [['1', '2']] });
    });

    it('shows an unclosed code fence as far as it goes', () => {
      expect(parseAintraAnswer('```\nline one', { streaming: true }).blocks).toEqual([{ type: 'code', text: 'line one' }]);
    });
  });

  it('removes leaked reasoning from open backup models', () => {
    expect(parseAintraAnswer('<think>the user wants fees</think>Fees are below.').blocks).toEqual([
      { type: 'paragraph', text: 'Fees are below.' },
    ]);
    expect(parseAintraAnswer('<think>still thinking', { streaming: true }).blocks).toEqual([]);
  });
});

describe('helpers', () => {
  it('plainInline strips bold, italics, code and keeps link targets', () => {
    expect(plainInline('**₹25,000** for *one* year, see [Apply](/apply) `now`')).toBe(
      '₹25,000 for one year, see Apply (/apply) now',
    );
  });

  it('isLongAnswer: long text or two sections', () => {
    const short = 'A short answer.';
    expect(isLongAnswer(short, parseAintraAnswer(short))).toBe(false);
    const sectioned = '### One\ntext\n### Two\ntext';
    expect(isLongAnswer(sectioned, parseAintraAnswer(sectioned))).toBe(true);
    const long = 'word '.repeat(300);
    expect(isLongAnswer(long, parseAintraAnswer(long))).toBe(true);
  });

  it('answerTitle prefers a heading, then the kind of content', () => {
    expect(answerTitle(parseAintraAnswer('## **NATA** pattern\ntext'))).toBe('NATA pattern');
    expect(answerTitle(parseAintraAnswer('[[fees]]'))).toBe('Fee details');
    expect(answerTitle(parseAintraAnswer('| a | b |\n|---|---|\n| 1 | 2 |'))).toBe('Comparison');
  });
});
