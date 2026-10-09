import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
}));

import StepShell from './StepShell';

afterEach(() => cleanup());

describe('StepShell', () => {
  it('renders the eyebrow, the step, one wide primary button, one Back and the note, all inline', () => {
    const onPrimary = vi.fn();
    const onBack = vi.fn();
    render(
      <StepShell step={1} actions={{ primaryLabel: 'Review application', onPrimary, onBack, note: 'Next: review' }}>
        <p>step body</p>
      </StepShell>,
    );
    expect(screen.getByText('eyebrow')).toBeTruthy();
    expect(screen.getByText('step body')).toBeTruthy();
    // The step count is spoken by the indicator, not printed twice.
    expect(screen.getByRole('list').getAttribute('aria-label')).toBe('progress {"current":2,"total":4}');

    fireEvent.click(screen.getByRole('button', { name: 'Review application' }));
    expect(onPrimary).toHaveBeenCalledTimes(1);

    const backs = screen.getAllByRole('button', { name: 'actions.back' });
    expect(backs).toHaveLength(1);
    fireEvent.click(backs[0]);
    expect(onBack).toHaveBeenCalledTimes(1);

    expect(screen.getAllByText('Next: review')).toHaveLength(1);
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

  it('renders the aside under the actions', () => {
    render(
      <StepShell step={1} actions={{ primaryLabel: 'Review application', onPrimary: vi.fn() }} aside={<a href="/demo-class">demo link</a>}>
        <p>body</p>
      </StepShell>,
    );
    const primary = screen.getByRole('button', { name: 'Review application' });
    const aside = screen.getByRole('link', { name: 'demo link' });
    // The link comes after the primary button in reading order.
    expect(primary.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
