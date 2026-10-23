// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { provisionClassAccount, type ClassAccountPorts, type ClassAccountSetup, type ClassAccountStudent } from './class-account';
import { FALLBACK_ACCOUNT_DEFAULTS } from './rules';

function ok<T>(value: T) {
  return { ok: true as const, value };
}
function fail(raw: string, status = 400) {
  return { ok: false as const, status, error: { code: 'unknown', message: 'Graph said no.', raw } as any };
}

const radhika: ClassAccountStudent = {
  id: 'u1',
  firstName: 'Radhika',
  lastName: null,
  fatherName: 'Kunisetty Bhanuprakash',
  phone: '7382843549',
  personalEmail: 'leelapriyamvada@gmail.com',
  msOid: null,
  isStaff: false,
  isStudent: true,
};

function makePorts(
  overrides: {
    student?: Partial<ClassAccountStudent>;
    graph?: Partial<Record<keyof ClassAccountPorts['graph'], any>>;
    store?: Partial<Record<keyof ClassAccountPorts['store'], any>>;
  } = {},
) {
  let saved: ClassAccountSetup | null = null;
  const graph = {
    findUserByUpn: vi.fn(async () => ok(null)),
    createUser: vi.fn(async () => ok({ id: 'oid-1' })),
    assignLicense: vi.fn(async () => ok(undefined)),
    addToGroup: vi.fn(async () => ok(undefined)),
    setOtherMails: vi.fn(async () => ok(undefined)),
    readUpn: vi.fn(async () => ok('Existing@neramclasses.com')),
    ...overrides.graph,
  };
  const store = {
    getStudent: vi.fn(async () => ({ ...radhika, ...overrides.student })),
    getSetup: vi.fn(async () => (saved ? JSON.parse(JSON.stringify(saved)) : null)),
    saveSetup: vi.fn(async (setup: ClassAccountSetup) => {
      saved = JSON.parse(JSON.stringify(setup));
    }),
    readDefaults: vi.fn(async () => ({ ...FALLBACK_ACCOUNT_DEFAULTS, sku_id: '11111111-1111-1111-1111-111111111111' })),
    linkMicrosoft: vi.fn(async () => {}),
    enrolInClassroom: vi.fn(async () => ({ classroomId: 'c1', classroomName: 'JEE B.Arch Session 1' })),
    syncTeams: vi.fn(async () => ({ status: 'done' as const })),
    sendWelcome: vi.fn(async () => ({ status: 'done' as const, to: 'leelapriyamvada@gmail.com' })),
    audit: vi.fn(async () => {}),
    ...overrides.store,
  };
  const ports = {
    graph,
    store,
    randomPassword: () => 'Rnd#Pass9xyz',
    now: () => new Date('2026-10-20T10:00:00Z'),
  } as unknown as ClassAccountPorts;
  return { ports, graph, store, saved: () => saved };
}

