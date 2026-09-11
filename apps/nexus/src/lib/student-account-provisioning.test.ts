import { describe, it, expect, vi } from 'vitest';
import {
  ALREADY_LINKED,
  CLASSIFY_FAILED,
  CLASSROOM_FAILED,
  NO_LICENSE,
  NO_MICROSOFT,
  NOT_A_STUDENT,
  RECORD_FAILED,
  RECORD_MISSING,
  UPN_TAKEN,
  createStudentAccount,
  resetStudentPassword,
  type AccountGraphPort,
  type AccountStorePort,
  type CreateStudentAccountInput,
  type ResetPasswordPorts,
  type StudentRecord,
} from './student-account-provisioning';

const SKU = '314c4481-f395-4525-be8b-2ec4bb1e9d91';
const PASSWORD = 'Ab3#kP9m$Qr2';

const ok = <T,>(value: T) => ({ ok: true as const, value });
const denied = (raw = 'Graph 403 Authorization_RequestDenied') => ({
  ok: false as const,
  status: 403,
  error: { code: 'insufficient_permission' as const, message: 'Missing permission.', fix: 'Add User.Create.', raw },
});

function ports(overrides: { graph?: Partial<AccountGraphPort>; store?: Partial<AccountStorePort> } = {}) {
  const graph: AccountGraphPort = {
    isUpnAvailable: vi.fn(async () => ok(true)),
    createUser: vi.fn(async () => ok({ id: 'oid-new' })),
    assignLicense: vi.fn(async () => ok(undefined)),
    addToGroup: vi.fn(async () => ok(undefined)),
    setOtherMails: vi.fn(async () => ok(undefined)),
    ...overrides.graph,
  };
  const store: AccountStorePort = {
    getStudent: vi.fn(async () => null),
    findCandidates: vi.fn(async () => []),
    linkMicrosoft: vi.fn(async () => undefined),
    createOrMatchRecord: vi.fn(async () => 'user-new'),
    fillContact: vi.fn(async () => undefined),
    enroll: vi.fn(async () => undefined),
    classify: vi.fn(async () => undefined),
    syncTeams: vi.fn(async () => ({ status: 'done' as const })),
    audit: vi.fn(async () => undefined),
    ...overrides.store,
  };
  return { graph, store };
}

function input(over: Partial<CreateStudentAccountInput> = {}): CreateStudentAccountInput {
  return {
    classroomId: 'room-1',
    firstName: 'Dhisha',
    lastName: 'Haribabu',
    username: 'Dhisha_Haribabu',
    domain: 'neramclasses.com',
    usageLocation: 'IN',
    phone: '9876543210',
    personalEmail: 'dhisha.201@gmail.com',
    studyStage: '12th',
    academicYear: '2026-27',
    batchId: null,
    attachToUserId: null,
    confirmNew: false,
    license: { skuId: SKU, mode: 'direct', groupId: null },
    password: PASSWORD,
    actorId: 'staff-1',
    ...over,
  };
}

function record(over: Partial<StudentRecord> = {}): StudentRecord {
  return {
    id: 'user-gmail',
    name: 'Afrin',
    first_name: 'Afrin',
    ms_oid: null,
    user_type: 'student',
    staff_role: null,
    phone: '+919876543210',
    email: 'afrinbanu20101@gmail.com',
    personal_email: null,
    ...over,
  };
}

const candidate = {
  user_id: 'user-gmail',
  name: 'Afrin',
  email: 'afrinbanu20101@gmail.com',
  enrolled_at: '2026-08-13T07:15:00Z',
  reason: 'phone' as const,
};

