import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LanguageChip from './LanguageChip';

describe('LanguageChip', () => {
  it('says Knows Tamil with the த mark', () => {
    render(<LanguageChip knowsTamil />);
    expect(screen.getByText('Knows Tamil')).toBeTruthy();
    expect(screen.getByText('த')).toBeTruthy();
  });

  it('spells out English only, without the mark', () => {
    render(<LanguageChip knowsTamil={false} />);
    expect(screen.getByText('English only')).toBeTruthy();
    expect(screen.queryByText('த')).toBeNull();
  });

  it('reads as not set rather than English only when nobody recorded it', () => {
    render(<LanguageChip knowsTamil={null} />);
    expect(screen.getByText('Language not set')).toBeTruthy();
  });

  it('is a button that says what tapping does, when it can be changed', () => {
    const onClick = vi.fn();
    render(<LanguageChip knowsTamil onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Knows Tamil. Change language' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is plain text for someone who cannot change it', () => {
    render(<LanguageChip knowsTamil={false} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
