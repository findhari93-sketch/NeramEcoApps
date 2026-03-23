'use client';

import { useState } from 'react';
import {
  Box,
  Avatar,
  Typography,
  Stack,
  Chip,
  Collapse,
  IconButton,
  alpha,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import StarIcon from '@mui/icons-material/Star';
import type { ExamRecallThreadDetail, ExamRecallAuthorRole, ExamRecallClarity } from '@neram/database';
import VouchButton from './VouchButton';

type VersionItem = ExamRecallThreadDetail['versions'][number];

interface VersionTimelineProps {
  versions: ExamRecallThreadDetail['versions'];
  onVouch?: (versionId: string) => void;
}

const ROLE_LABELS: Record<ExamRecallAuthorRole, string> = {
  student: 'Student',
  teacher: 'Teacher',
  admin: 'Admin',
  staff: 'Staff',
};

const ROLE_COLORS: Record<ExamRecallAuthorRole, string> = {
  student: '#1976d2',
  teacher: '#7b1fa2',
  admin: '#d32f2f',
  staff: '#ed6c02',
};

const CLARITY_CONFIG: Record<ExamRecallClarity, { label: string; color: string }> = {
  clear: { label: 'Clear', color: '#2e7d32' },
  partial: { label: 'Partial', color: '#ed6c02' },
  vague: { label: 'Vague', color: '#d32f2f' },
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return new Date(dateStr).toLocaleDateString();
}

function VersionCard({
  version,
  isMostVouched,
  onVouch,
}: {
  version: VersionItem;
  isMostVouched: boolean;
  onVouch?: (versionId: string) => void;
}) {
  const theme = useTheme();
  const [showWorking, setShowWorking] = useState(false);
  const clarityInfo = CLARITY_CONFIG[version.clarity];

  return (
    <Box
      sx={{
        p: { xs: 1.5, md: 2 },
        borderRadius: 2,
        border: '1px solid',
        borderColor: isMostVouched ? 'warning.300' : 'grey.200',
        bgcolor: isMostVouched ? alpha(theme.palette.warning.main, 0.04) : 'background.paper',
        position: 'relative',
      }}
    >
      {/* Most vouched highlight */}
      {isMostVouched && (
        <Chip
          icon={<StarIcon sx={{ fontSize: '0.85rem' }} />}
          label="MOST VOUCHED"
          size="small"
          sx={{
            position: 'absolute',
            top: -10,
            right: 12,
            bgcolor: 'warning.main',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.65rem',
            height: 20,
          }}
        />
      )}

      {/* Header: author info */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Chip
          label={`v${version.version_number}`}
          size="small"
          sx={{
            bgcolor: 'grey.800',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.7rem',
            height: 22,
            minWidth: 32,
          }}
        />
        <Avatar
          src={version.author.avatar_url || undefined}
          alt={version.author.name || 'User'}
          sx={{ width: 28, height: 28, fontSize: '0.75rem' }}
        >
          {version.author.name?.[0] || '?'}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="body2" fontWeight={600} noWrap>
              {version.author.name || 'Unknown'}
            </Typography>
            <Chip
              label={ROLE_LABELS[version.author_role]}
              size="small"
              sx={{
                bgcolor: alpha(ROLE_COLORS[version.author_role], 0.12),
                color: ROLE_COLORS[version.author_role],
                fontWeight: 600,
                fontSize: '0.6rem',
                height: 18,
              }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {formatRelativeTime(version.created_at)}
          </Typography>
        </Box>
      </Stack>

      {/* Recall text */}
      {version.recall_text && (
        <Typography variant="body2" sx={{ mb: 1, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {version.recall_text}
        </Typography>
      )}

      {/* Options (MCQ) */}
      {version.options && version.options.length > 0 && (
        <Box sx={{ mb: 1, pl: 1 }}>
          {version.options.map((opt, i) => (
            <Typography key={opt.id} variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
              <strong>{String.fromCharCode(65 + i)}.</strong> {opt.text}
            </Typography>
          ))}
        </Box>
      )}

      {/* My answer */}
      {version.my_answer && (
        <Box sx={{ mb: 1, p: 1, borderRadius: 1, bgcolor: 'grey.50' }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            My Answer:
          </Typography>
          <Typography variant="body2">{version.my_answer}</Typography>
        </Box>
      )}

      {/* My working (collapsible) */}
      {version.my_working && (
        <Box sx={{ mb: 1 }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.5}
            onClick={() => setShowWorking(!showWorking)}
            sx={{ cursor: 'pointer' }}
          >
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              My Working
            </Typography>
            <IconButton size="small" sx={{ p: 0 }}>
              {showWorking ? (
                <ExpandLessIcon sx={{ fontSize: '1rem' }} />
              ) : (
                <ExpandMoreIcon sx={{ fontSize: '1rem' }} />
              )}
            </IconButton>
          </Stack>
          <Collapse in={showWorking}>
            <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'grey.50', mt: 0.5 }}>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {version.my_working}
              </Typography>
            </Box>
          </Collapse>
        </Box>
      )}

      {/* Image gallery */}
      {version.recall_image_urls && version.recall_image_urls.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 1, overflowX: 'auto' }}>
          {version.recall_image_urls.map((url, i) => (
            <Box
              key={i}
              component="img"
              src={url}
              alt={`Recall image ${i + 1}`}
              sx={{
                width: { xs: 80, md: 120 },
                height: { xs: 80, md: 120 },
                objectFit: 'cover',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'grey.200',
                flexShrink: 0,
              }}
            />
          ))}
        </Stack>
      )}

      {/* Bottom: clarity + vouch */}
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Chip
          label={clarityInfo.label}
          size="small"
          sx={{
            bgcolor: alpha(clarityInfo.color, 0.1),
            color: clarityInfo.color,
            fontWeight: 600,
            fontSize: '0.65rem',
            height: 20,
          }}
        />
        {onVouch && (
          <VouchButton
            vouched={version.user_has_vouched}
            count={version.vouch_count}
            onClick={() => onVouch(version.id)}
          />
        )}
      </Stack>
    </Box>
  );
}

export default function VersionTimeline({ versions, onVouch }: VersionTimelineProps) {
  // Find most vouched version
  const maxVouches = Math.max(...versions.map((v) => v.vouch_count), 0);
  const mostVouchedId = maxVouches > 0
    ? versions.find((v) => v.vouch_count === maxVouches)?.id
    : null;

  // Sort by version_number ascending (chronological)
  const sorted = [...versions].sort((a, b) => a.version_number - b.version_number);

  return (
    <Stack spacing={0}>
      {sorted.map((version, index) => (
        <Box key={version.id} sx={{ position: 'relative' }}>
          {/* Timeline connector line */}
          {index < sorted.length - 1 && (
            <Box
              sx={{
                position: 'absolute',
                left: 20,
                top: '100%',
                width: 2,
                height: 16,
                bgcolor: 'grey.300',
                zIndex: 0,
              }}
            />
          )}
          <Box sx={{ mb: index < sorted.length - 1 ? 2 : 0 }}>
            <VersionCard
              version={version}
              isMostVouched={version.id === mostVouchedId}
              onVouch={onVouch}
            />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
