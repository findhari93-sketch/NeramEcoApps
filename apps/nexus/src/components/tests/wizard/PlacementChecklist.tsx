'use client';

import type { ReactNode } from 'react';
import { Box, Checkbox, Paper, TextField, Typography, alpha, useTheme } from '@neram/ui';
import type { PlacementChoice } from '@/lib/test-wizard-draft';

/**
 * Where should this test live?
 *
 * A CHECKLIST, never a type dropdown. That is the single change that lets one
 * wizard replace five creation paths: the kind of test is not something the
 * author declares up front, it is a consequence of where the test is placed,
 * and a test can genuinely be in several places at once.
 *
 * Scheduling lives inside the placement rather than beside it, so the timetable
 * and the tests can never disagree about when something is due.
 */

export interface PlacementRowSpec {
  kind: PlacementChoice['kind'];
  title: string;
  subtitle: string;
  /** Rendered under the subtitle when the row is ticked. */
  extra?: ReactNode;
  /** Ticking is impossible without a target, e.g. no class is selected. */
  disabledReason?: string;
  /** Whether this row carries its own date-time control. */
  schedulable?: boolean;
}

export default function PlacementChecklist({
  rows,
  value,
  onToggle,
  onSchedule,
}: {
  rows: PlacementRowSpec[];
  value: PlacementChoice[];
  onToggle: (kind: PlacementChoice['kind'], on: boolean) => void;
  onSchedule: (kind: PlacementChoice['kind'], when: string) => void;
}) {
  const theme = useTheme();
  const chosen = new Set(value.map((v) => v.kind));

  const scheduledValue = (kind: PlacementChoice['kind']): string => {
    const found = value.find((v) => v.kind === kind);
    if (!found) return '';
    if (found.kind === 'class_test') return found.dueAt ?? '';
    if (found.kind === 'weekly' || found.kind === 'mock') return found.availableFrom ?? '';
    return '';
  };

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        Where should this test live?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        Pick one or several. Students see it in every placement, and a scheduled slot appears on their
        timetable automatically.
      </Typography>

      {rows.map((row) => {
        const on = chosen.has(row.kind);
        const disabled = Boolean(row.disabledReason);
        return (
          <Paper
            key={row.kind}
            variant="outlined"
            sx={{
              p: 1.5,
              mb: 1,
              borderRadius: 2,
              borderWidth: on ? 1.5 : 1,
              borderColor: on ? 'primary.light' : 'divider',
              bgcolor: on ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Checkbox
                checked={on}
                disabled={disabled}
                onChange={(e) => onToggle(row.kind, e.target.checked)}
                inputProps={{ 'aria-label': row.title }}
                sx={{ minWidth: 48, minHeight: 48, mt: -0.5, ml: -0.5 }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {row.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {row.disabledReason || row.subtitle}
                </Typography>

                {on && row.extra && <Box sx={{ mt: 1 }}>{row.extra}</Box>}

                {/* The date control appears INSIDE the row once it is ticked,
                    full width at 48px. Beside the label it would be a 90px
                    target on a phone. */}
                {on && row.schedulable && (
                  <TextField
                    fullWidth
                    size="small"
                    type="datetime-local"
                    label="When"
                    value={scheduledValue(row.kind)}
                    onChange={(e) => onSchedule(row.kind, e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ mt: 1.25, '& .MuiInputBase-input': { fontSize: 16, minHeight: 32 } }}
                  />
                )}
              </Box>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}
