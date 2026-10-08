'use client';

import { Button, IconButton, Tooltip, useTheme } from '@neram/ui';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import { focusRing } from '@/components/assistant/focusRing';
import { stableHover } from '@/components/assistant/stableHover';

interface TutorButtonProps {
  onClick: () => void;
  /** The tutor is showing, so the button reads as pressed. */
  active?: boolean;
}

export const TUTOR_BUTTON_LABEL = 'Learn with tutor';

/**
 * Wide enough for the label, measured on the reader's header (PracticeReader
 * names it `reader-head`). A viewport breakpoint cannot see how much of the
 * window the sidebar and the question rail leave the reader.
 */
const ROOMY = '@container reader-head (min-width: 480px)';

/**
 * The door into the AI Tutor, in the reader's header beside the language
 * switch. A 48px icon on a phone and in a narrow pane, where the header is
 * already full; labelled where the header has room. One of the two shows at a
 * time (display only), so a screen reader hears one "Learn with tutor" button.
 */
export default function TutorButton({ onClick, active = false }: TutorButtonProps) {
  const theme = useTheme();
  const ring = { '&.Mui-focusVisible': focusRing(theme.palette.primary.dark) };
  return (
    <>
      <Tooltip title={TUTOR_BUTTON_LABEL}>
        <IconButton
          onClick={onClick}
          aria-label={TUTOR_BUTTON_LABEL}
          aria-pressed={active}
          color="primary"
          sx={{
            display: 'inline-flex',
            [ROOMY]: { display: 'none' },
            width: 48,
            height: 48,
            flexShrink: 0,
            bgcolor: active ? 'action.selected' : 'transparent',
            ...ring,
          }}
        >
          <SchoolOutlinedIcon />
        </IconButton>
      </Tooltip>
      <Button
        onClick={onClick}
        aria-pressed={active}
        variant={active ? 'contained' : 'outlined'}
        startIcon={<SchoolOutlinedIcon />}
        sx={{
          ...stableHover,
          display: 'none',
          [ROOMY]: { display: 'inline-flex' },
          minHeight: 44,
          flexShrink: 0,
          whiteSpace: 'nowrap',
          textTransform: 'none',
          fontWeight: 700,
          borderRadius: 22,
          px: 2,
          ...ring,
        }}
      >
        {TUTOR_BUTTON_LABEL}
      </Button>
    </>
  );
}
