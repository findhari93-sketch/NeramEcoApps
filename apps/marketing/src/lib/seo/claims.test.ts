/**
 * The site states only the founder-confirmed proof points (PROOF_POINTS in
 * facts.ts). AI assistants and Google trust an entity less when its pages
 * contradict each other, so this scans every source file for the old,
 * unverifiable claims and fails if one comes back.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { PROOF_POINTS } from './facts';

const SRC = path.resolve(__dirname, '../..');

const BANNED: Array<[label: string, re: RegExp]> = [
  ['success percentage', /99\.9\s?%/],
  ['10,000+ students', /10,000\+|10000\+|10,000 से अधिक/],
  ['5,000+ students or colleges', /5,?000\+\s*(students|colleges|aspirants|architecture|B\.Arch|options)/i],
  ['150+ cities', /150\+\s*(cities|coaching|covered|centers|centres)/i],
  ['"#1" claim', /(?<![&\w])#1(?![0-9a-fA-F\w])/],
  ['hard-coded rating', /4\.9\s?\/\s?5|4\.9 on Google|4\.8\s?\/\s?5|90\+ reviews|2500\+ reviews/i],
  ['inflated years', /1[5-7]\+\s*(years|yrs)/i],
  ['"AIR 1 & 2" claim', /AIR 1\s?(&|&amp;)\s?2/],
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('marketing claims', () => {
  it('keeps the confirmed proof points', () => {
    expect(PROOF_POINTS.line).toBe('10+ years, 1,000+ students, AIR 1 in JEE B.Arch 2024');
  });

  it('never states the old unverifiable claims anywhere in src', () => {
    const hits: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        // Comments that explain why a claim was removed may quote it.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        // NIRF ranks of colleges and a named tutor's own experience are not Neram claims.
        if (/NIRF|rank #1|qualification:/.test(line)) return;
        for (const [label, re] of BANNED) {
          if (re.test(line)) hits.push(`${path.relative(SRC, file)}:${i + 1} ${label}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });
});
