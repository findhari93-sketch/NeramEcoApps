import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TellTeacherWhySheet from './TellTeacherWhySheet';
import type { StudentTest } from './StudentTestCard';

/**
 * The sheet a student answers "why did you not sit it" in.
 *
 * Plain DOM assertions throughout: jest-dom matchers pass vitest here and then
 * fail the Nexus tsc build.
 */

const TEST: StudentTest = {
  id: 'paper-1',
  title: 'History of Architecture Test',
  description: null,
  folder_label: null,
  question_count: 150,
  test_type: 'untimed',
  duration_minutes: null,
  placement_id: 'run-exam',
  passing_pct: 80,
  available_from: null,
  available_until: '2026-08-18T17:15:00Z',
  attempt_limit: 1,
  attempts: 0,
  best_percentage: null,
  last_submitted_at: null,
  is_exam: true,
};

function mount(over: Partial<StudentTest> = {}, submitImpl?: (...args: any[]) => Promise<any>) {
  const submit = vi.fn(
    submitImpl ??
      (async (input: any) => ({ reason_code: input.reason_code, reason_note: input.reason_note || null, updated_at: 'now' })),
  );
  const onSent = vi.fn();
  const onClose = vi.fn();
  render(<TellTeacherWhySheet test={{ ...TEST, ...over }} onClose={onClose} submit={submit} onSent={onSent} />);
  return { submit, onSent, onClose };
}

describe('TellTeacherWhySheet', () => {
  it('offers the missed-test answers, the likeliest first, as radio rows', () => {
    mount();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(6);
    expect(screen.getByLabelText('I did not know the test was open')).toBe(radios[0]);
    expect(screen.getByLabelText('I did not have time')).not.toBeNull();
    expect(screen.getByLabelText('The test would not open or submit')).not.toBeNull();
  });

  it('sends a one-tap answer with the test and the run it is about', async () => {
    const { submit, onSent } = mount();
    fireEvent.click(screen.getByLabelText('I did not know the test was open'));
    fireEvent.click(screen.getByTestId('why-send'));

    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(submit).toHaveBeenCalledWith({
      test_id: 'paper-1',
      placement_id: 'run-exam',
      reason_code: 'did_not_know',
      reason_note: '',
    });
    expect(onSent.mock.calls[0][1]).toEqual({ reason_code: 'did_not_know', reason_note: null, updated_at: 'now' });
  });

  it('never disables Send: pressing it with nothing chosen says what is missing', async () => {
    const { submit } = mount();
    const send = screen.getByTestId('why-send');
    expect(send.hasAttribute('disabled')).toBe(false);

    fireEvent.click(send);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Pick the answer closest to what happened.');
    expect(submit).not.toHaveBeenCalled();
  });

  it('asks for a note on a broken test, next to the note field, and sends once it has one', async () => {
    const { submit } = mount();
    fireEvent.click(screen.getByLabelText('The test would not open or submit'));
    fireEvent.click(screen.getByTestId('why-send'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Say what went wrong');
    expect(submit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('why-note'), { target: { value: 'Submit kept spinning' } });
    fireEvent.click(screen.getByTestId('why-send'));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0].reason_note).toBe('Submit kept spinning');
  });

  it('labels the optional note as optional', () => {
    mount();
    fireEvent.click(screen.getByLabelText('I was unwell'));
    expect(screen.getByLabelText('Anything to add? (optional)')).not.toBeNull();
  });

  it('keeps what they chose and typed when sending fails, and says so', async () => {
    const { onSent } = mount({}, async () => {
      throw new Error('That did not send. Check your connection and try again.');
    });
    fireEvent.click(screen.getByLabelText('I was unwell'));
    fireEvent.change(screen.getByTestId('why-note'), { target: { value: 'Fever all week' } });
    fireEvent.click(screen.getByTestId('why-send'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('did not send');
    expect(onSent).not.toHaveBeenCalled();
    expect((screen.getByLabelText('I was unwell') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('why-note') as HTMLTextAreaElement).value).toBe('Fever all week');
  });

  it('opens on "Change" with what they said last time', () => {
    mount({ skip_reason: { reason_code: 'no_time', reason_note: 'Board exam week', updated_at: null } });
    expect((screen.getByLabelText('I did not have time') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId('why-note') as HTMLTextAreaElement).value).toBe('Board exam week');
  });

  it('says a reason does not reopen the test, and where to ask for that', () => {
    mount();
    expect(screen.getByText(/It does not reopen the test: for another sitting, use Ask my teacher\./)).not.toBeNull();
  });

  it('uses no em dash or double dash anywhere a student reads', () => {
    const { container } = render(
      <TellTeacherWhySheet test={TEST} onClose={vi.fn()} submit={vi.fn()} onSent={vi.fn()} />,
    );
    expect(document.body.textContent || container.textContent).not.toMatch(/—|–|--/);
  });
});
