import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AiAnswersSection from './AiAnswersSection';

const OFF = { on: false, line: 'Off: 1 missed class to catch up, starting with Perspective (1 Oct).', override: null };
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
const getToken = async () => 'tok';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const open = () => fireEvent.click(screen.getByText('AI answers'));

describe('AiAnswersSection', () => {
  it('shows the teacher line on first open', async () => {
    fetchMock.mockResolvedValue(json(200, OFF));
    render(<AiAnswersSection studentId="stu" getToken={getToken} />);
    open();
    expect(await screen.findAllByText(/Off: 1 missed class to catch up/)).not.toHaveLength(0);
  });

  it('opens a reason form and saves an Always on override', async () => {
    fetchMock.mockResolvedValueOnce(json(200, OFF));
    render(<AiAnswersSection studentId="stu" getToken={getToken} />);
    open();
    await screen.findAllByText(/Off: 1 missed class/);
    fireEvent.click(screen.getByRole('button', { name: 'Always on' }));
    const save = screen.getByRole('button', { name: 'Save' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Was ill' } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fetchMock.mockResolvedValueOnce(
      json(200, { on: true, line: 'On: set by a teacher (Was ill).', override: { mode: 'on', reason: 'Was ill', ends_on: null, set_at: '2026-10-03T05:00:00Z', set_by_name: 'Ms Rao' } }),
    );
    fireEvent.click(save);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/students/stu/ai-access');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ mode: 'on', reason: 'Was ill', ends_on: null });
    expect(await screen.findByRole('button', { name: 'Clear override' })).toBeTruthy();
    expect(screen.getByText(/Set by Ms Rao/)).toBeTruthy();
  });

  it('says so when the assistant is switched off', async () => {
    fetchMock.mockResolvedValue(json(404, { error: 'Not found' }));
    render(<AiAnswersSection studentId="stu" getToken={getToken} />);
    open();
    expect(await screen.findByText('Neram Assistant is switched off, so there is nothing to manage here.')).toBeTruthy();
  });
});
