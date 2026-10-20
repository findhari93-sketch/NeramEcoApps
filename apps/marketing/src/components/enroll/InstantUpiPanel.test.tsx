import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('qrcode', () => ({ toString: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg"></svg>') }));

import InstantUpiPanel, { type InstantOrder, type InstantStatus } from './InstantUpiPanel';

const order = (over: Partial<InstantOrder> = {}): InstantOrder => ({
  attemptId: 'a1',
  amountPaise: 2500037,
  paiseTag: 37,
  upiUri: 'upi://pay?pa=x@bank&am=25000.37',
  expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  payeeName: 'Manoharan Trust',
  upiId: 'x@bank',
  note: 'NRM AB12CD',
  ...over,
});

function setup(statuses: InstantStatus[] = []) {
  const queue = [...statuses];
  const props = {
    baseAmount: 25000,
    orderMinutes: 30,
    start: vi.fn(async () => order()),
    poll: vi.fn(async () => queue.shift() || { state: 'awaiting_credit', enrolled: false, expiresAt: null }),
    cancel: vi.fn(async () => undefined),
    onDone: vi.fn(),
    onFallback: vi.fn(),
    onActiveChange: vi.fn(),
  };
  render(<InstantUpiPanel {...props} />);
  return props;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() })) as any;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('InstantUpiPanel', () => {
  it('offers the base amount and starts an order on tap', async () => {
    const p = setup();
    const cta = screen.getByRole('button', { name: /Pay ₹25,000 instantly/ });
    fireEvent.click(cta);
    await waitFor(() => expect(p.start).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText('₹25,000.37')).length).toBeGreaterThan(0);
    expect(screen.getByText(/Pay exactly/)).toBeTruthy();
    expect(screen.getByText(/The 37 paise/)).toBeTruthy();
    expect(p.onActiveChange).toHaveBeenLastCalledWith(true);
  });

  it('hands over once the poll says enrolled', async () => {
    const p = setup([{ state: 'succeeded', enrolled: true, expiresAt: null }]);
    fireEvent.click(screen.getByRole('button', { name: /instantly/ }));
    await screen.findAllByText('₹25,000.37');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    await waitFor(() => expect(p.onDone).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Payment received/)).toBeTruthy();
  });

  it('explains a hold for staff instead of handing over', async () => {
    const p = setup([{ state: 'awaiting_review', enrolled: false, expiresAt: null }]);
    fireEvent.click(screen.getByRole('button', { name: /instantly/ }));
    await screen.findAllByText('₹25,000.37');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(await screen.findByText(/confirms it by hand/)).toBeTruthy();
    expect(p.onDone).not.toHaveBeenCalled();
    expect(p.onActiveChange).toHaveBeenLastCalledWith(true);
  });

  it('cancels the order when the student picks another way', async () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: /instantly/ }));
    await screen.findAllByText('₹25,000.37');
    fireEvent.click(screen.getByRole('button', { name: /Use another way to pay/ }));
    await waitFor(() => expect(p.cancel).toHaveBeenCalledWith('a1'));
    expect(p.onFallback).toHaveBeenCalledTimes(1);
    expect(p.onActiveChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: /instantly/ })).toBeTruthy();
  });

  it('keeps the order watching when the payment is not showing yet', async () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: /instantly/ }));
    await screen.findAllByText('₹25,000.37');
    fireEvent.click(screen.getByRole('button', { name: /not showing/ }));
    expect(p.cancel).not.toHaveBeenCalled();
    expect(p.onFallback).toHaveBeenCalledTimes(1);
    expect(p.onActiveChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText(/keep watching for ₹25,000.37/)).toBeTruthy();
  });

  it('offers a fresh start after the window closes', async () => {
    const p = setup([{ state: 'expired', enrolled: false, expiresAt: null }]);
    fireEvent.click(screen.getByRole('button', { name: /instantly/ }));
    await screen.findAllByText('₹25,000.37');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(await screen.findByRole('button', { name: /Start again/ })).toBeTruthy();
    expect(screen.getByText(/still counts/)).toBeTruthy();
    expect(p.onDone).not.toHaveBeenCalled();
  });

  it('shows the server message when the order cannot start', async () => {
    const p = setup();
    p.start.mockRejectedValueOnce(new Error('Instant confirmation is paused for a moment.'));
    fireEvent.click(screen.getByRole('button', { name: /instantly/ }));
    expect(await screen.findByText(/paused for a moment/)).toBeTruthy();
    expect(p.onActiveChange).toHaveBeenLastCalledWith(false);
  });
});

describe('InstantUpiPanel: review fixes', () => {
  it('a poll still in flight when the student picks another way cannot revive the panel', async () => {
    let resolvePoll: (s: InstantStatus) => void = () => undefined;
    const p = setup();
    p.poll.mockImplementationOnce(() => new Promise<InstantStatus>((res) => { resolvePoll = res; }));
    fireEvent.click(screen.getByRole('button', { name: /instantly/ }));
    await screen.findAllByText('₹25,000.37');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    fireEvent.click(screen.getByRole('button', { name: /Use another way to pay/ }));
    await waitFor(() => expect(p.cancel).toHaveBeenCalled());
    await act(async () => {
      resolvePoll({ state: 'cancelled', enrolled: false, expiresAt: null });
    });
    expect(screen.getByRole('button', { name: /instantly/ })).toBeTruthy();
    expect(screen.queryByText(/still counts/)).toBeNull();
  });

  it('a rejected order tells the student and opens the manual path', async () => {
    const p = setup([{ state: 'rejected', enrolled: false, expiresAt: null }]);
    fireEvent.click(screen.getByRole('button', { name: /instantly/ }));
    await screen.findAllByText('₹25,000.37');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100);
    });
    expect(await screen.findByText(/could not confirm/)).toBeTruthy();
    expect(p.onFallback).toHaveBeenCalledTimes(1);
    expect(p.onActiveChange).toHaveBeenLastCalledWith(false);
  });

  it('the countdown reaching zero closes the request without waiting for the sweep', async () => {
    const p = setup();
    p.start.mockResolvedValueOnce(order({ expiresAt: new Date(Date.now() + 2000).toISOString() }));
    fireEvent.click(screen.getByRole('button', { name: /instantly/ }));
    await screen.findAllByText('₹25,000.37');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(await screen.findByRole('button', { name: /Start again/ })).toBeTruthy();
  });

  it('shadow mode copy promises a staff confirmation, not instant enrolment', () => {
    render(
      <InstantUpiPanel baseAmount={25000} orderMinutes={30} mode="shadow" start={vi.fn()} poll={vi.fn()} cancel={vi.fn()} onDone={vi.fn()} onFallback={vi.fn()} />,
    );
    expect(screen.getByText(/our team confirms it/i)).toBeTruthy();
    expect(screen.queryByText(/confirmed in seconds/i)).toBeNull();
    expect(screen.getByRole('button', { name: /Pay ₹25,000 by UPI/ })).toBeTruthy();
  });
});
