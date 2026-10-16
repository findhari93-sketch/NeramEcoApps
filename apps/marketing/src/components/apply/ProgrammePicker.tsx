'use client';

import { useEffect, useState } from 'react';
import { Box, Skeleton, Stack, Typography, Alert } from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import { useTranslations } from 'next-intl';
import { tokens as t } from '@/design-system';
import { inkRuleTopSx } from './styles';

export interface ProgrammeRow {
  id: string;
  course_type: string;
  program_type: 'year_long' | 'crash_course';
  display_name: string;
  fee_amount: number;
  combo_extra_fee: number;
  duration: string;
  schedule_summary: string | null;
  features: string[];
}

export interface ProgrammePick {
  id: string;
  label: string;
  programType: 'year_long' | 'crash_course';
  feeAmount: number;
  comboExtraFee: number;
}

export function formatRupees(amount: number): string {
  return Math.round(amount).toLocaleString('en-IN');
}

/**
 * The programmes an applicant can pick for a course. A programme priced for
 * "both" exams covers NATA and JEE Paper 2 alike (in production every open
 * programme is priced that way), so it is offered for either course; a
 * course-specific programme is offered only for its own course.
 */
export function programmesFor(rows: ProgrammeRow[], courseType: string | null): ProgrammeRow[] {
  if (!courseType || courseType === 'not_sure') return [];
  return rows.filter((row) => row.course_type === courseType || row.course_type === 'both');
}

/** Every public programme once, from the same route the fees page uses, filtered per course. */
export function useProgrammes(courseType: string | null) {
  const [all, setAll] = useState<ProgrammeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const wanted = !!courseType && courseType !== 'not_sure';

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetch('/api/fee-structures?excludeHidden=true')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        if (!cancelled) setAll(Array.isArray(data?.feeStructures) ? data.feeStructures : []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wanted]);

  return { rows: programmesFor(all, courseType), loading, failed };
}

interface ProgrammePickerProps {
  courseType: string | null;
  value: string | null;
  onChange: (pick: ProgrammePick | null) => void;
}

/** Screen-reader only text (1px, never `width: 1`, which MUI reads as 100%). */
const srOnlySx = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/** One ruled row of the programme list: ground fill and a gold left rail when selected. */
function rowSx(selected: boolean) {
  return {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    width: '100%',
    minHeight: 64,
    py: '12px',
    pr: '4px',
    pl: selected ? '14px' : '4px',
    textAlign: 'left',
    fontFamily: 'inherit',
    color: t.ink,
    borderBottom: `1px solid ${t.line}`,
    bgcolor: selected ? t.ground : 'transparent',
    boxShadow: selected ? `inset 3px 0 0 ${t.gold500}` : 'none',
    transition: 'background-color 150ms, padding-left 150ms',
    '&:hover': { bgcolor: t.ground },
    '&.Mui-focusVisible': { outline: t.focusOutline, outlineOffset: '2px', zIndex: 1 },
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
  } as const;
}

/**
 * "Choose your programme": a ruled radio list (1px ink rule on top), one row
 * per open programme for the chosen course with its duration and standard fee,
 * so the exact fee is visible two steps before payment. Radio semantics so a
 * screen reader hears one group with one selection.
 */
export default function ProgrammePicker({ courseType, value, onChange }: ProgrammePickerProps) {
  const tr = useTranslations('apply');
  const { rows, loading, failed } = useProgrammes(courseType);

  if (!courseType || courseType === 'not_sure') return null;

  if (loading) {
    return (
      <Stack spacing={1} aria-busy="true" aria-label={tr('yourCourse.programmeLoading')}>
        <Skeleton variant="rectangular" height={64} sx={{ borderRadius: `${t.radius}px` }} />
        <Skeleton variant="rectangular" height={64} sx={{ borderRadius: `${t.radius}px` }} />
      </Stack>
    );
  }

  if (failed || rows.length === 0) {
    return <Alert severity="info">{tr('yourCourse.programmeEmpty')}</Alert>;
  }

  return (
    <Box role="radiogroup" aria-label={tr('yourCourse.programmeQuestion')} sx={inkRuleTopSx}>
      {rows.map((row) => {
        const selected = value === row.id;
        const fee = formatRupees(Number(row.fee_amount));
        return (
          <ButtonBase
            key={row.id}
            role="radio"
            aria-checked={selected}
            onClick={() =>
              onChange({
                id: row.id,
                label: row.display_name,
                programType: row.program_type,
                feeAmount: Number(row.fee_amount),
                comboExtraFee: Number(row.combo_extra_fee) || 0,
              })
            }
            sx={rowSx(selected)}
          >
            <Box
              component="span"
              aria-hidden
              sx={{
                flexShrink: 0,
                width: 20,
                height: 20,
                boxSizing: 'border-box',
                borderRadius: '50%',
                border: `2px solid ${selected ? t.navy900 : t.lineStrong}`,
                bgcolor: t.surface,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {selected && <Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: t.navy900 }} />}
            </Box>
            <Box component="span" sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <Typography component="span" sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.35, color: t.ink }}>
                {row.display_name}
              </Typography>
              <Typography component="span" sx={{ fontSize: 14, lineHeight: 1.45, color: t.inkMuted }}>
                {row.duration}
                {row.schedule_summary ? ` · ${row.schedule_summary}` : ''}
              </Typography>
            </Box>
            <Typography component="span" aria-hidden sx={{ flexShrink: 0, fontSize: 15, fontWeight: 700, color: t.ink, whiteSpace: 'nowrap' }}>
              ₹{fee}
            </Typography>
            <Box component="span" sx={srOnlySx}>
              {tr('yourCourse.standardFee', { amount: fee })}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}
