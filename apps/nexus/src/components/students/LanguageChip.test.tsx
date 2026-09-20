import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LanguageChip from './LanguageChip';

describe('LanguageChip', () => {
  it('names the language with its mark', () => {
    render(<LanguageChip language="tamil" />);
    expect(screen.getByText('Tamil')).toBeTruthy();
    expect(screen.getByText('த')).toBeTruthy();
  });

  it('uses the Latin initial for a script nobody here reads', () => {
    render(<LanguageChip language="kannada" />);
    expect(screen.getByText('Kannada')).toBeTruthy();
    expect(screen.getByText('K')).toBeTruthy();
  });

  it('says English without a mark, because that is the quiet default', () => {
    render(<LanguageChip language="english" />);
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.queryByText('த')).toBeNull();
  });

  it('reads as English when nobody has recorded it, with no third state on screen', () => {
    render(<LanguageChip language={null} />);
    expect(screen.getByText('English')).toBeTruthy();
  });

  it('spells out limited English, which the corner mark can only hint at', () => {
    render(<LanguageChip language="tamil" limitedEnglish />);
    expect(screen.getByText('Tamil, limited English')).toBeTruthy();
  });

  it('is a button that says what tapping does, when it can be changed', () => {
    const onClick = vi.fn();
    render(<LanguageChip language="tamil" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tamil. Change language' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is plain text for someone who cannot change it', () => {
    render(<LanguageChip language="english" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
