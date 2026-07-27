/**
 * Finding a class transcript, wherever it happens to be.
 *
 * There is no single place a Teams transcript lives. It might be pasted in by a
 * teacher, sitting behind a URL we cached earlier, available live from Graph but
 * not yet synced, or reachable only through the SharePoint recording. So this is
 * a ladder: try each source in increasing order of cost, stop at the first that
 * produces something.
 *
 * Extracted because the same ladder was being written out again for each new
 * consumer (class summaries, recap generation, and now the catch-up class test).
 * Copies of a five-step fallback drift: one gets the live-Graph step, another
 * does not, and the difference shows up as "Generate works on that screen but
 * not this one".
 *
 * Every step is best-effort. A transcript that cannot be found is a normal
 * outcome, not an error: the caller falls back to asking a human.
 */
import { parseVTT } from '@/lib/vtt-parser';
import { fetchTranscriptFromSharePoint } from '@/lib/sharepoint-transcript';
import type { TranscriptEntry } from '@neram/database';

export interface TranscriptSourceClass {
  id: string;
  transcript_url?: string | null;
  teams_meeting_id?: string | null;
  recording_url?: string | null;
}

export interface ResolveTranscriptInput {
  cls: TranscriptSourceClass;
  /** The caller's delegated Microsoft token. Without one, only the body is usable. */
  msToken?: string | null;
  /** Raw text a teacher pasted in. */
  transcriptText?: unknown;
  /** A .vtt file a teacher uploaded. */
  vttContent?: unknown;
  /**
   * Supabase admin client. Optional: when given, a transcript found live on
   * Graph is written back to the class so the next call skips straight to it.
   */
  supabase?: any;
}

export type TranscriptSource = 'pasted' | 'vtt' | 'cached_url' | 'graph_live' | 'sharepoint' | 'none';

export interface ResolvedTranscript {
  entries: TranscriptEntry[];
  source: TranscriptSource;
  /**
   * The sentinel the SharePoint step threw, if it got that far and failed:
   * NO_ACCESS, VIDEO_NOT_FOUND or NO_TRANSCRIPT.
   *
   * Reported rather than thrown because for most callers a missing transcript is
   * just "ask a human", but the recap editor turns each of these into a
   * different, actionable message ("you do not have view access to this
   * recording" is worth saying; "no transcript found" is not the same thing).
   */
  sharepointError?: string;
}

export async function resolveTranscript(input: ResolveTranscriptInput): Promise<ResolvedTranscript> {
  const { cls, msToken, supabase } = input;

  // 1. What a human handed us wins: it is the only source that is certainly
  //    about this class and certainly complete.
  if (typeof input.transcriptText === 'string' && input.transcriptText.trim()) {
    return {
      entries: [{ start: 0, end: 0, text: input.transcriptText.trim() }],
      source: 'pasted',
    };
  }
  if (typeof input.vttContent === 'string' && input.vttContent.trim()) {
    const entries = parseVTT(input.vttContent);
    if (entries.length > 0) return { entries, source: 'vtt' };
  }

  if (!msToken) return { entries: [], source: 'none' };

  // 2. A URL we resolved on an earlier run.
  if (cls.transcript_url) {
    try {
      const res = await fetch(cls.transcript_url, {
        headers: { Authorization: `Bearer ${msToken}` },
      });
      if (res.ok) {
        const entries = parseVTT(await res.text());
        if (entries.length > 0) return { entries, source: 'cached_url' };
      }
    } catch {
      // Stale or expired. Keep going.
    }
  }

  // 3. Live from Graph. This is the step that makes one-click generation work
  //    for a class whose transcript is ready but has not been synced yet.
  if (cls.teams_meeting_id) {
    try {
      const listRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/onlineMeetings/${cls.teams_meeting_id}/transcripts`,
        { headers: { Authorization: `Bearer ${msToken}` } },
      );
      if (listRes.ok) {
        const list = await listRes.json();
        const contentUrl = list.value?.[0]?.transcriptContentUrl || list.value?.[0]?.content || null;
        if (contentUrl) {
          const contentRes = await fetch(contentUrl, {
            headers: { Authorization: `Bearer ${msToken}` },
          });
          if (contentRes.ok) {
            const entries = parseVTT(await contentRes.text());
            if (entries.length > 0) {
              // Remember it, so the next call comes in at step 2.
              if (supabase) {
                try {
                  await supabase
                    .from('nexus_scheduled_classes')
                    .update({ transcript_url: contentUrl })
                    .eq('id', cls.id);
                } catch {
                  // A failed cache write is not a failed lookup.
                }
              }
              return { entries, source: 'graph_live' };
            }
          }
        }
      }
    } catch {
      // Fall through to SharePoint.
    }
  }

  // 4. Through the recording itself. Throws sentinels (NO_ACCESS,
  //    VIDEO_NOT_FOUND, NO_TRANSCRIPT), which are reported rather than thrown.
  let sharepointError: string | undefined;
  if (cls.recording_url) {
    try {
      const vtt = await fetchTranscriptFromSharePoint(cls.recording_url, msToken);
      const entries = parseVTT(vtt);
      if (entries.length > 0) return { entries, source: 'sharepoint' };
    } catch (err) {
      sharepointError = err instanceof Error ? err.message : 'UNKNOWN';
    }
  }

  return { entries: [], source: 'none', sharepointError };
}
