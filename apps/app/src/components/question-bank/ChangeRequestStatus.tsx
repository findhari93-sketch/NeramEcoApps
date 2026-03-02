'use client';

import { Chip, Stack, Tooltip, Typography, Box } from '@neram/ui';
import type { QuestionChangeRequest } from '@neram/database';

interface ChangeRequestStatusProps {
  requests: QuestionChangeRequest[];
}

export default function ChangeRequestStatus({ requests }: ChangeRequestStatusProps) {
  if (!requests || requests.length === 0) return null;

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1, mb: 1 }}>
      {requests.map((req) => {
        if (req.status === 'pending') {
          if (req.request_type === 'edit') {
            return (
              <Chip
                key={req.id}
                label="Edit Pending"
                size="small"
                color="warning"
                variant="filled"
                sx={{ fontWeight: 600, fontSize: '0.75rem' }}
              />
            );
          }
          return (
            <Chip
              key={req.id}
              label="Delete Pending"
              size="small"
              color="error"
              variant="filled"
              sx={{ fontWeight: 600, fontSize: '0.75rem' }}
            />
          );
        }

        if (req.status === 'rejected') {
          const label = req.request_type === 'edit' ? 'Edit Rejected' : 'Delete Rejected';
          return (
            <Tooltip
              key={req.id}
              title={
                req.rejection_reason ? (
                  <Box>
                    <Typography variant="caption" fontWeight={600}>Reason:</Typography>
                    <Typography variant="caption" display="block">{req.rejection_reason}</Typography>
                  </Box>
                ) : ''
              }
              arrow
            >
              <Chip
                label={req.rejection_reason ? `${label}: ${req.rejection_reason}` : label}
                size="small"
                color="error"
                variant="outlined"
                sx={{
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  maxWidth: 300,
                  '& .MuiChip-label': {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  },
                }}
              />
            </Tooltip>
          );
        }

        if (req.status === 'approved') {
          const label = req.request_type === 'edit' ? 'Edit Applied' : 'Delete Approved';
          return (
            <Chip
              key={req.id}
              label={label}
              size="small"
              color="success"
              variant="filled"
              sx={{ fontWeight: 600, fontSize: '0.75rem' }}
            />
          );
        }

        return null;
      })}
    </Stack>
  );
}
