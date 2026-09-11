import { describe, it, expect } from 'vitest';
import {
  escapeIlike,
  matchTier,
  rankPeople,
  MatchTier,
  phoneticKey,
  editDistance,
  suggestPeople,
  nameMatchRanges,
} from './people-search';

/**
 * The real production roster that matches "%ya%" (16 of 86 impersonatable
 * students). YahulKishore is the only true prefix match and used to render
 * last, behind Ananya, Ilakiya and Ooveya.
 */
const ROSTER = [
  { name: 'Ananya AnoopPuthan', email: 'Ananya_AnoopPuthan@neramclasses.com' },
  { name: 'Aryakumar Amitkumar', email: 'Aryakumar@neramclasses.com' },
  { name: 'Ayana khan', email: 'Ayana_khan@neramclasses.com' },
  { name: 'Bavishiya Senthilkumar', email: 'nathibavi85@gmail.com' },
  { name: 'Dhivyadharshini Student', email: 'divya28040127_gmail.com#EXT#@nerasmclasses.onmicrosoft.com' },
  { name: 'Harshitaa Thiyagu', email: 'Harshitaa_Thiyagu@neramclasses.com' },
  { name: 'Ilakiya ThangavelRaja', email: 'Ilakiya@nerasmclasses.onmicrosoft.com' },
  { name: 'Inaya Nizamudeen', email: 'inayanizamudeen@gmail.com' },
  { name: 'Iswarya Palaniappan', email: 'Iswarya_Palaniappan@neramclasses.com' },
  { name: 'Kaveya Rameshbabu', email: 'Kaveya@neram.co.in' },
  { name: 'Logapriya Kumaresan', email: 'Logapriya@neram.co.in' },
  { name: 'Nethrra BadhriNarayanan', email: 'Nethrra@neram.co.in' },
  { name: 'Ooveya Velmurugan', email: 'Ooveya_Velmurugan@neramclasses.com' },
  { name: 'Padala Aradya', email: null },
  { name: 'Salaivarnodhaya Vanamali', email: 'VarnodhayaVanamali@neram.co.in' },
  { name: 'YahulKishore Nandhakumar', email: 'YahulKishore@neramclasses.com' },
];

const names = (rows: Array<{ name?: string | null }>) => rows.map((r) => r.name);

describe('rankPeople', () => {
  it('puts the prefix match first, the bug this fixes', () => {
    const ranked = rankPeople(ROSTER, 'ya');
    expect(ranked[0].name).toBe('YahulKishore Nandhakumar');
    expect(ranked).toHaveLength(16);
  });

  it('orders the remaining substring matches by where the hit starts, then by name', () => {
    const rest = rankPeople(ROSTER, 'ya').slice(1);
    const at = (name?: string | null) => (name || '').toLowerCase().indexOf('ya');
    const expected = [...rest].sort(
      (a, b) => at(a.name) - at(b.name) || (a.name || '').localeCompare(b.name || '')
    );
    expect(names(rest)).toEqual(names(expected));
    expect(rest[0].name).toBe('Ayana khan');
  });

  it('ranks a word start above a substring', () => {
    const ranked = rankPeople(ROSTER, 'kh');
    expect(ranked[0].name).toBe('Ayana khan');
  });

  it('treats a camelCase hump as a word start', () => {
    expect(rankPeople(ROSTER, 'puthan')[0].name).toBe('Ananya AnoopPuthan');
    expect(rankPeople(ROSTER, 'narayanan')[0].name).toBe('Nethrra BadhriNarayanan');
  });

  it('matches a null email by name without throwing', () => {
    const ranked = rankPeople(ROSTER, 'padala');
    expect(ranked[0].name).toBe('Padala Aradya');
    expect(ranked).toHaveLength(1);
  });

  it('ranks an email-only match below every name match', () => {
    const ranked = rankPeople(
      [
        { name: 'Zara Last', email: 'zzz@neramclasses.com' },
        { name: 'Bavishiya Senthilkumar', email: 'nathibavi85@gmail.com' },
      ],
      'nathi'
    );
    expect(names(ranked)).toEqual(['Bavishiya Senthilkumar']);
  });

  it('is case insensitive and tolerates padded input', () => {
    expect(rankPeople(ROSTER, '  YA  ')[0].name).toBe('YahulKishore Nandhakumar');
  });

  it('returns an empty list when nothing matches', () => {
    expect(rankPeople(ROSTER, 'zzzznotastudent')).toEqual([]);
  });

  it('returns the input untouched for an empty query', () => {
    expect(rankPeople(ROSTER, '   ')).toBe(ROSTER);
  });

  it('applies the caller tie break before the name fallback', () => {
    const rows = [
      { name: 'Aaa Directory', email: 'aaa@x.com', source: 'directory' },
      { name: 'Aab Local', email: 'aab@x.com', source: 'local' },
    ];
    const localFirst = (a: { source: string }, b: { source: string }) =>
      (a.source === 'local' ? 0 : 1) - (b.source === 'local' ? 0 : 1);
    // Both are tier 0 prefix matches and alphabetical order would lead with
    // 'Aaa Directory', so a different result proves the tie break ran first.
    expect(names(rankPeople(rows, 'aa', localFirst))).toEqual(['Aab Local', 'Aaa Directory']);
    expect(names(rankPeople(rows, 'aa'))).toEqual(['Aaa Directory', 'Aab Local']);
  });
});

