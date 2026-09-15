/**
 * The teacher's notes on a drawing, numbered once so the pins on the drawing and
 * the "What to fix" list in the panel always agree.
 *
 * `ai_overlay_annotations` has held two shapes. Current rows are regions (a box
 * as fractions of the drawing, with a comment). Rows written before the region
 * editor carry only a `label` or an `area` name and no box. Both are notes; only
 * a region can be pinned.
 */
import type { RegionAnnotation } from './drawing-prompt-templates';

export interface RegionNote {
  id: string;
  /** 1-based, in the order the teacher made them. */
  number: number;
  text: string;
  /** Null for an older note that has no place on the drawing. */
  region: RegionAnnotation | null;
}

const unit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

export function notesFromAnnotations(raw: unknown): { notes: RegionNote[]; regions: RegionAnnotation[] } {
  if (!Array.isArray(raw)) return { notes: [], regions: [] };
  const notes: RegionNote[] = [];
  const regions: RegionAnnotation[] = [];

  raw.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') return;
    const e = entry as Record<string, unknown>;
    const comment = typeof e.comment === 'string' ? e.comment.trim() : '';
    const isRegion = unit(e.x) && unit(e.y) && unit(e.width) && unit(e.height) && (e.width as number) > 0 && (e.height as number) > 0;

    if (isRegion) {
      const region: RegionAnnotation = {
        id: typeof e.id === 'string' && e.id ? e.id : `r${i}`,
        x: e.x as number,
        y: e.y as number,
        width: e.width as number,
        height: e.height as number,
        comment,
      };
      regions.push(region);
      notes.push({ id: region.id, number: notes.length + 1, text: comment || 'Look again at this part', region });
      return;
    }

    const legacy = comment || (typeof e.label === 'string' ? e.label.trim() : '') || (typeof e.area === 'string' ? e.area.trim() : '');
    if (legacy) notes.push({ id: `n${i}`, number: notes.length + 1, text: legacy, region: null });
  });

  return { notes, regions };
}
