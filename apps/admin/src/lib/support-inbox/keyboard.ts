/**
 * Keyboard shortcuts for the support inbox, as a pure key-to-action map so the
 * rules are unit tested without a browser.
 *
 *   J / K   next / previous ticket
 *   R       reply             N   internal note
 *   /       search            Esc back to the list (narrow screens)
 *   ?       show the shortcuts
 *
 * Ignored while typing in a field, and when Ctrl, Alt or Meta is held, so
 * browser and OS shortcuts keep working.
 */

export type InboxShortcut = 'next' | 'prev' | 'reply' | 'note' | 'search' | 'back' | 'help';

export const INBOX_SHORTCUTS: { keys: string; aria: string; action: InboxShortcut; label: string }[] = [
  { keys: 'J', aria: 'j', action: 'next', label: 'Next ticket' },
  { keys: 'K', aria: 'k', action: 'prev', label: 'Previous ticket' },
  { keys: 'R', aria: 'r', action: 'reply', label: 'Reply' },
  { keys: 'N', aria: 'n', action: 'note', label: 'Internal note' },
  { keys: '/', aria: '/', action: 'search', label: 'Search' },
  { keys: 'Esc', aria: 'Escape', action: 'back', label: 'Back to the list' },
  { keys: '?', aria: 'Shift+?', action: 'help', label: 'Show shortcuts' },
  { keys: 'Ctrl+Enter', aria: 'Control+Enter', action: 'reply', label: 'Send (in the composer)' },
];

export const ARIA_KEYS: Record<InboxShortcut, string> = {
  next: 'j',
  prev: 'k',
  reply: 'r',
  note: 'n',
  search: '/',
  back: 'Escape',
  help: 'Shift+?',
};

interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

/** True when the key press is going into a text field, select or editor. */
export function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const t = target as TargetLike;
  if (t.isContentEditable) return true;
  const tag = (t.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  const role = t.getAttribute?.('role');
  return role === 'textbox' || role === 'combobox' || role === 'searchbox';
}

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: unknown;
}

export function shortcutFor(event: KeyLike): InboxShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isTypingTarget(event.target)) return null;
  switch (event.key) {
    case 'j':
    case 'J':
      return 'next';
    case 'k':
    case 'K':
      return 'prev';
    case 'r':
    case 'R':
      return 'reply';
    case 'n':
    case 'N':
      return 'note';
    case '/':
      return 'search';
    case 'Escape':
      return 'back';
    case '?':
      return 'help';
    default:
      return null;
  }
}

/** Ctrl+Enter or Cmd+Enter: send from the composer. */
export function isSendShortcut(event: KeyLike): boolean {
  return event.key === 'Enter' && (!!event.ctrlKey || !!event.metaKey);
}

/** The index J or K moves to, clamped to the list. -1 when the list is empty. */
export function stepIndex(current: number, length: number, direction: 1 | -1): number {
  if (length <= 0) return -1;
  if (current < 0) return direction === 1 ? 0 : length - 1;
  return Math.min(length - 1, Math.max(0, current + direction));
}
