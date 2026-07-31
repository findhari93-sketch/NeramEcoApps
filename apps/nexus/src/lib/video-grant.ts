/**
 * Mint a streaming grant, and record that it happened.
 *
 * This is where the expensive part of video authorization lives: resolving the
 * file, and writing the audit row. The byte proxy that follows does neither, so
 * everything costly is paid once per ten minutes of watching rather than once
 * per range request.
 *
 * Lives in lib rather than beside a route because a route.ts may only export
 * HTTP handlers, so three mint endpoints cannot share a helper through one
 * another. Same reason as class-staff-access.ts.
 */

import { getSupabaseAdminClient, getNexusSetting } from '@neram/database';
import { mintVideoToken, VIDEO_TOKEN_TTL_SECONDS, type VideoScope } from './video-token';
import { resolveMedia } from './recording-source-cache';
import { FEATURE_FLAGS_KEY, resolveFlags, isFeatureEnabled } from './feature-flags';

export const PROTECTED_VIDEO_FEATURE = 'student.protected-video';

/**
 * The kill switch for proxied delivery. Defaults ON (see feature-flags.ts), so
 * this returns true unless somebody has deliberately turned it off, and a failed
 * settings read also returns true rather than quietly reopening the leak.
 */
export async function isProtectedVideoEnabled(): Promise<boolean> {
  try {
    const setting = await getNexusSetting(FEATURE_FLAGS_KEY);
    const flags = resolveFlags((setting?.value as Record<string, boolean>) || {});
    return isFeatureEnabled(PROTECTED_VIDEO_FEATURE, flags);
  } catch {
    return true;
  }
}

export interface VideoGrant {
  /** Path the player puts in <video src>. Carries the grant, nothing else. */
  src: string;
  expiresAt: string;
  sessionId: string;
  sizeBytes: number;
}

export interface GrantVideoAccessInput {
  scope: VideoScope;
  refId: string;
  /** users.id of the viewer. */
  userId: string;
  /** Recorded on the audit row so a leak can be traced to a class. */
  recapId?: string | null;
  scheduledClassId?: string | null;
  request?: Request;
}

/**
 * Resolve the media, mint a short-lived grant, and log it.
 *
 * Throws MEDIA_NOT_FOUND when there is nothing to stream and
 * RECORDING_SIZE_UNKNOWN when the source will not tell us how big it is, which
 * matters because without a total we cannot answer Content-Range and the browser
 * cannot seek.
 */
export async function grantVideoAccess(input: GrantVideoAccessInput): Promise<VideoGrant> {
  const media = await resolveMedia(input.scope, input.refId);

  const { token, sid, expiresAt } = mintVideoToken({
    scope: input.scope,
    refId: input.refId,
    userId: input.userId,
    size: media.size,
  });

  // Best effort. A missing audit row is a gap in forensics, not a reason to stop
  // a student watching their class.
  try {
    const supabase = getSupabaseAdminClient() as any;
    await supabase.from('nexus_class_recap_stream_grants').insert({
      student_id: input.userId,
      recap_id: input.recapId ?? (input.scope === 'recap' ? input.refId : null),
      scheduled_class_id: input.scheduledClassId ?? (input.scope === 'class' ? input.refId : null),
      session_id: sid,
      expires_at: expiresAt,
      ip:
        input.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        input.request?.headers.get('x-real-ip') ??
        null,
      user_agent: input.request?.headers.get('user-agent')?.slice(0, 500) ?? null,
    });
  } catch (err) {
    console.error('[video-grant] audit insert failed:', err instanceof Error ? err.message : err);
  }

  return {
    src: `/api/media/recording?vt=${encodeURIComponent(token)}`,
    expiresAt,
    sessionId: sid,
    sizeBytes: media.size,
  };
}

/** Seconds a minted grant stays valid, for clients that want to pre-renew. */
export const VIDEO_GRANT_TTL_SECONDS = VIDEO_TOKEN_TTL_SECONDS;
