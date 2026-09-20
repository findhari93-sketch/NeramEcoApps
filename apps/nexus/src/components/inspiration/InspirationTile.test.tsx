import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { InspirationCard } from '@/lib/inspiration-present';
import InspirationTile from './InspirationTile';

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));

const card = (over: Partial<InspirationCard> = {}): InspirationCard =>
  ({
    id: 'i1',
    kind: 'submission_original',
    imageUrl: 'https://x/1.jpg',
    thumbnailUrl: null,
    aspect: 0.75,
    title: 'Sketchbook drawing',
    alt: 'Student drawing: Sketchbook drawing',
    brief: null,
    credit: 'Anuvika S. · 2027 batch',
    badge: null,
    typeSlugs: [],
    tagLabels: [],
    examTypes: [],
    years: [],
    featured: false,
    saved: false,
    saveCount: 0,
    createdAt: '2026-09-18T00:00:00.000Z',
    ...over,
  }) as InspirationCard;

describe('InspirationTile', () => {
  it('says who drew it, which is the point of featuring somebody', () => {
    render(<InspirationTile card={card()} href="/student/inspiration/i1" />);
    expect(screen.getByText('Anuvika S. · 2027 batch')).toBeTruthy();
  });

  it('carries an opted-out student as the credit already collapsed them', () => {
    render(<InspirationTile card={card({ credit: 'Neram student' })} href="/x" />);
    expect(screen.getByText('Neram student')).toBeTruthy();
  });

  it("marks a teacher's pick", () => {
    render(<InspirationTile card={card({ badge: 'featured', featured: true })} href="/x" />);
    expect(screen.getByText("Teacher's pick")).toBeTruthy();
  });

  it('shows no staff menu to a student', () => {
    render(<InspirationTile card={card()} href="/x" onToggleSave={() => {}} />);
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
  });

  it('lets a teacher take a drawing out of Inspiration from the grid', () => {
    const onHide = vi.fn();
    render(<InspirationTile card={card()} href="/x" onHide={onHide} />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Sketchbook drawing' }));
    fireEvent.click(screen.getByText('Hide from students'));
    expect(onHide).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }));
  });

  it('keeps the staff menu clear of the corner the heart would take', () => {
    // At 375px a tile is about 165px wide. A badge plus two 44px targets does
    // not fit, so staff get the menu in that corner and no heart. If both are
    // ever passed, the menu steps aside rather than landing on top of it.
    const { rerender } = render(<InspirationTile card={card()} href="/x" onHide={() => {}} />);
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
    const alone = screen.getByRole('button', { name: /More actions/ });
    expect(getComputedStyle(alone).right).toBe('4px');

    rerender(<InspirationTile card={card()} href="/x" onHide={() => {}} onToggleSave={() => {}} />);
    expect(getComputedStyle(screen.getByRole('button', { name: /More actions/ })).right).toBe('52px');
  });
});