/**
 * The Photo Review report, 2026-09-11: typing "ba" listed Afrin banu,
 * Bavishiya Senthilkumar and Kaveya Rameshbabu alphabetically. People search
 * on Google, LinkedIn or Facebook puts the name that starts with the letters
 * first, a later word that starts with them next, and a name that only
 * contains them last, with an earlier hit ahead of a later one.
 */
describe('the order people search is expected to follow', () => {
  it('puts a name start, then a word start, then a hit inside a word', () => {
    const roster = [
      { name: 'Afrin banu', email: 'Afrin_banu@neramclasses.com' },
      { name: 'Bavishiya Senthilkumar', email: 'nathibavi85@gmail.com' },
      { name: 'Kaveya Rameshbabu', email: 'Kaveya@neram.co.in' },
    ];
    expect(names(rankPeople(roster, 'ba'))).toEqual([
      'Bavishiya Senthilkumar',
      'Afrin banu',
      'Kaveya Rameshbabu',
    ]);
  });

  it('ranks an earlier hit inside a word above a later one, whatever the alphabet says', () => {
    const roster = [
      { name: 'Kaveya Rameshbabu', email: null },
      { name: 'Zubair Ahmed', email: null },
    ];
    expect(names(rankPeople(roster, 'ba'))).toEqual(['Zubair Ahmed', 'Kaveya Rameshbabu']);
  });

  it('ranks an earlier word start above a later one, whatever the alphabet says', () => {
    const roster = [
      { name: 'Aarthi Senthil Babu', email: null },
      { name: 'Afrin banu', email: null },
    ];
    expect(names(rankPeople(roster, 'ba'))).toEqual(['Afrin banu', 'Aarthi Senthil Babu']);
  });
});

describe('multi-word queries', () => {
  it('finds a person when each typed word starts one of their words, in any order', () => {
    const bavishiya = { name: 'Bavishiya Senthilkumar', email: null };
    expect(matchTier(bavishiya, 'bav sen')).toBe(MatchTier.NAME_ALL_WORDS);
    expect(matchTier(bavishiya, 'sen bav')).toBe(MatchTier.NAME_ALL_WORDS);
  });

  it('ranks that above a name that merely contains the typed text', () => {
    const roster = [
      { name: 'Abav Senan', email: null },
      { name: 'Bavishiya Senthilkumar', email: null },
    ];
    expect(names(rankPeople(roster, 'bav sen'))).toEqual(['Bavishiya Senthilkumar', 'Abav Senan']);
  });

  it('needs a separate name word for each typed word', () => {
    expect(matchTier({ name: 'Babu Kumar', email: null }, 'ba ba')).not.toBe(MatchTier.NAME_ALL_WORDS);
    expect(matchTier({ name: 'Babu Banu', email: null }, 'ba ba')).toBe(MatchTier.NAME_ALL_WORDS);
  });

  it('lets a longer typed word claim its word first, so a shorter one is not stranded', () => {
    expect(matchTier({ name: 'Ab Ax', email: null }, 'a ab')).toBe(MatchTier.NAME_ALL_WORDS);
  });
});

