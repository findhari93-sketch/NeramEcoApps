import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeckItem } from '@/lib/qb-present/deck';
import PresentStage from './PresentStage';
import type { StageView } from './present-model';

/**
 * The shared screen. What matters most: the class never sees the answer
 * before Reveal, and every state the teacher steps through draws.
 */

const item = (over: Partial<DeckItem> = {}): DeckItem => ({
  id: 'q1',
  label: '38',
  section: 'aptitude',
  format: 'MCQ',
  text: 'Which of these is a dome?',
  image_url: null,
  options: [
    { text: 'Arch', image_url: null },
    { text: 'Dome', image_url: null },
    { text: 'Beam', image_url: null },
    { text: 'Truss', image_url: null },
  ],
  parts: [],
  plan: { type: 'mcq', optionCount: 4, hasKey: true },
  ...over,
});

const view = (over: Partial<StageView> = {}): StageView => ({
  phase: 'ready',
  primary: 'start',
  promptId: null,
  isCurrentPrompt: false,
  closesAt: null,
  timeLimit: null,
  answered: null,
  joined: null,
  distribution: null,
  revealedKeys: null,
  canReveal: true,
  otherOpen: null,
  ...over,
});

function draw(v: StageView, i: DeckItem = item(), extra: { secondsLeft?: number | null; showDistribution?: boolean } = {}) {
  return render(
    <PresentStage
      title="JEE Paper 2 2025"
      item={i}
      position="12 of 30"
      view={v}
      secondsLeft={extra.secondsLeft ?? null}
      showDistribution={extra.showDistribution ?? true}
      solution={null}
      onZoom={vi.fn()}
    />,
  );
}

describe('PresentStage', () => {
  it('shows the paper number, the section and every option', () => {
    draw(view());
    expect(screen.getByRole('heading', { name: 'Q.38' })).toBeTruthy();
    expect(screen.getByText('Aptitude')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Options' })).getAllByRole('listitem')).toHaveLength(4);
  });

  it('while open: the live count and the timer, no answer and no spread', () => {
    draw(view({ phase: 'open', answered: 18, joined: 22, closesAt: '2026-10-01T10:00:30Z', timeLimit: 60 }), item(), { secondsLeft: 42 });
    expect(screen.getByText('18')).toBeTruthy();
    expect(screen.getByText(/of 22/)).toBeTruthy();
    expect(screen.getByRole('timer', { name: '0:42 left' })).toBeTruthy();
    expect(screen.queryByLabelText(/correct answer/)).toBeNull();
    expect(screen.queryByLabelText(/chose it/)).toBeNull();
  });

  it('once closed: how the class answered, still no answer', () => {
    draw(view({ phase: 'closed', answered: 18, distribution: [{ value: 'B', count: 12 }, { value: 'A', count: 6 }] }));
    expect(screen.getByLabelText('Option B, 12 chose it')).toBeTruthy();
    expect(screen.getByLabelText('Option A, 6 chose it')).toBeTruthy();
    expect(screen.queryByLabelText(/correct answer/)).toBeNull();
  });

  it('once revealed: the right option is marked, with words as well as colour', () => {
    draw(view({ phase: 'revealed', primary: 'next', revealedKeys: ['B'], distribution: [] }), item(), { showDistribution: false });
    expect(screen.getByLabelText('Option B, correct answer')).toBeTruthy();
    expect(screen.getByLabelText('Option A')).toBeTruthy();
  });

  it('a numerical answer is written out after Reveal', () => {
    const numeric = item({ format: 'NUMERICAL', options: [], plan: { type: 'numeric', optionCount: null, hasKey: true } });
    const { rerender } = draw(view({ phase: 'closed' }), numeric);
    expect(screen.queryByText(/Answer:/)).toBeNull();
    rerender(
      <PresentStage title="t" item={numeric} position="1 of 1" view={view({ phase: 'revealed', revealedKeys: ['12.5'] })} secondsLeft={null} showDistribution solution={null} onZoom={vi.fn()} />,
    );
    expect(screen.getByText('Answer: 12.5')).toBeTruthy();
  });

  it('a drawing question is for discussion, with its parts', () => {
    draw(
      view({ primary: 'next' }),
      item({ format: 'DRAWING_PROMPT', options: [], parts: [{ label: '(a)', text: 'Draw a chair', image_url: null }], plan: { type: 'show', optionCount: null, hasKey: false } }),
    );
    expect(screen.getByText('Discuss')).toBeTruthy();
    expect(screen.getByText('Draw a chair')).toBeTruthy();
  });

  it('figure options open full size', () => {
    const onZoom = vi.fn();
    const figures = item({
      options: ['a', 'b', 'c', 'd'].map((k) => ({ text: null, image_url: `https://cdn.test/${k}.png` })),
    });
    render(<PresentStage title="t" item={figures} position="1 of 1" view={view()} secondsLeft={null} showDistribution solution={null} onZoom={onZoom} />);
    screen.getByRole('button', { name: 'Option C, open full size' }).click();
    expect(onZoom).toHaveBeenCalledWith('https://cdn.test/c.png', 'Option C');
  });
});
