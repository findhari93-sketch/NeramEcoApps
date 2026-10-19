/**
 * Aintra's answers are markdown plus a few [[directives]] the marketing chat
 * turns into cards. Staff read them here, so this splits an answer into simple
 * blocks: paragraphs, lists, GFM tables, and a labelled chip for each
 * directive (fee cards, action buttons, follow-up suggestions). Pure, tested.
 */

export type AnswerBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'card'; label: string };

const CTA_LABELS: Record<string, string> = {
  apply: 'Apply',
  demo: 'Book a demo',
  whatsapp: 'WhatsApp',
  call: 'Call',
};

function directiveLabel(body: string): string | null {
  const [name, rest = ''] = body.split(/:(.*)/s).map((s) => s.trim());
  const key = name.toLowerCase();
  if (key === 'fees') return rest ? `Fee cards shown: ${rest.split(',').map((s) => s.trim()).join(', ')}` : 'Fee cards shown';
  if (key === 'cta') {
    const actions = rest
      .split(',')
      .map((a) => CTA_LABELS[a.trim().toLowerCase()])
      .filter(Boolean);
    return actions.length ? `Buttons shown: ${actions.join(', ')}` : null;
  }
  if (key === 'book') {
    const kind = rest.split(/[,|]/)[0]?.trim().toLowerCase();
    if (kind === 'callback') return 'Callback card shown';
    if (kind === 'demo') return 'Demo booking card shown';
    return null;
  }
  if (key === 'suggest') {
    const items = rest.split('|').map((s) => s.trim()).filter(Boolean);
    return items.length ? `Suggested next: ${items.join(' · ')}` : null;
  }
  return null;
}

const isTableRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/** Strip **bold**, *italics* and `code` marks; the transcript shows plain text. */
export function plainInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\s)([^*]+?)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)');
}

export function parseAnswer(raw: string | null | undefined): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  if (!raw?.trim()) return blocks;

  // Directives become cards, in the order they appear, on their own line.
  const text = raw.replace(/\[\[([^\]]+)\]\]/g, (_, body: string) => {
    const label = directiveLabel(body);
    return label ? `\n\u0000${label}\n` : '';
  });

  const lines = text.split(/\r?\n/);
  let para: string[] = [];
  const flush = () => {
    const t = para.join('\n').trim();
    if (t) blocks.push({ type: 'paragraph', text: plainInline(t) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('\u0000')) {
      flush();
      blocks.push({ type: 'card', label: trimmed.slice(1) });
      continue;
    }
    if (!trimmed) {
      flush();
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      flush();
      const header = cells(line).map(plainInline);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(cells(lines[i]).map(plainInline));
        i++;
      }
      i--;
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', text: plainInline(heading[1]) });
      continue;
    }
    const bullet = trimmed.match(/^([-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      flush();
      const ordered = /\d/.test(bullet[1]);
      const items = [plainInline(bullet[2])];
      while (i + 1 < lines.length) {
        const next = lines[i + 1].trim().match(/^([-*•]|\d+[.)])\s+(.*)$/);
        if (!next) break;
        items.push(plainInline(next[2]));
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return blocks;
}

/** Aintra's tools (apps/marketing chat route). Unknown names are shown tidied up. */
const TOOL_LABELS: Record<string, string> = {
  search_colleges: 'College directory',
  get_college: 'College directory',
  compare_colleges: 'College directory',
};

/** "Source: Fee structure, College directory", from the tools Aintra called. */
export function sourceLabel(tools: string[]): string {
  const labels = [
    ...new Set(
      tools.map((t) => TOOL_LABELS[t] ?? t.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()))
    ),
  ];
  return labels.length ? labels.join(', ') : 'Knowledge base';
}
