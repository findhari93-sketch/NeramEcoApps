import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProofLink from './ProofLink';

/**
 * Opening a proof must open the signed URL in a NEW tab and leave the Admin
 * page where it is. window.open('', '_blank', 'noopener') returns null by
 * spec, which is how the first version navigated the Admin tab away.
 */
describe('ProofLink', () => {
  const realOpen = window.open;
  const realFetch = global.fetch;
  let tab: { location: { href: string }; opener: unknown; close: () => void };
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tab = { location: { href: '' }, opener: {}, close: vi.fn() };
    // Like a browser: a 'noopener' request gets no handle back.
    window.open = vi.fn((_url?: string | URL, _target?: string, features?: string) => (features && /noopener/.test(features) ? null : (tab as any))) as any;
    assign = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ url: 'https://signed.example/proof.jpg?token=t' }) })) as any;
  });
  afterEach(() => {
    window.open = realOpen;
    global.fetch = realFetch;
  });

  it('opens the signed URL in the new tab and never moves the Admin page', async () => {
    render(<ProofLink stored="user-1/tok/1.jpg" />);
    fireEvent.click(screen.getByRole('button', { name: /view screenshot/i }));
    await waitFor(() => expect(tab.location.href).toBe('https://signed.example/proof.jpg?token=t'));
    expect(tab.opener).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('closes the tab and shows the error when signing fails', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({ error: 'This screenshot is not in the payment proofs store.' }) })) as any;
    render(<ProofLink stored="user-1/tok/1.jpg" />);
    fireEvent.click(screen.getByRole('button', { name: /view screenshot/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/not in the payment proofs store/i));
    expect(tab.close).toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('renders nothing when there is no stored proof', () => {
    const { container } = render(<ProofLink stored={null} />);
    expect(container.innerHTML).toBe('');
  });
});
