import { Box, Stack, Typography, Chip } from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import HistoryToggleOffIcon from '@mui/icons-material/HistoryToggleOff';
import type { Status } from '@/data/counselling-2026/schema';

const STATUS_STYLES: Record<
  Status,
  { bg: string; border: string; iconColor: string; chipLabel: string; chipColor: 'success' | 'warning' | 'default'; Icon: typeof EventAvailableIcon }
> = {
  live: {
    bg: '#E8F5E9',
    border: '#2E7D32',
    iconColor: '#2E7D32',
    chipLabel: 'Live',
    chipColor: 'success',
    Icon: EventAvailableIcon,
  },
  tbd: {
    bg: '#FFF8E1',
    border: '#F57C00',
    iconColor: '#F57C00',
    chipLabel: '2026 Schedule TBD',
    chipColor: 'warning',
    Icon: HourglassTopIcon,
  },
  'coming-soon': {
    bg: '#F5F5F5',
    border: '#9E9E9E',
    iconColor: '#616161',
    chipLabel: 'Coming Soon',
    chipColor: 'default',
    Icon: HistoryToggleOffIcon,
  },
};

export interface CounsellingStatusBannerProps {
  status: Status;
  label: string;
  detail?: string;
  expectedDate?: string;
  lastVerified: string;
  cycleSourceNote?: string;
}

export default function CounsellingStatusBanner({
  status,
  label,
  detail,
  expectedDate,
  lastVerified,
  cycleSourceNote,
}: CounsellingStatusBannerProps) {
  const style = STATUS_STYLES[status];
  const Icon = style.Icon;

  return (
    <Box
      sx={{
        bgcolor: style.bg,
        border: '1px solid',
        borderColor: style.border,
        borderRadius: 2,
        p: { xs: 2, md: 2.5 },
        mb: 3,
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flex: 1 }}>
          <Icon sx={{ color: style.iconColor, fontSize: 28 }} />
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
              <Typography variant="subtitle1" fontWeight={700}>
                {label}
              </Typography>
              <Chip label={style.chipLabel} size="small" color={style.chipColor} />
            </Stack>
            {detail && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {detail}
              </Typography>
            )}
            {expectedDate && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                Expected: {expectedDate}
              </Typography>
            )}
          </Box>
        </Stack>

        <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 600 }}>
            Last verified
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {new Date(lastVerified).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </Typography>
        </Box>
      </Stack>

      {cycleSourceNote && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: 'block',
            mt: 1.5,
            pt: 1.5,
            borderTop: '1px dashed',
            borderColor: style.border,
            fontStyle: 'italic',
          }}
        >
          Note: {cycleSourceNote}
        </Typography>
      )}
    </Box>
  );
}
