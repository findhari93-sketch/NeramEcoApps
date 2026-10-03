import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StudentHelpFab from './StudentHelpFab';

let ctx: { enabled: boolean } | null = null;
vi.mock('./AssistantProvider', () => ({ useAssistantOptional: () => ctx }));
vi.mock('./AssistantLauncher', () => ({ default: () => <div data-testid="launcher" /> }));
vi.mock('./AssistantSheet', () => ({ default: () => <div data-testid="sheet" /> }));
vi.mock('@/components/ReportIssueFab', () => ({ default: () => <div data-testid="report-fab" /> }));

beforeEach(() => { ctx = null; });

describe('StudentHelpFab', () => {
  it('renders the Report a problem Fab when there is no assistant context', () => {
    render(<StudentHelpFab />);
    expect(screen.queryByTestId('report-fab')).not.toBeNull();
    expect(screen.queryByTestId('launcher')).toBeNull();
  });
  it('renders the Fab when the assistant is disabled', () => {
    ctx = { enabled: false };
    render(<StudentHelpFab />);
    expect(screen.queryByTestId('report-fab')).not.toBeNull();
    expect(screen.queryByTestId('launcher')).toBeNull();
    expect(screen.queryByTestId('sheet')).toBeNull();
  });
  it('renders the launcher and sheet, not the Fab, when enabled', () => {
    ctx = { enabled: true };
    render(<StudentHelpFab />);
    expect(screen.queryByTestId('launcher')).not.toBeNull();
    expect(screen.queryByTestId('sheet')).not.toBeNull();
    expect(screen.queryByTestId('report-fab')).toBeNull();
  });
});
