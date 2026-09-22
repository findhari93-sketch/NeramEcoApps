import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ReportMistakeLink from './ReportMistakeLink';
import type { ReportTargetOption } from '@/lib/report-targets';

// A stable getter: an inline one would change identity every render.
const auth = vi.hoisted(() => ({ getToken: async () => 't' }));
vi.mock('@/hooks/useNexusAuth', () => ({ useNexusAuthContext: () => auth }));

const TARGETS: ReportTargetOption[] = [
  { target: 'video', partLabel: null, label: 'Video solution' },
  { target: 'question', partLabel: null, label: 'The question itself' },
];

const base = {
  questionId: 'q31',
  target: 'video' as const,
  partLabel: null,
  targets: TARGETS,
  isMcq: true,
  source: 'practice' as const,
};

describe('ReportMistakeLink', () => {
  it('opens the report sheet already on this part', () => {
    render(<ReportMistakeLink {...base} />);
    fireEvent.click(screen.getByRole('button', { name: 'Report a mistake' }));
    expect(screen.getByRole('button', { name: /There is a mistake in the working/ })).not.toBeNull();
  });

  it('says the student already reported it instead of asking again', () => {
    render(
      <ReportMistakeLink
        {...base}
        status={{ mine: [{ target: 'video', part_label: null, report_type: 'wrong_working' }], flagged: [] }}
      />,
    );
    expect(screen.getByText('You reported this. We will let you know.')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Report a mistake' })).toBeNull();
  });

  it('warns every student once enough students have reported this video', () => {
    render(<ReportMistakeLink {...base} status={{ mine: [], flagged: [{ target: 'video', part_label: null }] }} />);
    expect(screen.getByText('Some students think this video has a mistake. A teacher is checking it.')).not.toBeNull();
    // They can still add their own report.
    expect(screen.getByRole('button', { name: 'Report a mistake' })).not.toBeNull();
  });

  it('keeps the warning to the part that was reported', () => {
    render(
      <ReportMistakeLink {...base} status={{ mine: [], flagged: [{ target: 'answer_key', part_label: null }] }} />,
    );
    expect(screen.queryByText(/Some students think/)).toBeNull();
  });
});
