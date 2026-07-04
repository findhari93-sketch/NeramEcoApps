'use client';

/**
 * Class Day agenda: tap a row to cycle pending -> covered -> partial ->
 * skipped. Unplanned items carry an amber marker. The dashed row at the end
 * adds an unplanned item mid-class.
 */
import { Box, Typography, Stack, alpha } from '@neram/ui';
import type { NexusPlanDayItem, NexusPlanDayItemStatus } from '@neram/database';

const NEXT: Record<NexusPlanDayItemStatus, NexusPlanDayItemStatus> = {
  pending: 'covered',
  covered: 'partial',
  partial: 'skipped',
  skipped: 'pending',
};

const META: Record<NexusPlanDayItemStatus, { icon: string; bg: string; color: string; tag: string }> = {
  pending: { icon: '', bg: 'transparent', color: '#8B95A1', tag: 'PENDING' },
  covered: { icon: '✓', bg: 'rgba(46,125,50,0.12)', color: '#1B5E20', tag: 'COVERED' },
  partial: { icon: '◐', bg: 'rgba(249,168,37,0.18)', color: '#8D5A00', tag: 'PARTIAL' },
  skipped: { icon: '✕', bg: 'rgba(198,40,40,0.1)', color: '#C62828', tag: 'SKIPPED' },
};

export default function AgendaList({
  items,
  onSetStatus,
  onAddUnplanned,
  disabled,
}: {
  items: NexusPlanDayItem[];
  onSetStatus: (item: NexusPlanDayItem, status: NexusPlanDayItemStatus) => void;
  onAddUnplanned: () => void;
  disabled?: boolean;
}) {
  return (
    <Stack spacing={1}>
      {items.map((item) => {
        const meta = META[item.status];
        return (
          <Box
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => !disabled && onSetStatus(item, NEXT[item.status])}
            onKeyDown={(e) => e.key === 'Enter' && !disabled && onSetStatus(item, NEXT[item.status])}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 1.75,
              py: 1.5,
              minHeight: 52,
              borderRadius: 3,
              bgcolor: 'background.paper',
              border: item.status === 'partial' ? '1.5px solid rgba(249,168,37,0.5)' : '1px solid',
              borderColor: item.status === 'partial' ? 'rgba(249,168,37,0.5)' : 'divider',
              borderLeft: item.is_unplanned ? '3px solid #F9A825' : undefined,
              cursor: disabled ? 'default' : 'pointer',
              '&:hover': disabled ? {} : { borderColor: alpha('#7C3AED', 0.4) },
            }}
          >
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.82rem',
                fontWeight: 800,
                flexShrink: 0,
                bgcolor: meta.bg,
                color: meta.color,
                border: item.status === 'pending' ? '1.5px solid' : 'none',
                borderColor: 'divider',
                boxSizing: 'border-box',
              }}
            >
              {meta.icon}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  lineHeight: 1.35,
                  textDecoration: item.status === 'covered' && !item.is_unplanned ? 'line-through' : 'none',
                  opacity: item.status === 'covered' || item.status === 'skipped' ? 0.6 : 1,
                }}
              >
                {item.title}
              </Typography>
              {item.is_unplanned && (
                <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, color: '#8D5A00', mt: 0.25 }}>
                  ＋ UNPLANNED, added mid-class
                </Typography>
              )}
            </Box>
            <Typography sx={{ fontSize: '0.66rem', fontWeight: 800, color: meta.color === '#8B95A1' ? 'text.disabled' : meta.color, flexShrink: 0 }}>
              {meta.tag}
            </Typography>
          </Box>
        );
      })}
      <Box
        role="button"
        tabIndex={0}
        onClick={() => !disabled && onAddUnplanned()}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && onAddUnplanned()}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          minHeight: 48,
          borderRadius: 3,
          border: '1.5px dashed',
          borderColor: 'divider',
          color: 'text.secondary',
          fontSize: '0.85rem',
          fontWeight: 700,
          cursor: disabled ? 'default' : 'pointer',
          '&:hover': disabled ? {} : { borderColor: alpha('#7C3AED', 0.45), color: 'primary.main' },
        }}
      >
        ＋ Add unplanned topic
      </Box>
    </Stack>
  );
}
