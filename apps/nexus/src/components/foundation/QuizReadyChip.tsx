'use client';

import { Box, Typography, alpha, useTheme } from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CloseIcon from '@mui/icons-material/Close';

interface QuizReadyChipProps {
  visible: boolean;
  sectionTitle: string;
  onOpen: () => void;
  onDismiss?: () => void;
}

export default function QuizReadyChip({
  visible,
  sectionTitle,
  onOpen,
  onDismiss,
}: QuizReadyChipProps) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        position: 'absolute',
        bottom: { xs: 56, sm: 64 },
        left: '50%',
        transform: visible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(20px)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 300ms ease, transform 300ms ease',
        zIndex: 4,
        width: { xs: '85%', sm: 'auto' },
        maxWidth: 340,
      }}
    >
      <Box
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.25,
          borderRadius: 3,
          bgcolor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          cursor: 'pointer',
          minHeight: 48,
          transition: 'background-color 150ms ease',
          '&:hover': {
            bgcolor: 'rgba(0, 0, 0, 0.9)',
          },
        }}
      >
        <QuizOutlinedIcon
          sx={{
            fontSize: '1.2rem',
            color: theme.palette.primary.light,
            flexShrink: 0,
          }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              color: alpha('#fff', 0.7),
              fontSize: '0.65rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              display: 'block',
              lineHeight: 1.2,
            }}
          >
            Section Quiz Ready
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 500,
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {sectionTitle}
          </Typography>
        </Box>
        <ArrowForwardIcon
          sx={{
            fontSize: '1rem',
            color: alpha('#fff', 0.6),
            flexShrink: 0,
          }}
        />
        {onDismiss && (
          <Box
            component="span"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ml: 0.25,
              p: 0.5,
              borderRadius: '50%',
              cursor: 'pointer',
              flexShrink: 0,
              '&:hover': {
                bgcolor: alpha('#fff', 0.15),
              },
            }}
          >
            <CloseIcon sx={{ fontSize: '0.85rem', color: alpha('#fff', 0.5) }} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
