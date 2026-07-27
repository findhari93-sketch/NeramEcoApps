/**
 * Parse a Microsoft Teams attendance report into roster-matched participants.
 *
 * Why this exists: reading attendance from Microsoft Graph is blocked on a Teams
 * application access policy that only a tenant administrator can grant, and
 * which has never been in effect for this tenant. The meeting organizer can
 * nonetheless download the attendance report straight out of the Teams meeting
 * recap with no Azure configuration whatsoever, so this file is the one route to
 * real Teams attendance that depends on nothing outside the browser.
 *
 * The export is hostile in four specific ways, and every design choice below is
 * a response to one of them:
 *
 *   1. It is UTF-16 LE despite the `.csv` extension, so `File.text()` (which
 *      always decodes UTF-8) turns it into interleaved NUL characters.
 *   2. It is TAB delimited, again despite the extension, though some tenant and
 *      version combinations do emit real comma-separated CSV.
 *   3. Its section titles and column headers are localised, so nothing may key
 *      on the literal words "Summary" or "Participants".
 *   4. It has more than one block that looks like an attendance table, and the
 *      In-Meeting Activities block repeats a person once per join/leave pair.
 *
 * Like `week-import.ts`, this module is pure TypeScript with no dependencies, it
 * never throws, and it never silently drops a row: anything unreadable comes
 * back in `warnings` or `fatal` so the import preview can show a human exactly
 * what it is about to commit.
 */

export type CsvDelimiter = '\t' | ',' | ';';
export type CsvEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';

export interface TeamsCsvParticipant {
  /** Display name exactly as Teams wrote it. */
  rawName: string;
  /** Email or UPN, lowercased. Null when the export carried neither column. */
  identifier: string | null;
  /**
   * Total seconds in the meeting.
   *
   * Null means unreadable, which is deliberately NOT the same as zero: zero
   * would silently flip a student to absent under any threshold.
   */
  durationSeconds: number | null;
  /** Wall clock exactly as written. The file carries no timezone. */
  firstJoinText: string | null;
  lastLeaveText: string | null;
  role: string | null;
  /** Source rows folded into this participant. More than 1 means they rejoined. */
  occurrences: number;
}

export interface TeamsCsvParse {
  participants: TeamsCsvParticipant[];
  delimiter: CsvDelimiter;
  encoding: CsvEncoding;
  /** The header cells we actually read, so the preview can show its working. */
  headerUsed: string[];
  /** The block's own label line, when it had one. Localised, so display only. */
  sectionLabel: string | null;
  warnings: string[];
  /** Set when nothing usable was found. Blocks the import. */
  fatal: string | null;
}

// ─── Decoding ────────────────────────────────────────────────────────────────

/**
 * Decode the raw bytes of an attendance export.
 *
 * Takes an ArrayBuffer rather than a File on purpose: `File.text()` hardcodes
 * UTF-8, and keeping the decode step over plain bytes is what makes it testable
 * in Node with no DOM.
 */
export function decodeAttendanceFile(buffer: ArrayBuffer): { text: string; encoding: CsvEncoding } {
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: decodeWith('utf-16le', bytes.subarray(2)), encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decodeWith('utf-16be', bytes.subarray(2)), encoding: 'utf-16be' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: decodeWith('utf-8', bytes.subarray(3)), encoding: 'utf-8' };
  }

  // No BOM. ASCII text encoded UTF-16 LE is every other byte NUL, so counting
  // NULs at odd offsets separates it from UTF-8 without guessing at content.
  const sampleLength = Math.min(128, bytes.length);
  let oddNuls = 0;
  for (let i = 1; i < sampleLength; i += 2) {
    if (bytes[i] === 0x00) oddNuls++;
  }
  if (sampleLength > 3 && oddNuls / Math.ceil(sampleLength / 2) > 0.3) {
    return { text: decodeWith('utf-16le', bytes), encoding: 'utf-16le' };
  }

  return { text: decodeWith('utf-8', bytes), encoding: 'utf-8' };
}

