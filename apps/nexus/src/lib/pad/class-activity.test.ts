import { describe, expect, it, vi } from 'vitest';
import { foldPadActivity, loadClassPadActivity, padChipLabel, type StoredRoundResult } from './class-activity';

const row = (over: Partial<StoredRoundResult>): StoredRoundResult => ({
  session_id: 'r1',
  student_id: 'asha',
  questions: 10,
  attempted: 8,
  correct: 6,
  not_active: false,
  ...over,
});

describe('foldPadActivity', () => {
  it('sums a student across the rounds of one class', () => {
    const out = foldPadActivity([
      row({}),
      row({ session_id: 'r2', questions: 8, attempted: 8, correct: 7 }),
      row({ student_id: 'bala', attempted: 0, correct: 0, not_active: true }),
    ]);
    expect(out).toMatchObject({ rounds: 2, joined: 2, answered: 1 });
    expect(out.byStudent.get('asha')).toEqual({ rounds: 2, questions: 18, attempted: 16, correct: 13, notActive: false });
    expect(out.byStudent.get('bala')).toMatchObject({ attempted: 0, notActive: true });
  });

  it('flags a student quiet only when they were quiet in most of their rounds', () => {
    const halfQuiet = foldPadActivity([row({ not_active: true }), row({ session_id: 'r2' })]);
    expect(halfQuiet.byStudent.get('asha')?.notActive).toBe(false);
    const mostlyQuiet = foldPadActivity([row({ not_active: true }), row({ session_id: 'r2', not_active: true }), row({ session_id: 'r3' })]);
    expect(mostlyQuiet.byStudent.get('asha')?.notActive).toBe(true);
  });

  it('is empty for a class that never ran the pad', () => {
    expect(foldPadActivity([])).toMatchObject({ rounds: 0, joined: 0, answered: 0 });
  });

  it('labels the attendance chip', () => {
    expect(padChipLabel({ attempted: 14, questions: 18 })).toBe('Pad 14 of 18');
  });

  it('reads the stored results by class and throws a failed read', async () => {
    const eq = vi.fn().mockResolvedValue({ data: [row({})], error: null });
    const client = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq })) })) };
    expect((await loadClassPadActivity(client, 'c1')).joined).toBe(1);
    expect(client.from).toHaveBeenCalledWith('pad_round_results');
    expect(eq).toHaveBeenCalledWith('scheduled_class_id', 'c1');

    eq.mockResolvedValueOnce({ data: null, error: new Error('down') });
    await expect(loadClassPadActivity(client, 'c1')).rejects.toThrow('down');
  });
});
