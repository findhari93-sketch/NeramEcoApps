import { describe, it, expect } from 'vitest';
import {
  RECORDING_CAP_MS,
  applyListen,
  extForMime,
  heardLabel,
  heardState,
  isAllowedVoiceMime,
  isVoiceNotePathFor,
  pickRecordingMime,
  voiceContentType,
  voiceNotePath,
  voiceStatusLine,
} from './voice-recording';

const SUB = '3f1c2a9e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const NOTE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

describe('pickRecordingMime', () => {
  it('prefers AAC in MP4, the one format every phone can play back', () => {
    expect(pickRecordingMime(() => true)).toBe('audio/mp4;codecs=mp4a.40.2');
  });

  it('falls back to WebM Opus when the browser cannot encode AAC', () => {
    const supported = new Set(['audio/webm;codecs=opus', 'audio/webm']);
    expect(pickRecordingMime((m) => supported.has(m))).toBe('audio/webm;codecs=opus');
  });

  it('takes plain audio/mp4 on Safari, which answers no to codec strings', () => {
    expect(pickRecordingMime((m) => m === 'audio/mp4')).toBe('audio/mp4');
  });

  it('returns null when the browser cannot record any format we store', () => {
    expect(pickRecordingMime(() => false)).toBeNull();
  });

  it('treats a throwing isTypeSupported as unsupported rather than crashing', () => {
    expect(
      pickRecordingMime(() => {
        throw new Error('not implemented');
      }),
    ).toBeNull();
  });
});

describe('extForMime', () => {
  it('maps each recordable container to its file extension', () => {
    expect(extForMime('audio/mp4;codecs=mp4a.40.2')).toBe('m4a');
    expect(extForMime('audio/webm;codecs=opus')).toBe('webm');
    expect(extForMime('audio/ogg')).toBe('ogg');
  });

  it('returns null for anything that is not a voice note', () => {
    expect(extForMime('video/mp4')).toBeNull();
    expect(extForMime('image/png')).toBeNull();
  });
});

describe('isAllowedVoiceMime', () => {
  it('accepts the recordable containers with or without codec parameters', () => {
    expect(isAllowedVoiceMime('audio/webm;codecs=opus')).toBe(true);
    expect(isAllowedVoiceMime('AUDIO/MP4')).toBe(true);
  });

  it('refuses everything else', () => {
    expect(isAllowedVoiceMime('image/png')).toBe(false);
    expect(isAllowedVoiceMime('audio/mpeg')).toBe(false);
    expect(isAllowedVoiceMime('')).toBe(false);
  });
});

