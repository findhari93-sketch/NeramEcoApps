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

export const deleteSketch = (getToken: GetToken, id: string) =>
  call<void>(getToken, `/api/sketchbook/entries/${id}`, { method: 'DELETE' });

export const setOptOut = (getToken: GetToken, featureOptOut: boolean) =>
  call<{ feature_opt_out: boolean }>(getToken, '/api/sketchbook/preferences', { method: 'PATCH', body: JSON.stringify({ feature_opt_out: featureOptOut }) });

export const reactToSketch = (getToken: GetToken, id: string, reaction: SketchbookReaction | null, comment?: string) =>
  call<{ reaction: SketchbookReaction | null }>(getToken, `/api/sketchbook/entries/${id}/react`, { method: 'POST', body: JSON.stringify({ reaction, comment }) });

export const flipSketch = (getToken: GetToken, id: string, action: 'seen' | 'skipped') =>
  call<{ ok: true }>(getToken, `/api/sketchbook/entries/${id}/flip`, { method: 'POST', body: JSON.stringify({ action }) });

export const featureSketch = (getToken: GetToken, id: string, classroomId: string, caption: string) =>
  call<{ teams: { channel: boolean; chat: boolean; errors: string[] } }>(getToken, `/api/sketchbook/entries/${id}/feature`, { method: 'POST', body: JSON.stringify({ classroom_id: classroomId, caption }) });

export const unfeatureSketch = (getToken: GetToken, id: string, classroomId: string) =>
  call<{ ok: true; failures: string[] }>(getToken, `/api/sketchbook/entries/${id}/feature?classroom=${encodeURIComponent(classroomId)}`, { method: 'DELETE' });

export const setWeeklyGoal = (getToken: GetToken, classroomId: string, goal: number) =>
  call<{ goal: number }>(getToken, `/api/sketchbook/settings?classroom=${encodeURIComponent(classroomId)}`, { method: 'PATCH', body: JSON.stringify({ weekly_goal: goal }) });
