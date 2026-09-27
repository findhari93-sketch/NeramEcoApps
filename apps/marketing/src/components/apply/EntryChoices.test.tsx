import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import EntryChoices from './EntryChoices';

afterEach(() => cleanup());

describe('EntryChoices', () => {
  it('shows only the manual path and sign-in until the assistant handlers exist', () => {
    const onManual = vi.fn();
    const onSignIn = vi.fn();
    render(<EntryChoices onManual={onManual} onSignIn={onSignIn} />);
    expect(screen.queryByRole('button', { name: /entryNera/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /entryDocument/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /aboutYou.entryManual/ }));
    expect(onManual).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'aboutYou.signIn' }));
    expect(onSignIn).toHaveBeenCalled();
  });

  it('shows the three cards when the assistant handlers are given', () => {
    const onTalkToNera = vi.fn();
    const onUploadDocument = vi.fn();
    render(
      <EntryChoices onManual={vi.fn()} onSignIn={vi.fn()} onTalkToNera={onTalkToNera} onUploadDocument={onUploadDocument} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /aboutYou.entryNera/ }));
    fireEvent.click(screen.getByRole('button', { name: /aboutYou.entryDocument/ }));
    expect(onTalkToNera).toHaveBeenCalled();
    expect(onUploadDocument).toHaveBeenCalled();
  });
});
