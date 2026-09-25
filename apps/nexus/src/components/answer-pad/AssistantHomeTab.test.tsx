import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AssistantHomeTab, { ASSISTANT_HOME_LINKS } from './AssistantHomeTab';

/**
 * The tab every Neram Assistant Activity item opens. Outside Teams the SDK never
 * initialises, which is also the state a plain browser tab is in.
 */

vi.mock('@microsoft/teams-js', () => ({
  app: { initialize: () => Promise.reject(new Error('not in Teams')) },
}));

const NO_DASHES = /[–—]|--/;

describe('AssistantHomeTab', () => {
  it('opens each Nexus page in a new tab, relative to the Nexus it is served from', () => {
    render(<AssistantHomeTab />);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/student/assignments', '/student/catch-up', '/student/timetable']);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
  });

  it('names the app and says where the work opens', () => {
    render(<AssistantHomeTab />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Neram Assistant');
    expect(screen.getByText('Your Nexus work opens in your browser.')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Open in Nexus' })).toBeTruthy();
  });

  it('writes no en or em dashes', () => {
    const { container } = render(<AssistantHomeTab />);
    expect(container.textContent).not.toMatch(NO_DASHES);
    for (const link of ASSISTANT_HOME_LINKS) expect(`${link.label} ${link.hint}`).not.toMatch(NO_DASHES);
  });
});
