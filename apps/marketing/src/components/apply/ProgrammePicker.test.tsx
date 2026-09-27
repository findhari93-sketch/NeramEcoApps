import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}));

import ProgrammePicker, { formatRupees, programmesFor } from './ProgrammePicker';

const rows = [
  { id: 'fs-year', course_type: 'nata', program_type: 'year_long', display_name: 'NATA 1 Year', fee_amount: 24000, combo_extra_fee: 0, duration: '12 months', schedule_summary: 'Weekends', features: [] },
  { id: 'fs-crash', course_type: 'nata', program_type: 'crash_course', display_name: 'NATA Crash Course', fee_amount: 9000, combo_extra_fee: 0, duration: '6 weeks', schedule_summary: 'Daily', features: [] },
  { id: 'fs-both', course_type: 'both', program_type: 'year_long', display_name: 'One Year Long Program', fee_amount: 30000, combo_extra_fee: 0, duration: '12 months', schedule_summary: 'Mon-Friday 7.00-8.00', features: [] },
  { id: 'fs-jee', course_type: 'jee_paper2', program_type: 'year_long', display_name: 'JEE Paper 2 Year', fee_amount: 20000, combo_extra_fee: 0, duration: '12 months', schedule_summary: null, features: [] },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ feeStructures: rows }) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('programmesFor', () => {
  it('keeps the rows for the chosen course plus the ones that cover both exams', () => {
    expect(programmesFor(rows as any, 'nata').map((r) => r.id)).toEqual(['fs-year', 'fs-crash', 'fs-both']);
    expect(programmesFor(rows as any, 'jee_paper2').map((r) => r.id)).toEqual(['fs-both', 'fs-jee']);
    expect(programmesFor(rows as any, 'both').map((r) => r.id)).toEqual(['fs-both']);
  });

  it('a course with only "both" programmes (production today) still has something to choose', () => {
    const onlyBoth = rows.filter((r) => r.course_type === 'both');
    expect(programmesFor(onlyBoth as any, 'nata').map((r) => r.id)).toEqual(['fs-both']);
  });
});

describe('ProgrammePicker', () => {
  it('fetches every public programme once and lists the ones for the course with the standard fee', async () => {
    render(<ProgrammePicker courseType="nata" value={null} onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('NATA 1 Year')).toBeTruthy());
    expect(screen.getByText('yourCourse.standardFee:24,000')).toBeTruthy();
    expect(screen.getAllByText(/12 months/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('One Year Long Program')).toBeTruthy();
    expect(screen.queryByText('JEE Paper 2 Year')).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/api/fee-structures?excludeHidden=true');
  });

  it('reports the pick with its label, programme type and fee', async () => {
    const onChange = vi.fn();
    render(<ProgrammePicker courseType="nata" value={null} onChange={onChange} />);
    await waitFor(() => screen.getByText('NATA Crash Course'));
    fireEvent.click(screen.getByRole('radio', { name: /NATA Crash Course/ }));
    expect(onChange).toHaveBeenCalledWith({ id: 'fs-crash', label: 'NATA Crash Course', programType: 'crash_course', feeAmount: 9000, comboExtraFee: 0 });
  });

  it('shows the empty-state copy when no programme is open', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ feeStructures: [] }) })));
    render(<ProgrammePicker courseType="both" value={null} onChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('yourCourse.programmeEmpty')).toBeTruthy());
  });

  it('renders nothing for "not sure yet"', () => {
    const { container } = render(<ProgrammePicker courseType="not_sure" value={null} onChange={vi.fn()} />);
    expect(container.innerHTML).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('formats rupees the Indian way', () => {
    expect(formatRupees(24000)).toBe('24,000');
    expect(formatRupees(125000)).toBe('1,25,000');
  });
});
