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
vi.mock('next/dynamic', () => ({
  // Render an identifiable stub per dynamic() call so a test can assert which
  // floating widgets SiteChrome mounts on a given route. The loader source names
  // the module it imports (e.g. '@/components/college-hub/ComparisonTray').
  default: (loader: () => Promise<unknown>) => {
    const src = loader.toString();
    const testId = src.includes('ComparisonTray')
      ? 'comparison-tray'
      : src.includes('HubBottomNav')
        ? 'hub-bottom-nav'
        : src.includes('GeneralChatbot')
          ? 'general-chatbot'
          : 'dynamic-widget';
    return () => <div data-testid={testId} />;
  },
}));
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

  it('does not mount the compare tray on the home page', () => {
    pathname = '/';
    render(<SiteChrome locale="en"><p>home</p></SiteChrome>);
    expect(screen.queryByTestId('comparison-tray')).toBeNull();
    expect(screen.queryByTestId('hub-bottom-nav')).toBeNull();
  });

  it('does not mount the compare tray on an unrelated marketing page', () => {
    pathname = '/fees';
    render(<SiteChrome locale="en"><p>fees</p></SiteChrome>);
    expect(screen.queryByTestId('comparison-tray')).toBeNull();
  });

  it('mounts the compare tray and hub nav across the College Hub', () => {
    pathname = '/colleges/city/chennai';
    render(<SiteChrome locale="en"><p>hub</p></SiteChrome>);
    expect(screen.getByTestId('comparison-tray')).toBeTruthy();
    expect(screen.getByTestId('hub-bottom-nav')).toBeTruthy();
  });

  it('mounts the compare tray on a college profile but not the hub bottom nav', () => {
    pathname = '/colleges/tamil-nadu/caad-chennai';
    render(<SiteChrome locale="en"><p>college</p></SiteChrome>);
    expect(screen.getByTestId('comparison-tray')).toBeTruthy();
    expect(screen.queryByTestId('hub-bottom-nav')).toBeNull();
  });

  it('mounts the compare tray on the exam hubs that carry Compare buttons', () => {
    pathname = '/nata-hub';
    render(<SiteChrome locale="en"><p>nata hub</p></SiteChrome>);
    expect(screen.getByTestId('comparison-tray')).toBeTruthy();
  });
});
