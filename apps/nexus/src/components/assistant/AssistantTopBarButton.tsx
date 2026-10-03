'use client';

import { IconButton, Tooltip } from '@neram/ui';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { useAssistantOptional } from './AssistantProvider';

/** Desktop only: on phones the launcher owns the corner. Null outside the student shell. */
export default function AssistantTopBarButton() {
  const a = useAssistantOptional();
  if (!a || !a.enabled) return null;
  return (
    <Tooltip title="Neram Assistant">
      <IconButton aria-label="Open Neram Assistant" onClick={() => a.openPanel()} size="small" sx={{ color: 'inherit', mr: 0.5, display: { xs: 'none', md: 'inline-flex' }, width: 44, height: 44 }}>
        <AutoAwesomeOutlinedIcon />
      </IconButton>
    </Tooltip>
  );
}
