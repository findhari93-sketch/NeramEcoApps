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
import { ROSTER_SORTS, ROSTER_SORT_LABEL, type RosterSort } from '@/lib/student-roster-view';

/**
 * How the roster is ordered. A menu on a pointer screen, a sheet on a phone.
 *
 * On a phone the button says only "Sort": the full label beside Filters and the
 * layout switch does not fit 375px. The accessible name always carries the
 * current order, and the sheet ticks it.
 */
export default function StudentSortMenu({
  value,
  onChange,
}: {
  value: RosterSort;
  onChange: (sort: RosterSort) => void;
}) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = !!anchor;

  const options = ROSTER_SORTS.map((sort) => (
    <MenuItem
      key={sort}
      selected={sort === value}
      onClick={() => {
        setAnchor(null);
        onChange(sort);
      }}
      sx={{ minHeight: 48 }}
    >
      <ListItemIcon sx={{ minWidth: 32 }}>{sort === value ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
      <ListItemText primary={ROSTER_SORT_LABEL[sort]} />
    </MenuItem>
  ));

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<SortIcon />}
        aria-label={`Sort: ${ROSTER_SORT_LABEL[value]}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => setAnchor(e.currentTarget)}
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
          {ROSTER_SORT_LABEL[value]}
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
          <Typography sx={{ px: 2, pt: 2, pb: 1, fontWeight: 800 }}>Sort students</Typography>
          <Box role="menu" aria-label="Sort students">
            {options}
          </Box>
        </Drawer>
      ) : (
        <Menu anchorEl={anchor} open={open} onClose={() => setAnchor(null)}>
          {options}
        </Menu>
      )}
    </>
  );
}
