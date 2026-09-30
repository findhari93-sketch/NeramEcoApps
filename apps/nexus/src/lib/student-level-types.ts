/**
 * Wire shapes for the student level routes, shared by the routes and the
 * screens. Types only, so either side can import them.
 */
import type { RecentDrawing } from './recent-drawings';
import type { SkillLevelDetail, SkillLevelEvent } from './student-level-store';
import type { LevelKey, SkillKey } from './student-level';

export type { RecentDrawing, SkillLevelDetail, SkillLevelEvent };

/** GET /api/students/[id]/snapshot */
export interface StudentSnapshotPayload {
  studentId: string;
  levels: Partial<Record<SkillKey, SkillLevelDetail>>;
  overallLevel: LevelKey | null;
  history: SkillLevelEvent[];
  recentDrawings: RecentDrawing[];
}

/** PUT /api/students/[id]/skill-level */
export interface SkillLevelWriteResult {
  studentId: string;
  skill: SkillKey;
  level: LevelKey | null;
  previous: LevelKey | null;
  changed: boolean;
}

/** One student on the Sort by drawing screen. */
export interface LevelQueueStudent {
  id: string;
  name: string | null;
  level: LevelKey | null;
  setAt: string | null;
  drawings: RecentDrawing[];
}

/** GET /api/drawing-levels/queue */
export interface LevelQueuePayload {
  students: LevelQueueStudent[];
  /** How far back the thumbnails reach, for the caption. */
  sinceDays: number;
}
