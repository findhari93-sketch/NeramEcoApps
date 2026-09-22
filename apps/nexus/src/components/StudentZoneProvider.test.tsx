import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import type { QBExamType } from '@neram/database';
import { resolveFlags } from '@/lib/feature-flags';
import { QB_PATH, type NavItem } from '@/lib/nav-config';

/**
 * The student Question Bank answers to one switch, `student.question-bank` on
 * the Features screen, and to which exams have a published paper. A second,
 * per-classroom switch used to sit in front of it and hid the bank from a whole
 * classroom while Features read On.
 */

let flags: Record<string, boolean> = {};

vi.mock('next/navigation', () => ({
  // A path owned by neither zone, so the provider keeps its default zone.
  usePathname: () => '/student/profile',
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({ featureFlags: flags }),
}));

import StudentZoneProvider, { useStudentZoneContext } from './StudentZoneProvider';

function zone(qbExams: readonly QBExamType[] | null) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StudentZoneProvider qbExams={qbExams}>{children}</StudentZoneProvider>
  );
  return renderHook(() => useStudentZoneContext(), { wrapper }).result.current;
}

type Ctx = ReturnType<typeof zone>;

const sidebarItems = (ctx: Ctx): NavItem[] => ctx.currentNavGroups.flatMap((g) => g.items);
const qbFolder = (ctx: Ctx) => sidebarItems(ctx).find((i) => i.path === QB_PATH);
const examLabels = (ctx: Ctx) => qbFolder(ctx)?.children?.map((c) => c.label) ?? [];

/** Every path a student can reach: sidebar (folders opened), bottom bar, More. */
function everyPath(ctx: Ctx): string[] {
  return [
    ...sidebarItems(ctx).flatMap((i) => [i, ...(i.children ?? [])]),
    ...ctx.currentBottomNavItems,
    ...ctx.currentOverflowItems,
  ].map((i) => i.path);
}

describe('StudentZoneProvider: Question Bank', () => {
  beforeEach(() => {
    localStorage.clear();
    flags = resolveFlags({ 'student.question-bank': true });
  });

  it('lists the Question Bank whenever its Features flag is on', () => {
    const ctx = zone(['JEE_PAPER_2']);
    expect(qbFolder(ctx)).toBeTruthy();
    expect(ctx.currentBottomNavItems.map((i) => i.path)).toContain(QB_PATH);
  });

  it('lists JEE Paper 2 only while the published exams are still loading', () => {
    // NATA appearing and then vanishing when the answer lands is worse than
    // NATA arriving late.
    const ctx = zone(null);
    expect(examLabels(ctx)).toEqual(['JEE Paper 2']);
  });

  it('still reports the exams as unknown while loading, so the redirect waits', () => {
    expect(zone(null).qbExams).toBeNull();
  });

  it('lists NATA once it has a published paper', () => {
    expect(examLabels(zone(['JEE_PAPER_2', 'NATA']))).toEqual(['JEE Paper 2', 'NATA']);
  });

  it('hides the Question Bank everywhere when its Features flag is off', () => {
    flags = resolveFlags({ 'student.question-bank': false });
    const ctx = zone(['JEE_PAPER_2', 'NATA']);
    expect(everyPath(ctx).filter((p) => p === QB_PATH || p.startsWith(QB_PATH + '/'))).toEqual([]);
  });
});
