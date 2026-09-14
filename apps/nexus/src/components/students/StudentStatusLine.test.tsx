import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StudentStatusLine from './StudentStatusLine';
import type { RosterStudent } from '@/lib/student-roster-view';

const NOW = Date.UTC(2026, 8, 11, 6, 0, 0); // 11 Sep 2026, 11:30 IST

function student(over: Partial<RosterStudent> & { city?: string | null; state?: string | null } = {}) {
  return {
    name: 'Abhitha SR',
    ms_oid: 'oid-1',
    enrolled_at: '2026-03-23T05:00:00Z',
    first_signed_in_at: '2026-09-10T05:00:00Z',
    last_seen_at: '2026-09-10T11:00:00Z',
    attendance: { percentage: 80, total: 10 },
    ...over,
  };
}

describe('StudentStatusLine', () => {
  it('names the place first, so two students of one name read apart', () => {
    const { container } = render(
      <StudentStatusLine student={student({ city: 'Chennai', state: 'Tamil Nadu' })} now={NOW} />,
    );
    expect(screen.getByText('Chennai, Tamil Nadu')).toBeTruthy();
    // Before the joined date, not after it.
    const text = container.textContent || '';
    expect(text.indexOf('Chennai')).toBeLessThan(text.indexOf('Joined'));
  });

  it('shows the city alone when there is no state', () => {
    render(<StudentStatusLine student={student({ city: 'Dubai', state: null })} now={NOW} />);
    expect(screen.getByText('Dubai')).toBeTruthy();
  });

  it('says nothing at all about a student with no city, rather than a placeholder', () => {
    const { container } = render(
      <StudentStatusLine student={student({ city: null, has_application_form: false })} now={NOW} />,
    );
    const text = container.textContent || '';
    expect(text).not.toContain('City');
    expect(text).toContain('No application form');
  });

  it('carries the year on the joined date', () => {
    render(<StudentStatusLine student={student({ enrolled_at: '2026-03-23T05:00:00Z' })} now={NOW} />);
    expect(screen.getByText('Joined 23 Mar 2026')).toBeTruthy();
  });
});
