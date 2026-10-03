// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ActionToolDef, AssistantCaller, ToolDef } from './types';
import { allowedTools, audienceOf, bindStudentSelf } from './policy';

const ok = async () => ({ ok: true });
const schema = { type: 'object' as const, properties: {} };

const studentRead: ToolDef = { name: 'my_brief', description: '', parameters: schema, audience: 'student', kind: 'read', run: ok };
const staffRead: ToolDef = { name: 'find_student', description: '', parameters: schema, audience: 'staff', kind: 'read', run: ok };
const examRead: ToolDef = { name: 'qb_weightage', description: '', parameters: schema, audience: 'student', kind: 'read', mode: 'exam', run: ok };
const studentAction: ActionToolDef = { name: 'set_reminder', description: '', parameters: schema, audience: 'student', kind: 'action', run: ok, execute: ok };
const examAction: ActionToolDef = { name: 'qb_bookmark', description: '', parameters: schema, audience: 'student', kind: 'action', mode: 'exam', run: ok, execute: ok };
const ALL = [studentRead, staffRead, examRead, studentAction, examAction];

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
    const names = allowedTools(ALL, student, 'general').map((t) => t.name);
    expect(names).toEqual(['my_brief', 'set_reminder']);
  });
  it('in exam mode allows only exam tools, so no student data can reach that path', () => {
    expect(allowedTools(ALL, student, 'exam').map((t) => t.name)).toEqual(['qb_weightage', 'qb_bookmark']);
  });
  it('drops every action while impersonating in general mode', () => {
    const names = allowedTools(ALL, { ...student, impersonating: true }, 'general').map((t) => t.name);
    expect(names).toEqual(['my_brief']);
  });
  it('drops every action while impersonating in exam mode', () => {
    const names = allowedTools(ALL, { ...student, impersonating: true }, 'exam').map((t) => t.name);
    expect(names).toEqual(['qb_weightage']);
  });
  it('shows staff their tools and nothing student-only', () => {
    expect(allowedTools(ALL, teacher, 'general').map((t) => t.name)).toEqual(['find_student']);
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
