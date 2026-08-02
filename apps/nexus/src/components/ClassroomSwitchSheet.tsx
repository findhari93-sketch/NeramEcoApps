'use client';

import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  SwipeableDrawer,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CheckIcon from '@mui/icons-material/Check';

/**
 * Phone-sized classroom switcher.
 *
 * A bottom sheet rather than the desktop dropdown menu: the control that opens
 * it is a 44px icon button in the corner of the app bar, and a menu anchored to
 * it would open a narrow list under the user's own thumb. The sheet matches the
 * "More" drawer the bottom nav already uses, so the two read as one product.
 *
 * Generic over the item so it can take the auth hook's classroom shape without
 * that type having to be exported and without widening what callers may pass
 * back to setActiveClassroom.
 */

interface SwitchableClassroom {
  id: string;
  name: string;
  type?: string | null;
  enrollmentRole?: string | null;
}

interface ClassroomSwitchSheetProps<T extends SwitchableClassroom> {
  open: boolean;
  onClose: () => void;
  items: T[];
  activeId: string | null;
  onSelect: (item: T) => void;
}

/** "nata · student", or just the role when the type carries no information. */
function describeClassroom(c: SwitchableClassroom): string {
  const role = c.enrollmentRole || '';
  return c.type && c.type !== 'common' ? `${c.type} · ${role}` : role;
}

export default function ClassroomSwitchSheet<T extends SwitchableClassroom>({
  open,
  onClose,
  items,
  activeId,
  onSelect,
}: ClassroomSwitchSheetProps<T>) {
  const theme = useTheme();

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      swipeAreaWidth={0}
      slotProps={{ backdrop: { sx: { bgcolor: alpha(theme.palette.common.black, 0.3) } } }}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: '60vh',
          bgcolor: theme.palette.background.paper,
          // Clears the home indicator on gesture-nav phones.
          pb: 'env(safe-area-inset-bottom)',
        },
      }}
    >
      {/* Puller handle, same affordance as the bottom nav's More sheet */}
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
        <Box
          sx={{
            width: 32,
            height: 4,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.text.secondary, 0.3),
          }}
        />
      </Box>

      <Typography
        variant="caption"
        sx={{
          px: 2,
          pt: 0.5,
          pb: 1,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          fontSize: '0.625rem',
          color: 'text.secondary',
          display: 'block',
        }}
      >
        Your classrooms
      </Typography>

      <List sx={{ px: 1, pb: 2 }}>
        {items.map((c) => {
          const selected = c.id === activeId;
          return (
            <ListItemButton
              key={c.id}
              selected={selected}
              onClick={() => {
                onSelect(c);
                onClose();
              }}
              sx={{
                borderRadius: 2,
                mb: 0.5,
                // Comfortably above the 48px touch-target floor: this list is
                // read and tapped one-handed, mid-scroll.
                minHeight: 56,
                px: 2,
                gap: 0.5,
                bgcolor: selected ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, 0.08) },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 36,
                  color: selected ? 'primary.main' : 'text.secondary',
                  '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
                }}
              >
                <SchoolOutlinedIcon />
              </ListItemIcon>
              <ListItemText
                primary={c.name}
                secondary={describeClassroom(c)}
                primaryTypographyProps={{
                  variant: 'body2',
                  fontWeight: selected ? 700 : 500,
                  color: selected ? 'primary.main' : 'text.primary',
                }}
                secondaryTypographyProps={{
                  variant: 'caption',
                  sx: { textTransform: 'capitalize' },
                }}
              />
              {selected && <CheckIcon sx={{ fontSize: '1.1rem', color: 'primary.main' }} />}
            </ListItemButton>
          );
        })}
      </List>
    </SwipeableDrawer>
  );
}
