// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ActionToolDef, AssistantCaller, AssistantFeatures, ToolDef } from './types';
import { allowedTools, audienceOf, bindStudentSelf } from './policy';

const ok = async () => ({ ok: true });
const schema = { type: 'object' as const, properties: {} };

const studentRead: ToolDef = { name: 'my_brief', description: '', parameters: schema, audience: 'student', kind: 'read', run: ok };
const staffRead: ToolDef = { name: 'find_student', description: '', parameters: schema, audience: 'staff', kind: 'read', run: ok };
const examRead: ToolDef = { name: 'qb_weightage', description: '', parameters: schema, audience: 'student', kind: 'read', mode: 'exam', run: ok };
const studentAction: ActionToolDef = { name: 'set_reminder', description: '', parameters: schema, audience: 'student', kind: 'action', run: ok, execute: ok };
const examAction: ActionToolDef = { name: 'qb_bookmark', description: '', parameters: schema, audience: 'student', kind: 'action', mode: 'exam', run: ok, execute: ok };
const ALL = [studentRead, staffRead, examRead, studentAction, examAction];
const ON: AssistantFeatures = { sketchbook: true, attendance: true };

const student: AssistantCaller = { id: 's1', name: 'Priya', user_type: 'student', staff_role: null, can_teach: null, impersonating: false };
const teacher: AssistantCaller = { ...student, id: 't1', user_type: 'teacher', staff_role: 'teacher' };

describe('audienceOf', () => {
  it('is student for a plain student and staff for any staff tier', () => {
    expect(audienceOf(student)).toBe('student');
    expect(audienceOf(teacher)).toBe('staff');
    expect(audienceOf({ ...student, user_type: 'admin', staff_role: null })).toBe('staff');
  });
});

describe('allowedTools', () => {
  it('never shows a student a staff tool', () => {
    const names = allowedTools(ALL, student, 'general', ON).map((t) => t.name);
    expect(names).toEqual(['my_brief', 'set_reminder']);
  });
  it('in exam mode allows only exam tools, so no student data can reach that path', () => {
    expect(allowedTools(ALL, student, 'exam', ON).map((t) => t.name)).toEqual(['qb_weightage', 'qb_bookmark']);
  });
  it('drops every action while impersonating in general mode', () => {
    const names = allowedTools(ALL, { ...student, impersonating: true }, 'general', ON).map((t) => t.name);
    expect(names).toEqual(['my_brief']);
  });
  it('drops every action while impersonating in exam mode', () => {
    const names = allowedTools(ALL, { ...student, impersonating: true }, 'exam', ON).map((t) => t.name);
    expect(names).toEqual(['qb_weightage']);
  });
  it('shows staff their tools and nothing student-only', () => {
    expect(allowedTools(ALL, teacher, 'general', ON).map((t) => t.name)).toEqual(['find_student']);
  });
});

describe('allowedTools and the student features (Ruling 25)', () => {
  const sketchRead: ToolDef = { ...studentRead, name: 'my_sketchbook', feature: 'sketchbook' };
  const attendanceRead: ToolDef = { ...studentRead, name: 'my_attendance', feature: 'attendance' };
  const sketchAction: ActionToolDef = { ...studentAction, name: 'add_sketch', feature: 'sketchbook' };
  const LIST = [studentRead, sketchRead, attendanceRead, sketchAction];

  it('keeps a tool while its feature is on', () => {
    expect(allowedTools(LIST, student, 'general', ON).map((t) => t.name)).toEqual(['my_brief', 'my_sketchbook', 'my_attendance', 'add_sketch']);
  });

  it('drops every tool that leads into a feature the app has switched off', () => {
    expect(allowedTools(LIST, student, 'general', { sketchbook: false, attendance: true }).map((t) => t.name)).toEqual(['my_brief', 'my_attendance']);
    expect(allowedTools(LIST, student, 'general', { sketchbook: true, attendance: false }).map((t) => t.name)).toEqual(['my_brief', 'my_sketchbook', 'add_sketch']);
  });
});

describe('bindStudentSelf', () => {
  it('overwrites any id a student passes with their own', () => {
    expect(bindStudentSelf(student, { student_id: 'victim', user_id: 'victim', classroom_id: 'c1' })).toEqual({
      student_id: 's1', user_id: 's1', classroom_id: 'c1',
    });
  });
  it('leaves staff arguments alone', () => {
    expect(bindStudentSelf(teacher, { student_id: 'x' })).toEqual({ student_id: 'x' });
  });
});
