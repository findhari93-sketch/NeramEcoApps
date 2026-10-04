import { describe, expect, it } from 'vitest';
import { detectMode, routeIntent } from './router';

const page = { path: '/student/dashboard' };

describe('routeIntent', () => {
  it.each([
    ['cancel', 'cancel'], ['Stop', 'cancel'], ['never mind', 'cancel'],
  ])('%s -> %s', (text, kind) => {
    expect(routeIntent(text, page)).toEqual({ kind });
  });

  it.each([
    ["I can't attend tomorrow", 'cannot-attend'],
    ['cannot come to class on friday', 'cannot-attend'],
    ["won't be able to join today", 'cannot-attend'],
    ['I will miss the class', 'cannot-attend'],
    ['mark me away next week', 'cannot-attend'],
    ['remind me tomorrow to finish the catch-up', 'remind-me'],
    ['Remind me on friday', 'remind-me'],
    ['add a sketch', 'upload-sketch'],
    ['upload my drawing', 'upload-sketch'],
  ])('%s -> flow %s', (text, flow) => {
    expect(routeIntent(text, page)).toEqual({ kind: 'flow', flow });
  });

  it.each([
    ["what's due", 'my_assignments'], ['pending assignments', 'my_assignments'], ['homework', 'my_assignments'],
    ['my schedule', 'my_schedule'], ['when is my next class', 'my_schedule'], ['timetable', 'my_schedule'],
    ['brief', 'my_brief'], ['what do I have today', 'my_brief'], ['summary', 'my_brief'],
    ['my attendance', 'my_attendance'],
    ['catch up', 'my_catchup'], ['catch-up', 'my_catchup'], ['what did I miss', 'my_catchup'],
    ['sketchbook', 'my_sketchbook'], ['how is my rhythm', 'my_sketchbook'],
    ['how many days left for the exam', 'exam_countdown'], ['exam date', 'exam_countdown'], ['days to NATA', 'exam_countdown'],
  ])('%s -> tool %s', (text, tool) => {
    expect(routeIntent(text, page)).toEqual({ kind: 'tool', tool });
  });

  it.each([
    ['what tests do I have', 'my_tests'],
    ['any tests due this week?', 'my_tests'],
    ['are my reviews back', 'my_reviews'],
    ['feedback on my drawing', 'my_reviews'],
    ['show me some inspiration', 'get_inspirations'],
    ["I'm new here", 'new_student_welcome'],
  ])('routes %s to %s', (text, tool) => {
    expect(routeIntent(text, null)).toEqual({ kind: 'tool', tool });
  });

  it('leaves an inspiration request with a topic to the model, which can pass the topic', () => {
    expect(routeIntent('inspiration for perspective drawings of a market', null)).toEqual({ kind: 'llm', mode: 'general' });
  });

  it('sends anything else to the model in the detected mode', () => {
    expect(routeIntent('why do we draw two point perspective', page)).toEqual({ kind: 'llm', mode: 'general' });
    expect(routeIntent('which chapter has most weightage in maths', page)).toEqual({ kind: 'llm', mode: 'exam' });
    expect(routeIntent('anything', { path: '/student/question-bank/nata/questions' })).toEqual({ kind: 'llm', mode: 'exam' });
  });

  it('treats curly apostrophes from phone keyboards like straight ones', () => {
    expect(routeIntent('I can’t attend tomorrow', page)).toEqual({ kind: 'flow', flow: 'cannot-attend' });
    expect(routeIntent('I won’t be able to join today', page)).toEqual({ kind: 'flow', flow: 'cannot-attend' });
    expect(routeIntent('what’s due', page)).toEqual({ kind: 'tool', tool: 'my_assignments' });
    expect(routeIntent('what’s up today', page)).toEqual({ kind: 'tool', tool: 'my_brief' });
  });

  it('prefers a flow over a tool when both words appear', () => {
    expect(routeIntent("I can't attend the class, what's the catch up", page)).toEqual({ kind: 'flow', flow: 'cannot-attend' });
  });
});

describe('detectMode', () => {
  it('is exam on question-bank pages or on exam words', () => {
    expect(detectMode('hello', { path: '/student/question-bank/jee' })).toBe('exam');
    expect(detectMode('NCERT chapter on probability', { path: '/student/dashboard' })).toBe('exam');
    expect(detectMode('hello', { path: '/student/dashboard' })).toBe('general');
  });
});
