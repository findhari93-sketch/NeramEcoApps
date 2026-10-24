'use client';

/** Small shared pieces for the support inbox. Colours come from the theme palette. */
import { Box, Chip } from '@neram/ui';
import type { SupportTicketRequesterSegment } from '@neram/database';
import { ticketStatusMeta } from '@neram/database/support-ticket-status';

/** 36px chip, 44px hit area: the ::after stretches the click target 4px above and below. */
export const CHIP_SX = { height: 36, fontWeight: 500, position: 'relative', overflow: 'visible', '&::after': { content: '""', position: 'absolute', inset: '-4px 0' } } as const;

/** Amber with readable text: dark on light amber, amber border. */
export const WARNING_CHIP_SX = { bgcolor: 'warning.light', color: 'text.primary', border: 1, borderColor: 'warning.main' } as const;

const SEGMENT: Record<SupportTicketRequesterSegment, { label: string; color: 'success' | 'info' | 'default' | 'secondary' }> = {
  enrolled: { label: 'Enrolled', color: 'success' },
  lead: { label: 'Lead', color: 'info' },
  guest: { label: 'Guest', color: 'default' },
  staff: { label: 'Staff', color: 'secondary' },
};

/** Enrolled / Lead / Guest / Staff. Legacy rows with no segment show Lead or Guest from the account. */
export function SegmentChip({ segment, hasAccount }: { segment: SupportTicketRequesterSegment | null; hasAccount: boolean }) {
  const key: SupportTicketRequesterSegment | null = segment ?? (hasAccount ? null : 'guest');
  if (!key) return null;
  const s = SEGMENT[key];
  return <Chip size="small" variant="outlined" color={s.color} label={s.label} sx={{ height: 20, fontSize: 11, fontWeight: 600 }} />;
}

export function TicketStatusChip({ status }: { status: string }) {
  const meta = ticketStatusMeta(status);
  // The theme's warning.main (#EF6C00) is about 3:1 against white text, under the
  // 4.5:1 floor. Amber statuses use dark text on the light amber instead.
  if (meta.color === 'warning') {
    return <Chip size="small" label={meta.staffLabel} sx={{ ...WARNING_CHIP_SX, fontWeight: 700, height: 26 }} />;
  }
  return (
    <Chip
      size="small"
      color={meta.color}
      variant={status === 'closed' || status === 'resolved' ? 'outlined' : 'filled'}
      label={meta.staffLabel}
      sx={{ fontWeight: 700, height: 26 }}
    />
  );
}

/** A labelled section inside the detail pane. */
export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Box component="section" aria-label={title} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50', minHeight: 44 }}>
        <Box component="h3" sx={{ m: 0, fontSize: 13, fontWeight: 700, color: 'text.primary' }}>
          {title}
        </Box>
        {action}
      </Box>
      <Box sx={{ p: 2 }}>{children}</Box>
    </Box>
  );
}
