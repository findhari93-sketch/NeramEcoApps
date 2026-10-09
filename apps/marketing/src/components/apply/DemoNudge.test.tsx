import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/funnel-tracker', () => ({ trackTaxonomyEvent: vi.fn() }));

import { DemoExitIntent, DemoNotSureLink } from './DemoNudge';

function mockPointer(fine: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: fine,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function leaveThroughTheTop() {
  act(() => {
    document.dispatchEvent(new MouseEvent('mouseout', { clientY: 0, relatedTarget: null, bubbles: true }));
  });
}

beforeEach(() => window.sessionStorage.clear());
afterEach(() => cleanup());

describe('DemoNotSureLink', () => {
  it('links to the demo booking and says where it came from', () => {
    render(<DemoNotSureLink step={1} />);
    expect(screen.getByText('notSure')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'notSureLink' }).getAttribute('href')).toBe('/demo-class?from=apply');
  });
});

describe('DemoExitIntent', () => {
  it('shows once when the pointer leaves through the top on a desktop', () => {
    mockPointer(true);
    const { unmount } = render(<DemoExitIntent enabled step={1} />);
    expect(screen.queryByRole('dialog')).toBeNull();

    leaveThroughTheTop();
    const card = screen.getByRole('dialog');
    expect(card.getAttribute('aria-modal')).toBe('false');
    expect(screen.getByRole('link', { name: 'exitCta' }).getAttribute('href')).toBe('/demo-class?from=apply_exit');

    fireEvent.click(screen.getByRole('button', { name: 'exitKeep' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    unmount();

    // Same session, new page load: never again.
    render(<DemoExitIntent enabled step={1} />);
    leaveThroughTheTop();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', () => {
    mockPointer(true);
    render(<DemoExitIntent enabled step={2} />);
    leaveThroughTheTop();
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never runs on touch screens', () => {
    mockPointer(false);
    render(<DemoExitIntent enabled step={1} />);
    leaveThroughTheTop();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays quiet while disabled (no progress yet, or the dialogs are open)', () => {
    mockPointer(true);
    render(<DemoExitIntent enabled={false} step={0} />);
    leaveThroughTheTop();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores moves between elements inside the page', () => {
    mockPointer(true);
    render(<DemoExitIntent enabled step={1} />);
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseout', { clientY: 0, relatedTarget: document.body, bubbles: true }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
