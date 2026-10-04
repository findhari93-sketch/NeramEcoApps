/** The "on" status line. Pure and import-free, so the panel and the server word it the same way. */
export function onSentence(limit: number, left: number): string {
  if (limit <= 0) return 'AI answers are paused right now.';
  if (left <= 0) return 'AI answers: on, none left today. They reset at midnight.';
  return `AI answers: on, ${left} left today.`;
}
