/**
 * Turns an Aintra answer (markdown plus a few [[directives]]) into blocks.
 *
 * Hand-written on purpose, like the renderer it replaces: react-markdown is
 * ESM-only and caused chunk 404s on the marketing site in production. This one
 * is a pure function, so it is unit tested without a DOM and it is cheap to run
 * on every streamed delta.
 *
 * What it understands:
 *  - headings, paragraphs (line breaks kept), bullet and numbered lists (text
 *    and list lines may share a block), GFM tables, quotes, code fences, rules
 *  - [[fees]] / [[fees:1-year,2-year]]   designed fee cards
 *  - [[cta:apply,demo,whatsapp,call]]    action buttons
 *  - [[suggest: Q1 | Q2 | Q3]]           follow-up chips, returned separately
 *
 * It is tolerant of a half-written answer: while `streaming` is set, an
 * unfinished table row or [[directive is held back until it completes, so the
 * visitor never sees raw pipes or brackets flash up and vanish.
 */

export type CtaAction = 'apply' | 'demo' | 'whatsapp' | 'call';

export interface ListItem {
  text: string;
  /** 0 for a top-level item, 1 for anything indented under it. */
  depth: number;
}

export type TableAlign = 'left' | 'right' | 'center' | null;

export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { type: 'table'; header: string[]; align: TableAlign[]; rows: string[][] }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'hr' }
  | { type: 'fees'; ids: string[] | null }
  | { type: 'cta'; actions: CtaAction[] };

export interface ParsedAnswer {
  blocks: Block[];
  /** Follow-up questions from [[suggest: ...]], at most three. */
  suggestions: string[];
}

const CTA_ACTIONS: CtaAction[] = ['apply', 'demo', 'whatsapp', 'call'];
const DIRECTIVE_ANYWHERE = /\s*(\[\[[a-z]+(?::[^\]\n]*)?\]\])\s*/gi;
const DIRECTIVE_LINE = /^\[\[([a-z]+)(?::([^\]\n]*))?\]\]$/i;
const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/;
const EMPTY_CELL = /^[—–-]$/;

export function parseAintraAnswer(raw: string, opts: { streaming?: boolean } = {}): ParsedAnswer {
  const streaming = !!opts.streaming;
  let text = normalise(raw, streaming);

  // Every directive gets a line of its own, so a model that writes
  // "...any questions? [[suggest: A | B]]" still produces chips.
  text = text.replace(DIRECTIVE_ANYWHERE, '\n$1\n');

  const lines = text.split('\n').flatMap(unflattenTableLine);
  const blocks: Block[] = [];
  const suggestions: string[] = [];

  let paragraph: string[] = [];
  const flushParagraph = () => {
    const body = paragraph.join('\n').trim();
    if (body) blocks.push({ type: 'paragraph', text: body });
    paragraph = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    const isLastLine = i === lines.length - 1;

    if (!trimmed) {
      flushParagraph();
      i++;
      continue;
    }

    // Code fence. Unclosed while streaming: show what has arrived.
    if (trimmed.startsWith('```')) {
      flushParagraph();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    const directive = DIRECTIVE_LINE.exec(trimmed);
    if (directive) {
      flushParagraph();
      const name = directive[1].toLowerCase();
      const arg = (directive[2] ?? '').trim();
      if (name === 'fees') {
        const ids = arg ? arg.split(/[,|]/).map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
        // Models often write one [[fees:x]] per program on consecutive lines.
        // That is one set of cards, not three sections with three footers.
        const previous = blocks[blocks.length - 1];
        if (previous?.type === 'fees') {
          previous.ids = previous.ids === null || !ids.length ? null : [...new Set([...previous.ids, ...ids])];
        } else {
          blocks.push({ type: 'fees', ids: ids.length ? ids : null });
        }
      } else if (name === 'cta') {
        const actions = arg
          .split(/[,|]/)
          .map((s) => s.trim().toLowerCase())
          .filter((s): s is CtaAction => (CTA_ACTIONS as string[]).includes(s));
        if (actions.length) blocks.push({ type: 'cta', actions: [...new Set(actions)] });
      } else if (name === 'suggest') {
        for (const q of arg.split('|').map((s) => s.trim()).filter(Boolean)) {
          if (suggestions.length < 3 && !suggestions.includes(q)) suggestions.push(q);
        }
      }
      // Anything else is a directive this widget does not know: drop it.
      i++;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', level: heading[1].length, text: stripTrailingHashes(heading[2]) });
      i++;
      continue;
    }

    if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    if (trimmed.startsWith('|')) {
      const next = lines[i + 1]?.trim() ?? '';
      if (isSeparatorRow(next)) {
        flushParagraph();
        const header = splitRow(trimmed);
        const align = splitRow(next).map(alignOf);
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          rows.push(fitRow(splitRow(lines[i].trim()), header.length));
          i++;
        }
        blocks.push({ type: 'table', header, align: fitRow(align, header.length) as TableAlign[], rows });
        continue;
      }
      // A header row whose separator has not streamed in yet: wait for it.
      if (streaming && (isLastLine || !next)) {
        i++;
        continue;
      }
    }

    if (trimmed.startsWith('>')) {
      flushParagraph();
      const body: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        body.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', text: body.join('\n').trim() });
      continue;
    }

    const item = listItemOf(line);
    if (item) {
      flushParagraph();
      const ordered = item.ordered;
      const items: ListItem[] = [];
      const start = item.number ?? 1;
      while (i < lines.length) {
        const current = listItemOf(lines[i]);
        if (current && (current.ordered === ordered || current.depth > 0)) {
          items.push({ text: current.text, depth: current.depth });
          i++;
          continue;
        }
        // An indented line under an item continues that item.
        if (!current && lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          items[items.length - 1].text += `\n${lines[i].trim()}`;
          i++;
          continue;
        }
        break;
      }
      blocks.push({ type: 'list', ordered, start, items });
      continue;
    }

    paragraph.push(trimmed);
    i++;
  }
  flushParagraph();

  return { blocks, suggestions };
}

