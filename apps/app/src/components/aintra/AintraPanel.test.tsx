import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@neram/auth', () => ({ getFirebaseAuth: () => ({ currentUser: { getIdToken: async () => 'tok-1' } }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import AintraPanel, { splitSuggest } from './AintraPanel';

const sse = (events: unknown[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

let posts: { url: string; body: any; headers: any }[] = [];
let answer: unknown[] = [];

beforeEach(() => {
  posts = [];
  answer = [
    { t: 'status', text: 'Checking your fees...' },
    { t: 'card', card: { kind: 'links', title: 'Your fees', lines: [], links: [{ label: 'Pay ₹13,500', href: '/pay', primary: true }] } },
    { t: 'delta', text: 'You owe **₹13,500**. Tap the card to pay.\n[[suggest: When is it due? | Raise a ticket]]' },
    { t: 'done', model: 'fixture' },
  ];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    posts.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null, headers: init?.headers });
    if (String(url) === '/api/aintra') return new Response(sse(answer), { headers: { 'Content-Type': 'text/event-stream' } });
    if (String(url) === '/api/support-tickets') return new Response(JSON.stringify({ ticketNumber: 'NERAM-TKT-7' }), { status: 201 });
    return new Response('{}');
  }) as unknown as typeof fetch;
});
afterEach(() => cleanup());

describe('splitSuggest', () => {
  it('takes the chips off the answer and hides a half-written one', () => {
    expect(splitSuggest('Done.\n[[suggest: A | B]]')).toEqual({ body: 'Done.', suggestions: ['A', 'B'] });
    expect(splitSuggest('Done.\n[[sugg').body).toBe('Done.');
  });
});

describe('AintraPanel', () => {
  it('sends a starter with the token, then shows the answer, the card and the follow-ups', async () => {
    render(<AintraPanel open onClose={() => {}} takeQuestion={() => null} />);
    fireEvent.click(screen.getByRole('button', { name: 'What fees do I owe?' }));
    await screen.findByRole('link', { name: 'Pay ₹13,500' });
    expect(screen.getByText(/You owe/)).toBeTruthy();
    expect(screen.queryByText(/\[\[suggest/)).toBeNull();
    await screen.findByRole('button', { name: 'When is it due?' });
    expect(posts[0]).toMatchObject({ url: '/api/aintra', body: { message: 'What fees do I owe?' }, headers: { Authorization: 'Bearer tok-1' } });
  });

  it('a ticket card raises the ticket only on the tap', async () => {
    answer = [
      { t: 'card', card: { kind: 'ticket', category: 'payment_issue', subject: 'Payment pending', description: 'My UPI payment still shows pending.' } },
      { t: 'delta', text: 'Check the ticket and tap Raise ticket.' },
      { t: 'done' },
    ];
    render(<AintraPanel open onClose={() => {}} takeQuestion={() => 'My payment is stuck'} />);
    const raise = await screen.findByRole('button', { name: 'Raise ticket' });
    expect(posts.filter((p) => p.url === '/api/support-tickets')).toHaveLength(0);
    fireEvent.click(raise);
    await screen.findByText('Ticket raised');
    expect(posts.find((p) => p.url === '/api/support-tickets')?.body).toMatchObject({ category: 'payment_issue', subject: 'Payment pending' });
  });

  it('shows an error in place of an answer that failed', async () => {
    answer = [{ t: 'error', error: 'Aintra is taking a short break. Please try again later.' }];
    render(<AintraPanel open onClose={() => {}} takeQuestion={() => 'hi'} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('short break'));
  });
});
