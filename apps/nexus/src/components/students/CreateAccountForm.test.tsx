import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('./StudentAvatar', () => ({ default: () => null }));

import CreateAccountForm from './CreateAccountForm';

const READY = {
  ready: true,
  canResetPassword: true,
  connection: null,
  missing: [],
  optionalMissing: [],
  domain: 'neramclasses.com',
  license: {
    skuId: 'sku-1',
    skuPartNumber: 'STANDARDWOFFPACK_STUDENT',
    name: 'Office 365 A1 for students',
    free: 412,
    mode: 'direct',
    groupId: null,
    source: 'detected',
  },
  skus: [],
};

const ALL_DONE = {
  account: { status: 'done' },
  license: { status: 'done' },
  record: { status: 'done' },
  classroom: { status: 'done' },
  teams: { status: 'done' },
};

type Handler = (body: any) => { status: number; body: unknown };

function api(routes: { readiness: Handler; preview?: Handler; create?: Handler }) {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body });
    const handler = url.includes('/readiness') ? routes.readiness : url.includes('/preview') ? routes.preview : routes.create;
    const result = handler ? handler(body) : { status: 500, body: {} };
    return { ok: result.status >= 200 && result.status < 300, status: result.status, json: async () => result.body };
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function props(over: Record<string, unknown> = {}) {
  return {
    classroomId: 'room-1',
    getToken: async () => 'token',
    examYears: ['2025-26', '2026-27', '2027-28'],
    currentBatch: '2026-27',
    batches: [],
    onCreated: vi.fn(),
    onDone: vi.fn(),
    previewDelayMs: 0,
    ...over,
  };
}

function previewFor(candidates: unknown[] = []): Handler {
  return (body) => ({
    status: 200,
    body: {
      username: body.username || 'Dhisha_Haribabu',
      upn: `${body.username || 'Dhisha_Haribabu'}@neramclasses.com`,
      valid: true,
      available: true,
      availabilityError: null,
      candidates: body.attachToUserId ? [] : candidates,
      record: null,
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CreateAccountForm', () => {
  it('names the missing Azure permissions instead of showing a form that cannot work', async () => {
    api({
      readiness: () => ({
        status: 200,
        body: { ...READY, ready: false, missing: ['User.Create', 'LicenseAssignment.ReadWrite.All'], license: null },
      }),
    });
    const onUseExisting = vi.fn();
    render(<CreateAccountForm {...props({ onUseExisting })} />);

    expect(await screen.findByText('One-time setup needed')).toBeTruthy();
    expect(screen.getByText('User.Create')).toBeTruthy();
    expect(screen.getByText('LicenseAssignment.ReadWrite.All')).toBeTruthy();
    expect(screen.queryByLabelText(/First name/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add an existing Microsoft account instead' }));
    expect(onUseExisting).toHaveBeenCalled();
  });

  it('works out the login ID, creates the account and shows the password once', async () => {
    const calls = api({
      readiness: () => ({ status: 200, body: READY }),
      preview: previewFor(),
      create: () => ({
        status: 201,
        body: {
          kind: 'created',
          upn: 'Dhisha_Haribabu@neramclasses.com',
          password: 'Ab3#kP9m$Qr2',
          firstName: 'Dhisha',
          phone: '9876543210',
          steps: ALL_DONE,
        },
      }),
    });
    const p = props();
    render(<CreateAccountForm {...p} />);

    fireEvent.change(await screen.findByLabelText(/First name/), { target: { value: 'Dhisha' } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: 'Haribabu' } });
    fireEvent.change(screen.getByLabelText(/Mobile number/), { target: { value: '98765 43210' } });

    expect(await screen.findByText('Available')).toBeTruthy();
    expect(screen.getByText('Dhisha_Haribabu@neramclasses.com')).toBeTruthy();
    expect(screen.getByText('Office 365 A1 for students')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Ab3#kP9m$Qr2')).toBeTruthy();
    expect(p.onCreated).toHaveBeenCalledTimes(1);
    const create = calls.find((call) => call.url === '/api/students/accounts');
    expect(create?.body).toMatchObject({
      classroomId: 'room-1',
      firstName: 'Dhisha',
      lastName: 'Haribabu',
      username: 'Dhisha_Haribabu',
      phone: '9876543210',
      attachToUserId: null,
      confirmNew: false,
      license: { skuId: 'sku-1', mode: 'direct', groupId: null },
    });
  });

  it('asks whether it is the same student, then creates the account on that record', async () => {
    const candidate = {
      user_id: 'user-gmail',
      name: 'Afrin',
      email: 'afrinbanu20101@gmail.com',
      enrolled_at: null,
      reason: 'phone',
    };
    const calls = api({
      readiness: () => ({ status: 200, body: READY }),
      preview: previewFor([candidate]),
      create: () => ({
        status: 201,
        body: { kind: 'created', upn: 'Afrin_Banu@neramclasses.com', password: 'Zz9@abcdefgh', firstName: 'Afrin', phone: null, steps: ALL_DONE },
      }),
    });
    render(<CreateAccountForm {...props()} />);

    fireEvent.change(await screen.findByLabelText(/First name/), { target: { value: 'Afrin' } });
    fireEvent.change(screen.getByLabelText(/Last name/), { target: { value: 'Banu' } });

    expect(await screen.findByText('Is this the same student?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, same student' }));
    await waitFor(() => expect(screen.queryByText('Is this the same student?')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByText('Zz9@abcdefgh');
    expect(calls.find((call) => call.url === '/api/students/accounts')?.body.attachToUserId).toBe('user-gmail');
  });

  it('stops at a mobile number that is not one, without calling the server', async () => {
    const calls = api({ readiness: () => ({ status: 200, body: READY }), preview: previewFor() });
    render(<CreateAccountForm {...props()} />);

    fireEvent.change(await screen.findByLabelText(/First name/), { target: { value: 'Dhisha' } });
    const mobile = screen.getByLabelText(/Mobile number/);
    fireEvent.change(mobile, { target: { value: '12345' } });
    // Not while they are still typing: only once they leave the field.
    expect(screen.queryByText('Enter a 10 digit Indian mobile number.')).toBeNull();
    fireEvent.blur(mobile);
    expect(screen.getByText('Enter a 10 digit Indian mobile number.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.some((call) => call.url === '/api/students/accounts')).toBe(false);
  });

  it('offers only current and later exam years', async () => {
    api({ readiness: () => ({ status: 200, body: READY }), preview: previewFor() });
    render(<CreateAccountForm {...props()} />);
    fireEvent.mouseDown(await screen.findByLabelText(/Exam year/));
    expect(await screen.findByRole('option', { name: '2026-27' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '2027-28' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: '2025-26' })).toBeNull();
  });
});
