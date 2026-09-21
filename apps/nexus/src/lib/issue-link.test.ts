import { describe, it, expect } from 'vitest';
import {
  ISSUE_PARAM,
  studentIssuePath,
  teacherIssuePath,
  issuePathFor,
  studentIssueUrl,
  teacherIssueUrl,
  findIssueForRef,
} from './issue-link';

describe('issue deep links', () => {
  it('points each side at its own issues page', () => {
    expect(studentIssuePath('NXS-0125')).toBe('/student/issues?issue=NXS-0125');
    expect(teacherIssuePath('NXS-0125')).toBe('/teacher/issues?issue=NXS-0125');
  });

  it('encodes the reference', () => {
    expect(studentIssuePath('a b&c')).toBe('/student/issues?issue=a%20b%26c');
  });

  it('uses the parameter name the pages read', () => {
    expect(studentIssuePath('X')).toContain(`?${ISSUE_PARAM}=`);
  });

  it('routes by the reader role, not the sender', () => {
    expect(issuePathFor('teacher', 'X')).toBe('/teacher/issues?issue=X');
    expect(issuePathFor('admin', 'X')).toBe('/teacher/issues?issue=X');
    expect(issuePathFor('manager', 'X')).toBe('/teacher/issues?issue=X');
    expect(issuePathFor('student', 'X')).toBe('/student/issues?issue=X');
    expect(issuePathFor(null, 'X')).toBe('/student/issues?issue=X');
  });

  it('joins a base without doubling the slash', () => {
    expect(studentIssueUrl('https://nexus.neramclasses.com/', 'NXS-1')).toBe(
      'https://nexus.neramclasses.com/student/issues?issue=NXS-1',
    );
    expect(teacherIssueUrl('https://nexus.neramclasses.com', 'NXS-1')).toBe(
      'https://nexus.neramclasses.com/teacher/issues?issue=NXS-1',
    );
  });
});

describe('findIssueForRef', () => {
  const issues = [
    { id: '11111111-1111-1111-1111-111111111111', ticket_number: 'NXS-0124' },
    { id: '22222222-2222-2222-2222-222222222222', ticket_number: 'NXS-0125' },
    { id: '33333333-3333-3333-3333-333333333333', ticket_number: null },
  ];

  it('finds by uuid', () => {
    expect(findIssueForRef(issues, '22222222-2222-2222-2222-222222222222')?.ticket_number).toBe('NXS-0125');
  });

  it('finds by ticket number, whatever the case', () => {
    expect(findIssueForRef(issues, 'NXS-0125')?.id).toBe('22222222-2222-2222-2222-222222222222');
    expect(findIssueForRef(issues, 'nxs-0125')?.id).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('trims a reference that arrived with whitespace', () => {
    expect(findIssueForRef(issues, '  NXS-0124  ')?.id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('returns null rather than guessing', () => {
    expect(findIssueForRef(issues, 'NXS-9999')).toBeNull();
    expect(findIssueForRef(issues, '')).toBeNull();
    expect(findIssueForRef([], 'NXS-0125')).toBeNull();
  });

  it('does not match a null ticket number against an empty reference', () => {
    expect(findIssueForRef(issues, '   ')).toBeNull();
  });
});
