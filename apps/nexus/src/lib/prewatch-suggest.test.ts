import { describe, it, expect } from 'vitest';
import {
  isPlayableRecording,
  libraryCandidate,
  mergeSuggestions,
  rankRecordings,
  recordingCandidate,
  scoreRecording,
  tokenize,
  type RecordingRow,
  type ScoreContext,
} from './prewatch-suggest';

const rec = (over: Partial<RecordingRow>): RecordingRow => ({
  id: 'c1',
  title: 'Class',
  description: null,
  scheduled_date: '2026-09-01',
  classroom_id: 'room-a',
  classroom_name: 'JEE B.Arch Session 1',
  course_topic_id: null,
  recording_url: 'https://neram.sharepoint.com/sites/x/rec.mp4',
  youtube_url: null,
  recording_duration_minutes: 60,
  library_video_id: null,
  tags: [],
  ...over,
});

const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
  tokens: tokenize('Human on Streets'),
  today: '2026-10-10',
  ...over,
});

describe('tokenize', () => {
  it('keeps the words that carry the topic', () => {
    expect(tokenize('Human on Streets')).toEqual(['human', 'streets']);
    expect(tokenize('Class 3: Perspective drawing, part 2')).toEqual(['perspective', 'drawing']);
    expect(tokenize('')).toEqual([]);
  });
});

describe('scoreRecording', () => {
  it('finds a past class that shares the topic words, singular or plural', () => {
    expect(scoreRecording(ctx(), rec({ title: 'Humans on the street' }))).toBeGreaterThan(0);
  });

  it('offers nothing for an unrelated class', () => {
    expect(scoreRecording(ctx(), rec({ title: 'Mathematics: Matrices' }))).toBe(0);
  });

  it('does not let a short word match inside a longer one', () => {
    expect(scoreRecording(ctx({ tokens: ['art'] }), rec({ title: 'Party time' }))).toBe(0);
  });

  it('ranks the chosen course topic above any amount of word overlap', () => {
    const topic = scoreRecording(ctx({ courseTopicId: 't1' }), rec({ title: 'Something else', course_topic_id: 't1' }));
    const words = scoreRecording(ctx({ courseTopicId: 't1' }), rec({ title: 'Human streets', tags: ['human', 'streets'] }));
    expect(topic).toBeGreaterThan(words);
  });

  it('matches on tags and description too', () => {
    expect(scoreRecording(ctx(), rec({ title: 'Week 4', tags: ['Streets'] }))).toBeGreaterThan(0);
    expect(scoreRecording(ctx(), rec({ title: 'Week 4', description: 'Sketching humans outdoors' }))).toBeGreaterThan(0);
  });

  it('breaks ties with recency and the same classroom, but never invents a match', () => {
    const recent = scoreRecording(ctx(), rec({ title: 'Human streets', scheduled_date: '2026-10-01' }));
    const old = scoreRecording(ctx(), rec({ title: 'Human streets', scheduled_date: '2025-06-01' }));
    expect(recent).toBeGreaterThan(old);
    const same = scoreRecording(ctx({ classroomIds: ['room-a'] }), rec({ title: 'Human streets' }));
    expect(same).toBeGreaterThan(scoreRecording(ctx(), rec({ title: 'Human streets' })));
    expect(scoreRecording(ctx({ classroomIds: ['room-a'] }), rec({ title: 'Unrelated' }))).toBe(0);
  });
});

describe('isPlayableRecording', () => {
  it('plays a SharePoint recording or a YouTube backup', () => {
    expect(isPlayableRecording(rec({}))).toBe(true);
    expect(isPlayableRecording(rec({ recording_url: null, youtube_url: 'https://youtu.be/dQw4w9WgXcQ' }))).toBe(true);
  });
  it('refuses a stored Graph API URL with no backup', () => {
    expect(
      isPlayableRecording(rec({ recording_url: 'https://graph.microsoft.com/v1.0/drives/x/items/y', youtube_url: null })),
    ).toBe(false);
    expect(isPlayableRecording(rec({ recording_url: null, youtube_url: null }))).toBe(false);
  });
});

describe('candidates', () => {
  it('labels a past class with its classroom and date and converts minutes', () => {
    const c = recordingCandidate(rec({ id: 'c9', scheduled_date: '2026-10-03', youtube_url: 'https://youtu.be/dQw4w9WgXcQ' }));
    expect(c.key).toBe('class_recording:c9');
    expect(c.subtitle).toBe('JEE B.Arch Session 1, 3 Oct 2026');
    expect(c.duration_seconds).toBe(3600);
    expect(c.thumb_url).toContain('dQw4w9WgXcQ');
  });

  it('builds a Library candidate with a thumbnail even when none is stored', () => {
    const c = libraryCandidate({ id: 'v1', youtube_video_id: 'dQw4w9WgXcQ', original_title: 'Old class' });
    expect(c.title).toBe('Old class');
    expect(c.subtitle).toBe('Library');
    expect(c.thumb_url).toContain('dQw4w9WgXcQ');
  });

  it('ranks only playable, matching classes', () => {
    const ranked = rankRecordings(ctx(), [
      rec({ id: 'a', title: 'Human streets' }),
      rec({ id: 'b', title: 'Unrelated' }),
      rec({ id: 'c', title: 'Human streets', recording_url: null, youtube_url: null }),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(['a']);
  });
});

describe('mergeSuggestions', () => {
  const lib = (id: string) => libraryCandidate({ id, youtube_video_id: null, original_title: id });
  const r = (id: string, over: Partial<RecordingRow> = {}, c: ScoreContext = ctx()) =>
    recordingCandidate(rec({ id, title: 'Human streets', ...over }), c);

  it('puts topic matches first, then alternates the sources', () => {
    const topicCtx = ctx({ courseTopicId: 't1' });
    const out = mergeSuggestions(
      [r('r1', {}, topicCtx), r('t', { course_topic_id: 't1' }, topicCtx), r('r2', {}, topicCtx)],
      [lib('l1'), lib('l2')],
      { limit: 5 },
    );
    expect(out.map((c) => c.id)).toEqual(['t', 'r1', 'l1', 'r2', 'l2']);
  });

  it('shows a class that is also in the Library once, as the Library copy', () => {
    const out = mergeSuggestions([r('r1', { library_video_id: 'l1' })], [lib('l1')], { limit: 3 });
    expect(out.map((c) => c.key)).toEqual(['library_video:l1']);
  });

  it('leaves out what is already picked and respects the limit', () => {
    const out = mergeSuggestions([r('r1'), r('r2')], [lib('l1'), lib('l2')], {
      limit: 2,
      exclude: ['class_recording:r1'],
    });
    expect(out.map((c) => c.id)).toEqual(['r2', 'l1']);
  });
});
