import { describe, it, expect } from 'vitest';
import { csvCell, toCsv } from './csv-export';

/**
 * The escaping five dashboards each reimplemented, pinned once.
 *
 * Every case here is something that actually occurs in this data: student names
 * with commas, Tamil chapter titles, and teacher-typed notes containing quotes.
 */

describe('csvCell', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvCell('Anitha')).toBe('Anitha');
    expect(csvCell(87)).toBe('87');
  });

  it('renders null and undefined as empty, not as the word', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes a field containing a comma, so the columns do not shift', () => {
    expect(csvCell('Kumar, R')).toBe('"Kumar, R"');
  });

  it('doubles an embedded quote rather than backslash-escaping it', () => {
    expect(csvCell('She said "yes"')).toBe('"She said ""yes"""');
  });

  it('quotes a field containing a newline', () => {
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('defuses a value Excel would run as a formula', () => {
    // A cell beginning =, +, - or @ is executed on open. This is a real attack
    // path whenever any of the data is user-typed.
    expect(csvCell('=1+1')).toBe('\t=1+1');
    expect(csvCell('@SUM(A1)')).toBe('\t@SUM(A1)');
    expect(csvCell('-2')).toBe('\t-2');
  });

  it('passes Tamil through unchanged', () => {
    expect(csvCell('தமிழ்')).toBe('தமிழ்');
  });
});

describe('toCsv', () => {
  it('writes a header row followed by the data rows', () => {
    const csv = toCsv(['Name', 'Score'], [['Anitha', 87], ['Kumar, R', null]]);
    expect(csv).toBe('Name,Score\nAnitha,87\n"Kumar, R",');
  });

  it('escapes headers too, since chapter titles become columns', () => {
    expect(toCsv(['Ch 1, intro'], [])).toBe('"Ch 1, intro"');
  });
});
