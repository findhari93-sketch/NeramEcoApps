'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Drawer,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SortIcon from '@mui/icons-material/Sort';
import CheckIcon from '@mui/icons-material/Check';

/**
 * How a list of students is ordered. A menu on a pointer screen, a bottom sheet
 * on a phone. Generalised from StudentSortMenu so every list shares it.
 *
 * On a phone the button says only "Sort", because the full label does not fit
 * beside search at 375px. The accessible name always carries the current order,
 * and the sheet ticks it.
 */
export default function ListSortMenu<K extends string>({
  value,
  options,
  onChange,
  title = 'Sort students',
}: {
  value: K;
  options: ReadonlyArray<{ key: K; label: string }>;
  onChange: (key: K) => void;
  title?: string;
}) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = !!anchor;
  const current = options.find((o) => o.key === value)?.label ?? '';

  const items = options.map((o) => (
    <MenuItem
      key={o.key}
      selected={o.key === value}
      onClick={() => {
        setAnchor(null);
        onChange(o.key);
      }}
      sx={{ minHeight: 48 }}
    >
      <ListItemIcon sx={{ minWidth: 32 }}>{o.key === value ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
      <ListItemText primary={o.label} />
    </MenuItem>
  ));

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<SortIcon />}
        aria-label={`Sort: ${current}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => setAnchor(e.currentTarget)}
        data-testid="list-sort-button"
        sx={{
          minHeight: 48,
          textTransform: 'none',
          fontWeight: 700,
          borderRadius: 2,
          bgcolor: 'background.paper',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          {current}
        </Box>
        <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
          Sort
        </Box>
      </Button>
      {isPhone ? (
        <Drawer
          anchor="bottom"
          open={open}
          onClose={() => setAnchor(null)}
          PaperProps={{
            sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: 'calc(8px + env(safe-area-inset-bottom))' },
          }}
        >
          <Typography sx={{ px: 2, pt: 2, pb: 1, fontWeight: 800 }}>{title}</Typography>
          <Box role="menu" aria-label={title}>
            {items}
          </Box>
        </Drawer>
      ) : (
        <Menu anchorEl={anchor} open={open} onClose={() => setAnchor(null)}>
          {items}
        </Menu>
      )}
    </>
  );
}
