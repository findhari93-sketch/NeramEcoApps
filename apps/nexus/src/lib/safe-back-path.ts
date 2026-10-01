/**
 * Where a Back button may go when a link says so (`?back=`). Only a path inside
 * the student app: anything else would make the page an open redirect.
 */
export function safeBackPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/student/') || value.startsWith('//') || value.includes(':')) return null;
  return value;
}
