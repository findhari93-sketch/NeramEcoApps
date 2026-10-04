import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PadHost } from '@/lib/pad/client/pad-host';
import type { ParticipationRow } from '@/lib/pad/client/types';
import OptionNames, { type OptionNamesPrompt } from './OptionNames';

/**
 * The answer bars in a 300px side panel. A typed sentence once took 30 lines in
 * a 64px column; now it sits on its own line above its bar, two lines at most
 * until opened, and only the top answers show until the teacher asks for all.
 */

const mocks = vi.hoisted(() => ({ padFetch: vi.fn() }));
vi.mock('@/lib/pad/client/pad-fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pad/client/pad-fetch')>()),
  padFetch: mocks.padFetch,
}));
vi.mock('@/components/students/StudentAvatar', () => ({ default: () => null }));

const host = { kind: 'test' } as PadHost;
const LONG = '1. it is scalar only depends on magnitude 2. vector it depends both directions and magnitude';

function answered(name: string, answer: string): ParticipationRow {
  return { student_id: `id-${name}`, name, on_roster: true, participation: 'answered', result: 'ungraded', answer, joined_mid_prompt: false };
}

const textPrompt: OptionNamesPrompt = { id: 'p1', answer_type: 'text', option_count: null, correct_keys: null, ungraded: false, state: 'closed' };

beforeEach(() => {
  localStorage.clear();
  mocks.padFetch.mockReset();
});

describe('OptionNames', () => {
  it('puts a long typed answer on its own line, two lines at most until opened', async () => {
    mocks.padFetch.mockResolvedValue({ rows: [answered('Asha', 'vector'), answered('Bala', 'vector'), answered('Chitra', LONG)] });
    render(<OptionNames host={host} prompt={textPrompt} groups={[]} />);

    const row = await screen.findByRole('button', { name: `${LONG}: 1. Show who` });
    // Stacked: the label, then the bar and count under it.
    expect(getComputedStyle(row).flexDirection).toBe('column');
    const label = screen.getByText(LONG);
    expect(getComputedStyle(label).overflow).toBe('hidden');

    fireEvent.click(row);
    expect(getComputedStyle(screen.getByText(LONG)).overflow).not.toBe('hidden');
    expect(await screen.findByText('Chitra')).toBeTruthy();
  });

  it('keeps letters beside their bars', async () => {
    mocks.padFetch.mockResolvedValue({ rows: [answered('Asha', 'B'), answered('Bala', 'A')] });
    render(
      <OptionNames
        host={host}
        prompt={{ id: 'p2', answer_type: 'mcq', option_count: 4, correct_keys: null, ungraded: false, state: 'closed' }}
        groups={[]}
      />,
    );
    const row = await screen.findByRole('button', { name: 'B: 1. Show who' });
    expect(getComputedStyle(row).flexDirection).toBe('row');
  });

  it('shows the six most given typed answers, and the rest on request', async () => {
    const rows = Array.from({ length: 9 }, (_, i) => answered(`S${i}`, `answer number ${i}`));
    mocks.padFetch.mockResolvedValue({ rows });
    render(<OptionNames host={host} prompt={textPrompt} groups={[]} />);

    await waitFor(() => expect(screen.getAllByRole('button', { name: /^answer number \d: 1\. Show who$/ })).toHaveLength(6));
    fireEvent.click(screen.getByRole('button', { name: '3 other answers' }));
    expect(screen.getAllByRole('button', { name: /^answer number \d: 1\. Show who$/ })).toHaveLength(9);
    expect(screen.getByRole('button', { name: 'Show the top answers only' })).toBeTruthy();
  });
});
