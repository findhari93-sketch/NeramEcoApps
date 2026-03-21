'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Divider,
  alpha,
  useTheme,
} from '@neram/ui';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ExamDateManager from './ExamDateManager';
import BroadcastDialog from './BroadcastDialog';

export default function ExamTrackingDashboard() {
  const theme = useTheme();
  const { activeClassroom } = useNexusAuthContext();
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  if (!activeClassroom) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">
          Select a classroom to manage exam tracking.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Section 1: Exam Date Manager */}
      <ExamDateManager />

      <Divider />

      {/* Section 2: Broadcast Actions */}
      <Box>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
          Broadcast to Students
        </Typography>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2, sm: 3 },
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 2,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <CampaignOutlinedIcon sx={{ color: 'primary.main', fontSize: '1.3rem' }} />
              <Typography variant="body2" fontWeight={600}>
                Results Released Notification
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Notify all students when JEE or NATA results/scorecards are released.
              Students will be prompted to upload their scorecards.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<CampaignOutlinedIcon />}
            onClick={() => setBroadcastOpen(true)}
            sx={{
              textTransform: 'none',
              minHeight: 48,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Send Broadcast
          </Button>
        </Paper>
      </Box>

      <Divider />

      {/* Section 3: Student Exam Status (Placeholder) */}
      <Box>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
          Student Exam Overview
        </Typography>
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 3, sm: 4 },
            textAlign: 'center',
            bgcolor: alpha(theme.palette.info.main, 0.04),
          }}
        >
          <TrackChangesOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary" fontWeight={500}>
            Student exam tracking overview coming soon
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
            A detailed matrix of each student&apos;s registration status, attempt progress,
            and scorecard submissions will appear here.
          </Typography>
        </Paper>
      </Box>

      <BroadcastDialog
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        classroomId={activeClassroom.id}
      />
    </Box>
  );
}
