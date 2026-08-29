/**
 * Would this slot already have STARTED by `now`? Used to reject scheduling or
 * moving a class into the past, the gap that let a class get created for a
 * date that had already gone by. Built on `classStartIso`'s IST (+05:30)
 * boundary, the same one prework deadlines and the countdown use, so this
 * doesn't introduce a fourth independent copy of that arithmetic.
 */
import { classStartIso } from '@/lib/prework';

export function isSlotInPast(date: string, startTime: string, now: Date = new Date()): boolean {
  const start = Date.parse(classStartIso(date, startTime));
  return Number.isFinite(start) && start < now.getTime();
}
