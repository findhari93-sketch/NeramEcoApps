/**
 * How far each section of a paper has got with its solution videos.
 *
 * One bar for the whole paper ("59/80") cannot answer the question a teacher
 * actually asks: "is Aptitude done?". Aptitude usually has a video for every
 * question and Mathematics rarely does, so the two are counted apart.
 *
 * Always over the WHOLE section, never the filtered view: with "No video" on,
 * the list shows only the gaps, and a bar reading 0/21 would be a lie.
 *
 * Grouping follows the list below it (the stored `section`, ordered by
 * QB_SECTION_ORDER, Unsectioned last), so a bar and its heading always agree.
 */
import { QB_SECTION_ORDER, qbSectionLabel, type QBQuestionSection } from '@neram/database';

export interface VideoProgressQuestion {
  id: string;
  section?: QBQuestionSection | null;
}

export interface SectionVideoProgress {
  /** The section, or '__none__' for questions that have none yet. */
  key: QBQuestionSection | '__none__';
  label: string;
  done: number;
  total: number;
  missing: number;
  complete: boolean;
}

export function sectionVideoProgress<Q extends VideoProgressQuestion>(
  questions: Q[],
  hasVideo: (q: Q) => boolean,
): SectionVideoProgress[] {
  const groups = new Map<SectionVideoProgress['key'], { done: number; total: number }>();
  for (const q of questions) {
    const key = q.section ?? '__none__';
    const group = groups.get(key) ?? { done: 0, total: 0 };
    group.total += 1;
    if (hasVideo(q)) group.done += 1;
    groups.set(key, group);
  }

  const order = (key: SectionVideoProgress['key']) =>
    key === '__none__' ? 99 : QB_SECTION_ORDER[key] ?? 98;

  return Array.from(groups.entries())
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([key, { done, total }]) => ({
      key,
      label: key === '__none__' ? 'Unsectioned' : qbSectionLabel(key),
      done,
      total,
      missing: total - done,
      complete: total > 0 && done === total,
    }));
}
