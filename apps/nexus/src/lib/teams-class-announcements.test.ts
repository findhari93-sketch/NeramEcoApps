import { describe, it, expect, vi, afterEach } from 'vitest';
import { removeTeamsAnnouncements, type TeamsAnnouncementRefs } from './teams-class-announcements';

/**
 * `removeTeamsAnnouncements` softDeletes Teams cards for a cancelled/deleted
 * class. The bug this guards against: a Graph 403 (wrong/expired scope, no
 * longer a chat member, etc.) used to be swallowed with only a console.error,
 * so a permanent delete reported a clean success while the card sat untouched
 * in Teams. `failures` is how the caller (the DELETE route) now finds out.
 */
function makeSupabase(classroom: { ms_team_id: string | null; ms_group_chat_id: string | null } | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: classroom }),
        }),
      }),
    }),
  } as any;
}

const REFS: TeamsAnnouncementRefs = {
  teams_channel_id: 'channel-1',
  teams_channel_message_id: 'msg-channel',
  teams_group_chat_message_id: 'msg-chat',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('removeTeamsAnnouncements', () => {
  it('reports no failures when every softDelete succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true }) as Response));
    const supabase = makeSupabase({ ms_team_id: 'team-1', ms_group_chat_id: 'chat-1' });

    const result = await removeTeamsAnnouncements('token', supabase, 'room-1', REFS);
    expect(result.failures).toEqual([]);
  });

  it('names the group chat post when Graph rejects only that softDelete', async () => {
    // The exact shape of the bug report: the channel post's own softDelete
    // succeeds, but the group chat's fails (e.g. a 403 from a missing/expired
    // Chat.ReadWrite grant), and the message is still visible in Teams.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: !url.includes('/chats/'),
        status: 403,
        text: async () => 'Forbidden',
      })) as unknown as typeof fetch,
    );
    const supabase = makeSupabase({ ms_team_id: 'team-1', ms_group_chat_id: 'chat-1' });

    const result = await removeTeamsAnnouncements('token', supabase, 'room-1', REFS);
    expect(result.failures).toEqual(['group chat post']);
  });

  it('records a failure without calling Graph when the classroom has no group chat id', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true }) as Response);
    vi.stubGlobal('fetch', fetchSpy);
    const supabase = makeSupabase({ ms_team_id: 'team-1', ms_group_chat_id: null });

    const result = await removeTeamsAnnouncements('token', supabase, 'room-1', REFS);
    expect(result.failures).toEqual(['group chat post']);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // only the channel post
  });

  it('is a no-op for a class with no cards to remove', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const supabase = makeSupabase({ ms_team_id: 'team-1', ms_group_chat_id: 'chat-1' });

    const result = await removeTeamsAnnouncements('token', supabase, 'room-1', {
      teams_channel_id: null,
      teams_channel_message_id: null,
      teams_group_chat_message_id: null,
    });
    expect(result.failures).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