function decodeWith(encoding: CsvEncoding, bytes: Uint8Array): string {
  try {
    return new TextDecoder(encoding).decode(bytes);
  } catch {
    // TextDecoder is missing utf-16be in a few older runtimes. Falling back to
    // UTF-8 produces visible mojibake rather than an exception, which the
    // preview can at least show the teacher.
    return new TextDecoder('utf-8').decode(bytes);
  }
}

// ─── Delimited lines ─────────────────────────────────────────────────────────

/**
 * Split one line, honouring quoting.
 *
 * A naive `split(delimiter)` breaks `"Babu, Hari"` into two fields and shifts
 * every column after it, which is the kind of failure that produces a plausible
 * but wrong import rather than an obvious one.
 */
export function splitDelimited(line: string, delimiter: CsvDelimiter): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

/** Pick the delimiter by counting, since the file extension lies. */
function detectDelimiter(lines: string[]): CsvDelimiter {
  const sample = lines.filter((l) => l.trim()).slice(0, 20);
  const counts: Record<CsvDelimiter, number> = { '\t': 0, ',': 0, ';': 0 };
  for (const line of sample) {
    counts['\t'] += (line.match(/\t/g) || []).length;
    counts[','] += (line.match(/,/g) || []).length;
    counts[';'] += (line.match(/;/g) || []).length;
  }
  // Tab wins ties: it is what Teams actually emits, and a stray comma inside a
  // name is far more likely than a stray tab.
  if (counts['\t'] >= counts[','] && counts['\t'] >= counts[';'] && counts['\t'] > 0) return '\t';
  if (counts[','] >= counts[';'] && counts[','] > 0) return ',';
  if (counts[';'] > 0) return ';';
  return '\t';
}

// ─── Header matching ─────────────────────────────────────────────────────────

type Field = 'email' | 'upn' | 'duration' | 'firstJoin' | 'lastLeave' | 'role' | 'name';

/**
 * Aliases are pre-normalised (lowercase, punctuation folded to spaces) because
 * that is what they are compared against.
 *
 * Field order matters: the first field to claim a header keeps it, so the
 * specific columns are resolved before `name`, whose loosest alias
 * ("participant") would otherwise swallow "Participant ID (UPN)".
 */
const HEADER_ALIASES: Record<Field, string[]> = {
  email: ['email address', 'e mail', 'email', 'mail'],
  upn: ['participant id (upn)', 'user principal name', 'participant id', 'upn'],
  duration: [
    'in meeting duration',
    'attendance duration',
    'time in meeting',
    'total duration',
    'duration',
  ],
  firstJoin: ['first join time', 'first join', 'join time', 'joined at', 'joined', 'entry time'],
  lastLeave: ['last leave time', 'last leave', 'leave time', 'left at', 'exit time', 'left'],
  role: ['participant role', 'role'],
  name: ['full name', 'display name', 'name', 'participant'],
};

const FIELD_ORDER: Field[] = ['email', 'upn', 'duration', 'firstJoin', 'lastLeave', 'role', 'name'];

/** How far into a block to look for its header row. */
const HEADER_SCAN_LINES = 5;

