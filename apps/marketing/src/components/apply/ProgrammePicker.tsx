'use client';

import { useEffect, useState } from 'react';
import { Box, Card, CardActionArea, Skeleton, Stack, Typography, Alert } from '@neram/ui';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import { useTranslations } from 'next-intl';

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

/**
 * "Choose your programme": one card per open programme for the chosen course,
 * with the duration and the standard fee on the card, so the exact fee is
 * visible two steps before payment. Radio semantics so a screen reader hears
 * one group with one selection.
 */
export default function ProgrammePicker({ courseType, value, onChange }: ProgrammePickerProps) {
  const t = useTranslations('apply');
  const { rows, loading, failed } = useProgrammes(courseType);

  if (!courseType || courseType === 'not_sure') return null;

  if (loading) {
    return (
      <Stack spacing={1.5} aria-busy="true" aria-label={t('yourCourse.programmeLoading')}>
        <Skeleton variant="rectangular" height={84} sx={{ borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={84} sx={{ borderRadius: 1 }} />
      </Stack>
    );
  }

  if (failed || rows.length === 0) {
    return <Alert severity="info">{t('yourCourse.programmeEmpty')}</Alert>;
  }

  return (
    <Stack spacing={1.5} role="radiogroup" aria-label={t('yourCourse.programmeQuestion')}>
      {rows.map((row) => {
        const selected = value === row.id;
        return (
          <Card
            key={row.id}
            variant="outlined"
            sx={{
              borderColor: selected ? 'primary.main' : 'divider',
              borderWidth: selected ? 2 : 1,
              bgcolor: selected ? 'primary.50' : 'background.paper',
              transition: 'border-color 150ms',
            }}
          >
            <CardActionArea
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
              sx={{ p: 2, minHeight: 84, display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'space-between' }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  {row.display_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.duration}
                  {row.schedule_summary ? ` · ${row.schedule_summary}` : ''}
                </Typography>
                <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5 }}>
                  {t('yourCourse.standardFee', { amount: formatRupees(Number(row.fee_amount)) })}
                </Typography>
              </Box>
              {selected && <CheckCircleOutlined color="primary" aria-hidden />}
            </CardActionArea>
          </Card>
        );
      })}
    </Stack>
  );
}
