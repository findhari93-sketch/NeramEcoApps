/**
 * The short due label on a student assignment ("2d left", "Overdue", "Day 3 ·
 * 4d left" for a late joiner). Shared by the document page and the drawing
 * workspace so the two never word a deadline differently.
 */
import type { AssignmentClock } from './assignment-clock';

export interface DueLabel {
  label: string;
  overdue: boolean;
}

export function dueLabel(clock: AssignmentClock | null, canSubmit: boolean): DueLabel | null {
  if (!clock || !canSubmit || !clock.personal_due) return null;
  const overdue = clock.status === 'overdue';
  const label = clock.is_late_joiner
    ? overdue
      ? `${Math.abs(clock.days_remaining ?? 0)}d overdue`
      : `Day ${clock.days_elapsed} · ${clock.days_remaining}d left`
    : overdue
      ? 'Overdue'
      : clock.days_remaining === 0
        ? 'Due today'
        : `${clock.days_remaining}d left`;
  return { label, overdue };
}
