'use client';

import { useCallback, useEffect, useState } from 'react';
import type { NexusStudyAnnotationDTO, NexusStudyAnnotationKind, NexusStudyAnnotationPoint } from '@neram/database/types';

export interface NewAnnotationInput {
  page_number: number;
  kind: NexusStudyAnnotationKind;
  color: string;
  points?: NexusStudyAnnotationPoint[];
  anchor_x?: number;
  anchor_y?: number;
  note_text?: string | null;
}

/**
 * Single source of truth for one file's annotations (pen/highlighter strokes + sticky
 * notes), shared by the PDFReader overlay (draws them, creates new ones) and the "Notes"
 * review panel (lists them, jumps to a page) so both read the same fetch instead of
 * racing two independent ones. Read-only when `studentId` names someone other than the
 * caller (the teacher drill-in from ChapterWorkspaceRail's Students tab).
 */
export function useFileAnnotations(opts: {
  fileId: string | null;
  getToken: () => Promise<string | null>;
  enabled: boolean;
  /** Staff-only: view a specific student's marks read-only instead of the caller's own. */
  studentId?: string;
}) {
  const { fileId, getToken, enabled, studentId } = opts;
  const readOnly = !!studentId;
  const [annotations, setAnnotations] = useState<NexusStudyAnnotationDTO[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!fileId || !enabled) return;
    setLoading(true);
    try {
      const token = await getToken();
      const qs = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
      const res = await fetch(`/api/study-materials/files/${fileId}/annotations${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setAnnotations(body.annotations || []);
    } finally {
      setLoading(false);
    }
  }, [fileId, enabled, getToken, studentId]);

  useEffect(() => {
    setAnnotations([]);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, enabled, studentId]);

  const createAnnotation = useCallback(
    async (input: NewAnnotationInput): Promise<NexusStudyAnnotationDTO | null> => {
      if (!fileId || readOnly) return null;
      const token = await getToken();
      const res = await fetch(`/api/study-materials/files/${fileId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return null;
      setAnnotations((prev) => [...prev, body.annotation]);
      return body.annotation as NexusStudyAnnotationDTO;
    },
    [fileId, getToken, readOnly],
  );

  const updateAnnotationNote = useCallback(
    async (id: string, patch: { color?: string; note_text?: string | null }) => {
      if (readOnly) return null;
      const token = await getToken();
      const res = await fetch(`/api/study-materials/annotations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return null;
      setAnnotations((prev) => prev.map((a) => (a.id === id ? body.annotation : a)));
      return body.annotation as NexusStudyAnnotationDTO;
    },
    [getToken, readOnly],
  );

  const deleteAnnotation = useCallback(
    async (id: string) => {
      if (readOnly) return false;
      const token = await getToken();
      const res = await fetch(`/api/study-materials/annotations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAnnotations((prev) => prev.filter((a) => a.id !== id));
      return res.ok;
    },
    [getToken, readOnly],
  );

  return { annotations, loading, readOnly, refresh, createAnnotation, updateAnnotationNote, deleteAnnotation };
}