function normaliseHeader(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type ColumnMap = Partial<Record<Field, number>>;

/**
 * Map header cells onto fields we understand.
 *
 * An exact match always beats a substring one, which is what stops the `name`
 * field claiming "Participant ID (UPN)" on the strength of containing
 * "participant" while a plain "Name" column sits unused beside it.
 */
function mapHeader(cells: string[]): { map: ColumnMap; score: number } {
  const normalised = cells.map(normaliseHeader);
  const map: ColumnMap = {};
  const taken = new Set<number>();
  let score = 0;

  for (const field of FIELD_ORDER) {
    let bestIndex = -1;
    let bestScore = 0;

    for (let i = 0; i < normalised.length; i++) {
      if (taken.has(i)) continue;
      const cell = normalised[i];
      if (!cell) continue;

      for (const alias of HEADER_ALIASES[field]) {
        const hit = cell === alias ? 1000 + alias.length : cell.includes(alias) ? alias.length : 0;
        if (hit > bestScore) {
          bestScore = hit;
          bestIndex = i;
        }
      }
    }

    if (bestIndex >= 0) {
      map[field] = bestIndex;
      taken.add(bestIndex);
      score += bestScore >= 1000 ? 2 : 1;
    }
  }

  return { map, score };
}

/** A block has to name people and say something about their attendance. */
function isUsableBlock(map: ColumnMap): boolean {
  const hasIdentity = map.name !== undefined || map.email !== undefined || map.upn !== undefined;
  const hasAttendance =
    map.duration !== undefined || map.firstJoin !== undefined || map.lastLeave !== undefined;
  return hasIdentity && hasAttendance;
}

// ─── Durations ───────────────────────────────────────────────────────────────

/**
 * Read a Teams duration into seconds, or null when it cannot be read.
 *
 * Returning 0 on failure would be the worst possible answer: it looks like a
 * real value and marks the student absent under any threshold.
 */
export function parseTeamsDuration(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // hh:mm:ss or mm:ss
  const clock = raw.match(/^(\d{1,3}):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (clock) {
    return clock[3] !== undefined
      ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
      : Number(clock[1]) * 60 + Number(clock[2]);
  }

  // "1h 12m 5s", "1 hr 12 min", "47m 3s"
  const unit = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi;
  let total = 0;
  let found = false;
  let match: RegExpExecArray | null;
  while ((match = unit.exec(raw)) !== null) {
    const amount = parseFloat(match[1]);
    const suffix = match[2].toLowerCase();
    if (suffix.startsWith('h')) total += amount * 3600;
    else if (suffix.startsWith('m')) total += amount * 60;
    else total += amount;
    found = true;
  }
  if (found) return Math.round(total);

  // A bare integer is seconds.
  if (/^\d+$/.test(raw)) return Number(raw);

  return null;
}

// ─── Timestamps ──────────────────────────────────────────────────────────────

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Turn a Teams wall-clock string into an ISO instant, anchored to the class.
 *
 * The export carries no UTC offset: the times are whatever the person who
 * downloaded the file saw on their own clock. We read them as India time, which
 * is the same assumption `attendance-sync.ts` already makes when it builds a
 * class start.
 *
 * The anchoring is the load-bearing part. `03/04/2026` is 3 April or 4 March
 * depending on locale, and a wrong reading would be recorded as confidently as a
 * right one. So every plausible reading is generated and only one that lands
 * near the class survives; if none does, this returns null and the row simply
 * carries no timestamp. Failing to "unknown" is always recoverable, failing to
 * "wrong" is not.
 *
 * @param classAnchorIso Either a full class start instant, or a bare YYYY-MM-DD.
 */
export function anchorToClassDate(
  wallClock: string | null | undefined,
  classAnchorIso: string,
): string | null {
  if (!wallClock) return null;
  const raw = String(wallClock).trim();
  if (!raw) return null;

  const dateOnlyAnchor = /^\d{4}-\d{2}-\d{2}$/.test(classAnchorIso);
  const anchor = dateOnlyAnchor
    ? new Date(`${classAnchorIso}T12:00:00+05:30`)
    : new Date(classAnchorIso);
  if (Number.isNaN(anchor.getTime())) return null;
  // A date-only anchor sits at midday, so a wide enough window still covers a
  // class at any hour of that day.
  const toleranceMs = (dateOnlyAnchor ? 18 : 12) * 60 * 60 * 1000;

  const candidates = buildTimestampCandidates(raw);
  let best: number | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const delta = Math.abs(candidate - anchor.getTime());
    if (delta <= toleranceMs && delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }

  return best === null ? null : new Date(best).toISOString();
}

/** Every plausible reading of a timestamp, as epoch millis in India time. */
function buildTimestampCandidates(raw: string): number[] {
  const out: number[] = [];

  // ISO first: unambiguous, so no need to guess.
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (iso) {
    out.push(
      utcFromIst(
        Number(iso[1]),
        Number(iso[2]),
        Number(iso[3]),
        Number(iso[4]),
        Number(iso[5]),
        Number(iso[6] ?? 0),
      ),
    );
    return out;
  }

  const parts = raw.match(
    /^(\d{1,4})[/-](\d{1,2})[/-](\d{2,4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?/,
  );
  if (!parts) return out;

  const [, aRaw, bRaw, cRaw, hourRaw, minuteRaw, secondRaw, meridiem] = parts;
  const a = Number(aRaw);
  const b = Number(bRaw);
  const year = expandYear(Number(cRaw));

  let hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw ?? 0);
  if (meridiem) {
    const pm = meridiem.toLowerCase() === 'pm';
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }

  // Both readings, month-first and day-first. The anchor window picks one.
  for (const [month, day] of [
    [a, b],
    [b, a],
  ]) {
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const stamp = utcFromIst(year, month, day, hour, minute, second);
    if (!out.includes(stamp)) out.push(stamp);
  }

  return out;
}

function expandYear(year: number): number {
  if (year >= 1000) return year;
  // Teams writes a two digit year. Everything here is this century.
  return 2000 + year;
}

function utcFromIst(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number {
  return Date.UTC(year, month - 1, day, hour, minute, second) - IST_OFFSET_MS;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

interface Block {
  label: string | null;
  lines: string[];
}

/**
 * Cut the file into blocks.
 *
 * Blank lines separate sections, and a bare numbered line ("2. Participants")
 * both separates and labels one. The label is kept for display only: it is
 * localised, so no logic may depend on it.
 */
function splitBlocks(lines: string[], delimiter: CsvDelimiter): Block[] {
  const blocks: Block[] = [];
  let current: Block = { label: null, lines: [] };
  let pendingLabel: string | null = null;

  const flush = () => {
    if (current.lines.length) blocks.push(current);
    current = { label: pendingLabel, lines: [] };
    pendingLabel = null;
  };

  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }

    const cells = splitDelimited(line, delimiter).filter((c) => c !== '');
    if (cells.length === 1 && /^\d+\.\s+\S/.test(line.trim())) {
      flush();
      pendingLabel = line.trim();
      current.label = pendingLabel;
      pendingLabel = null;
      continue;
    }

    current.lines.push(line);
  }

  if (current.lines.length) blocks.push(current);
  return blocks;
}

/** Fold rows onto one entry per person. */
function aggregate(rows: TeamsCsvParticipant[]): TeamsCsvParticipant[] {
  const byKey = new Map<string, TeamsCsvParticipant>();

  for (const row of rows) {
    const key = row.identifier ?? normaliseName(row.rawName);
    if (!key) continue;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row });
      continue;
    }

    existing.occurrences += row.occurrences;
    if (row.durationSeconds !== null) {
      existing.durationSeconds = (existing.durationSeconds ?? 0) + row.durationSeconds;
    }
    if (!existing.firstJoinText) existing.firstJoinText = row.firstJoinText;
    if (row.lastLeaveText) existing.lastLeaveText = row.lastLeaveText;
    if (!existing.role) existing.role = row.role;
  }

  return Array.from(byKey.values());
}

