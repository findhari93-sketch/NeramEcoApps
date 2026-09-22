import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReportSolutionSheet from './ReportSolutionSheet';
import type { ReportTargetOption } from '@/lib/report-targets';

/**
 * A student reporting a mistake: pick the part (unless they came from it),
 * pick why, optionally say where in the video, send. Nothing is greyed out:
 * pressing Send too early says what is missing, next to it.
 */

const TARGETS: ReportTargetOption[] = [
  { target: 'video', partLabel: null, label: 'Video solution' },
  { target: 'answer_key', partLabel: null, label: 'Answer key' },
  { target: 'question', partLabel: null, label: 'The question itself' },
];

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ data: { id: 'r1' }, already_open: false }) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function open(props: Partial<React.ComponentProps<typeof ReportSolutionSheet>> = {}) {
  const onSent = vi.fn();
  render(
    <ReportSolutionSheet
      open
      onClose={vi.fn()}
      questionId="q31"
      targets={TARGETS}
      isMcq
      source="practice"
      getToken={async () => 't'}
      onSent={onSent}
      {...props}
    />,
  );
  return { onSent };
}

const body = () => JSON.parse(fetchMock.mock.calls[0][1].body);

describe('ReportSolutionSheet', () => {
  it('asks which part first, offering only what the question has', () => {
    open();
    expect(screen.getByRole('button', { name: /Video solution/ })).not.toBeNull();
    expect(screen.getByRole('button', { name: /Answer key/ })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Written solution/ })).toBeNull();
  });

  it('goes straight to the reasons when opened from the video, and can change its mind', () => {
    open({ initialTarget: { target: 'video', partLabel: null } });
    expect(screen.getByRole('button', { name: /There is a mistake in the working/ })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('button', { name: /Answer key/ })).not.toBeNull();
  });

  it('sends the report, with the moment in the video', async () => {
    const { onSent } = open({ initialTarget: { target: 'video', partLabel: null }, testId: 't-1', source: 'test_review' });
    fireEvent.click(screen.getByRole('button', { name: /There is a mistake in the working/ }));
    fireEvent.change(screen.getByLabelText(/Where in the video/), { target: { value: '2:15' } });
    fireEvent.change(screen.getByLabelText(/Anything else/), { target: { value: 'Step 3 uses sin' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/question-bank/questions/q31/report');
    expect(body()).toEqual({
      target: 'video',
      reason: 'wrong_working',
      note: 'Step 3 uses sin',
      video_seconds: 135,
      part_label: null,
      source: 'test_review',
      test_id: 't-1',
    });
    expect(await screen.findByText(/A teacher will check it/)).not.toBeNull();
    expect(onSent).toHaveBeenCalledWith({ target: 'video', partLabel: null, reason: 'wrong_working' });
  });

  it('says what is missing instead of greying Send out', () => {
    open({ initialTarget: { target: 'video', partLabel: null } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByText('Choose what is wrong')).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('wants a few words when the reason is Something else', () => {
    open({ initialTarget: { target: 'video', partLabel: null } });
    fireEvent.click(screen.getByRole('button', { name: /Something else/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByText('Tell us what looks wrong')).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks the time is a time', () => {
    open({ initialTarget: { target: 'video', partLabel: null } });
    fireEvent.click(screen.getByRole('button', { name: /There is a mistake in the working/ }));
    fireEvent.change(screen.getByLabelText(/Where in the video/), { target: { value: '2:75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByText('Write the time like 2:15')).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hides the options-only reasons on a question without options', () => {
    open({ initialTarget: { target: 'answer_key', partLabel: null }, isMcq: false });
    expect(screen.getByRole('button', { name: /The marked answer is wrong/ })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /None of the options is right/ })).toBeNull();
  });

  it('says so when they had already reported it', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {}, already_open: true }) });
    open({ initialTarget: { target: 'video', partLabel: null } });
    fireEvent.click(screen.getByRole('button', { name: /It will not play/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/You already reported this/)).not.toBeNull();
  });

  it('shows the reason a report was refused', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'You have sent 20 reports today. Try again tomorrow.' }),
    });
    open({ initialTarget: { target: 'video', partLabel: null } });
    fireEvent.click(screen.getByRole('button', { name: /It will not play/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect((await screen.findByRole('alert')).textContent).toContain('20 reports today');
  });
});
