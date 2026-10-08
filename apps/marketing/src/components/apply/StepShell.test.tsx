import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
}));

import StepShell from './StepShell';

afterEach(() => cleanup());

describe('StepShell', () => {
  it('renders the step, the progress line, one primary button, Back and the note', () => {
    const onPrimary = vi.fn();
    const onBack = vi.fn();
    render(
      <StepShell step={1} actions={{ primaryLabel: 'Review application', onPrimary, onBack, note: 'Next: review' }}>
        <p>step body</p>
      </StepShell>,
    );
    expect(screen.getByText('step body')).toBeTruthy();
    expect(screen.getByText('progress {"current":2,"total":4}')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Review application' }));
    expect(onPrimary).toHaveBeenCalledTimes(1);

    // Two Back controls exist: the phone icon button and the desktop text button. CSS shows one at a time.
    const backs = screen.getAllByRole('button', { name: 'actions.back' });
    expect(backs).toHaveLength(2);
    fireEvent.click(backs[0]);
    expect(onBack).toHaveBeenCalledTimes(1);

    expect(screen.getAllByText('Next: review')).toHaveLength(2);
  });

  it('shows no Back on the first step and disables the primary button while busy', () => {
    render(
      <StepShell step={0} actions={{ primaryLabel: 'Continue', onPrimary: vi.fn(), busy: true }}>
        <p>first step</p>
      </StepShell>,
    );
    expect(screen.queryByRole('button', { name: 'actions.back' })).toBeNull();
    expect((screen.getByRole('button', { name: /Continue/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders no action block when the step owns its own button', () => {
    render(
      <StepShell step={3}>
        <p>pay step</p>
      </StepShell>,
    );
    expect(screen.getByText('pay step')).toBeTruthy();
    // Only the four step-indicator buttons remain.
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });
});
