import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { NeramThemeProvider, useThemeMode } from './provider';

function ModeProbe() {
  const { mode, actualMode } = useThemeMode();
  return <span data-testid="mode">{`${mode}/${actualMode}`}</span>;
}

describe('NeramThemeProvider mode', () => {
  beforeEach(() => localStorage.clear());

  it('renders defaultMode first so server and client markup match', () => {
    localStorage.setItem('neram-theme-mode', 'dark');
    const html = renderToString(
      <NeramThemeProvider>
        <ModeProbe />
      </NeramThemeProvider>
    );
    expect(html).toContain('light/light');
  });

  it('applies the stored mode after mount and keeps it stored', async () => {
    localStorage.setItem('neram-theme-mode', 'dark');
    render(
      <NeramThemeProvider>
        <ModeProbe />
      </NeramThemeProvider>
    );
    await waitFor(() => expect(screen.getByTestId('mode').textContent).toBe('dark/dark'));
    expect(localStorage.getItem('neram-theme-mode')).toBe('dark');
  });

  it('a nested provider reuses the outer cache and still themes its subtree', async () => {
    render(
      <NeramThemeProvider>
        <NeramThemeProvider storageKey="inner-mode" defaultMode="dark">
          <ModeProbe />
        </NeramThemeProvider>
      </NeramThemeProvider>
    );
    await waitFor(() => expect(screen.getByTestId('mode').textContent).toBe('dark/dark'));
  });
});
