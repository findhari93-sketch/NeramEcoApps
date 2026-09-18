import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import InspirationAttempts from './InspirationAttempts';

const card = (over: Record<string, unknown> = {}) =>
  ({
    key: 'k1', submissionId: 'sub1', itemId: 'item1', imageUrl: 'https://x/o.jpg', thumbnailUrl: null,
    credit: 'Priya S. · 2026 batch', submittedAt: '2026-09-10T10:00:00Z', practisedFrom: false,
    review: { state: 'reviewed', rating: 5, marks: null }, ...over,
  }) as any;

describe('InspirationAttempts', () => {
  it('links staff to the review screen of each attempt', () => {
    render(<InspirationAttempts mode="staff" itemId="i0" view={{ students: 2, shown: 1, cards: [card()] }} />);
    expect(screen.getByText('Drawn from this')).toBeTruthy();
    expect(screen.getByText('2 students drew this.')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/teacher/drawing-reviews/sub1?from=inspiration&item=i0');
  });

  it('links a student to the Inspiration drawing of each attempt', () => {
    render(<InspirationAttempts mode="student" itemId="i0" view={{ students: 2, shown: 1, cards: [card({ submissionId: null, review: null })] }} />);
    expect(screen.getByText('2 students drew this. 1 scored 4 stars and above.')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/student/inspiration/item1');
  });

  it('renders nothing when nobody has drawn it', () => {
    const { container } = render(<InspirationAttempts mode="student" itemId="i0" view={{ students: 0, shown: 0, cards: [] }} />);
    expect(container.textContent).toBe('');
  });
});
