import { Box, Typography, Stack, Chip, Paper } from '@mui/material';
import EventIcon from '@mui/icons-material/Event';
import type { ImportantDate } from '@/data/counselling-2026/schema';

export interface CounsellingDateTrackerProps {
  dates: ImportantDate[];
}

const STATUS_CHIP: Record<NonNullable<ImportantDate['status']>, { label: string; color: 'success' | 'info' | 'warning' }> = {
  confirmed: { label: 'Confirmed', color: 'success' },
  expected: { label: 'Expected', color: 'info' },
  tbd: { label: 'TBD', color: 'warning' },
};

function getDaysUntil(iso?: string): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  return diff;
}

export default function CounsellingDateTracker({ dates }: CounsellingDateTrackerProps) {
  if (!dates || dates.length === 0) return null;

  // Find next upcoming confirmed/expected date for the highlight strip.
  const next = dates
    .filter((d) => d.dateIso && d.status !== 'tbd')
    .map((d) => ({ d, days: getDaysUntil(d.dateIso) ?? Number.POSITIVE_INFINITY }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days)[0];

  return (
    <Box>
      {next && next.days <= 90 && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2.5,
            borderRadius: 2,
            bgcolor: '#E3F2FD',
            border: '1px solid',
            borderColor: '#1565C0',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <EventIcon sx={{ color: '#1565C0', fontSize: 28 }} />
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>
              Next milestone: {next.d.label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {next.d.dateDisplay} ({next.days === 0 ? 'today' : `${next.days} day${next.days === 1 ? '' : 's'} away`})
            </Typography>
          </Box>
        </Paper>
      )}

      {/* Desktop: table. Mobile: card stack. */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Box sx={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
                <th style={{ padding: '12px 8px', fontWeight: 600 }}>Milestone</th>
                <th style={{ padding: '12px 8px', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '12px 8px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 8px', fontWeight: 600 }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {dates.map((d, idx) => {
                const chip = d.status ? STATUS_CHIP[d.status] : null;
                return (
                  <tr key={`${d.label}-${idx}`} style={{ borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '10px 8px', fontWeight: 500 }}>{d.label}</td>
                    <td style={{ padding: '10px 8px' }}>{d.dateDisplay}</td>
                    <td style={{ padding: '10px 8px' }}>
                      {chip ? <Chip label={chip.label} size="small" color={chip.color} /> : null}
                    </td>
                    <td style={{ padding: '10px 8px', color: '#666' }}>{d.note || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Box>
      </Box>

      <Stack spacing={1.25} sx={{ display: { xs: 'flex', md: 'none' } }}>
        {dates.map((d, idx) => {
          const chip = d.status ? STATUS_CHIP[d.status] : null;
          return (
            <Paper
              key={`${d.label}-mob-${idx}`}
              elevation={0}
              sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'grey.200' }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {d.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {d.dateDisplay}
                  </Typography>
                  {d.note && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                      {d.note}
                    </Typography>
                  )}
                </Box>
                {chip && <Chip label={chip.label} size="small" color={chip.color} />}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}
