import type { SketchbookReaction } from '@neram/database/types';

type GetToken = () => Promise<string | null>;

async function call<T>(getToken: GetToken, url: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('Session expired. Please refresh the page and try again.');
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'Request failed');
  return body as T;
}

/** Body for DrawingSubmissionSheet.submitBody when adding to the sketchbook. */
export function addSketchBody(uploadedUrl: string, caption: string | null, thumbnailUrl: string | null) {
  return { original_image_url: uploadedUrl, thumbnail_url: thumbnailUrl, caption };
}

/** Body for a sketch practised from an Inspiration drawing. */
export function practiseBody(itemId: string) {
  return (uploadedUrl: string, caption: string | null, thumbnailUrl: string | null) => ({
    ...addSketchBody(uploadedUrl, caption, thumbnailUrl),
    inspiration_item_id: itemId,
  });
}

export const deleteSketch = (getToken: GetToken, id: string) =>
  call<void>(getToken, `/api/sketchbook/entries/${id}`, { method: 'DELETE' });

export const setOptOut = (getToken: GetToken, featureOptOut: boolean) =>
  call<{ feature_opt_out: boolean }>(getToken, '/api/sketchbook/preferences', { method: 'PATCH', body: JSON.stringify({ feature_opt_out: featureOptOut }) });

export const setShareOptOut = (getToken: GetToken, optOut: boolean) =>
  call<{ share_drawings_opt_out: boolean }>(getToken, '/api/sketchbook/preferences', { method: 'PATCH', body: JSON.stringify({ share_drawings_opt_out: optOut }) });

export const reactToSketch = (getToken: GetToken, id: string, reaction: SketchbookReaction | null, comment?: string) =>
  call<{ reaction: SketchbookReaction | null }>(getToken, `/api/sketchbook/entries/${id}/react`, { method: 'POST', body: JSON.stringify({ reaction, comment }) });

export const flipSketch = (getToken: GetToken, id: string, action: 'seen' | 'skipped') =>
  call<{ ok: true }>(getToken, `/api/sketchbook/entries/${id}/flip`, { method: 'POST', body: JSON.stringify({ action }) });

/**
 * Feature a drawing. The classroom is optional: the server resolves the one
 * this teacher and this student share, and only answers 409 when there really
 * is a choice to make. `shelved` says whether it also reached the Inspiration
 * shelf, which a student who keeps their drawings private never does.
 */
export const featureSketch = (getToken: GetToken, id: string, classroomId?: string) =>
  call<{
    feature: { classroom_id: string; featured_at: string };
    teams: { channel: boolean; chat: boolean; errors: string[] };
    shelved: boolean;
  }>(
    getToken,
    `/api/sketchbook/entries/${id}/feature`,
    { method: 'POST', body: JSON.stringify(classroomId ? { classroom_id: classroomId } : {}) },
  );

export const unfeatureSketch = (getToken: GetToken, id: string, classroomId: string) =>
  call<{ ok: true; failures: string[] }>(getToken, `/api/sketchbook/entries/${id}/feature?classroom=${encodeURIComponent(classroomId)}`, { method: 'DELETE' });

export interface NudgeResponse {
  counts: { total: number; chat: number; teams: number; inapp: number; failed: number; skipped: number; unreached: number };
  results: Array<{ studentId: string; name: string | null; channel: string; reasons: Record<string, string> | null }>;
  dropped: number;
}

/** Needs the teacher token (chat scopes): the message goes as the teacher's own Teams chat. */
export const nudgeStudents = (getTeacherToken: GetToken, classroomId: string, studentIds: string[]) =>
  call<NudgeResponse>(getTeacherToken, '/api/sketchbook/nudge', { method: 'POST', body: JSON.stringify({ classroom_id: classroomId, student_ids: studentIds }) });

export const setWeeklyGoal =(getToken: GetToken, classroomId: string, goal: number) =>
  call<{ goal: number }>(getToken, `/api/sketchbook/settings?classroom=${encodeURIComponent(classroomId)}`, { method: 'PATCH', body: JSON.stringify({ weekly_goal: goal }) });