describe('matchTier', () => {
  it('grades each kind of hit', () => {
    const ayana = { name: 'Ayana khan', email: 'Ayana_khan@neramclasses.com' };
    expect(matchTier(ayana, 'ay')).toBe(MatchTier.NAME_PREFIX);
    expect(matchTier(ayana, 'kh')).toBe(MatchTier.NAME_WORD);
    expect(matchTier({ name: 'Bavishiya Senthilkumar', email: 'nathibavi85@gmail.com' }, 'nathi')).toBe(
      MatchTier.EMAIL_WORD
    );
    expect(matchTier(ayana, 'yana')).toBe(MatchTier.NAME_CONTAINS);
    expect(matchTier({ name: 'Bavishiya Senthilkumar', email: 'nathibavi85@gmail.com' }, 'bavi85')).toBe(
      MatchTier.EMAIL_CONTAINS
    );
    expect(matchTier(ayana, 'nothing')).toBeNull();
  });

  it('does not let the shared mail domain outrank a real hit', () => {
    // Every org address ends in @neramclasses.com. A domain hit still counts, so
    // rankPeople never drops a row the server ilike already matched, but it
    // lands in the weakest tier, below anyone matched by name.
    const roster = [
      { name: 'Ayana khan', email: 'Ayana_khan@neramclasses.com' },
      { name: 'Neramji Kumar', email: 'neramji@gmail.com' },
    ];
    expect(matchTier(roster[0], 'neram')).toBe(MatchTier.EMAIL_CONTAINS);
    expect(names(rankPeople(roster, 'neram'))).toEqual(['Neramji Kumar', 'Ayana khan']);
  });

  it('returns null for an empty query', () => {
    expect(matchTier({ name: 'Ayana khan', email: null }, '  ')).toBeNull();
  });
});

describe('nameMatchRanges', () => {
  it('points at the letters that matched, for each kind of name hit', () => {
    expect(nameMatchRanges('Bavishiya Senthilkumar', 'ba')).toEqual([[0, 2]]);
    expect(nameMatchRanges('Afrin banu', 'BA')).toEqual([[6, 8]]);
    expect(nameMatchRanges('Kaveya Rameshbabu', 'ba')).toEqual([[13, 15]]);
    expect(nameMatchRanges('Bavishiya Senthilkumar', 'sen bav')).toEqual([
      [0, 3],
      [10, 13],
    ]);
  });

  it('points at nothing when no letters of the name matched as typed', () => {
    expect(nameMatchRanges('Dhisha Haribabu', 'disha')).toEqual([]);
    expect(nameMatchRanges('Ayana khan', 'zzz')).toEqual([]);
    expect(nameMatchRanges('Ayana khan', '  ')).toEqual([]);
    expect(nameMatchRanges(null, 'ay')).toEqual([]);
  });
});

describe('escapeIlike', () => {
  it('escapes the ilike wildcards', () => {
    expect(escapeIlike('50%')).toBe(String.raw`50\%`);
    expect(escapeIlike('a_b')).toBe(String.raw`a\_b`);
  });

  it('escapes backslashes before adding its own', () => {
    expect(escapeIlike(String.raw`a\b`)).toBe(String.raw`a\\b`);
  });

  it('replaces the PostgREST or() separator with a space', () => {
    expect(escapeIlike('khan,ayana')).toBe('khan ayana');
  });

  it('leaves an ordinary term alone', () => {
    expect(escapeIlike('YahulKishore')).toBe('YahulKishore');
  });
});

/**
 * The same name reaches the roster spelled several ways. "disha" found nobody
 * because the student is stored as "Dhisha", which a substring search can never
 * reach. These pin the spelling-tolerant tier that fixes that.
 */
