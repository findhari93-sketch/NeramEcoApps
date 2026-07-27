import { describe, it, expect } from 'vitest';
import {
  decodeAttendanceFile,
  splitDelimited,
  parseTeamsDuration,
  anchorToClassDate,
  parseTeamsAttendanceText,
  parseTeamsAttendanceFile,
  matchParticipants,
  decideAttendance,
  type RosterCandidate,
} from './teams-attendance-csv';

/**
 * The real Teams export, transcribed. Tab delimited despite the .csv name, with
 * three numbered sections. The Participants block is what we want; the
 * In-Meeting Activities block below it repeats people once per join/leave pair,
 * which is the trap this parser exists to survive.
 */
const REAL_EXPORT = [
  '1. Summary',
  'Meeting title\tJEE B.Arch Session 1',
  'Attended participants\t3',
  'Start time\t7/22/26, 7:00:11 PM',
  'End time\t7/22/26, 8:31:02 PM',
  'Meeting duration\t1h 30m 51s',
  '',
  '2. Participants',
  'Name\tFirst join\tLast leave\tIn-meeting duration\tEmail\tParticipant ID (UPN)\tRole',
  'Humaira safrin\t7/22/26, 7:02:11 PM\t7/22/26, 8:30:02 PM\t1h 27m 51s\tHumaira@neramclasses.com\tHumaira@neramclasses.com\tAttendee',
  'Pranav Shankar\t7/22/26, 7:05:00 PM\t7/22/26, 8:30:00 PM\t1h 25m 0s\tpranav@neramclasses.com\tpranav@neramclasses.com\tAttendee',
  'Hari Heera\t7/22/26, 7:00:11 PM\t7/22/26, 8:31:02 PM\t1h 30m 51s\thari@neramclasses.com\thari@neramclasses.com\tOrganizer',
  '',
  '3. In-Meeting Activities',
  'Name\tJoin time\tLeave time\tDuration\tEmail\tRole',
  'Humaira safrin\t7/22/26, 7:02:11 PM\t7/22/26, 8:30:02 PM\t1h 27m 51s\tHumaira@neramclasses.com\tAttendee',
  'Pranav Shankar\t7/22/26, 7:05:00 PM\t7/22/26, 8:30:00 PM\t1h 25m 0s\tpranav@neramclasses.com\tAttendee',
  'Hari Heera\t7/22/26, 7:00:11 PM\t7/22/26, 8:31:02 PM\t1h 30m 51s\thari@neramclasses.com\tOrganizer',
].join('\r\n');

