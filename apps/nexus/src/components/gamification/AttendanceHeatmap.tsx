'use client';

import { Box, Typography, alpha } from '@neram/ui';
import {
  neramTokens,
  neramFontFamilies,
  neramShadows,
} from '@neram/ui';

// ── Day labels ──

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// ── Helpers ──

function getMonthGrid(year: number, month: number) {
  // month is 0-indexed
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();

  // ISO weekday: Mon=0 ... Sun=6
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = new Array(startDow).fill(null);

  for (let d = 1; d <= totalDays; d++) {
    currentWeek.push(d);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  // Fill remaining days
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  return weeks;
}

function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

// ── Props ──

interface AttendanceHeatmapProps {
  heatmap: { date: string; attended: boolean }[];
  month?: string; // YYYY-MM format; defaults to current month
}

export default function AttendanceHeatmap({
  heatmap,
  month,
}: AttendanceHeatmapProps) {
  const now = new Date();
  let year: number, monthIdx: number;

  if (month) {
    const [y, m] = month.split('-').map(Number);
    year = y;
    monthIdx = m - 1;
  } else {
    year = now.getFullYear();
    monthIdx = now.getMonth();
  }

  const weeks = getMonthGrid(year, monthIdx);
  const today = now.toISOString().split('T')[0];

  // Build lookup map: "YYYY-MM-DD" -> attended boolean
  const attendanceMap = new Map<string, boolean>();
  for (const entry of heatmap) {
    attendanceMap.set(entry.date, entry.attended);
  }

  // Stats
  const totalRecorded = heatmap.length;
  const attendedCount = heatmap.filter((h) => h.attended).length;
  const pct = totalRecorded > 0 ? Math.round((attendedCount / totalRecorded) * 100) : 0;

  const cellSize = { xs: 28, sm: 32 };
  const gap = 3; // px

  function getCellColor(dayNum: number | null): string {
    if (dayNum === null) return 'transparent';

    const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const isFuture = dateStr > today;

    if (isFuture) return alpha(neramTokens.cream[100], 0.04);

    const status = attendanceMap.get(dateStr);
    if (status === true) return neramTokens.success;
    if (status === false) return alpha('#8B9DAF', 0.25);

    // No data for this date
    return alpha(neramTokens.cream[100], 0.06);
  }

  function getCellBorder(dayNum: number | null): string {
    if (dayNum === null) return 'none';
    const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    if (dateStr === today) return `2px solid ${neramTokens.gold[500]}`;
    return 'none';
  }

  return (
    <Box>
      {/* Month header */}
      <Typography
        sx={{
          fontFamily: neramFontFamilies.serif,
          fontSize: '1rem',
          fontWeight: 600,
          color: neramTokens.cream[100],
          mb: 1.5,
        }}
      >
        {formatMonthLabel(year, monthIdx)}
      </Typography>

      {/* Day-of-week headers */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: `${gap}px`,
          maxWidth: { xs: 7 * 28 + 6 * gap, sm: 7 * 32 + 6 * gap },
          mb: 0.5,
        }}
      >
        {DAY_LABELS.map((label, i) => (
          <Box
            key={i}
            sx={{
              width: cellSize,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              sx={{
                fontFamily: neramFontFamilies.mono,
                fontSize: '0.6rem',
                fontWeight: 600,
                color: alpha(neramTokens.cream[100], 0.4),
                textTransform: 'uppercase',
              }}
            >
              {label}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Calendar grid */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: `${gap}px`,
          maxWidth: { xs: 7 * 28 + 6 * gap, sm: 7 * 32 + 6 * gap },
        }}
      >
        {weeks.map((week, wIdx) => (
          <Box
            key={wIdx}
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: `${gap}px`,
            }}
          >
            {week.map((dayNum, dIdx) => (
              <Box
                key={dIdx}
                sx={{
                  width: cellSize,
                  height: cellSize,
                  borderRadius: 1,
                  bgcolor: getCellColor(dayNum),
                  border: getCellBorder(dayNum),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 150ms ease',
                }}
              >
                {dayNum !== null && (
                  <Typography
                    sx={{
                      fontFamily: neramFontFamilies.mono,
                      fontSize: '0.6rem',
                      fontWeight: 500,
                      color:
                        attendanceMap.get(
                          `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                        ) === true
                          ? '#fff'
                          : alpha(neramTokens.cream[100], 0.5),
                      lineHeight: 1,
                    }}
                  >
                    {dayNum}
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        ))}
      </Box>

      {/* Summary */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          mt: 1.5,
          px: 0.5,
        }}
      >
        {/* Legend */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: 0.5,
              bgcolor: neramTokens.success,
            }}
          />
          <Typography
            sx={{
              fontFamily: neramFontFamilies.body,
              fontSize: '0.65rem',
              color: alpha(neramTokens.cream[100], 0.5),
            }}
          >
            Attended
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: 0.5,
              bgcolor: alpha('#8B9DAF', 0.25),
            }}
          />
          <Typography
            sx={{
              fontFamily: neramFontFamilies.body,
              fontSize: '0.65rem',
              color: alpha(neramTokens.cream[100], 0.5),
            }}
          >
            Missed
          </Typography>
        </Box>

        <Box sx={{ flex: 1 }} />

        {/* Stats */}
        <Typography
          sx={{
            fontFamily: neramFontFamilies.mono,
            fontSize: '0.7rem',
            color: alpha(neramTokens.cream[100], 0.6),
          }}
        >
          {attendedCount}/{totalRecorded} classes ({pct}%)
        </Typography>
      </Box>
    </Box>
  );
}
