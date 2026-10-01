// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { attendanceCountsByStudent, fetchAttendanceCounts } from './attendance-counts';

describe('attendanceCountsByStudent', () => {
  it('maps RPC rows to the per-student shape the route already used', () => {
    expect(
      attendanceCountsByStudent([
        { student_id: 's1', attended: 3, total: 4 },
        { student_id: 's2', attended: '0', total: '2' },
      ]),
    ).toEqual({ s1: { attended: 3, total: 4 }, s2: { attended: 0, total: 2 } });
  });

  it('handles no rows and junk safely', () => {
    expect(attendanceCountsByStudent(null)).toEqual({});
    expect(attendanceCountsByStudent([{ student_id: '', attended: 1, total: 1 }])).toEqual({});
    expect(attendanceCountsByStudent([{ student_id: 's', attended: null, total: null }])).toEqual({
      s: { attended: 0, total: 0 },
    });
  });

  it('is not capped at 1,000 like the old row read', () => {
    // One row per student regardless of class history.
    const rows = Array.from({ length: 1500 }, (_, i) => ({ student_id: `s${i}`, attended: 40, total: 50 }));
    expect(Object.keys(attendanceCountsByStudent(rows))).toHaveLength(1500);
  });
});

describe('fetchAttendanceCounts', () => {
  it('calls the RPC scoped to the classroom and roster', async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    await fetchAttendanceCounts({ rpc }, ['c1'], ['s1', 's2']);
    expect(rpc).toHaveBeenCalledWith('nexus_attendance_counts', { p_classroom_ids: ['c1'], p_student_ids: ['s1', 's2'] });
  });

  it('falls back to counting rows when the function is not deployed yet', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rpc = vi.fn(async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }));
    const chain: any = {
      select: () => chain,
      in: async () => ({
        data: [
          { student_id: 's1', attended: true },
          { student_id: 's1', attended: false },
          { student_id: 's2', attended: true },
        ],
        error: null,
      }),
    };
    const res = await fetchAttendanceCounts({ rpc, from: () => chain }, ['c1'], ['s1', 's2']);
    expect(attendanceCountsByStudent(res.data)).toEqual({ s1: { attended: 1, total: 2 }, s2: { attended: 1, total: 1 } });
  });

  it('passes other errors through', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: '57014', message: 'timeout' } }));
    const res = await fetchAttendanceCounts({ rpc }, ['c1'], ['s1']);
    expect(res.error).toEqual({ code: '57014', message: 'timeout' });
  });
});
