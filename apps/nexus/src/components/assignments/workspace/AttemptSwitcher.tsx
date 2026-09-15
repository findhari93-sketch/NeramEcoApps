'use client';

/**
 * Earlier attempts, switched in place.
 *
 * A redo used to add a list of earlier attempts under the page, and opening one
 * showed its drawing again in a dialog. Here the drawing on the stage and the
 * feedback beside it simply change to that attempt, so one drawing is on screen
 * at a time and going back to the newest is one tap.
 *
 * A row of buttons where there is room; one "Attempt 2 of 3" button with a menu
 * on a phone.
 */
import { useState } from 'react';
import { Button, Menu, MenuItem, ListItemText, ToggleButton, ToggleButtonGroup } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckIcon from '@mui/icons-material/Check';
import { STATUS_META } from '@/lib/drawing-student-status';

export interface AttemptOption {
  /** 1-based, in the order they were handed in. */
  index: number;
  status: string;
  released: boolean;
}

export default function AttemptSwitcher({
  attempts,
  selected,
  onSelect,
  compact,
}: {
  attempts: AttemptOption[];
  selected: number;
  onSelect: (index: number) => void;
  compact: boolean;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (attempts.length < 2) return null;
  const total = attempts.length;

  if (!compact) {
    return (
      <ToggleButtonGroup
        value={selected}
        exclusive
        size="small"
        aria-label="Attempts"
        onChange={(_, v) => v && onSelect(v as number)}
        sx={{ '& .MuiToggleButton-root': { minHeight: 44, px: 1.5, textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' } }}
      >
        {attempts.map((a) => (
          <ToggleButton
            key={a.index}
            value={a.index}
            aria-label={`Attempt ${a.index}${a.index === total ? ', latest' : ''}`}
          >
            Attempt {a.index}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    );
  }

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        endIcon={<ExpandMoreIcon />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
        aria-label={`Showing attempt ${selected} of ${total}. Change attempt`}
        sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        {selected} of {total}
      </Button>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {attempts
          .slice()
          .reverse()
          .map((a) => {
            const meta = a.released ? STATUS_META[a.status] : null;
            return (
              <MenuItem
                key={a.index}
                selected={a.index === selected}
                onClick={() => {
                  setAnchor(null);
                  onSelect(a.index);
                }}
                sx={{ minHeight: 48, gap: 1 }}
              >
                <ListItemText
                  primary={`Attempt ${a.index}${a.index === total ? ' (latest)' : ''}`}
                  secondary={meta ? meta.label : 'Waiting for review'}
                />
                {a.index === selected && <CheckIcon fontSize="small" color="primary" />}
              </MenuItem>
            );
          })}
      </Menu>
    </>
  );
}
