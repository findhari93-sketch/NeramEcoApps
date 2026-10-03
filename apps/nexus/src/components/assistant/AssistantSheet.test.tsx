import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AssistantSheet from './AssistantSheet';

vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => ({ getToken: async () => 'tok' }) }));

const ctx = {
  enabled: true, open: true, openPanel: vi.fn(), closePanel: vi.fn(),
  messages: [], busy: false, error: null, suggestions: [], wantsAttachment: false, pendingAction: null,
  draft: '', setDraft: vi.fn(), send: vi.fn(async () => undefined), confirm: vi.fn(async () => undefined),
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
});
