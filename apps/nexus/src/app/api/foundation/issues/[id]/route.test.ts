import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The ticket route, which is now a two-way door.
 *
 * What these tests are actually protecting:
 *  - a student can only ever reply on their OWN ticket;
 *  - an internal note reaches nobody, and a reply reaches the student as a
 *    Teams chat from the staff member who wrote it, carrying a link back here;
 *  - a student's payload contains no internal rows and no staff-only technical
 *    fields, because that filtering has to happen on the server;
 *  - a manager can work a ticket. The route used to read user_type alone, and a
 *    manager is user_type 'student' with staff_role 'manager'.
 */

const ISSUE_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => ({
  verifyMsToken: vi.fn(),
  notifyUser: vi.fn(),
  addIssueComment: vi.fn(),
  getIssueActivityLog: vi.fn(),
  getFoundationIssueById: vi.fn(),
  markIssueSeen: vi.fn(),
  userRow: null as Record<string, unknown> | null,
  issueRow: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/ms-verify', () => ({
  verifyMsToken: (h: string | null) => mocks.verifyMsToken(h),
}));

vi.mock('@/lib/nudge-delivery', () => ({
  notifyUser: (...a: unknown[]) => mocks.notifyUser(...a),
  plainToHtmlWithLink: (text: string, url: string, label: string) =>
    `<p>${text}</p><p><a href="${url}">${label}</a></p>`,
}));

vi.mock('@/lib/class-share-links', () => ({
  shareBaseUrl: () => 'https://nexus.neramclasses.com',
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => {
    const chain = (table: string) => {
      const c: Record<string, unknown> = {};
      const self = () => c;
      c.select = self;
      c.eq = self;
      c.update = self;
      c.single = () =>
        Promise.resolve({
          data: table === 'users' ? mocks.userRow : mocks.issueRow,
          error: null,
        });
      return c;
    };
    return { from: (table: string) => chain(table) };
  },
}));

vi.mock('@neram/database/queries/nexus', () => ({
  getFoundationIssueById: (...a: unknown[]) => mocks.getFoundationIssueById(...a),
  getIssueActivityLog: (...a: unknown[]) => mocks.getIssueActivityLog(...a),
  addIssueComment: (...a: unknown[]) => mocks.addIssueComment(...a),
  markIssueSeen: (...a: unknown[]) => mocks.markIssueSeen(...a),
  resolveFoundationIssue: vi.fn(),
  updateFoundationIssueStatus: vi.fn(),
  assignFoundationIssue: vi.fn(),
  delegateFoundationIssue: vi.fn(),
  returnFoundationIssue: vi.fn(),
  updateFoundationIssuePriority: vi.fn(),
  confirmFoundationIssue: vi.fn(),
  reopenFoundationIssue: vi.fn(),
  cleanupIssueScreenshots: vi.fn(),
  deleteFoundationIssue: vi.fn(),
}));

import { GET, PATCH } from './route';

const ctx = { params: Promise.resolve({ id: ISSUE_ID }) };

const getReq = (query = '') =>
  new NextRequest(`http://localhost/api/foundation/issues/${ISSUE_ID}${query}`, {
    headers: { Authorization: 'Bearer t' },
  });

