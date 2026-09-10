import { describe, it, expect, vi } from 'vitest';
import {
  ACCOUNT_HAS_OWN_RECORD,
  LINK_TARGET_MISSING,
  LINK_TARGET_OTHER_ACCOUNT,
  resolveDirectoryUser,
  type DirectoryEnrollStore,
  type ReconcileRequest,
  type ResolveDirectoryUserInput,
} from './directory-enrollment';

const INPUT: ResolveDirectoryUserInput = {
  classroomId: 'room-1',
  msOid: 'oid-afrin',
  upn: 'Afrin_banu@neramclasses.com',
  name: 'Afrin banu',
  role: 'student',
  userType: 'student',
  linkUserId: null,
  confirmNew: false,
  actorId: 'admin-1',
};

const GMAIL_ROW = {
  user_id: 'gmail-row',
  name: 'Afrin',
  email: 'afrinbanu20101@gmail.com',
  phone: '+916382901455',
  enrolled_at: '2026-08-13T12:45:27Z',
};

function fakeStore(overrides: Partial<DirectoryEnrollStore> = {}) {
  const linked: Array<[string, string, string, string]> = [];
  const reconciled: ReconcileRequest[] = [];
  const store: DirectoryEnrollStore = {
    getUser: async () => null,
    findUserIdByMsOid: async () => null,
    linkMicrosoft: async (userId, msOid, upn, actorId) => {
      linked.push([userId, msOid, upn, actorId]);
    },
    listClassroomStudentsWithoutMicrosoft: async () => [],
    getDirectoryHints: async () => ({ phones: [], emails: [] }),
    reconcile: async (request) => {
      reconciled.push(request);
      return request.allowCreate ? 'new-user' : null;
    },
    ...overrides,
  };
  return { store, linked, reconciled };
}

describe('resolveDirectoryUser', () => {
  it('links onto the record the teacher chose and never creates a row', async () => {
    const { store, linked, reconciled } = fakeStore({
      getUser: async () => ({ id: 'gmail-row', ms_oid: null }),
    });
    const result = await resolveDirectoryUser(store, { ...INPUT, linkUserId: 'gmail-row' });
    expect(result).toEqual({ kind: 'resolved', userId: 'gmail-row', how: 'linked' });
    expect(linked).toEqual([['gmail-row', 'oid-afrin', 'Afrin_banu@neramclasses.com', 'admin-1']]);
    expect(reconciled).toEqual([]);
  });

  it('refuses a record that belongs to a different Microsoft account', async () => {
    const { store, linked } = fakeStore({
      getUser: async () => ({ id: 'gmail-row', ms_oid: 'someone-else' }),
    });
    const result = await resolveDirectoryUser(store, { ...INPUT, linkUserId: 'gmail-row' });
    expect(result).toEqual({ kind: 'conflict', status: 409, error: LINK_TARGET_OTHER_ACCOUNT });
    expect(linked).toEqual([]);
  });

  it('refuses when the Microsoft account already has its own record', async () => {
    const { store, linked } = fakeStore({
      getUser: async () => ({ id: 'gmail-row', ms_oid: null }),
      findUserIdByMsOid: async () => 'org-row',
    });
    const result = await resolveDirectoryUser(store, { ...INPUT, linkUserId: 'gmail-row' });
    expect(result).toEqual({ kind: 'conflict', status: 409, error: ACCOUNT_HAS_OWN_RECORD });
    expect(linked).toEqual([]);
  });

  it('reports a missing link target', async () => {
    const { store } = fakeStore();
    const result = await resolveDirectoryUser(store, { ...INPUT, linkUserId: 'gone' });
    expect(result).toEqual({ kind: 'conflict', status: 404, error: LINK_TARGET_MISSING });
  });

  it('attaches through the reconciler when the directory hints recognise the person', async () => {
    const { store, reconciled } = fakeStore({
      getDirectoryHints: async () => ({ phones: ['+916382901455'], emails: [] }),
      reconcile: async (request) => {
        reconciled.push(request);
        return request.allowCreate ? 'new-user' : 'gmail-row';
      },
    });
    const result = await resolveDirectoryUser(store, INPUT);
    expect(result).toEqual({ kind: 'resolved', userId: 'gmail-row', how: 'matched' });
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toMatchObject({ allowCreate: false, phoneHints: ['+916382901455'] });
  });

  it('stops and asks instead of creating a second record (the Afrin case)', async () => {
    const { store, reconciled } = fakeStore({
      listClassroomStudentsWithoutMicrosoft: async () => [GMAIL_ROW],
    });
    const result = await resolveDirectoryUser(store, INPUT);
    expect(result.kind).toBe('possible_duplicate');
    if (result.kind !== 'possible_duplicate') return;
    expect(result.candidates.map((c) => c.user_id)).toEqual(['gmail-row']);
    expect(reconciled.every((r) => r.allowCreate === false)).toBe(true);
  });

  it('creates once the teacher has said it is a different student', async () => {
    const { store, reconciled } = fakeStore({
      listClassroomStudentsWithoutMicrosoft: async () => [GMAIL_ROW],
    });
    const result = await resolveDirectoryUser(store, { ...INPUT, confirmNew: true });
    expect(result).toEqual({ kind: 'resolved', userId: 'new-user', how: 'created' });
    expect(reconciled[reconciled.length - 1]).toMatchObject({ allowCreate: true, userType: 'student' });
  });

  it('skips the duplicate question and directory hints for teachers', async () => {
    const getDirectoryHints = vi.fn(async () => ({ phones: ['1'], emails: [] }));
    const listClassroomStudentsWithoutMicrosoft = vi.fn(async () => [GMAIL_ROW]);
    const { store } = fakeStore({ getDirectoryHints, listClassroomStudentsWithoutMicrosoft });
    const result = await resolveDirectoryUser(store, { ...INPUT, role: 'teacher', userType: 'teacher' });
    expect(result).toEqual({ kind: 'resolved', userId: 'new-user', how: 'created' });
    expect(getDirectoryHints).not.toHaveBeenCalled();
    expect(listClassroomStudentsWithoutMicrosoft).not.toHaveBeenCalled();
  });
});
