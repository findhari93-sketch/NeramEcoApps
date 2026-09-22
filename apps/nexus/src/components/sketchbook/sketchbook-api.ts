import type { SketchbookReaction } from '@neram/database/types';
import type { ImageQuality } from '@/lib/image-quality';

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

/**
 * Body for DrawingSubmissionSheet.submitBody when adding to the sketchbook. The
 * photo measurement rides along so the sheet's fingerprint is stored: a student
 * who also sent this sheet to an assignment must not hand the teacher it twice.
 */
export function addSketchBody(uploadedUrl: string, caption: string | null, thumbnailUrl: string | null, imageQuality: ImageQuality | null = null) {
  return { original_image_url: uploadedUrl, thumbnail_url: thumbnailUrl, caption, ...(imageQuality ? { image_quality: imageQuality } : {}) };
}

/** Body for a sketch practised from an Inspiration drawing. */
export function practiseBody(itemId: string) {
  return (uploadedUrl: string, caption: string | null, thumbnailUrl: string | null, imageQuality: ImageQuality | null = null) => ({
    ...addSketchBody(uploadedUrl, caption, thumbnailUrl, imageQuality),
    inspiration_item_id: itemId,
  });
}

export const deleteSketch = (getToken: GetToken, id: string) =>
  call<void>(getToken, `/api/sketchbook/entries/${id}`, { method: 'DELETE' });

export const setOptOut = (getToken: GetToken, featureOptOut: boolean) =>
  call<{ feature_opt_out: boolean }>(getToken, '/api/sketchbook/preferences', { method: 'PATCH', body: JSON.stringify({ feature_opt_out: featureOptOut }) });

export const setShareOptOut = (getToken: GetToken, optOut: boolean) =>
  call<{ share_drawings_opt_out: boolean }>(getToken, '/api/sketchbook/preferences', { method: 'PATCH', body: JSON.stringify({ share_drawings_opt_out: optOut }) });

/**
 * `keepalive` lets a send outlive the page: Flip through answers the teacher at
 * once and posts in the background, so a tab closed straight after a tap still
 * delivers. Payloads here are a few bytes, far inside keepalive's 64 KB cap.
 */
export interface SendOptions {
  keepalive?: boolean;
}

/**
 * The token a reaction is sent with. It becomes a Teams chat from the teacher, so
 * the chat-scoped teacher token comes first (the standing rule for anything a
 * teacher presses Send on). When that one is not to be had, the ordinary session
 * token still delivers: sendNudge then falls back to the teacher's connected
 * login, the activity feed and the bell, instead of the reaction failing outright.
 */
export const chatTokenGetter = (getTeacherToken: GetToken, getToken: GetToken): GetToken =>
  async () => (await getTeacherToken().catch(() => null)) ?? getToken();

/**
 * React, clear (null), or leave `reaction` undefined to send `comment` on its
 * own, which keeps whatever reaction the sketch already has.
 */
export const reactToSketch = (
  getToken: GetToken,
  id: string,
  reaction: SketchbookReaction | null | undefined,
  comment?: string,
  options: SendOptions = {},
) =>
  call<{ reaction: SketchbookReaction | null }>(getToken, `/api/sketchbook/entries/${id}/react`, {
    method: 'POST',
    body: JSON.stringify(reaction === undefined ? { comment } : { reaction, comment }),
    keepalive: options.keepalive,
  });

export const flipSketch = (getToken: GetToken, id: string, action: 'seen' | 'skipped', options: SendOptions = {}) =>
  call<{ ok: true }>(getToken, `/api/sketchbook/entries/${id}/flip`, {
    method: 'POST',
    body: JSON.stringify({ action }),
    keepalive: options.keepalive,
  });

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
