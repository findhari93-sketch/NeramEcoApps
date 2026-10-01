import { describe, expect, it } from 'vitest';
import { safeBackPath } from './safe-back-path';

describe('safeBackPath', () => {
  it('keeps a student path, query and all', () => {
    expect(safeBackPath('/student/question-bank/questions?qid=1&exam=NATA')).toBe('/student/question-bank/questions?qid=1&exam=NATA');
  });
  it('refuses anything that could leave the student app', () => {
    expect(safeBackPath('https://evil.example')).toBeNull();
    expect(safeBackPath('//evil.example/student/')).toBeNull();
    expect(safeBackPath('/teacher/question-bank')).toBeNull();
    expect(safeBackPath('/student/x?u=javascript:alert(1)')).toBeNull();
    expect(safeBackPath(null)).toBeNull();
  });
});
