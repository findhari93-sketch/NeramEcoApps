import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import StudentIdentityLine from './StudentIdentityLine';
import * as facts from './StudentStageFactsProvider';

/**
 * The line was left plain in the first two adoption passes of the cohort ring,
 * on the reasoning that its chip already prints the stage so a ring would state
 * the same fact twice. It does, and that is the point: a chip is a label you
 * read, a ring is a shape you scan, and a teacher looking down a list of thirty
 * students scans. Both signals stay, and this test pins the decision down so a
 * third pass does not undo it.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StudentIdentityLine', () => {
  it('wears the ring and keeps the chip', () => {
    vi.spyOn(facts, 'useStudentStageFacts').mockReturnValue({
      ready: true,
      factsFor: (id) => (id === 's1' ? { stage: '11th', dormant: false } : null),
    });

    render(
      <StudentIdentityLine student={{ id: 's1', name: 'Nithya Raman', current_standard: '11th' }} />
    );

    // Both the ring and the chip announce the stage, so the label matches twice.
    // The ring is the one wrapping the face; the chip is a MuiChip.
    const labelled = screen.getAllByLabelText(/Class 11/);
    const ring = labelled.find((el) => el.querySelector('.MuiAvatar-root'));
    const chip = labelled.find((el) => el.classList.contains('MuiChip-root'));

    expect(ring).toBeTruthy();
    expect(chip).toBeTruthy();
  });

  it('stays plain for someone who is not a tracked student', () => {
    render(<StudentIdentityLine student={{ id: 'teacher-1', name: 'A Teacher' }} />);
    expect(screen.queryByLabelText(/Class 1[12]|Break Year|Dormant/)).toBeNull();
  });
});
