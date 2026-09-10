import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useDirectoryEnroll, type EnrollOutcome } from './useDirectoryEnroll';

// The face comes from the stage-facts provider, which is not what this tests and
// would otherwise consume the mocked fetch responses meant for the enrollments route.
vi.mock('./StudentAvatar', () => ({
  default: () => <div data-testid="avatar" />,
}));

const AFRIN = { ms_oid: 'oid-afrin', name: 'Afrin banu', email: 'Afrin_banu@neramclasses.com' };

const CANDIDATE = {
  user_id: 'gmail-row',
  name: 'Afrin',
  email: 'afrinbanu20101@gmail.com',
  enrolled_at: '2026-08-13T12:45:27Z',
  reason: 'name',
};

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function Harness({ onDone }: { onDone: (outcome: EnrollOutcome) => void }) {
  const { enroll, dialog } = useDirectoryEnroll({ classroomId: 'room-1', getToken: async () => 'token' });
  return (
    <>
      <button type="button" onClick={() => enroll([AFRIN]).then(onDone)}>
        start
      </button>
      {dialog}
    </>
  );
}

const fetchMock = vi.fn();

function bodyOfCall(index: number) {
  return JSON.parse((fetchMock.mock.calls[index][1] as RequestInit).body as string);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useDirectoryEnroll', () => {
  it('asks before linking, then sends link_user_id', async () => {
    fetchMock
      .mockResolvedValueOnce(response(409, { error: 'possible_duplicate', candidates: [CANDIDATE] }))
      .mockResolvedValueOnce(response(201, { enrollment: {} }));
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);

    fireEvent.click(screen.getByText('start'));
    expect(await screen.findByText('Is this the same student?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, same student' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][0]).toEqual({ added: ['oid-afrin'], skipped: [], errors: [] });
    expect(bodyOfCall(1).link_user_id).toBe('gmail-row');
    expect(bodyOfCall(1).confirm_new).toBeUndefined();
  });

  it('sends confirm_new when the teacher says it is a different student', async () => {
    fetchMock
      .mockResolvedValueOnce(response(409, { error: 'possible_duplicate', candidates: [CANDIDATE] }))
      .mockResolvedValueOnce(response(201, { enrollment: {} }));
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);

    fireEvent.click(screen.getByText('start'));
    fireEvent.click(await screen.findByRole('button', { name: 'No, a different student' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(bodyOfCall(1).confirm_new).toBe(true);
    expect(bodyOfCall(1).link_user_id).toBeUndefined();
  });

  it('skips without a second request', async () => {
    fetchMock.mockResolvedValueOnce(response(409, { error: 'possible_duplicate', candidates: [CANDIDATE] }));
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);

    fireEvent.click(screen.getByText('start'));
    fireEvent.click(await screen.findByRole('button', { name: 'Skip this one' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][0]).toEqual({ added: [], skipped: ['oid-afrin'], errors: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns a refusal into a readable error without asking', async () => {
    fetchMock.mockResolvedValueOnce(
      response(409, { error: 'This Microsoft account already has its own Nexus record.' }),
    );
    const onDone = vi.fn();
    render(<Harness onDone={onDone} />);

    fireEvent.click(screen.getByText('start'));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(onDone.mock.calls[0][0].errors).toEqual([
      'Afrin banu: This Microsoft account already has its own Nexus record.',
    ]);
    expect(screen.queryByText('Is this the same student?')).toBeNull();
  });
});
