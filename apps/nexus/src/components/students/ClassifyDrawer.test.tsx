import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClassifyDrawer, { type ClassifyDrawerProps } from './ClassifyDrawer';

/**
 * The Language controls on the Set stage sheet.
 *
 * The API treats a PRESENT key as an instruction to write, so the sheet must send
 * homeLanguage only when a teacher picked one, and must never smuggle it into a
 * class-only edit (that would overwrite every selected student's language). The
 * tick has the same rule, and its untouched state is what a bulk edit needs.
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

/**
 * The Language field itself, by test id rather than by label: an open menu
 * carries the same label, and a closed sheet's DOM lingers through its exit
 * transition, so the last one is the live one.
 */
const languageField = () => screen.getAllByTestId('language-select').slice(-1)[0];
/** MUI renders an unset select as a zero-width space, which trim() leaves alone. */
const shown = () => (languageField().textContent || '').replace(/​/g, '');

/** The repo's pattern for a MUI select: open it, then click the option. */
function pickLanguage(name: string) {
  fireEvent.mouseDown(languageField());
  fireEvent.click(screen.getByRole('option', { name }));
}

const tick = () => screen.getByRole('checkbox', { name: 'Limited English' });

describe('ClassifyDrawer language', () => {
  it('cannot apply until something is picked, and leaves the language alone by default', () => {
    setup();
    expect((apply() as HTMLButtonElement).disabled).toBe(true);
    // Empty display, exactly like the exam-year field above it when unchanged.
    expect(shown()).toBe('');
  });

  it('offers all five languages and nothing else', () => {
    setup();
    fireEvent.mouseDown(languageField());
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Leave unchanged',
      'தTamil',
      'हHindi',
      'KKannada',
      'MMalayalam',
      'English',
    ]);
  });

  it('sends only the language key that was picked', () => {
    const { onApply } = setup();
    pickLanguage('Tamil');
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({ homeLanguage: 'tamil' });
  });

  it('sends English like any other language, because it is a real answer now', () => {
    const { onApply } = setup();
    pickLanguage('English');
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({ homeLanguage: 'english' });
  });

  it('sends the English fluency tick on its own', () => {
    const { onApply } = setup();
    fireEvent.click(tick());
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({ limitedEnglish: true });
  });

  it('never sends a language key with a class-only edit', () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Class 11/ }));
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledTimes(1);
    const payload = onApply.mock.calls[0][0];
    expect('homeLanguage' in payload).toBe(false);
    expect('limitedEnglish' in payload).toBe(false);
  });

  it('leaves an untouched tick alone on a bulk edit, whatever each student holds', () => {
    const { onApply } = setup({ names: ['Nithya Raman', 'Aarav Sharma'] });
    pickLanguage('Hindi');
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({ homeLanguage: 'hindi' });
  });

  it('sends class and language together when both are picked', () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Class 12/ }));
    pickLanguage('Kannada');
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith({ studyStage: '12th', homeLanguage: 'kannada' });
  });

  it('forgets the choice when the sheet reopens, so it cannot land on other students', () => {
    const { props, view } = setup();
    pickLanguage('Tamil');
    view.rerender(<ClassifyDrawer {...props} open={false} />);
    view.rerender(<ClassifyDrawer {...props} open />);
    expect(shown()).toBe('');
    expect((apply() as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the current language for a single student', () => {
    setup({ currentLanguage: 'tamil', currentLimitedEnglish: true });
    expect(screen.getByText('Now: Tamil, limited English')).toBeTruthy();
  });

  it('reads an unrecorded student as English rather than inventing a third state', () => {
    setup({ currentLanguage: null });
    expect(screen.getByText('Now: English')).toBeTruthy();
  });

  it('starts the tick from what the student already has', () => {
    setup({ currentLanguage: 'tamil', currentLimitedEnglish: true });
    expect((tick() as HTMLInputElement).checked).toBe(true);
  });

  it('has no language controls when marking someone dormant', () => {
    setup({ mode: 'dormant' });
    expect(screen.queryByLabelText('Language')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Limited English' })).toBeNull();
  });
});