/**
 * Parse an already-decoded attendance export.
 *
 * The block with the best-scoring header wins, rather than the one whose title
 * says "Participants", because titles are localised. Rows are then ALWAYS folded
 * per person: the In-Meeting Activities block scores nearly as high as the
 * Participants block and emits one row per join/leave pair, so folding makes the
 * result correct whichever block was chosen, and also handles someone appearing
 * twice under two identities.
 */
export function parseTeamsAttendanceText(text: string, encoding: CsvEncoding = 'utf-8'): TeamsCsvParse {
  const warnings: string[] = [];
  const empty = (fatal: string): TeamsCsvParse => ({
    participants: [],
    delimiter: '\t',
    encoding,
    headerUsed: [],
    sectionLabel: null,
    warnings,
    fatal,
  });

  if (!text || !text.trim()) return empty('The file is empty.');

  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const delimiter = detectDelimiter(lines);
  const blocks = splitBlocks(lines, delimiter);

  let chosen: { rows: string[]; map: ColumnMap; header: string[]; label: string | null } | null = null;
  let chosenScore = 0;

  for (const block of blocks) {
    if (block.lines.length < 2) continue;

    // The header is not reliably the block's first line. A section title is
    // often just a bare word ("Teilnehmer"), and it is only NUMBERED in the
    // English export, so it does not always get consumed as a label. Scan the
    // opening lines and take the best-scoring one that still leaves data rows
    // beneath it. Ties keep the earliest line, so a data row can never displace
    // the header it sits under.
    const horizon = Math.min(HEADER_SCAN_LINES, block.lines.length - 1);
    for (let i = 0; i < horizon; i++) {
      const header = splitDelimited(block.lines[i], delimiter);
      const { map, score } = mapHeader(header);
      if (!isUsableBlock(map)) continue;
      if (score > chosenScore) {
        chosenScore = score;
        chosen = { rows: block.lines.slice(i + 1), map, header, label: block.label };
      }
    }
  }

  if (!chosen) {
    return empty(
      'This does not look like a Teams attendance report. Download it from the meeting in Teams, then upload that file without editing it.',
    );
  }

  const { rows: dataLines, map, header, label } = chosen;
  const identityColumn = map.email ?? map.upn;
  if (identityColumn === undefined) {
    warnings.push(
      'This export has no Email or UPN column, so students were matched on their name alone. Check the list below carefully.',
    );
  }

  const rows: TeamsCsvParticipant[] = [];
  for (const line of dataLines) {
    if (!line.trim()) continue;
    const cells = splitDelimited(line, delimiter);

    const rawName = pick(cells, map.name) ?? '';
    const identifierRaw = pick(cells, map.email) ?? pick(cells, map.upn) ?? null;
    const identifier = identifierRaw && identifierRaw.includes('@') ? identifierRaw.toLowerCase() : null;

    // A row with neither a name nor an identity is a stray separator, not a
    // person. Anything with one of them is kept so it can be reported.
    if (!rawName && !identifier) continue;

    const durationText = pick(cells, map.duration);
    const durationSeconds = parseTeamsDuration(durationText);
    if (durationText && durationSeconds === null) {
      warnings.push(`Could not read the duration "${durationText}" for ${rawName || identifier}.`);
    }

    rows.push({
      rawName,
      identifier,
      durationSeconds,
      firstJoinText: pick(cells, map.firstJoin) ?? null,
      lastLeaveText: pick(cells, map.lastLeave) ?? null,
      role: pick(cells, map.role) ?? null,
      occurrences: 1,
    });
  }

  const participants = aggregate(rows);
  const rejoined = participants.filter((p) => p.occurrences > 1);
  if (rejoined.length) {
    warnings.push(
      `${rejoined.length} ${rejoined.length === 1 ? 'person' : 'people'} appear more than once because they rejoined. Their times have been added together.`,
    );
  }

  if (participants.length === 0) {
    return {
      participants: [],
      delimiter,
      encoding,
      headerUsed: header,
      sectionLabel: label,
      warnings,
      fatal: 'The attendance report lists nobody.',
    };
  }

  return {
    participants,
    delimiter,
    encoding,
    headerUsed: header,
    sectionLabel: label,
    warnings,
    fatal: null,
  };
}

