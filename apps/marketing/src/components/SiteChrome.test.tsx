import { render, screen, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/Header', () => ({ default: () => <header data-testid="marketing-header" /> }));
vi.mock('@/components/Footer', () => ({ default: () => <footer data-testid="marketing-footer" /> }));
vi.mock('@/components/marketing-content', () => ({
  BroadcastBanner: () => <div data-testid="broadcast" />,
  ImportantDateBanner: () => <div data-testid="important-date" />,
  StickyAchievementWidget: () => <div data-testid="sticky-widget" />,
}));

import SiteChrome from './SiteChrome';

afterEach(() => cleanup());

describe('SiteChrome', () => {
  it('renders the full marketing chrome on a marketing page', () => {
    pathname = '/fees';
    render(<SiteChrome locale="en"><p>page</p></SiteChrome>);
    expect(screen.getByTestId('marketing-header')).toBeTruthy();
    expect(screen.getByTestId('marketing-footer')).toBeTruthy();
    expect(screen.getByTestId('sticky-widget')).toBeTruthy();
    expect(screen.getByText('page')).toBeTruthy();
  });

  it('renders only the application shell on /apply', () => {
    pathname = '/apply';
    render(<SiteChrome locale="en"><p>form</p></SiteChrome>);
    expect(screen.queryByTestId('marketing-header')).toBeNull();
    expect(screen.queryByTestId('marketing-footer')).toBeNull();
    expect(screen.queryByTestId('sticky-widget')).toBeNull();
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'shell.home' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'shell.help' })).toBeTruthy();
    expect(screen.getByText('form')).toBeTruthy();
  });

  it('renders the application shell on a localised pay page', () => {
    pathname = '/ta/pay';
    render(<SiteChrome locale="ta"><p>pay</p></SiteChrome>);
    expect(screen.queryByTestId('marketing-header')).toBeNull();
    expect(screen.getByRole('link', { name: 'shell.terms' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'shell.refund' })).toBeTruthy();
  });
});
