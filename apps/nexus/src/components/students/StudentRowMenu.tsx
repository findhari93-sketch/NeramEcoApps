'use client';

import { useState } from 'react';
import {
  Box,
  Divider,
  Drawer,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import MoreVertIcon from '@mui/icons-material/MoreVert';

export interface RowMenuItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'warning' | 'error';
  dividerBefore?: boolean;
}

const TONE_COLOR = { default: 'text.primary', warning: 'warning.dark', error: 'error.main' } as const;

/**
 * The actions for one student, behind a single 48px button on the row.
 *
 * A menu on a pointer screen, a bottom sheet on a phone, so every action stays in
 * the thumb zone. Clicks and key presses are stopped here: the row underneath is a
 * button that opens the profile, and choosing "Mark dormant" must not also
 * navigate away. React bubbles portal events through this tree too, which is why
 * stopping them on the wrapper covers the menu items as well.
 */
export default function StudentRowMenu({ title, items }: { title: string; items: RowMenuItem[] }) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (!items.length) return null;

  const open = !!anchor;
  const close = () => setAnchor(null);

  const entries = items.flatMap((item) => [
    ...(item.dividerBefore ? [<Divider key={`${item.key}-divider`} />] : []),
    <MenuItem
      key={item.key}
      onClick={() => {
        close();
        item.onClick();
      }}
      sx={{ minHeight: 48, color: TONE_COLOR[item.tone ?? 'default'] }}
    >
      <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>{item.icon}</ListItemIcon>
      <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600 }} />
    </MenuItem>,
  ]);

  return (
    <Box
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      sx={{ display: 'flex', flexShrink: 0 }}
    >
      <IconButton
        aria-label={`Actions for ${title}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ width: 48, height: 48 }}
      >
        <MoreVertIcon />
      </IconButton>
      {isPhone ? (
        <Drawer
          anchor="bottom"
          open={open}
          onClose={close}
          PaperProps={{
            sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, pb: 'calc(8px + env(safe-area-inset-bottom))' },
          }}
        >
          <Typography noWrap sx={{ px: 2, pt: 2, pb: 1, fontWeight: 800 }}>
            {title}
          </Typography>
          <Box role="menu" aria-label={`Actions for ${title}`}>
            {entries}
          </Box>
        </Drawer>
      ) : (
        <Menu
          anchorEl={anchor}
          open={open}
          onClose={close}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {entries}
        </Menu>
      )}
    </Box>
  );
}
