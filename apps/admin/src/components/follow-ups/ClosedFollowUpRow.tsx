'use client';

import Link from 'next/link';
import { Box, Paper, Typography, Button, CircularProgress } from '@neram/ui';
import { FOLLOW_UP_CLOSE_REASON_LABELS, type ClosedFollowUp } from '@neram/database';
import UndoIcon from '@mui/icons-material/Undo';
import AutoDeleteOutlinedIcon from '@mui/icons-material/AutoDeleteOutlined';
import { formatIstDate } from '@/lib/ops-format';
import { followUpKindLabel, followUpSourceLabel } from '@/lib/follow-up-source';
import { StatusChip, FOCUS_RING, TARGET_44 } from '@/components/ops/OpsUi';
import PersonAvatar from '@/components/person/PersonAvatar';

/** One follow-up the nightly job closed: who, what they asked, why it closed, and Reopen. */
export default function ClosedFollowUpRow({
  item,
  reopening,
  onReopen,
}: {
  item: ClosedFollowUp;
  reopening: boolean;
  onReopen: () => void;
}) {
  const name = item.person_name || item.person_phone || 'Unnamed caller';
  const source = followUpSourceLabel({ query_type: item.query_type, source: item.source });
  const reason = item.closed_reason ? FOLLOW_UP_CLOSE_REASON_LABELS[item.closed_reason] : 'Closed by system';

  return (
    <Paper
      component="li"
      variant="outlined"
      sx={{
        listStyle: 'none',
        borderRadius: 2,
        p: 1.5,
        display: 'grid',
        gap: { xs: 1.25, md: 2 },
        gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1.6fr) minmax(0,1.6fr) minmax(0,1.6fr) 136px' },
        alignItems: 'start',
      }}
    >
      <Box sx={{ minWidth: 0, display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
        <PersonAvatar userId={item.user_id} name={name} size={36} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          {item.user_id ? (
            <Link href={`/crm/${item.user_id}`}>
              <Typography
                component="span"
                variant="body2"
                fontWeight={700}
                sx={{ color: 'primary.main', textDecoration: 'underline', textUnderlineOffset: 2, overflowWrap: 'anywhere' }}
              >
                {name}
              </Typography>
            </Link>
          ) : (
            <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
              {name}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {item.person_phone || 'No phone on file'}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600}>
          {followUpKindLabel(item.query_type)}
        </Typography>
        {source && (
          <Typography variant="body2" color="text.secondary">
            From: {source}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          Asked on {formatIstDate(item.created_at)}
        </Typography>
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ mb: 0.5 }}>
          <StatusChip icon={AutoDeleteOutlinedIcon} label={reason} />
        </Box>
        <Typography variant="caption" color="text.secondary">
          Closed on {formatIstDate(item.closed_at)}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex' }}>
        <Button
          variant="outlined"
          onClick={onReopen}
          disabled={reopening}
          startIcon={reopening ? <CircularProgress size={16} color="inherit" /> : <UndoIcon />}
          aria-label={`Reopen the follow-up for ${name}`}
          sx={{ ...TARGET_44, ...FOCUS_RING, textTransform: 'none', flex: 1 }}
        >
          {reopening ? 'Reopening' : 'Reopen'}
        </Button>
      </Box>
    </Paper>
  );
}
