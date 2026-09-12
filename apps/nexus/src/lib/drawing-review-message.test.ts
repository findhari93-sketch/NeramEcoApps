import { describe, it, expect } from 'vitest';
import { buildReviewMessage, gradeLabel, shouldNotifyStudent } from './drawing-review-message';

const LINK = 'https://nexus.neramclasses.com/student/assignments/asg-1';

const redoWithVoice = {
  action: 'redo' as const,
  assignmentTitle: 'Draw a Good Cube composition',
  teacherName: 'Hari Babu',
  gradeText: null,
  praiseLine: null,
  imageUrl: 'https://db.neramclasses.com/storage/v1/object/public/drawing-uploads/u/1.jpg',
  voiceDurationMs: 42000,
  link: LINK,
};

describe('gradeLabel', () => {
  it('reads a star rating out of five', () => {
    expect(gradeLabel({ evaluationType: 'stars', rating: 4, marks: null, maxMarks: 5 })).toBe('4/5 stars');
  });

  it('reads marks out of the maximum', () => {
    expect(gradeLabel({ evaluationType: 'marks', rating: null, marks: 7, maxMarks: 10 })).toBe('7/10 marks');
  });

  it('says something honest when no grade was given', () => {
    expect(gradeLabel({ evaluationType: 'stars', rating: null, marks: null, maxMarks: 5 })).toBe('a star rating');
    expect(gradeLabel({ evaluationType: 'marks', rating: null, marks: null, maxMarks: 10 })).toBe('your marks');
  });
});

describe('buildReviewMessage', () => {
  it('asks for a redo and names the voice note and its length', () => {
    const m = buildReviewMessage(redoWithVoice);
    expect(m.subject).toBe('Redo requested: Draw a Good Cube composition');
    expect(m.plain).toContain('Hari');
    expect(m.plain).toContain('0:42 voice note');
    expect(m.buttonLabel).toBe('Listen and redo');
  });

  it('asks for a redo without mentioning a voice note that does not exist', () => {
    const m = buildReviewMessage({ ...redoWithVoice, voiceDurationMs: null });
    expect(m.plain).not.toContain('voice note');
    expect(m.buttonLabel).toBe('See feedback and redo');
  });

  it('carries the grade and praise when the drawing is completed', () => {
    const m = buildReviewMessage({
      ...redoWithVoice,
      action: 'complete',
      gradeText: '4/5 stars',
      praiseLine: 'Well done!',
      voiceDurationMs: null,
    });
    expect(m.subject).toBe('Assignment reviewed: Draw a Good Cube composition');
    expect(m.plain).toContain('You got 4/5 stars.');
    expect(m.plain).toContain('Well done!');
    expect(m.buttonLabel).toBe('See feedback');
  });

  it('offers to listen when a completed drawing has a voice note', () => {
    const m = buildReviewMessage({ ...redoWithVoice, action: 'complete', gradeText: '5/5 stars' });
    expect(m.buttonLabel).toBe('Listen to feedback');
  });

  it('builds an Adaptive Card that opens the assignment', () => {
    const m = buildReviewMessage(redoWithVoice);
    const card = JSON.parse(m.chatAttachment.content);
    expect(m.chatAttachment.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(card.type).toBe('AdaptiveCard');
    const action = card.actions.find((a: any) => a.type === 'Action.OpenUrl');
    expect(action.url).toBe(LINK);
    expect(action.title).toBe('Listen and redo');
    expect(JSON.stringify(card.body)).toContain(redoWithVoice.imageUrl);
  });

  it('leaves the image out of the card when there is none', () => {
    const m = buildReviewMessage({ ...redoWithVoice, imageUrl: null });
    const card = JSON.parse(m.chatAttachment.content);
    expect(card.body.some((b: any) => b.type === 'Image')).toBe(false);
  });

  it('points the chat body at the card attachment by id', () => {
    const m = buildReviewMessage(redoWithVoice);
    expect(m.chatHtml).toBe(`<attachment id="${m.chatAttachment.id}"></attachment>`);
  });

  it('escapes the title in the plain HTML fallback and keeps a working link', () => {
    const m = buildReviewMessage({ ...redoWithVoice, assignmentTitle: '<script>x</script>' });
    expect(m.fallbackHtml).not.toContain('<script>');
    expect(m.fallbackHtml).toContain('&lt;script&gt;');
    expect(m.fallbackHtml).toContain(`href="${LINK}"`);
  });

  it('never writes an em dash into anything a student reads', () => {
    const m = buildReviewMessage(redoWithVoice);
    for (const text of [m.subject, m.plain, m.teamsText, m.chatAttachment.content, m.fallbackHtml]) {
      expect(text).not.toContain('—');
    }
  });
});

describe('shouldNotifyStudent', () => {
  const first = {
    action: 'redo' as const,
    previousStatus: 'submitted',
    hasAssignment: true,
    isExam: false,
    voiceSentNow: false,
  };

  it('tells the student about a first review, redo or complete', () => {
    expect(shouldNotifyStudent(first)).toBe(true);
    expect(shouldNotifyStudent({ ...first, action: 'complete' })).toBe(true);
  });

  it('never messages about an exam drawing, whose result is still embargoed', () => {
    expect(shouldNotifyStudent({ ...first, isExam: true, voiceSentNow: true })).toBe(false);
  });

  it('leaves practice drawings with no assignment as they were', () => {
    expect(shouldNotifyStudent({ ...first, hasAssignment: false })).toBe(false);
  });

  it('never messages on a draft save', () => {
    expect(shouldNotifyStudent({ ...first, action: 'draft' })).toBe(false);
  });

  it('messages again when a re-review changes the outcome', () => {
    expect(shouldNotifyStudent({ ...first, previousStatus: 'completed', action: 'redo' })).toBe(true);
    expect(shouldNotifyStudent({ ...first, previousStatus: 'redo', action: 'complete' })).toBe(true);
  });

  it('stays quiet when a re-review only tidies the same outcome', () => {
    expect(shouldNotifyStudent({ ...first, previousStatus: 'completed', action: 'complete' })).toBe(false);
    expect(shouldNotifyStudent({ ...first, previousStatus: 'reviewed', action: 'complete' })).toBe(false);
    expect(shouldNotifyStudent({ ...first, previousStatus: 'redo', action: 'redo' })).toBe(false);
  });

  it('messages on a same-outcome re-review when a new voice note went out', () => {
    expect(
      shouldNotifyStudent({ ...first, previousStatus: 'completed', action: 'complete', voiceSentNow: true }),
    ).toBe(true);
  });
});
