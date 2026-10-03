import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActionProposal } from './client';
import ActionCard from './ActionCard';

const proposal = (expiresAt: string): ActionProposal => ({
  id: 'a1', kind: 'decline_class', summary: 'Tell your teacher you cannot attend Perspective.',
  fields: [{ label: 'Class', value: 'Perspective' }], confirmToken: 'ct', expiresAt,
} as ActionProposal);

function confirmButton(expiresAt: string) {
  render(<ActionCard action={proposal(expiresAt)} busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
  return screen.getByRole('button', { name: 'Confirm' }) as HTMLButtonElement;
}

describe('ActionCard', () => {
  it('a live card can be confirmed and says how long it has', () => {
    expect(confirmButton(new Date(Date.now() + 5 * 60_000).toISOString()).disabled).toBe(false);
    expect(screen.queryByText('Expires in 5 min')).not.toBeNull();
  });

  it('an expired card cannot be confirmed', () => {
    expect(confirmButton(new Date(Date.now() - 1_000).toISOString()).disabled).toBe(true);
  });

  it('an unreadable expiry reads as expired and Confirm is off, never a live button on an Expired card', () => {
    expect(confirmButton('not a date').disabled).toBe(true);
    expect(screen.queryByText(/^Expired\./)).not.toBeNull();
  });

  it('offers Confirm and Cancel only: no Edit in M1 (Ruling 23)', () => {
    confirmButton(new Date(Date.now() + 5 * 60_000).toISOString());
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Confirm', 'Cancel']);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});
