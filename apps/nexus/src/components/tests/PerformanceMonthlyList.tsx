'use client';

/**
 * The individual attempts behind the trend chart, grouped by month. This is
 * the feature's accessible "table view": every value the chart's tooltip can
 * show is reachable here too, without hovering anything.
 *
 * The collapse interaction (role="button" header + rotating chevron) mirrors
 * GroupSection on the teacher tests hub, not a new pattern of its own.
 */

import { useMemo, useState } from 'react';
import { Box, Paper, Typography, Chip, Collapse, Divider } from '@neram/ui';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import type { NexusAttemptKind } from '@neram/database';
import { formatWhen } from './StudentTestCard';

export interface PerformanceAttemptRow {
  attempt_id: string;
  test_id: string;
  test_title: string;
  kind: NexusAttemptKind;
  attempt_number: number;
  percentage: number | null;
  passed: boolean | null;
  submitted_at: string | null;
}

const KIND_LABEL: Record<NexusAttemptKind, string> = {
  practice: 'Practice',
  class: 'Class test',
  exam: 'Exam',
};

function monthKey(iso: string | null): string {
  return iso ? iso.slice(0, 7) : 'unknown';
}

function monthLabel(iso: string | null): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function MonthGroup({
  label,
  rows,
  defaultOpen,
}: {
  label: string;
  rows: PerformanceAttemptRow[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const scored = rows.filter((r) => r.percentage != null);
  const avg =
    scored.length > 0 ? Math.round(scored.reduce((s, r) => s + (r.percentage || 0), 0) / scored.length) : null;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Box
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        sx={{ p: 1.5, minHeight: 48, display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {rows.length} test{rows.length !== 1 ? 's' : ''}
            {avg != null ? ` · ${avg}% average` : ''}
          </Typography>
        </Box>
        <ExpandMoreOutlinedIcon
          sx={{ color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
        />
      </Box>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <Box>
          {rows.map((r, i) => (
            <Box key={r.attempt_id}>
              {i > 0 && <Divider />}
              <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {r.test_title}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mt: 0.25 }}>
                    <Typography variant="caption" color="text.secondary">
                      Attempt {r.attempt_number} · {formatWhen(r.submitted_at)}
                    </Typography>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={KIND_LABEL[r.kind]}
                      sx={{ height: 18, fontSize: '0.65rem' }}
                    />
                  </Box>
                </Box>
                <Chip
                  size="small"
                  label={r.percentage == null ? '-' : `${Math.round(r.percentage)}%`}
                  color={r.passed === true ? 'success' : r.passed === false ? 'default' : 'primary'}
                  sx={{ height: 24, fontWeight: 700 }}
                />
              </Box>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
}

export default function PerformanceMonthlyList({ attempts }: { attempts: PerformanceAttemptRow[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; rows: PerformanceAttemptRow[] }>();
    // Attempts arrive newest-first, and Map preserves insertion order, so the
    // months come out newest-first without a separate sort.
    for (const a of attempts) {
      const key = monthKey(a.submitted_at);
      if (!map.has(key)) map.set(key, { key, label: monthLabel(a.submitted_at), rows: [] });
      map.get(key)!.rows.push(a);
    }
    return [...map.values()];
  }, [attempts]);

  if (groups.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
        No attempts yet.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {groups.map((g, i) => (
        <MonthGroup key={g.key} label={g.label} rows={g.rows} defaultOpen={i === 0} />
      ))}
    </Box>
  );
}
