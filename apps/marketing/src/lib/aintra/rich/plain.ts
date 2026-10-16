import { COURSE_FEES, formatRupees, type CourseFee } from '../fees';
import { parseAintraAnswer, plainInline, type ParsedAnswer } from './parse';

function feeLine(f: CourseFee): string {
  const installments = f.installmentTotal == null ? 'single payment only' : `${formatRupees(f.installmentTotal)} in installments`;
  return `${f.name} (${f.months} months): ${formatRupees(f.fullPrice)} paid in full, ${installments}`;
}

/**
 * An answer as plain text, for Copy and for sharing on WhatsApp. Directives
 * become what they stood for (fee cards become fee lines); buttons and
 * suggestions are left out, since they mean nothing outside the chat.
 */
export function answerToPlainText(input: string | ParsedAnswer): string {
  const parsed = typeof input === 'string' ? parseAintraAnswer(input) : input;
  const out: string[] = [];
  for (const block of parsed.blocks) {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
      case 'quote':
      case 'code':
        out.push(plainInline(block.text));
        break;
      case 'list':
        out.push(
          block.items
            .map((item, i) => `${'  '.repeat(item.depth)}${block.ordered && item.depth === 0 ? `${block.start + i}.` : '•'} ${plainInline(item.text)}`)
            .join('\n'),
        );
        break;
      case 'table':
        out.push([block.header, ...block.rows].map((row) => row.map(plainInline).join(' | ')).join('\n'));
        break;
      case 'fees': {
        const fees = block.ids ? COURSE_FEES.filter((f) => block.ids!.includes(f.id)) : COURSE_FEES;
        out.push((fees.length ? fees : COURSE_FEES).map(feeLine).join('\n'));
        break;
      }
      default:
        break;
    }
  }
  return out.filter(Boolean).join('\n\n');
}

/** Copies text, falling back to a hidden textarea where the Clipboard API is missing. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea route (blocked permission, insecure origin).
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