/**
 * Cleans what the model wrote before parsing.
 *  - Reasoning that leaked into the text (<think>...</think>, which some open
 *    backup models emit) is removed.
 *  - Dashes: the site never shows em dashes (CLAUDE.md content rule), and the
 *    model loves them. A spaced em dash becomes a comma; a spaced en dash
 *    between two values is a range and becomes "to".
 *  - While streaming, an unfinished [[directive and an unfinished table row
 *    are held back.
 */
function normalise(raw: string, streaming: boolean): string {
  let text = raw.replace(/\r\n?/g, '\n');
  text = text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');

  if (streaming) {
    const open = text.lastIndexOf('[[');
    if (open !== -1 && text.indexOf(']]', open) === -1) text = text.slice(0, open);
    // The first bracket of a directive can arrive on its own.
    else if (text.endsWith('[')) text = text.slice(0, -1);
    const lastBreak = text.lastIndexOf('\n');
    const tail = text.slice(lastBreak + 1);
    if (tail.trim().startsWith('|')) text = text.slice(0, lastBreak + 1);
  }

  return text
    // A table cell holding only a dash means "none"; say so before the dash
    // rules below turn it into a stray comma.
    .replace(/\|[ \t]*[—–-][ \t]*(?=\|)/g, '| Not available ')
    .replace(/(\S) — (\S)/g, '$1, $2')
    .replace(/(\w)—(\w)/g, '$1, $2')
    .replace(/(\S) – (\S)/g, '$1 to $2')
    .replace(/ — /g, ', ')
    .replace(/&mdash;/g, ',');
}

/**
 * A table whose rows arrived joined on one line ("| a | b | | :--- | :--- | | 1 | 2 |"),
 * which is how the screenshot that started this redesign looked. The separator
 * row tells us the column count, which is enough to cut the rows apart again.
 */
function unflattenTableLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return [line];
  const sep = /\|((?:\s*:?-{3,}:?\s*\|)+)/.exec(trimmed);
  if (!sep) return [line];
  const columns = sep[1].split('|').filter((c) => c.trim()).length;
  const cells = trimmed.slice(1, -1).split('|');
  if (cells.length <= columns + 1) return [line];

  const rows: string[] = [];
  let k = 0;
  while (k < cells.length) {
    const row = cells.slice(k, k + columns);
    if (row.some((c) => c.trim())) rows.push(`| ${row.map((c) => c.trim()).join(' | ')} |`);
    k += columns;
    // The empty cell between "| |" is the seam between two rows.
    if (k < cells.length && !cells[k].trim()) k++;
  }
  return rows.length > 1 ? rows : [line];
}

function isSeparatorRow(line: string): boolean {
  if (!line.startsWith('|') && !line.includes('|')) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => TABLE_SEPARATOR_CELL.test(c.replace(/\s/g, '')));
}

function splitRow(line: string): string[] {
  let body = line.trim();
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|')) body = body.slice(0, -1);
  return body.split('|').map((c) => {
    const cell = c.trim();
    return EMPTY_CELL.test(cell) ? 'Not available' : cell;
  });
}

function alignOf(cell: string): TableAlign {
  const c = cell.replace(/\s/g, '');
  if (c.startsWith(':') && c.endsWith(':')) return 'center';
  if (c.endsWith(':')) return 'right';
  if (c.startsWith(':')) return 'left';
  return null;
}

function fitRow<T>(row: T[], length: number): T[] {
  if (row.length === length) return row;
  if (row.length > length) return row.slice(0, length);
  return [...row, ...Array.from({ length: length - row.length }, () => '' as T)];
}

function listItemOf(line: string): { ordered: boolean; number?: number; text: string; depth: number } | null {
  const bullet = /^(\s*)[-*+•]\s+(.*)$/.exec(line);
  if (bullet) return { ordered: false, text: bullet[2].trim(), depth: bullet[1].length >= 2 ? 1 : 0 };
  const numbered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
  if (numbered) {
    return { ordered: true, number: Number(numbered[2]), text: numbered[3].trim(), depth: numbered[1].length >= 2 ? 1 : 0 };
  }
  return null;
}

function stripTrailingHashes(text: string): string {
  return text.replace(/\s+#+\s*$/, '').trim();
}

/** Inline markdown removed, for Copy and for WhatsApp sharing. */
export function plainInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

/**
 * Should this answer offer "Read in canvas"? Long, sectioned answers read
 * better at full width; short ones do not need a second surface.
 */
export function isLongAnswer(raw: string, parsed: ParsedAnswer): boolean {
  const headings = parsed.blocks.filter((b) => b.type === 'heading').length;
  return raw.length > 1200 || headings >= 2;
}

/** A sensible canvas title: the first heading, else what the answer mostly is. */
export function answerTitle(parsed: ParsedAnswer): string {
  const heading = parsed.blocks.find((b) => b.type === 'heading');
  if (heading && heading.type === 'heading') return plainInline(heading.text);
  if (parsed.blocks.some((b) => b.type === 'fees')) return 'Fee details';
  if (parsed.blocks.some((b) => b.type === 'table')) return 'Comparison';
  return 'Aintra answer';
}
