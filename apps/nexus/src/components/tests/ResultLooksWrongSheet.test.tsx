import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ResultLooksWrongSheet from './ResultLooksWrongSheet';

/**
 * The end of the loop: a published result a student can question.
 *
 * These hold the contract between the sheet and the route. The wording of the
 * reasons themselves is pinned in exam-result-explain.test.ts.
 *
 * Plain DOM assertions throughout. jest-dom matchers pass vitest here and then
 * fail the Nexus tsc build.
 */

const sent = { issueId: 'i1', ticketNumber: 'NXS-0078', alreadyOpen: false };

function open(submit = vi.fn(async () => sent)) {
  const onClose = vi.fn();
  render(
    <ResultLooksWrongSheet
      open
      examTitle="History of Architecture Test"
      onClose={onClose}
      submit={submit as never}
    />,
  );
  return { submit, onClose };
}

describe('ResultLooksWrongSheet', () => {
  it('offers the reason the product itself gets wrong', () => {
    open();
    expect(screen.queryByText('The wrong attempt was counted')).not.toBeNull();
    expect(screen.queryByText('My marks look wrong')).not.toBeNull();
  });

  it('sends what was picked', async () => {
    const { submit } = open();
    fireEvent.click(screen.getByTestId('result-query-marks_wrong'));
    fireEvent.click(screen.getByTestId('result-query-send'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit).toHaveBeenCalledWith({ reason_code: 'marks_wrong', note: '' });
  });

  // A greyed button that silently refuses is the dead end this app has spent a
  // release removing. Nothing here is ever disabled.
  it('says what is missing rather than disabling Send', () => {
    const { submit } = open();
    const send = screen.getByTestId('result-query-send') as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByText(/Pick what looks wrong/)).not.toBeNull();
  });

  it('asks for the detail that the answer is useless without', async () => {
    const { submit } = open();
    fireEvent.click(screen.getByTestId('result-query-question_marked_wrong'));
    fireEvent.click(screen.getByTestId('result-query-send'));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.queryByText(/Say which question/)).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/Say a bit more/), { target: { value: 'Q12 was marked wrong' } });
    fireEvent.click(screen.getByTestId('result-query-send'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  });

  it('does not demand a note where the facts already answer it', async () => {
    const { submit } = open();
    fireEvent.click(screen.getByTestId('result-query-wrong_attempt'));
    fireEvent.click(screen.getByTestId('result-query-send'));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  });

  it('confirms, with the reference, rather than closing silently', async () => {
    open();
    fireEvent.click(screen.getByTestId('result-query-rank_wrong'));
    fireEvent.click(screen.getByTestId('result-query-send'));
    await waitFor(() => expect(screen.queryByText(/Sent to your teacher/)).not.toBeNull());
    expect(screen.queryByText(/NXS-0078/)).not.toBeNull();
  });

  it('tells a student who already asked that it is in hand, not that it failed', async () => {
    open(vi.fn(async () => ({ ...sent, alreadyOpen: true })));
    fireEvent.click(screen.getByTestId('result-query-marks_wrong'));
    fireEvent.click(screen.getByTestId('result-query-send'));
    await waitFor(() => expect(screen.queryByText(/already asked about this one/)).not.toBeNull());
  });

  // The sheet stays open on a failure, so what they chose and typed survives.
  it('keeps the answer when the send fails', async () => {
    open(
      vi.fn(async (): Promise<typeof sent> => {
        throw new Error('Network is down');
      }),
    );
    fireEvent.click(screen.getByTestId('result-query-marks_wrong'));
    fireEvent.click(screen.getByTestId('result-query-send'));
    await waitFor(() => expect(screen.queryByText('Network is down')).not.toBeNull());
    const chosen = screen.getByTestId('result-query-marks_wrong') as HTMLInputElement;
    expect(chosen.checked).toBe(true);
  });

  it('uses no em dash anywhere a student reads', () => {
    const { container } = render(
      <ResultLooksWrongSheet open examTitle="HOA Test" onClose={vi.fn()} submit={vi.fn() as never} />,
    );
    expect(container.textContent || '').not.toMatch(/—|--|&mdash;/);
  });
});