const patchReq = (body: unknown) =>
  new NextRequest(`http://localhost/api/foundation/issues/${ISSUE_ID}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const TEACHER = { id: 't1', user_type: 'teacher', staff_role: null, can_teach: true, name: 'Hari Babu' };
const MANAGER = { id: 'm1', user_type: 'student', staff_role: 'manager', can_teach: false, name: 'Coord' };
const STUDENT = { id: 's1', user_type: 'student', staff_role: null, can_teach: null, name: 'Kaveya Rameshbabu' };

const ISSUE = {
  student_id: 's1',
  title: 'Not able to attend the test',
  ticket_number: 'NXS-0125',
  status: 'open',
  assigned_to: 't1',
  resolved_by: null,
  chapter: { title: 'Ch 0' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyMsToken.mockResolvedValue({ oid: 'oid-1' });
  mocks.issueRow = { ...ISSUE };
  mocks.userRow = { ...TEACHER };
  mocks.notifyUser.mockResolvedValue(null);
  mocks.addIssueComment.mockImplementation((_i: string, actorId: string, text: string) =>
    Promise.resolve({ id: 'a1', actor_id: actorId, action: 'comment', reason: text, visible_to_student: true }),
  );
  mocks.getIssueActivityLog.mockResolvedValue([]);
  mocks.getFoundationIssueById.mockResolvedValue({
    id: ISSUE_ID,
    student_id: 's1',
    title: ISSUE.title,
    console_logs: [{ level: 'error', message: 'boom' }],
    device_info: { ua: 'Chrome' },
    context: { facts: {} },
  });
});

describe('GET /api/foundation/issues/[id]', () => {
  it('serves staff the whole log and the technical capture', async () => {
    mocks.userRow = { ...TEACHER };
    const body = await (await GET(getReq(), ctx)).json();

    expect(mocks.getIssueActivityLog).toHaveBeenCalledWith(ISSUE_ID, { visibleToStudentOnly: false });
    expect(body.issue.console_logs).toBeDefined();
    expect(body.issue.device_info).toBeDefined();
  });

  it('asks the database for student-visible rows only, and strips the staff-only fields', async () => {
    mocks.userRow = { ...STUDENT };
    const body = await (await GET(getReq(), ctx)).json();

    expect(mocks.getIssueActivityLog).toHaveBeenCalledWith(ISSUE_ID, { visibleToStudentOnly: true });
    expect(body.issue.console_logs).toBeUndefined();
    expect(body.issue.device_info).toBeUndefined();
    expect(body.issue.context).toBeUndefined();
  });

  it('refuses a student somebody else’s ticket', async () => {
    mocks.userRow = { ...STUDENT, id: 'other' };
    const res = await GET(getReq(), ctx);
    expect(res.status).toBe(403);
  });

  it('clears the unread mark only when asked, so a prefetch cannot', async () => {
    mocks.userRow = { ...STUDENT };
    await GET(getReq(), ctx);
    expect(mocks.markIssueSeen).not.toHaveBeenCalled();

    await GET(getReq('?seen=1'), ctx);
    expect(mocks.markIssueSeen).toHaveBeenCalledWith(ISSUE_ID, 'student');
  });

  it('marks the staff side seen for a manager, not the student side', async () => {
    mocks.userRow = { ...MANAGER };
    await GET(getReq('?seen=1'), ctx);
    expect(mocks.markIssueSeen).toHaveBeenCalledWith(ISSUE_ID, 'staff');
  });
});

describe('PATCH comment', () => {
  it('sends the student a Teams chat from the staff member, with a link back to the ticket', async () => {
    mocks.userRow = { ...TEACHER };
    const res = await PATCH(patchReq({ action: 'comment', comment: 'Try it again now' }), ctx);
    expect(res.status).toBe(200);

    expect(mocks.addIssueComment).toHaveBeenCalledWith(
      ISSUE_ID, 't1', 'Try it again now', { visibleToStudent: true },
    );

    const [notice, opts] = mocks.notifyUser.mock.calls[0];
    expect(notice.user_id).toBe('s1');
    expect(notice.event_type).toBe('foundation_issue_comment');
    expect(notice.metadata.href).toBe('/student/issues?issue=NXS-0125');
    // The teacher's own delegated token is what turns this into a 1:1 chat.
    expect(opts.teacher).toEqual({ authHeader: 'Bearer t', userId: 't1' });
    expect(opts.html).toContain('https://nexus.neramclasses.com/student/issues?issue=NXS-0125');
  });

  it('tells the student to answer on the ticket rather than in the chat', async () => {
    mocks.userRow = { ...TEACHER };
    await PATCH(patchReq({ action: 'comment', comment: 'Fixed' }), ctx);
    const [notice] = mocks.notifyUser.mock.calls[0];
    expect(notice.message).toContain('reply on the ticket itself');
    expect(notice.message).toContain('will not reach the ticket');
  });

  it('keeps the response shape the E2E suite reads', async () => {
    mocks.userRow = { ...TEACHER };
    const body = await (await PATCH(patchReq({ action: 'comment', comment: 'hi' }), ctx)).json();
    expect(body.activity.reason).toBe('hi');
  });

  it('an internal note reaches nobody', async () => {
    mocks.userRow = { ...TEACHER };
    await PATCH(patchReq({ action: 'comment', comment: 'Same as NXS-0119', internal: true }), ctx);

    expect(mocks.addIssueComment).toHaveBeenCalledWith(
      ISSUE_ID, 't1', 'Same as NXS-0119', { visibleToStudent: false },
    );
    expect(mocks.notifyUser).not.toHaveBeenCalled();
  });

  it('lets the reporter reply on their own ticket and tells the assignee', async () => {
    mocks.userRow = { ...STUDENT };
    const res = await PATCH(patchReq({ action: 'comment', comment: 'Still closed' }), ctx);
    expect(res.status).toBe(200);

    const [notice, opts] = mocks.notifyUser.mock.calls[0];
    expect(notice.user_id).toBe('t1');
    expect(notice.metadata.href).toBe('/teacher/issues?issue=NXS-0125');
    // No delegated Graph token exists on a student request, so no chat is claimed.
    expect(opts).toEqual({ audience: 'staff' });
  });

  it('a student cannot write an internal note even by asking for one', async () => {
    mocks.userRow = { ...STUDENT };
    await PATCH(patchReq({ action: 'comment', comment: 'hidden?', internal: true }), ctx);
    expect(mocks.addIssueComment).toHaveBeenCalledWith(
      ISSUE_ID, 's1', 'hidden?', { visibleToStudent: true },
    );
  });

  it('refuses a student commenting on somebody else’s ticket', async () => {
    mocks.userRow = { ...STUDENT, id: 'other' };
    const res = await PATCH(patchReq({ action: 'comment', comment: 'nosy' }), ctx);
    expect(res.status).toBe(403);
    expect(mocks.addIssueComment).not.toHaveBeenCalled();
  });

  it('admits a manager, who is user_type student with staff_role manager', async () => {
    mocks.userRow = { ...MANAGER };
    const res = await PATCH(patchReq({ action: 'comment', comment: 'On it' }), ctx);
    expect(res.status).toBe(200);
    // Treated as staff: the student is the one notified, not the manager.
    expect(mocks.notifyUser.mock.calls[0][0].user_id).toBe('s1');
  });
});

describe('PATCH recheck', () => {
  it('puts the ask in the thread and sends it as a chat with the link', async () => {
    mocks.userRow = { ...TEACHER };
    const res = await PATCH(patchReq({ action: 'recheck', note: 'Open the test again please' }), ctx);
    expect(res.status).toBe(200);

    expect(mocks.addIssueComment).toHaveBeenCalledWith(
      ISSUE_ID, 't1', 'Open the test again please', { visibleToStudent: true },
    );
    const [notice, opts] = mocks.notifyUser.mock.calls[0];
    expect(notice.event_type).toBe('foundation_issue_recheck_requested');
    expect(notice.message).toContain('not in this chat');
    expect(opts.teacher.userId).toBe('t1');
  });

  it('writes a default line when the teacher adds nothing', async () => {
    mocks.userRow = { ...TEACHER };
    await PATCH(patchReq({ action: 'recheck' }), ctx);
    expect(mocks.addIssueComment.mock.calls[0][2]).toContain('check this once more');
  });

  it('refuses a student', async () => {
    mocks.userRow = { ...STUDENT };
    const res = await PATCH(patchReq({ action: 'recheck', note: 'x' }), ctx);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Not authorized' });
    expect(mocks.addIssueComment).not.toHaveBeenCalled();
  });

  it('refuses a closed ticket', async () => {
    mocks.userRow = { ...TEACHER };
    mocks.issueRow = { ...ISSUE, status: 'closed' };
    const res = await PATCH(patchReq({ action: 'recheck' }), ctx);
    expect(res.status).toBe(400);
  });
});