function pick(cells: string[], index: number | undefined): string | null {
  if (index === undefined) return null;
  const value = cells[index];
  return value ? value.trim() || null : null;
}

/**
 * Read a File as raw bytes.
 *
 * `Blob.arrayBuffer` is the obvious call and the one to prefer, but it is absent
 * in older mobile Safari and in some in-app browsers, which is exactly where
 * teachers open this. FileReader is the fallback that has always been there.
 */
function readFileBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error('The file could not be read as bytes.'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsArrayBuffer(file);
  });
}

/** Browser entry point. Decodes, then parses. */
export async function parseTeamsAttendanceFile(file: File): Promise<TeamsCsvParse> {
  try {
    const buffer = await readFileBuffer(file);
    const { text, encoding } = decodeAttendanceFile(buffer);
    return parseTeamsAttendanceText(text, encoding);
  } catch (err) {
    return {
      participants: [],
      delimiter: '\t',
      encoding: 'utf-8',
      headerUsed: [],
      sectionLabel: null,
      warnings: [],
      fatal: `Could not read the file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Roster matching ─────────────────────────────────────────────────────────

export interface RosterCandidate {
  student_id: string;
  name: string | null;
  /** email, linked_classroom_email and personal_email, lowercased. */
  match_emails: string[];
}

export interface ParticipantMatch {
  participant: TeamsCsvParticipant;
  studentId: string | null;
  matchedBy: 'email' | 'name' | null;
  /** Two roster students share this name, so we refuse to pick one. */
  ambiguous: boolean;
}

export interface MatchSummary {
  matches: ParticipantMatch[];
  matched: ParticipantMatch[];
  unmatched: ParticipantMatch[];
  /** Enrolled students who are not in the file at all. */
  missingFromFile: RosterCandidate[];
}

/**
 * Normalise a display name for fallback matching.
 *
 * Tokens are sorted so "Hari Babu" and "Babu Hari" collapse together: Microsoft
 * and our own records disagree about surname order often enough that not doing
 * so loses real matches. The cost is that two genuinely different students who
 * are anagrams of each other collide, which is why a collision is reported as
 * ambiguous rather than resolved.
 */
function normaliseName(name: string | null | undefined): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Match parsed participants to enrolled students.
 *
 * Email first, because it is the only key both sides agree on. The CSV has no
 * equivalent of Graph's `identity.id`, so there is no stable object id to match
 * on and the name fallback is unavoidable. Nothing is ever dropped: a
 * participant we cannot place comes back in `unmatched` so the preview can show
 * who it was.
 */
export function matchParticipants(
  participants: TeamsCsvParticipant[],
  roster: RosterCandidate[],
): MatchSummary {
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string[]>();

  for (const student of roster) {
    for (const email of student.match_emails) {
      if (email) byEmail.set(email.toLowerCase(), student.student_id);
    }
    const key = normaliseName(student.name);
    if (key) byName.set(key, [...(byName.get(key) ?? []), student.student_id]);
  }

  const matches: ParticipantMatch[] = participants.map((participant) => {
    // Lowercased again here rather than trusting the parser: Microsoft preserves
    // whatever casing an admin typed into a UPN, and this function is also
    // reachable with participants built by a caller.
    const emailHit = participant.identifier
      ? byEmail.get(participant.identifier.toLowerCase())
      : undefined;
    if (emailHit) {
      return { participant, studentId: emailHit, matchedBy: 'email' as const, ambiguous: false };
    }

    const nameHits = byName.get(normaliseName(participant.rawName)) ?? [];
    if (nameHits.length === 1) {
      return { participant, studentId: nameHits[0], matchedBy: 'name' as const, ambiguous: false };
    }

    return {
      participant,
      studentId: null,
      matchedBy: null,
      ambiguous: nameHits.length > 1,
    };
  });

  const matched = matches.filter((m) => m.studentId !== null);
  const seen = new Set(matched.map((m) => m.studentId));

  return {
    matches,
    matched,
    unmatched: matches.filter((m) => m.studentId === null),
    missingFromFile: roster.filter((student) => !seen.has(student.student_id)),
  };
}

/**
 * Was this person present?
 *
 * Teams lists everyone who joined, including someone who was in for 30 seconds,
 * so a threshold is the only way to tell attendance from a stray tap. An
 * unreadable duration counts as present: we know they joined, and marking a
 * student absent on the strength of a parse failure is the worse error.
 */
export function decideAttendance(
  durationSeconds: number | null,
  thresholdSeconds: number,
): boolean {
  if (durationSeconds === null) return true;
  return durationSeconds >= thresholdSeconds;
}