describe('createStudentAccount', () => {
  it('creates, licenses, records, enrolls, classifies and adds to the Team in that order', async () => {
    const { graph, store } = ports();
    const result = await createStudentAccount(graph, store, input());

    expect(result).toEqual({
      kind: 'created',
      upn: 'Dhisha_Haribabu@neramclasses.com',
      password: PASSWORD,
      msOid: 'oid-new',
      userId: 'user-new',
      firstName: 'Dhisha',
      phone: '9876543210',
      steps: {
        account: { status: 'done' },
        license: { status: 'done' },
        record: { status: 'done' },
        classroom: { status: 'done' },
        teams: { status: 'done' },
      },
    });
    expect(graph.createUser).toHaveBeenCalledWith({
      displayName: 'Dhisha Haribabu',
      givenName: 'Dhisha',
      surname: 'Haribabu',
      upn: 'Dhisha_Haribabu@neramclasses.com',
      mailNickname: 'Dhisha_Haribabu',
      password: PASSWORD,
      mobilePhone: '+91 9876543210',
      usageLocation: 'IN',
    });
    expect(graph.assignLicense).toHaveBeenCalledWith('oid-new', SKU);
    expect(graph.setOtherMails).toHaveBeenCalledWith('oid-new', ['dhisha.201@gmail.com']);
    expect(store.createOrMatchRecord).toHaveBeenCalledWith({
      msOid: 'oid-new',
      upn: 'Dhisha_Haribabu@neramclasses.com',
      name: 'Dhisha Haribabu',
      phoneHints: ['9876543210'],
      emailHints: ['dhisha.201@gmail.com'],
    });
    expect(store.enroll).toHaveBeenCalledWith({ userId: 'user-new', classroomId: 'room-1', batchId: null });
    expect(store.classify).toHaveBeenCalledWith({
      userId: 'user-new',
      classroomId: 'room-1',
      studyStage: '12th',
      academicYear: '2026-27',
      actorId: 'staff-1',
    });
    expect(store.syncTeams).toHaveBeenCalledWith({
      userId: 'user-new',
      classroomId: 'room-1',
      upn: 'Dhisha_Haribabu@neramclasses.com',
    });
  });

  it('never writes the password into the audit trail', async () => {
    const { graph, store } = ports();
    await createStudentAccount(graph, store, input());
    expect(store.audit).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(store.audit).mock.calls)).not.toContain(PASSWORD);
  });

  it('asks before creating when the student may already exist, and touches nothing', async () => {
    const { graph, store } = ports({ store: { findCandidates: vi.fn(async () => [candidate]) } });
    const result = await createStudentAccount(graph, store, input());
    expect(result).toEqual({ kind: 'possible_duplicate', status: 409, candidates: [candidate] });
    expect(graph.isUpnAvailable).not.toHaveBeenCalled();
    expect(graph.createUser).not.toHaveBeenCalled();
  });

  it('skips the question and the matching hints once staff said it is a different student', async () => {
    const { graph, store } = ports({ store: { findCandidates: vi.fn(async () => [candidate]) } });
    const result = await createStudentAccount(graph, store, input({ confirmNew: true }));
    expect(result.kind).toBe('created');
    expect(store.findCandidates).not.toHaveBeenCalled();
    expect(store.createOrMatchRecord).toHaveBeenCalledWith(
      expect.objectContaining({ phoneHints: [], emailHints: [] }),
    );
  });

  it('attaches the account to the record staff picked', async () => {
    const { graph, store } = ports({ store: { getStudent: vi.fn(async () => record()) } });
    const result = await createStudentAccount(graph, store, input({ attachToUserId: 'user-gmail' }));
    expect(result).toMatchObject({ kind: 'created', userId: 'user-gmail' });
    expect(store.linkMicrosoft).toHaveBeenCalledWith(
      'user-gmail',
      'oid-new',
      'Dhisha_Haribabu@neramclasses.com',
      'staff-1',
    );
    expect(store.createOrMatchRecord).not.toHaveBeenCalled();
    expect(store.findCandidates).not.toHaveBeenCalled();
  });

  it('refuses a picked record that is missing, staff, or already has an account, before any Graph call', async () => {
    const cases: Array<[StudentRecord | null, string]> = [
      [null, RECORD_MISSING],
      [record({ staff_role: 'teacher' }), NOT_A_STUDENT],
      [record({ ms_oid: 'oid-existing' }), ALREADY_LINKED],
    ];
    for (const [target, error] of cases) {
      const { graph, store } = ports({ store: { getStudent: vi.fn(async () => target) } });
      const result = await createStudentAccount(graph, store, input({ attachToUserId: 'user-gmail' }));
      expect(result).toMatchObject({ kind: 'conflict', error });
      expect(graph.createUser).not.toHaveBeenCalled();
    }
  });

  it('refuses a login ID that is taken, whether the lookup or the create says so', async () => {
    const taken = ports({ graph: { isUpnAvailable: vi.fn(async () => ok(false)) } });
    expect(await createStudentAccount(taken.graph, taken.store, input())).toMatchObject({
      kind: 'conflict',
      code: 'upn_taken',
      error: UPN_TAKEN,
    });
    expect(taken.graph.createUser).not.toHaveBeenCalled();

    const race = ports({
      graph: { createUser: vi.fn(async () => ({ ...denied('Graph 400 userPrincipalName already exists.'), status: 400 })) },
    });
    expect(await createStudentAccount(race.graph, race.store, input())).toMatchObject({ code: 'upn_taken' });
  });

  it('stops with the Azure explanation when the account cannot be created', async () => {
    const { graph, store } = ports({ graph: { createUser: vi.fn(async () => denied()) } });
    const result = await createStudentAccount(graph, store, input());
    expect(result).toMatchObject({ kind: 'graph_failed', status: 403, error: { code: 'insufficient_permission' } });
    expect(store.createOrMatchRecord).not.toHaveBeenCalled();
    expect(store.enroll).not.toHaveBeenCalled();
  });

  it('keeps the account and carries on when the license fails', async () => {
    const { graph, store } = ports({ graph: { assignLicense: vi.fn(async () => denied()) } });
    const result = await createStudentAccount(graph, store, input());
    expect(result.kind).toBe('created');
    if (result.kind !== 'created') return;
    expect(result.steps.license).toEqual({ status: 'failed', message: 'Missing permission. Add User.Create.' });
    expect(result.steps.record.status).toBe('done');
    expect(result.steps.classroom.status).toBe('done');
  });

  it('licenses through the group when the tenant licenses students that way', async () => {
    const { graph, store } = ports();
    await createStudentAccount(graph, store, input({ license: { skuId: SKU, mode: 'group', groupId: 'group-1' } }));
    expect(graph.addToGroup).toHaveBeenCalledWith('group-1', 'oid-new');
    expect(graph.assignLicense).not.toHaveBeenCalled();
  });

  it('says so when no license is set up', async () => {
    const { graph, store } = ports();
    const result = await createStudentAccount(graph, store, input({ license: null }));
    expect(result.kind === 'created' && result.steps.license).toEqual({ status: 'skipped', message: NO_LICENSE });
  });

  it('stops after the account when the record cannot be saved', async () => {
    const { graph, store } = ports({ store: { createOrMatchRecord: vi.fn(async () => null) } });
    const result = await createStudentAccount(graph, store, input());
    expect(result).toMatchObject({ kind: 'created', userId: null, password: PASSWORD });
    if (result.kind !== 'created') return;
    expect(result.steps.record).toEqual({ status: 'failed', message: RECORD_FAILED });
    expect(result.steps.classroom.status).toBe('skipped');
    expect(result.steps.teams.status).toBe('skipped');
    expect(store.enroll).not.toHaveBeenCalled();
  });

  it('reports a failed enrollment and skips the Team', async () => {
    const { graph, store } = ports({ store: { enroll: vi.fn(async () => Promise.reject(new Error('db'))) } });
    const result = await createStudentAccount(graph, store, input());
    if (result.kind !== 'created') throw new Error('expected created');
    expect(result.steps.classroom).toEqual({ status: 'failed', message: CLASSROOM_FAILED });
    expect(result.steps.teams.status).toBe('skipped');
    expect(store.syncTeams).not.toHaveBeenCalled();
  });

  it('keeps the enrollment when only the class and exam year fail', async () => {
    const { graph, store } = ports({ store: { classify: vi.fn(async () => Promise.reject(new Error('db'))) } });
    const result = await createStudentAccount(graph, store, input());
    if (result.kind !== 'created') throw new Error('expected created');
    expect(result.steps.classroom).toEqual({ status: 'done', message: CLASSIFY_FAILED });
    expect(store.syncTeams).toHaveBeenCalled();
  });

  it('passes on why the Team add did not happen', async () => {
    const { graph, store } = ports({
      store: { syncTeams: vi.fn(async () => ({ status: 'skipped' as const, reason: 'This class has no linked Team.' })) },
    });
    const result = await createStudentAccount(graph, store, input());
    if (result.kind !== 'created') throw new Error('expected created');
    expect(result.steps.teams).toEqual({ status: 'skipped', message: 'This class has no linked Team.' });
  });

  it('rejects bad input before doing anything', async () => {
    for (const bad of [input({ firstName: '  ' }), input({ username: '_bad_' }), input({ personalEmail: 'nope' })]) {
      const { graph, store } = ports();
      expect((await createStudentAccount(graph, store, bad)).kind).toBe('invalid');
      expect(graph.isUpnAvailable).not.toHaveBeenCalled();
    }
  });
});

