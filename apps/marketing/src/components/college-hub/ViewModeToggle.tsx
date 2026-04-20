'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewStreamIcon from '@mui/icons-material/ViewStream';
import type { ViewMode } from './view-mode';

const MODES: { value: ViewMode; icon: React.ReactNode; label: string }[] = [
  { value: 'detailed', icon: <ViewStreamIcon fontSize="small" />, label: 'Detailed' },
  { value: 'grid', icon: <ViewModuleIcon fontSize="small" />, label: 'Grid' },
  { value: 'list', icon: <ViewListIcon fontSize="small" />, label: 'List' },
];

interface ViewModeToggleProps {
  value: ViewMode;
}

export default function ViewModeToggle({ value }: ViewModeToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (_: React.MouseEvent<HTMLElement>, next: ViewMode | null) => {
    if (!next || next === value) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'detailed') {
      params.delete('view');
    } else {
      params.set('view', next);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      onChange={handleChange}
      size="small"
      aria-label="View mode"
      sx={{
        '& .MuiToggleButton-root': {
          px: 1.25,
          py: 0.5,
          border: '1px solid',
          borderColor: 'divider',
          color: 'text.secondary',
          '&.Mui-selected': {
            bgcolor: 'primary.main',
            color: 'white',
            '&:hover': { bgcolor: 'primary.dark' },
          },
        },
      }}
    >
      {MODES.map((m) => (
        <ToggleButton key={m.value} value={m.value} aria-label={m.label}>
          <Tooltip title={m.label} placement="top">
            <span style={{ display: 'inline-flex' }}>{m.icon}</span>
          </Tooltip>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