describe('voiceContentType', () => {
  it('drops codec parameters so storage matches the bucket allow list', () => {
    expect(voiceContentType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(voiceContentType('audio/mp4;codecs=mp4a.40.2')).toBe('audio/mp4');
    expect(voiceContentType('AUDIO/OGG')).toBe('audio/ogg');
  });
});

describe('voice note paths', () => {
  it('builds the path under the submission it belongs to', () => {
    expect(voiceNotePath(SUB, NOTE, 'audio/webm;codecs=opus')).toBe(`${SUB}/${NOTE}.webm`);
  });

  it('accepts a path the server would have minted for this submission', () => {
    expect(isVoiceNotePathFor(SUB, `${SUB}/${NOTE}.m4a`)).toBe(true);
  });

  it("refuses a path under another student's submission", () => {
    const other = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
    expect(isVoiceNotePathFor(SUB, `${other}/${NOTE}.webm`)).toBe(false);
  });

  it('refuses traversal, nesting and non-audio extensions', () => {
    expect(isVoiceNotePathFor(SUB, `${SUB}/../${NOTE}.webm`)).toBe(false);
    expect(isVoiceNotePathFor(SUB, `${SUB}/extra/${NOTE}.webm`)).toBe(false);
    expect(isVoiceNotePathFor(SUB, `${SUB}/${NOTE}.png`)).toBe(false);
    expect(isVoiceNotePathFor(SUB, `${SUB}/not-a-uuid.webm`)).toBe(false);
  });
});

describe('heardState', () => {
  const base = { sent_at: null, first_played_at: null, heard_fully_at: null };

  it('is unsent while the note is still a draft, or missing', () => {
    expect(heardState(null)).toBe('unsent');
    expect(heardState(base)).toBe('unsent');
  });

  it('is unheard once sent and never played', () => {
    expect(heardState({ ...base, sent_at: '2026-09-12T10:00:00Z' })).toBe('unheard');
  });

  it('is partial when the student started but did not reach the end', () => {
    expect(
      heardState({ ...base, sent_at: '2026-09-12T10:00:00Z', first_played_at: '2026-09-12T11:00:00Z' }),
    ).toBe('partial');
  });

  it('is full once the student heard it through', () => {
    expect(
      heardState({
        sent_at: '2026-09-12T10:00:00Z',
        first_played_at: '2026-09-12T11:00:00Z',
        heard_fully_at: '2026-09-12T11:01:00Z',
      }),
    ).toBe('full');
  });
});

describe('heardLabel', () => {
  it('names each state in a word or two', () => {
    expect(heardLabel('full')).toBe('Heard');
    expect(heardLabel('partial')).toBe('Partly heard');
    expect(heardLabel('unheard')).toBe('Not heard yet');
    expect(heardLabel('unsent')).toBe('Draft');
  });
});

describe('voiceStatusLine', () => {
  const NOW = Date.parse('2026-09-12T12:00:00Z');
  const sent = {
    sent_at: '2026-09-12T09:00:00Z',
    first_played_at: null,
    heard_fully_at: null,
    max_position_ms: 0,
    duration_ms: 42000,
  };

  it('tells the teacher a draft goes out with the review', () => {
    expect(voiceStatusLine({ ...sent, sent_at: null }, NOW)).toBe('Saved. It goes out with Redo or Complete.');
  });

  it('says a sent note has not been heard yet', () => {
    expect(voiceStatusLine(sent, NOW)).toBe('Sent 3h ago. Not heard yet.');
  });

  it('says where the student stopped', () => {
    expect(
      voiceStatusLine({ ...sent, first_played_at: '2026-09-12T10:00:00Z', max_position_ms: 12000 }, NOW),
    ).toBe('Sent 3h ago. Stopped at 0:12 of 0:42.');
  });

  it('says when the student heard it through', () => {
    expect(
      voiceStatusLine(
        {
          ...sent,
          first_played_at: '2026-09-12T10:00:00Z',
          heard_fully_at: '2026-09-12T11:00:00Z',
          max_position_ms: 42000,
        },
        NOW,
      ),
    ).toBe('Sent 3h ago. Heard fully 1h ago.');
  });

  it('reads recent and old times the way a person says them', () => {
    expect(voiceStatusLine({ ...sent, sent_at: '2026-09-12T11:59:40Z' }, NOW)).toBe('Sent just now. Not heard yet.');
    expect(voiceStatusLine({ ...sent, sent_at: '2026-09-12T11:55:00Z' }, NOW)).toBe('Sent 5 min ago. Not heard yet.');
    expect(voiceStatusLine({ ...sent, sent_at: '2026-09-10T12:00:00Z' }, NOW)).toBe('Sent 2d ago. Not heard yet.');
  });
});

describe('applyListen', () => {
  const NOW = '2026-09-12T12:00:00.000Z';
  const fresh = { first_played_at: null, max_position_ms: 0, heard_fully_at: null, play_count: 0 };

  it('stamps the first play and counts it', () => {
    const next = applyListen(fresh, { positionMs: 2000, ended: false, started: true, durationMs: 42000, now: NOW });
    expect(next.first_played_at).toBe(NOW);
    expect(next.play_count).toBe(1);
    expect(next.max_position_ms).toBe(2000);
    expect(next.heard_fully_at).toBeNull();
  });

  it('keeps the original first play when the student listens again', () => {
    const prev = { ...fresh, first_played_at: '2026-09-11T08:00:00.000Z', play_count: 1, max_position_ms: 5000 };
    const next = applyListen(prev, { positionMs: 1000, ended: false, started: true, durationMs: 42000, now: NOW });
    expect(next.first_played_at).toBe('2026-09-11T08:00:00.000Z');
    expect(next.play_count).toBe(2);
  });

  it('never moves the furthest point backwards on a re-listen from the start', () => {
    const prev = { ...fresh, first_played_at: NOW, play_count: 1, max_position_ms: 30000 };
    const next = applyListen(prev, { positionMs: 4000, ended: false, started: false, durationMs: 42000, now: NOW });
    expect(next.max_position_ms).toBe(30000);
    expect(next.play_count).toBe(1);
  });

  it('marks it heard fully at 90 percent of the duration', () => {
    const prev = { ...fresh, first_played_at: NOW, play_count: 1 };
    const next = applyListen(prev, { positionMs: 37800, ended: false, started: false, durationMs: 42000, now: NOW });
    expect(next.heard_fully_at).toBe(NOW);
  });

  it('marks it heard fully on ended even when the reported time falls short', () => {
    const prev = { ...fresh, first_played_at: NOW, play_count: 1 };
    const next = applyListen(prev, { positionMs: 12000, ended: true, started: false, durationMs: 42000, now: NOW });
    expect(next.heard_fully_at).toBe(NOW);
  });

  it('never clears or moves heard fully once it is set', () => {
    const prev = { first_played_at: NOW, max_position_ms: 42000, heard_fully_at: '2026-09-11T09:00:00.000Z', play_count: 1 };
    const next = applyListen(prev, { positionMs: 1000, ended: false, started: true, durationMs: 42000, now: NOW });
    expect(next.heard_fully_at).toBe('2026-09-11T09:00:00.000Z');
  });

  it('clamps a reported position to the length of the note', () => {
    const next = applyListen(fresh, { positionMs: 999999, ended: false, started: true, durationMs: 42000, now: NOW });
    expect(next.max_position_ms).toBe(42000);
  });

  it('treats a nonsense position as zero', () => {
    const next = applyListen(fresh, { positionMs: Number.NaN, ended: false, started: true, durationMs: 42000, now: NOW });
    expect(next.max_position_ms).toBe(0);
  });
});

describe('RECORDING_CAP_MS', () => {
  it('holds a voice note to three minutes', () => {
    expect(RECORDING_CAP_MS).toBe(180000);
  });
});
