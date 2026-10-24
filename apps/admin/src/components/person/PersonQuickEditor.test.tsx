import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageSection, StudiesSection } from './PersonQuickEditor';

const NOW = new Date('2026-10-24T10:00:00Z');

describe('StudiesSection', () => {
  it('records a break year, keeping a year already known', () => {
    const onSave = vi.fn();
    render(<StudiesSection facts={{ currentStandard: '12th', studySource: 'staff' }} onSave={onSave} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Break year' }));
    expect(onSave).toHaveBeenCalledWith({ studyStage: 'gap_year', twelfthPassedYear: null });
  });

  it('does nothing when the confirmed class is picked again', () => {
    const onSave = vi.fn();
    render(<StudiesSection facts={{ currentStandard: '12th', studySource: 'staff' }} onSave={onSave} now={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Class 12' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("confirms the class a student gave on their application", () => {
    const onSave = vi.fn();
    render(
      <StudiesSection
        facts={{ currentStandard: 'gap_year', studySource: 'application', twelfthPassedYear: 2025 }}
        onSave={onSave}
        now={NOW}
      />,
    );
    expect(screen.getByText(/From their application\. Click Break year to confirm it\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Break year' }));
    expect(onSave).toHaveBeenCalledWith({ studyStage: 'gap_year', twelfthPassedYear: 2025 });
  });

  it('offers the last three years, and a second click clears the year', () => {
    const onSave = vi.fn();
    render(
      <StudiesSection facts={{ currentStandard: 'gap_year', studySource: 'staff', twelfthPassedYear: 2025 }} onSave={onSave} now={NOW} />,
    );
    expect(screen.getByRole('button', { name: '2026' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2024' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '2024' }));
    expect(onSave).toHaveBeenLastCalledWith({ studyStage: 'gap_year', twelfthPassedYear: 2024 });
    fireEvent.click(screen.getByRole('button', { name: '2025' }));
    expect(onSave).toHaveBeenLastCalledWith({ studyStage: 'gap_year', twelfthPassedYear: null });
  });

  it('hides the year for any other class', () => {
    render(<StudiesSection facts={{ currentStandard: '11th' }} onSave={vi.fn()} now={NOW} />);
    expect(screen.queryByText('Finished Class 12 in')).toBeNull();
  });
});

describe('LanguageSection', () => {
  it('confirms a guess in one click', () => {
    const onSave = vi.fn();
    render(<LanguageSection facts={{ guess: { key: 'tamil', source: 'state', from: 'Tamil Nadu' } }} onSave={onSave} />);
    expect(screen.getByText('Likely Tamil, from Tamil Nadu')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Tamil' }));
    expect(onSave).toHaveBeenCalledWith({ homeLanguage: 'tamil' });
  });

  it('clears a recorded language with a second click, and ticks limited English', () => {
    const onSave = vi.fn();
    render(<LanguageSection facts={{ homeLanguage: 'telugu', limitedEnglish: false }} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Telugu/ }));
    expect(onSave).toHaveBeenLastCalledWith({ homeLanguage: null });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onSave).toHaveBeenLastCalledWith({ limitedEnglish: true });
  });
});
