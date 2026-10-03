import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AssistantSheet from './AssistantSheet';

let sketchbookOn = true;
vi.mock('@/hooks/useNexusAuth', () => ({
  useNexusAuthContext: () => ({ getToken: async () => 'tok', isFeatureEnabled: (id: string) => (id === 'student.sketchbook' ? sketchbookOn : true) }),
}));

const ctx = {
  enabled: true, open: true, openPanel: vi.fn(), closePanel: vi.fn(),
  messages: [], busy: false, error: null, suggestions: [], wantsAttachment: false, pendingAction: null,
  canRetry: false, retry: vi.fn(async () => undefined), send: vi.fn(async () => undefined), confirm: vi.fn(async () => undefined),
  cancel: vi.fn(async () => undefined), newChat: vi.fn(async () => undefined), reportProblem: vi.fn(async () => undefined),
  pageContext: { path: '/student/dashboard' },
};
vi.mock('./AssistantProvider', () => ({ useAssistant: () => ctx }));

describe('AssistantSheet', () => {
  it('is announced as a modal dialog named by its heading', () => {
    render(<AssistantSheet />);
    const dialog = screen.getByRole('dialog', { name: 'Neram Assistant' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const heading = screen.getByRole('heading', { name: 'Neram Assistant' });
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(dialog.hasAttribute('aria-label')).toBe(false);
  });

  it('hides the sketch quick action and the attach button while the sketchbook is off (Ruling 25)', () => {
    sketchbookOn = false;
    try {
      render(<AssistantSheet />);
      expect(screen.queryByRole('button', { name: /Add a sketch/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Attach a photo' })).toBeNull();
      expect(screen.queryByRole('button', { name: /Remind me/ })).not.toBeNull();
    } finally {
      sketchbookOn = true;
    }
  });

  it('offers Try again under an error the student can retry, and it resends', () => {
    // jsdom has no scrollIntoView; the message list calls it on every new message.
    Element.prototype.scrollIntoView = vi.fn();
    Object.assign(ctx, { error: 'You seem to be offline. Check your connection and try again.', canRetry: true, messages: [{ id: 'm1', role: 'user', text: 'hello' }] });
    try {
      render(<AssistantSheet />);
      expect(screen.getByRole('alert').textContent).toBe('You seem to be offline. Check your connection and try again.');
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(ctx.retry).toHaveBeenCalledTimes(1);
    } finally {
      Object.assign(ctx, { error: null, canRetry: false, messages: [] });
    }
  });
});
