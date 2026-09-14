/**
 * One exam, one address.
 *
 * The Question Bank used to be one screen with the exam picked by a tab inside
 * it. The teacher's tab opened on NATA, a single empty paper, while every paper
 * anyone was working on sat behind the second tab. The student's tabs appeared
 * only when both exams had something published, so a JEE student never learnt
 * NATA existed at all.
 *
 * Now the exam is part of the URL (`/student/question-bank/jee-paper-2`) and the
 * sidebar lists each one. Everything that needs to turn an exam into a path, or
 * a path back into an exam, goes through this file so the two directions cannot
 * drift.
 *
 * Next.js matches a static folder before a dynamic one, so the `[exam]` segment
 * sits beside `papers`, `questions`, `recalled` and the rest without shadowing
 * them. No slug here may ever equal one of those folder names.
 */

import { useSyncExternalStore } from 'react';
import type { QBExamRelevance, QBExamType } from '@neram/database';

export type QBSurface = 'student' | 'teacher';

/** Sidebar and redirect order. JEE Paper 2 first: it is where the papers are. */
export const QB_EXAM_ORDER: readonly QBExamType[] = ['JEE_PAPER_2', 'NATA'];

export const QB_EXAM_SLUGS: Record<QBExamType, string> = {
  JEE_PAPER_2: 'jee-paper-2',
  NATA: 'nata',
};

/**
 * Kept here rather than read from `QB_EXAM_TYPE_LABELS` so the nav config, which
 * every layout imports, does not pull the database barrel in with it. The
 * `Record<QBExamType, ...>` type fails the build if an exam is added without one.
 */
export const QB_EXAM_LABELS: Record<QBExamType, string> = {
  JEE_PAPER_2: 'JEE Paper 2',
  NATA: 'NATA',
};

/** Questions carry `exam_relevance`, not `exam_type`, and spell JEE differently. */
const EXAM_RELEVANCE: Record<QBExamType, QBExamRelevance> = {
  JEE_PAPER_2: 'JEE',
  NATA: 'NATA',
};

export function isQBExamType(value: unknown): value is QBExamType {
  return value === 'JEE_PAPER_2' || value === 'NATA';
}

export function examFromSlug(slug: string | null | undefined): QBExamType | null {
  if (!slug) return null;
  return QB_EXAM_ORDER.find((exam) => QB_EXAM_SLUGS[exam] === slug) ?? null;
}

export function qbHomePath(surface: QBSurface): string {
  return `/${surface}/question-bank`;
}

export function qbExamPath(surface: QBSurface, exam: QBExamType): string {
  return `${qbHomePath(surface)}/${QB_EXAM_SLUGS[exam]}`;
}

export function examRelevanceFor(exam: QBExamType): QBExamRelevance {
  return EXAM_RELEVANCE[exam];
}

/**
 * The exam an exam page belongs to, from its path, or null for every other
 * path. Shared sub-routes (`/questions`, `/papers/[id]`) are deliberately null:
 * they serve both exams and say which one through their own data.
 */
export function examFromPathname(pathname: string): QBExamType | null {
  const match = pathname.match(/^\/(?:student|teacher)\/question-bank\/([^/?#]+)/);
  return match ? examFromSlug(match[1]) : null;
}

/**
 * Which exam page to open for `/question-bank` with no exam in it.
 *
 * The one the person used last, while they can still see it. Otherwise the first
 * exam they can see, in sidebar order. Null only when they can see none.
 */
export function pickQBExam(
  remembered: QBExamType | null,
  available: readonly QBExamType[],
): QBExamType | null {
  if (remembered && available.includes(remembered)) return remembered;
  return QB_EXAM_ORDER.find((exam) => available.includes(exam)) ?? null;
}

/**
 * The exams a student's sidebar lists.
 *
 * Only exams with a published paper, so NATA stays out of the way until there is
 * something in it. With nothing published anywhere the first exam stays anyway:
 * the question search works without papers, and dropping every child would take
 * the whole Question Bank folder out of the sidebar with it.
 */
export function studentSidebarExams(published: readonly QBExamType[]): QBExamType[] {
  const listed = QB_EXAM_ORDER.filter((exam) => published.includes(exam));
  return listed.length > 0 ? listed : [QB_EXAM_ORDER[0]];
}

/**
 * Whether a nav path survives the student's exam filter. Paths that are not an
 * exam page are none of this function's business and always pass.
 */
export function isExamPathListed(path: string, listed: readonly QBExamType[]): boolean {
  const exam = examFromPathname(path);
  return exam === null || listed.includes(exam);
}

// ── The remembered exam ─────────────────────────────────────────────────────

const STORAGE_KEY = 'nexus:qb:lastExam';

/**
 * Held in memory as well as in localStorage, so a browser that refuses storage
 * (private mode, a full quota) still remembers for the life of the tab.
 */
let memory: QBExamType | null = null;
const listeners = new Set<() => void>();

/**
 * The remembered exam, read now. For effects and handlers: during hydration the
 * hook below still reports the server's null, and an effect that trusted it
 * would act on the wrong exam before the right one arrived.
 */
export function readRememberedQBExam(): QBExamType | null {
  return readRemembered();
}

function readRemembered(): QBExamType | null {
  if (memory) return memory;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isQBExamType(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Called by every screen that knows which exam it is showing. */
export function rememberQBExam(exam: QBExamType): void {
  if (readRemembered() === exam) return;
  memory = exam;
  try {
    window.localStorage.setItem(STORAGE_KEY, exam);
  } catch {
    /* the in-memory copy still applies for this tab */
  }
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      memory = null;
      notify();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * The exam this person last opened, or null. Null on the server and on the first
 * client render, so the markup matches and nothing is reported as a hydration
 * mismatch. A plain store rather than `useSearchParams`, which in a shared
 * component forces every route under it out of static prerendering.
 */
export function useRememberedQBExam(): QBExamType | null {
  return useSyncExternalStore(subscribe, readRemembered, () => null);
}

/** Test seam: forget the in-memory copy between cases. */
export function __resetRememberedQBExamForTests(): void {
  memory = null;
}