const SPELLINGS = [
  { name: 'Dhisha Haribabu', email: 'Dhisha_Haribabu@neramclasses.com' },
  { name: 'Keerthana SureshMurugan', email: 'keerthana_suresh@neramclasses.com' },
  { name: 'Aarthi Selvam', email: 'Aarthi@neramclasses.com' },
  { name: 'Afrin banu', email: 'Afrin_banu@neramclasses.com' },
  { name: 'Aryakumar Amitkumar', email: 'Aryakumar@neramclasses.com' },
  { name: 'Dhivyadharshini Student', email: null },
];

describe('phoneticKey', () => {
  it('folds aspirated consonants', () => {
    expect(phoneticKey('Dhisha')).toBe('disa');
    expect(phoneticKey('Disha')).toBe('disa');
  });

  it('folds long vowels and doubled letters', () => {
    expect(phoneticKey('Keerthana')).toBe('kirtana');
    expect(phoneticKey('Keertana')).toBe('kirtana');
    expect(phoneticKey('Nethrra')).toBe('netra');
    expect(phoneticKey('Nethra')).toBe('netra');
    expect(phoneticKey('Aarthi')).toBe('arti');
  });

  it('reads zh the way people type it', () => {
    expect(phoneticKey('Kuzhali')).toBe('kulali');
  });

  it('returns an empty key for empty input', () => {
    expect(phoneticKey('')).toBe('');
    expect(phoneticKey(null)).toBe('');
  });
});

describe('editDistance', () => {
  it('counts inserts, deletes, substitutions and neighbour swaps as one each', () => {
    expect(editDistance('disa', 'disa')).toBe(0);
    expect(editDistance('afrin', 'afrn')).toBe(1);
    expect(editDistance('kirtana', 'kirtnaa')).toBe(1);
    expect(editDistance('abc', '')).toBe(3);
  });
});

describe('fuzzy tier', () => {
  it('finds Dhisha when someone types disha, the bug this fixes', () => {
    expect(rankPeople(SPELLINGS, 'disha')[0].name).toBe('Dhisha Haribabu');
    expect(matchTier(SPELLINGS[0], 'disha')).toBe(MatchTier.FUZZY);
  });

  it('tolerates a dropped h and a doubled letter', () => {
    expect(rankPeople(SPELLINGS, 'keertana')[0].name).toBe('Keerthana SureshMurugan');
    expect(rankPeople(ROSTER, 'nethra')[0].name).toBe('Nethrra BadhriNarayanan');
  });

  it('tolerates a one-letter typo in a later word', () => {
    expect(matchTier(SPELLINGS[3], 'afrin bano')).toBe(MatchTier.FUZZY);
  });

  it('tolerates two neighbouring letters swapped', () => {
    expect(rankPeople(SPELLINGS, 'aryakuamr')[0].name).toBe('Aryakumar Amitkumar');
  });

  it('never outranks a real substring match', () => {
    const ranked = rankPeople(
      [
        { name: 'Dhisha Haribabu', email: null },
        { name: 'Disha Kumar', email: null },
      ],
      'disha'
    );
    expect(ranked.map((r) => r.name)).toEqual(['Disha Kumar', 'Dhisha Haribabu']);
  });

  it('does not invent matches for a short query', () => {
    expect(matchTier({ name: 'Divya', email: null }, 'dh')).toBeNull();
    // Name only: every org address contains "neram", which is a legitimate
    // EMAIL_CONTAINS hit for "ram". The point here is that no FUZZY hit is invented.
    expect(matchTier({ name: 'Ananya AnoopPuthan', email: null }, 'ram')).toBeNull();
  });
});

describe('suggestPeople', () => {
  it('offers the nearest name when nothing matched', () => {
    expect(suggestPeople(SPELLINGS, 'dsha')[0].name).toBe('Dhisha Haribabu');
  });

  it('offers nothing for noise', () => {
    expect(suggestPeople(SPELLINGS, 'zzzzqqqq')).toEqual([]);
    expect(suggestPeople(SPELLINGS, '  ')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(suggestPeople(SPELLINGS, 'dhisa', 1)).toHaveLength(1);
  });
});
