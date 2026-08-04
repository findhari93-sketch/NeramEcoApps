/**
 * Turning a table on screen into a file a tutor can open in Excel.
 *
 * Five dashboards had already hand-rolled this, each with its own idea of
 * escaping. That is one bug per copy waiting to happen, and the bug is always
 * the same one: a student's name contains a comma, or a chapter title contains a
 * quote, and the columns silently shift for every row after it.
 *
 * The rules that matter are small and worth stating rather than rediscovering:
 *   - a field containing a comma, a quote or a newline must be wrapped in quotes
 *   - a quote inside a quoted field is escaped by doubling it, not by a backslash
 *   - Excel reads a leading =, +, - or @ as a formula, so those are prefixed
 *     with a tab. A cell reading "=cmd|..." is a real attack, not a curiosity.
 */

export type CsvValue = string | number | boolean | null | undefined;

/** One field, escaped so it cannot break the row or be read as a formula. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  // Excel and Sheets both execute a cell that starts with one of these.
  const defused = /^[=+\-@]/.test(raw) ? `\t${raw}` : raw;
  if (/[",\n\r]/.test(defused)) return `"${defused.replace(/"/g, '""')}"`;
  return defused;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
}

/**
 * Hand the browser a CSV as a download.
 *
 * The BOM is not decoration: without it Excel on Windows reads UTF-8 as the
 * system codepage, and every Tamil chapter title and student name arrives as
 * mojibake. That is the whole reason this helper exists rather than a one-liner.
 */
export function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]): void {
  const blob = new Blob([`﻿${toCsv(headers, rows)}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoked on the next tick: revoking synchronously can beat the download in
  // Safari and produce an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
