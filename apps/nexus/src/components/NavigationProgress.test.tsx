import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { Suspense, useState } from 'react';

/**
 * Chrome navigation used to be buttons calling router.push (PERF-0029): nothing
 * was prefetched, nothing showed that a tap had registered, and rows could not be
 * opened in a new tab or read as links. NavLink is a real link that Next prefetches,
 * and every navigation it or useNavigate starts runs in one transition whose pending
 * state drives a thin progress bar.
 */

let setRoute: (route: string) => void = () => {};
const push = vi.fn((href: string) => setRoute(href));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/teacher/dashboard',
}));

import { NavigationProgressProvider, NavLink, useNavigate } from './NavigationProgress';

beforeEach(() => {
  push.mockClear();
});
afterEach(() => cleanup());

describe('NavLink', () => {
  it('is a real link to its page, so it can be prefetched and opened in a new tab', () => {
    render(<NavLink href="/teacher/students">Students</NavLink>);
    expect(screen.getByRole('link', { name: 'Students' }).getAttribute('href')).toBe('/teacher/students');
  });

  it('navigates a plain click through the router', () => {
    render(<NavLink href="/teacher/students">Students</NavLink>);
    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'Students' }));
    expect(notPrevented).toBe(false);
    expect(push).toHaveBeenCalledWith('/teacher/students');
  });

  it.each([
    ['ctrl', { ctrlKey: true }],
    ['cmd', { metaKey: true }],
    ['shift', { shiftKey: true }],
    ['middle button', { button: 1 }],
  ])('leaves a %s click to the browser (new tab or window)', (_name, init) => {
    render(<NavLink href="/teacher/students">Students</NavLink>);
    fireEvent.click(screen.getByRole('link', { name: 'Students' }), init);
    expect(push).not.toHaveBeenCalled();
  });

  it('still runs its own onClick, for example to close the More sheet', () => {
    const onClick = vi.fn();
    render(<NavLink href="/teacher/tests" onClick={onClick}>Tests</NavLink>);
    fireEvent.click(screen.getByRole('link', { name: 'Tests' }));
    expect(onClick).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/teacher/tests');
  });
});

describe('the progress bar', () => {
  let finish: () => void = () => {};
  let ready = false;
  const slowData = new Promise<void>((resolve) => {
    finish = () => {
      ready = true;
      resolve();
    };
  });

  function Slow() {
    if (!ready) throw slowData;
    return <p>Students page</p>;
  }

  function Screen() {
    const [route, set] = useState('/teacher/dashboard');
    setRoute = set;
    return route === '/teacher/dashboard' ? <p>Dashboard page</p> : <Slow />;
  }

  function Menu() {
    const navigate = useNavigate();
    return (
      <button type="button" onClick={() => navigate('/teacher/students')}>
        Go
      </button>
    );
  }

  it('shows while the next page is still loading, keeping the current page on screen, then goes', async () => {
    render(
      <NavigationProgressProvider>
        <Suspense fallback={<p>fallback</p>}>
          <Screen />
        </Suspense>
        <Menu />
      </NavigationProgressProvider>,
    );
    expect(screen.queryByRole('progressbar')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    });
    // It waits 150ms before appearing, so a page that swaps at once never flashes it.
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(await screen.findByRole('progressbar', { name: /loading page/i })).toBeTruthy();
    expect(screen.getByText('Dashboard page')).toBeTruthy();

    await act(async () => {
      finish();
      await slowData;
    });
    expect(screen.getByText('Students page')).toBeTruthy();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