describe('provisionClassAccount', () => {
  it('creates Radhika_Bhanuprakash with Radhika@123 and runs every step', async () => {
    const { ports, graph, store } = makePorts();
    const result = await provisionClassAccount(ports, { userId: 'u1', actorId: 'staff' });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.setup.upn).toBe('Radhika_Bhanuprakash@neramclasses.com');
    expect(graph.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'Radhika@123', mobilePhone: '+91 7382843549' }),
    );
    expect(result.password).toBeNull();
    expect(result.complete).toBe(true);
    expect(graph.setOtherMails).toHaveBeenCalledWith('oid-1', ['leelapriyamvada@gmail.com']);
    expect(store.linkMicrosoft).toHaveBeenCalledWith('u1', 'oid-1', 'Radhika_Bhanuprakash@neramclasses.com');
    expect(store.syncTeams).toHaveBeenCalledWith({
      userId: 'u1',
      classroomId: 'c1',
      upn: 'Radhika_Bhanuprakash@neramclasses.com',
    });
  });

  it('uses the ID staff edited', async () => {
    const { ports } = makePorts();
    const result = await provisionClassAccount(ports, { userId: 'u1', username: 'Radhika_K', actorId: 'staff' });
    expect(result.kind === 'ok' && result.setup.upn).toBe('Radhika_K@neramclasses.com');
  });

  it('never writes the password into the audit or the saved setup', async () => {
    const { ports, store, saved } = makePorts();
    await provisionClassAccount(ports, { userId: 'u1', actorId: 'staff' });
    expect(JSON.stringify(store.audit.mock.calls)).not.toContain('@123');
    expect(JSON.stringify(saved())).not.toContain('@123');
  });

  it('falls back to a random password, shown once, when Microsoft refuses the start one', async () => {
    const createUser = vi
      .fn()
      .mockResolvedValueOnce(fail('Graph 400 The specified password does not comply with password complexity requirements.'))
      .mockResolvedValueOnce(ok({ id: 'oid-1' }));
    const { ports } = makePorts({ graph: { createUser } });
    const result = await provisionClassAccount(ports, { userId: 'u1', actorId: 'staff' });
    expect(result.kind === 'ok' && result.password).toBe('Rnd#Pass9xyz');
    expect(result.kind === 'ok' && result.setup.passwordMode).toBe('random');
  });

  it('refuses an ID that belongs to someone else', async () => {
    const { ports, graph } = makePorts({ graph: { findUserByUpn: vi.fn(async () => ok({ id: 'someone-else' })) } });
    const result = await provisionClassAccount(ports, { userId: 'u1', actorId: 'staff' });
    expect(result).toMatchObject({ kind: 'conflict', code: 'upn_taken' });
    expect(graph.createUser).not.toHaveBeenCalled();
  });

  it('keeps an account the record already has instead of making a second one', async () => {
    const { ports, graph } = makePorts({ student: { msOid: 'old-oid' } });
    const result = await provisionClassAccount(ports, { userId: 'u1', actorId: 'staff' });
    expect(graph.createUser).not.toHaveBeenCalled();
    expect(result.kind === 'ok' && result.setup.upn).toBe('Existing@neramclasses.com');
  });

  it('adopts an account the student already uses without a welcome email', async () => {
    const { ports, graph, store } = makePorts({ student: { msOid: 'old-oid' } });
    const result = await provisionClassAccount(ports, { userId: 'u1', actorId: 'staff', welcome: false });
    expect(graph.createUser).not.toHaveBeenCalled();
    expect(store.sendWelcome).not.toHaveBeenCalled();
    expect(result.kind === 'ok' && result.setup.steps.welcome).toMatchObject({ status: 'skipped' });
    expect(result.kind === 'ok' && result.complete).toBe(true);
  });

  it('sends Teams the first and last name', async () => {
    const { ports, graph } = makePorts({ student: { lastName: 'Kunisetty' } });
    await provisionClassAccount(ports, { userId: 'u1', actorId: 'staff' });
    expect(graph.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Radhika Kunisetty', givenName: 'Radhika', surname: 'Kunisetty' }),
    );
  });

  it('stops at a failed license and Retry resumes there without a second account', async () => {
    const assignLicense = vi
      .fn()
      .mockResolvedValueOnce(fail('Graph 400 does not have any available licenses'))
      .mockResolvedValue(ok(undefined));
    const { ports, graph } = makePorts({ graph: { assignLicense } });
    const first = await provisionClassAccount(ports, { userId: 'u1', actorId: 'staff' });
    expect(first.kind === 'ok' && first.setup.steps.licence.status).toBe('failed');
    expect(first.kind === 'ok' && first.complete).toBe(false);

    const second = await provisionClassAccount(ports, { userId: 'u1', actorId: 'staff' });
    expect(graph.createUser).toHaveBeenCalledTimes(1);
    expect(second.kind === 'ok' && second.setup.steps.licence.status).toBe('done');
    expect(second.kind === 'ok' && second.complete).toBe(true);
  });

  it('retries only the Team when a new mailbox was not ready', async () => {
    const syncTeams = vi
      .fn()
      .mockResolvedValueOnce({ status: 'failed', reason: 'not yet' })
      .mockResolvedValue({ status: 'done' });
    const { ports, store } = makePorts({ store: { syncTeams } });
    await provisionClassAccount(ports, { userId: 'u1', actorId: 'staff' });
    const again = await provisionClassAccount(ports, { userId: 'u1', actorId: 'staff' });
    expect(again.kind === 'ok' && again.setup.steps.teams.status).toBe('done');
    expect(store.sendWelcome).toHaveBeenCalledTimes(1);
  });

  it('marks the email skipped when there is no personal email', async () => {
    const { ports } = makePorts({
      store: { sendWelcome: vi.fn(async () => ({ status: 'skipped' as const, reason: 'No email on file.' })) },
    });
    const result = await provisionClassAccount(ports, { userId: 'u1', actorId: 'staff' });
    expect(result.kind === 'ok' && result.setup.steps.welcome.status).toBe('skipped');
    expect(result.kind === 'ok' && result.complete).toBe(true);
  });

  it('refuses staff records', async () => {
    const { ports } = makePorts({ student: { isStaff: true } });
    expect(await provisionClassAccount(ports, { userId: 'u1', actorId: 'staff' })).toMatchObject({
      kind: 'conflict',
      code: 'not_a_student',
    });
  });
});
