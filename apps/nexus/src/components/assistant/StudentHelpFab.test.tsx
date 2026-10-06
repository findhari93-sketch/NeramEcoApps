import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import StudentHelpFab from './StudentHelpFab';
import { setTutorPresence } from '@/components/tutor/tutor-presence';

let ctx: { enabled: boolean } | null = null;
vi.mock('./AssistantProvider', () => ({ useAssistantOptional: () => ctx }));
vi.mock('./AssistantLauncher', () => ({ default: () => <div data-testid="launcher" /> }));
vi.mock('./AssistantSheet', () => ({ default: () => <div data-testid="sheet" /> }));
vi.mock('@/components/ReportIssueFab', () => ({ default: () => <div data-testid="report-fab" /> }));

beforeEach(() => { ctx = null; setTutorPresence(false); });

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
  it('steps the launcher aside while the AI Tutor is open, keeping the sheet', () => {
    ctx = { enabled: true };
    render(<StudentHelpFab />);
    act(() => setTutorPresence(true));
    expect(screen.queryByTestId('launcher')).toBeNull();
    expect(screen.queryByTestId('sheet')).not.toBeNull();
    act(() => setTutorPresence(false));
    expect(screen.queryByTestId('launcher')).not.toBeNull();
  });
  it('hides the Report a problem Fab while the AI Tutor is open', () => {
    setTutorPresence(true);
    render(<StudentHelpFab />);
    expect(screen.queryByTestId('report-fab')).toBeNull();
  });
});
