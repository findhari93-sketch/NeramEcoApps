'use client';

import { IconButton, Tooltip, alpha } from '@neram/ui';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';

/** Copy-email icon button shared by every view mode. */
export default function CopyEmailButton({
  email,
  title,
  onCopy,
}: {
  email: string;
  title: string;
  onCopy: (e: React.MouseEvent, email: string) => void;
}) {
  return (
    <Tooltip title={title} arrow>
      <IconButton
        size="small"
        aria-label="Copy email"
        onClick={(e) => onCopy(e, email)}
        sx={{
          flexShrink: 0,
          width: 40,
          height: 40,
          color: 'primary.main',
          bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
          '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.14) },
        }}
      >
        <ContentCopyOutlinedIcon sx={{ fontSize: '1rem' }} />
      </IconButton>
    </Tooltip>
  );
}