describe('resetStudentPassword', () => {
  function resetPorts(target: StudentRecord | null, over: Partial<ResetPasswordPorts> = {}): ResetPasswordPorts {
    return {
      getStudent: vi.fn(async () => target),
      resetPassword: vi.fn(async () => ok(undefined)),
      readUpn: vi.fn(async () => ok('Afrin_banu@neramclasses.com')),
      audit: vi.fn(async () => undefined),
      ...over,
    };
  }

  it('resets a student and returns what to share, without auditing the password', async () => {
    const p = resetPorts(record({ ms_oid: 'oid-afrin', first_name: null, name: 'Afrin banu' }));
    const result = await resetStudentPassword(p, { userId: 'user-gmail', password: PASSWORD, actorId: 'staff-1' });
    expect(result).toEqual({
      kind: 'reset',
      upn: 'Afrin_banu@neramclasses.com',
      password: PASSWORD,
      firstName: 'Afrin',
      phone: '9876543210',
    });
    expect(p.resetPassword).toHaveBeenCalledWith('oid-afrin', PASSWORD);
    expect(JSON.stringify(vi.mocked(p.audit).mock.calls)).not.toContain(PASSWORD);
  });

  it('refuses a missing record, staff, and a student with no Microsoft account', async () => {
    const cases: Array<[StudentRecord | null, string]> = [
      [null, RECORD_MISSING],
      [record({ ms_oid: 'oid-x', user_type: 'admin' }), NOT_A_STUDENT],
      [record({ ms_oid: null }), NO_MICROSOFT],
    ];
    for (const [target, error] of cases) {
      const p = resetPorts(target);
      expect(await resetStudentPassword(p, { userId: 'x', password: PASSWORD, actorId: 's' })).toMatchObject({
        kind: 'conflict',
        error,
      });
      expect(p.resetPassword).not.toHaveBeenCalled();
    }
  });

  it('passes on an Azure refusal', async () => {
    const p = resetPorts(record({ ms_oid: 'oid-x' }), { resetPassword: vi.fn(async () => denied()) });
    expect(await resetStudentPassword(p, { userId: 'x', password: PASSWORD, actorId: 's' })).toMatchObject({
      kind: 'graph_failed',
      status: 403,
    });
  });
});
