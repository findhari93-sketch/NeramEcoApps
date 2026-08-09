/**
 * Copying text out of the app, and the two ways it fails.
 *
 * `navigator.clipboard.writeText` needs the document focused and, in Chrome, a
 * live user activation. Both are lost by an `await` in the click handler: fetch
 * the data first and the copy that follows is rejected with "Document is not
 * focused", even though the click was real. The fix at the call site is to hold
 * the text in state and copy on a second, bare click; the fallback here covers
 * the rest (insecure origins, an unfocused window, a browser that refuses).
 *
 * When both routes fail the caller should offer `downloadText` instead, which
 * needs no permission at all.
 */

/** True when the text reached the clipboard by either route. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path rather than reporting failure straight away.
  }

  // execCommand is deprecated but still the only route that works on an
  // insecure origin, and it does not care whether the document has focus.
  try {
    const area = document.createElement('textarea');
    area.value = text;
    // Keep it off-screen without `display: none`, which would make it unselectable.
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    area.setAttribute('readonly', '');
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Save text as a file. No clipboard permission involved, so this always works. */
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
