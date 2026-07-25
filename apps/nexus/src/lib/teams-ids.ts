/**
 * Helpers for extracting Microsoft Teams thread ids from what a teacher pastes in.
 *
 * A teacher usually copies either a raw thread id or a Teams deep link. Group-chat
 * thread ids look like `19:...@thread.v2`; channel thread ids like `19:...@thread.tacv2`.
 * Deep links URL-encode the `:` and `@`, e.g.
 *   https://teams.microsoft.com/l/chat/19%3Affc6...%40thread.v2/0?...
 * so we URL-decode first, then pull out the thread id.
 */

/** Matches a Teams thread id: 19:<stuff>@thread.<suffix> (v2, tacv2, skype, ...). */
const THREAD_ID_RE = /19:[^\s"'<>()]+?@thread\.[a-z0-9]+/i;

function extractThreadId(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // Decode percent-encoding when a deep link was pasted (best-effort).
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed escape sequence, keep the raw string.
  }

  const match = decoded.match(THREAD_ID_RE) || raw.match(THREAD_ID_RE);
  return match ? match[0] : null;
}

/**
 * Extract a group-chat thread id (`19:...@thread.v2`) from a raw id or a Teams
 * chat deep link. Returns null when nothing that looks like a thread id is found.
 */
export function parseTeamsChatId(input: string | null | undefined): string | null {
  return extractThreadId(input);
}

/**
 * Extract a channel thread id (`19:...@thread.tacv2`) from a raw id or a Teams
 * channel deep link. Same extraction as chat ids; kept separate for call-site clarity.
 */
export function parseTeamsChannelId(input: string | null | undefined): string | null {
  return extractThreadId(input);
}