describe('decodeAttendanceFile', () => {
  it('decodes UTF-16 LE with a BOM, which is what Teams actually exports', () => {
    const text = 'Name\tEmail\nHari\thari@x.com';
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
    const result = decodeAttendanceFile(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    expect(result.encoding).toBe('utf-16le');
    expect(result.text).toBe(text);
  });

  it('decodes UTF-16 LE with no BOM by spotting the interleaved NUL bytes', () => {
    const text = 'Name\tEmail\nHari\thari@x.com';
    const bytes = Buffer.from(text, 'utf16le');
    const result = decodeAttendanceFile(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    expect(result.encoding).toBe('utf-16le');
    expect(result.text).toBe(text);
  });

  it('strips a UTF-8 BOM instead of leaving it on the first header cell', () => {
    const text = 'Name,Email';
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
    const result = decodeAttendanceFile(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    expect(result.encoding).toBe('utf-8');
    expect(result.text).toBe(text);
  });

  it('decodes plain UTF-8', () => {
    const bytes = Buffer.from('Name,Email', 'utf8');
    const result = decodeAttendanceFile(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    expect(result.encoding).toBe('utf-8');
    expect(result.text).toBe('Name,Email');
  });
});

describe('splitDelimited', () => {
  it('keeps a comma inside a quoted name in one field', () => {
    expect(splitDelimited('"Babu, Hari",hari@x.com,1h', ',')).toEqual([
      'Babu, Hari',
      'hari@x.com',
      '1h',
    ]);
  });

  it('treats a doubled quote inside a quoted field as a literal quote', () => {
    expect(splitDelimited('"Hari ""HB"" Babu",x', ',')).toEqual(['Hari "HB" Babu', 'x']);
  });

  it('leaves an unquoted comma alone in a tab-delimited line', () => {
    expect(splitDelimited('Babu, Hari\thari@x.com', '\t')).toEqual(['Babu, Hari', 'hari@x.com']);
  });
});

describe('parseTeamsDuration', () => {
  it.each([
    ['1h 12m 5s', 4325],
    ['47m 3s', 2823],
    ['5s', 5],
    ['1h', 3600],
    ['1 hr 12 min', 4320],
    ['00:47:03', 2823],
    ['47:03', 2823],
    ['2820', 2820],
  ])('reads %s as %i seconds', (input, expected) => {
    expect(parseTeamsDuration(input)).toBe(expected);
  });

  it('returns null, NOT zero, for something it cannot read', () => {
    // Zero would silently flip the student to absent under any threshold, which
    // is worse than admitting we do not know.
    expect(parseTeamsDuration('garbage')).toBeNull();
    expect(parseTeamsDuration('')).toBeNull();
    expect(parseTeamsDuration('7/22/26, 7:02:11 PM')).toBeNull();
  });
});

describe('anchorToClassDate', () => {
  const classStart = '2026-07-22T19:00:00+05:30';

  it('reads a US-style Teams timestamp as India time', () => {
    const iso = anchorToClassDate('7/22/26, 7:32:11 PM', classStart);
    expect(iso).toBe(new Date('2026-07-22T19:32:11+05:30').toISOString());
  });

  it('reads a day-first timestamp when that is the only reading in range', () => {
    const iso = anchorToClassDate('22/07/2026, 19:32:11', classStart);
    expect(iso).toBe(new Date('2026-07-22T19:32:11+05:30').toISOString());
  });

  it('reads an ISO timestamp', () => {
    const iso = anchorToClassDate('2026-07-22T19:32:11', classStart);
    expect(iso).toBe(new Date('2026-07-22T19:32:11+05:30').toISOString());
  });

  it('returns null when no reading lands near the class, so a locale misread fails safe', () => {
    // 3/4 vs 4/3 is a month either way. Neither is this class, so we would rather
    // record no timestamp than a confidently wrong one.
    expect(anchorToClassDate('03/04/2026, 19:32:11', classStart)).toBeNull();
    expect(anchorToClassDate('not a date', classStart)).toBeNull();
  });

  it('accepts a date-only anchor for callers that have no start time', () => {
    expect(anchorToClassDate('7/22/26, 7:32:11 PM', '2026-07-22')).toBe(
      new Date('2026-07-22T19:32:11+05:30').toISOString(),
    );
  });
});

describe('parseTeamsAttendanceText', () => {
  it('picks the participants block out of a real three-section export', () => {
    const result = parseTeamsAttendanceText(REAL_EXPORT);
    expect(result.fatal).toBeNull();
    expect(result.delimiter).toBe('\t');
    expect(result.participants).toHaveLength(3);

    const humaira = result.participants.find((p) => p.rawName === 'Humaira safrin');
    // Lowercased, because Graph and Teams both preserve whatever casing an admin
    // typed into the UPN while our lookups are case sensitive.
    expect(humaira?.identifier).toBe('humaira@neramclasses.com');
    expect(humaira?.durationSeconds).toBe(5271);
    expect(humaira?.role).toBe('Attendee');
  });

  it('ignores the summary block, whose rows are key/value pairs', () => {
    const result = parseTeamsAttendanceText(REAL_EXPORT);
    expect(result.participants.map((p) => p.rawName)).not.toContain('Meeting title');
  });

  it('finds the right block when the sections are relabelled and reordered', () => {
    // Section titles are localised, so nothing may key on the words "Summary" or
    // "Participants". Only the header row's shape is reliable.
    const localised = [
      'Teilnehmer',
      'Name\tErste Teilnahme\tLetzter Austritt\tIn-meeting duration\tEmail\tRole',
      'Hari Heera\t7/22/26, 7:00:11 PM\t7/22/26, 8:31:02 PM\t1h 30m 51s\thari@neramclasses.com\tOrganizer',
      '',
      'Zusammenfassung',
      'Besprechungstitel\tJEE B.Arch Session 1',
    ].join('\n');

    const result = parseTeamsAttendanceText(localised);
    expect(result.participants).toHaveLength(1);
    expect(result.participants[0].identifier).toBe('hari@neramclasses.com');
  });

  it('folds a student who rejoined into one participant', () => {
    // The activities block emits one row per join/leave pair. Without folding,
    // one student who dropped and rejoined would look like three students.
    const activitiesOnly = [
      '3. In-Meeting Activities',
      'Name\tJoin time\tLeave time\tDuration\tEmail\tRole',
      'Hari Heera\t7/22/26, 7:00:00 PM\t7/22/26, 7:20:00 PM\t20m\thari@neramclasses.com\tAttendee',
      'Hari Heera\t7/22/26, 7:25:00 PM\t7/22/26, 7:40:00 PM\t15m\thari@neramclasses.com\tAttendee',
      'Hari Heera\t7/22/26, 7:45:00 PM\t7/22/26, 8:00:00 PM\t15m\thari@neramclasses.com\tAttendee',
    ].join('\n');

    const result = parseTeamsAttendanceText(activitiesOnly);
    expect(result.participants).toHaveLength(1);
    const [hari] = result.participants;
    expect(hari.occurrences).toBe(3);
    expect(hari.durationSeconds).toBe(50 * 60);
    expect(hari.firstJoinText).toBe('7/22/26, 7:00:00 PM');
    expect(hari.lastLeaveText).toBe('7/22/26, 8:00:00 PM');
    expect(result.warnings.join(' ')).toMatch(/rejoined|more than once/i);
  });

  it('falls back to the name and warns when the export carries no email column', () => {
    const noEmail = [
      'Name\tFirst join\tLast leave\tIn-meeting duration',
      'Hari Heera\t7/22/26, 7:00:11 PM\t7/22/26, 8:31:02 PM\t1h 30m 51s',
    ].join('\n');

    const result = parseTeamsAttendanceText(noEmail);
    expect(result.participants).toHaveLength(1);
    expect(result.participants[0].identifier).toBeNull();
    expect(result.warnings.join(' ')).toMatch(/email/i);
  });

  it('parses the comma-delimited variant with quoted names', () => {
    const commaVariant = [
      'Name,First join,Last leave,In-meeting duration,Email,Role',
      '"Babu, Hari",7/22/26 7:00 PM,7/22/26 8:00 PM,1h,hari@neramclasses.com,Attendee',
    ].join('\n');

    const result = parseTeamsAttendanceText(commaVariant);
    expect(result.delimiter).toBe(',');
    expect(result.participants[0].rawName).toBe('Babu, Hari');
    expect(result.participants[0].durationSeconds).toBe(3600);
  });

  it('reports a fatal instead of throwing when the file is not an attendance export', () => {
    const result = parseTeamsAttendanceText('this is just prose\nwith no columns at all');
    expect(result.participants).toHaveLength(0);
    expect(result.fatal).toBeTruthy();
  });

  it('does not mistake the Participant ID (UPN) column for the name column', () => {
    const result = parseTeamsAttendanceText(REAL_EXPORT);
    expect(result.headerUsed).toContain('Name');
    expect(result.participants.map((p) => p.rawName)).toContain('Hari Heera');
  });
});

describe('parseTeamsAttendanceFile', () => {
  /**
   * The whole path a teacher actually takes: a File from a picker, through
   * arrayBuffer and TextDecoder, out as participants.
   *
   * This is the highest-risk step in the feature and the one most easily got
   * wrong, because the obvious implementation (`await file.text()`) hardcodes
   * UTF-8 and would turn this exact input into interleaved NUL characters. The
   * other tests feed the decoder a buffer directly and so would not catch that.
   */
  it('reads a real UTF-16 LE File the way a file picker hands it over', async () => {
    const bytes = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(REAL_EXPORT, 'utf16le'),
    ]);
    const file = new File([bytes], 'meetingAttendanceReport.csv', { type: 'text/csv' });

    const result = await parseTeamsAttendanceFile(file);

    expect(result.fatal).toBeNull();
    expect(result.encoding).toBe('utf-16le');
    expect(result.participants).toHaveLength(3);
    expect(result.participants.map((p) => p.identifier)).toContain('hari@neramclasses.com');
  });

  it('reports a fatal rather than throwing when handed something unreadable', async () => {
    const file = new File([Buffer.from('holiday photos, not a report', 'utf8')], 'nope.csv');
    const result = await parseTeamsAttendanceFile(file);
    expect(result.participants).toHaveLength(0);
    expect(result.fatal).toBeTruthy();
  });
});

describe('matchParticipants', () => {
  const roster: RosterCandidate[] = [
    { student_id: 'u1', name: 'Humaira safrin', match_emails: ['humaira@neramclasses.com'] },
    {
      student_id: 'u2',
      name: 'Pranav Shankar',
      // The 28-student case: their classroom account differs from users.email.
      match_emails: ['pranav.old@gmail.com', 'pranav@neramclasses.com'],
    },
    { student_id: 'u3', name: 'Hari Heera', match_emails: [] },
  ];

  const participant = (rawName: string, identifier: string | null) => ({
    rawName,
    identifier,
    durationSeconds: 3600,
    firstJoinText: null,
    lastLeaveText: null,
    role: null,
    occurrences: 1,
  });

  it('matches on linked_classroom_email when the primary email differs', () => {
    const result = matchParticipants([participant('Pranav Shankar', 'PRANAV@neramclasses.com')], roster);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].studentId).toBe('u2');
    expect(result.matched[0].matchedBy).toBe('email');
  });

  it('falls back to the name for the student with no email on file', () => {
    const result = matchParticipants([participant('hari heera', null)], roster);
    expect(result.matched[0].studentId).toBe('u3');
    expect(result.matched[0].matchedBy).toBe('name');
  });

  it('reports an unknown participant rather than dropping them', () => {
    const result = matchParticipants([participant('Someone Else', 'nobody@example.com')], roster);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0].participant.rawName).toBe('Someone Else');
  });

  it('lists roster students who are absent from the file', () => {
    const result = matchParticipants([participant('Humaira safrin', 'humaira@neramclasses.com')], roster);
    expect(result.missingFromFile.map((r) => r.student_id).sort()).toEqual(['u2', 'u3']);
  });

  it('refuses to auto-match when two roster students share a name', () => {
    const twins: RosterCandidate[] = [
      { student_id: 'a', name: 'Hari Babu', match_emails: [] },
      { student_id: 'b', name: 'Babu Hari', match_emails: [] },
    ];
    const result = matchParticipants([participant('Hari Babu', null)], twins);
    expect(result.matched).toHaveLength(0);
    expect(result.unmatched[0].ambiguous).toBe(true);
  });
});

describe('decideAttendance', () => {
  it('counts an unknown duration as present, since unknown is not absent', () => {
    expect(decideAttendance(null, 300)).toBe(true);
  });

  it('counts exactly the threshold as present', () => {
    expect(decideAttendance(300, 300)).toBe(true);
  });

  it('counts below the threshold as absent', () => {
    expect(decideAttendance(299, 300)).toBe(false);
  });

  it('counts any join as present when the threshold is zero', () => {
    expect(decideAttendance(1, 0)).toBe(true);
  });
});
