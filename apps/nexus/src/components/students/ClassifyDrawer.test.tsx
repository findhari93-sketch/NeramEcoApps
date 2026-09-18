import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClassifyDrawer, { type ClassifyDrawerProps } from './ClassifyDrawer';

/**
 * The Language group on the Set stage sheet.
 *
 * The API treats a PRESENT key as an instruction to write, so the sheet must send
 * knowsTamil only when a teacher picked a language, and must never smuggle it into
 * a class-only edit (that would clear every selected student's language).
 */

function setup(overrides: Partial<ClassifyDrawerProps> = {}) {
  const onApply = vi.fn();
  const props: ClassifyDrawerProps = {
    open: true,
    mode: 'stage',
    names: ['Nithya Raman'],
    examYears: ['2026-27', '2027-28'],
    currentBatch: '2026-27',
    onClose: vi.fn(),
    onApply,
    ...overrides,
  };
  const view = render(<ClassifyDrawer {...props} />);
  return { onApply, props, view };
}

const apply = () => screen.getByRole('button', { name: /^Apply/ });
const pick = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));

describe('ClassifyDrawer language', () => {
  it('cannot apply until something is picked, and leaves language unchanged by default', () => {
    setup();
    expect((apply() as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('radio', { name: 'Leave unchanged' }) as HTMLInputElement).checked).toBe(true);
  });

  it('sends only knowsTamil true for Knows Tamil', () => {
    const { onApply } = setup();
    pick('Knows Tamil');
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({ knowsTamil: true });
  });

  it('sends only knowsTamil false for English only', () => {
    const { onApply } = setup();
    pick('English only');
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({ knowsTamil: false });
  });

  it('sends knowsTamil null to clear it', () => {
    const { onApply } = setup();
    pick('Clear language');
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({ knowsTamil: null });
  });

  it('never sends a language key with a class-only edit', () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Class 11/ }));
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect('knowsTamil' in onApply.mock.calls[0][0]).toBe(false);
  });

  it('sends class and language together when both are picked', () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Class 12/ }));
    pick('English only');
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({ studyStage: '12th', knowsTamil: false });
  });

  it('forgets the choice when the sheet reopens, so it cannot land on other students', () => {
    const { props, view } = setup();
    pick('Knows Tamil');
    view.rerender(<ClassifyDrawer {...props} open={false} />);
    view.rerender(<ClassifyDrawer {...props} open />);
    expect((screen.getByRole('radio', { name: 'Leave unchanged' }) as HTMLInputElement).checked).toBe(true);
    expect((apply() as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the current language for a single student', () => {
    setup({ currentKnowsTamil: false });
    expect(screen.getByText('Now: English only')).toBeTruthy();
  });

  it('has no language group when marking someone dormant', () => {
    setup({ mode: 'dormant' });
    expect(screen.queryByRole('radiogroup', { name: 'Language' })).toBeNull();
  });

  it('labels the group so a screen reader announces it', () => {
    setup();
    expect(screen.getByRole('radiogroup', { name: 'Language' })).toBeTruthy();
  });
});
