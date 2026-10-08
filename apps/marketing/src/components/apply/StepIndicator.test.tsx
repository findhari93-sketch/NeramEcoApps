import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
}));

import StepIndicator from './StepIndicator';

afterEach(() => cleanup());

describe('StepIndicator', () => {
  it('marks the active step and lets only completed steps be clicked', () => {
    const onStepClick = vi.fn();
    render(<StepIndicator step={2} onStepClick={onStepClick} />);
    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    expect(buttons).toHaveLength(4);
    expect(buttons[2].getAttribute('aria-current')).toBe('step');
    expect(buttons.map((b) => b.disabled)).toEqual([false, false, true, true]);

    fireEvent.click(buttons[1]);
    expect(onStepClick).toHaveBeenCalledWith(1);
    fireEvent.click(buttons[3]);
    expect(onStepClick).toHaveBeenCalledTimes(1);
  });

  it('names every step with its number', () => {
    render(<StepIndicator step={0} />);
    expect(screen.getByText('steps.aboutYou')).toBeTruthy();
    expect(screen.getByText('steps.pay')).toBeTruthy();
    expect(screen.getByText('04')).toBeTruthy();
    expect(screen.getByRole('list').getAttribute('aria-label')).toContain('progress');
  });

  it('is inert on the pay step, where the application is already written', () => {
    const onStepClick = vi.fn();
    render(<StepIndicator step={3} onStepClick={onStepClick} />);
    for (const button of screen.getAllByRole('button') as HTMLButtonElement[]) expect(button.disabled).toBe(true);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onStepClick).not.toHaveBeenCalled();
  });
});
