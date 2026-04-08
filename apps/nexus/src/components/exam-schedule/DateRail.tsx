'use client';

import { useEffect, useRef } from 'react';
import { Box, Chip, Typography, alpha, useTheme } from '@neram/ui';
import type { DateRailItem } from '@/types/exam-schedule';

interface DateRailProps {
  items: DateRailItem[];
  activeFriday: string | null; // currently selected week's Friday (or first date of week)
  onSelect: (date: string) => void;
}

function formatRailDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export default function DateRail({ items, activeFriday, onSelect }: DateRailProps) {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active chip into view
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const chip = activeRef.current;
      const chipLeft = chip.offsetLeft;
      const chipWidth = chip.offsetWidth;
      const containerWidth = container.offsetWidth;
      const scrollLeft = chipLeft - containerWidth / 2 + chipWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
    }
  }, [activeFriday]);

  if (items.length === 0) return null;

  return (
    <Box
      ref={scrollRef}
      sx={{
        display: 'flex',
        gap: 0.75,
        overflowX: 'auto',
        py: 0.5,
        px: 0.25,
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {items.map((item) => {
        const isActive = activeFriday === item.date ||
          // Saturday is "active" if its Friday is selected
          (item.day === 'Sat' && activeFriday && Math.abs(
            new Date(item.date + 'T00:00:00').getTime() -
            new Date(activeFriday + 'T00:00:00').getTime()
          ) <= 86400000);

        return (
          <Box
            key={item.date}
            ref={isActive && item.day === 'Fri' ? activeRef : undefined}
            sx={{ flexShrink: 0 }}
          >
            <Chip
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography
                    component="span"
                    sx={{ fontSize: '0.75rem', fontWeight: isActive ? 700 : 500, lineHeight: 1 }}
                  >
                    {formatRailDate(item.date)}
                  </Typography>
                  {item.studentCount > 0 && (
                    <Box
                      sx={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        bgcolor: isActive
                          ? alpha(theme.palette.primary.contrastText, 0.25)
                          : alpha(theme.palette.primary.main, 0.12),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Typography
                        component="span"
                        sx={{
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          color: isActive ? theme.palette.primary.contrastText : theme.palette.primary.main,
                          lineHeight: 1,
                        }}
                      >
                        {item.studentCount}
                      </Typography>
                    </Box>
                  )}
                </Box>
              }
              onClick={() => onSelect(item.date)}
              sx={{
                height: 30,
                opacity: item.isPast && !isActive ? 0.45 : 1,
                bgcolor: isActive ? 'primary.main' : alpha(theme.palette.primary.main, 0.06),
                color: isActive ? 'primary.contrastText' : 'text.primary',
                border: `1px solid ${isActive ? 'transparent' : alpha(theme.palette.primary.main, 0.15)}`,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                '&:hover': {
                  bgcolor: isActive
                    ? 'primary.dark'
                    : alpha(theme.palette.primary.main, 0.12),
                },
                '& .MuiChip-label': { px: 1.25, py: 0 },
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
}
