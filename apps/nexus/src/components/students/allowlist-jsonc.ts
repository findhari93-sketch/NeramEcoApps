/**
 * Reading an allowlist that carries its reasons.
 *
 * Two guardrails now keep a student's face on screen, and both are allowlists:
 * the ESLint overrides in .eslintrc.json that say which faces may stay plain,
 * and faceless-name-allowlist.jsonc that says which names may appear without
 * one. An exception without a reason is indistinguishable from an oversight, so
 * both formats keep the reason as a `//` comment above the entry. ESLint parses
 * those; JSON.parse does not.
 */

/**
 * Strip `//` line comments so JSON.parse can read the rest.
 *
 * Tracks string state rather than running a regex over the whole file, because a
 * rule message or a reason could legitimately contain a double slash, and a URL
 * in a comment is the obvious way to lose half a config to a greedy match.
 */
export function stripLineComments(src: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }

    out += ch;
  }

  return out;
}
