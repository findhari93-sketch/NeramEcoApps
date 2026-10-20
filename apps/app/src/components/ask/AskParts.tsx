'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { usePathname } from 'next/navigation';
import { setAuthRedirectUrl } from '@neram/auth';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import PsychologyAltOutlinedIcon from '@mui/icons-material/PsychologyAltOutlined';
import AuthButtons from '@/components/AuthButtons';
import { factChips, type AskFacts } from '@/lib/ask/memory';
import { savePendingQuestion } from './useAskChat';

// ─── Your details ─────────────────────────────────────────────────────────

/**
 * What the chat remembers, always visible. Tapping the cross forgets that
 * detail, here and on the server.
 */
export function MemoryStrip({ facts, onForget }: { facts: AskFacts; onForget: (keys: string[]) => void }) {
  const chips = factChips(facts);
  if (chips.length === 0) return null;
  return (
    <Box component="section" aria-label="Details Ask aiArchitek remembers" sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
        <PsychologyAltOutlinedIcon aria-hidden="true" sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
          Remembered for your answers. Tap the cross to forget one.
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {chips.map((c) => (
          <Chip
            key={c.label}
            label={c.label}
            onDelete={() => onForget(c.keys)}
            deleteIcon={<CloseRoundedIcon aria-label={`Forget ${c.label}`} />}
            sx={{
              height: 40,
              borderRadius: 2,
              fontWeight: 600,
              bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
              '& .MuiChip-deleteIcon': { fontSize: 20, mr: 0.75 },
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────

export function Composer({
  busy,
  disabled,
  onSend,
  onStop,
  note,
}: {
  busy: boolean;
  disabled?: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  note?: React.ReactNode;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submit = () => {
    if (!value.trim() || busy || disabled) return;
    onSend(value);
    setValue('');
  };
  const onKeyDown = (e: KeyboardEvent) => {
    // Enter sends on a keyboard; Shift+Enter is a new line. Phones use the button.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <Box
      sx={{
        position: 'sticky',
        bottom: 'var(--app-bottom-inset, 0px)',
        zIndex: 5,
        pt: 1.5,
        pb: 'max(12px, env(safe-area-inset-bottom))',
        bgcolor: 'background.default',
        // A soft fade so messages scroll under the composer cleanly.
        boxShadow: (t) => `0 -12px 16px -4px ${t.palette.background.default}`,
      }}
    >
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 1,
          p: 0.75,
          pl: 1.75,
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          '&:focus-within': { borderColor: 'primary.main', boxShadow: (t) => `0 0 0 3px ${alpha(t.palette.primary.main, 0.15)}` },
        }}
      >
        <TextField
          inputRef={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 1000))}
          onKeyDown={onKeyDown}
          placeholder="Ask about your cutoff, colleges or NATA centres"
          multiline
          maxRows={5}
          fullWidth
          variant="standard"
          disabled={disabled}
          inputProps={{ 'aria-label': 'Your question', enterKeyHint: 'send' }}
          InputProps={{ disableUnderline: true, sx: { fontSize: '1rem', lineHeight: 1.5, py: 1.25 } }}
        />
        {busy ? (
          <IconButton aria-label="Stop the answer" onClick={onStop} sx={{ width: 48, height: 48, flexShrink: 0, bgcolor: 'action.selected' }}>
            <StopRoundedIcon />
          </IconButton>
        ) : (
          <IconButton
            type="submit"
            aria-label="Send"
            disabled={!value.trim() || disabled}
            sx={{
              width: 48,
              height: 48,
              flexShrink: 0,
              color: 'primary.contrastText',
              bgcolor: 'primary.main',
              '&:hover': { bgcolor: 'primary.dark' },
              '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' },
            }}
          >
            <ArrowUpwardRoundedIcon />
          </IconButton>
        )}
      </Box>
      {note && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.75, textAlign: 'center' }}>
          {note}
        </Typography>
      )}
    </Box>
  );
}

// ─── Sign-in ──────────────────────────────────────────────────────────────

/** Opens sign-in in place. The pending question is sent once they are back. */
export function useAskSignIn() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || '/ask';
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const start = (pendingQuestion?: string | null) => {
    if (pendingQuestion) savePendingQuestion(pendingQuestion);
    setAuthRedirectUrl(pathname);
    setOpen(true);
  };
  const dialog = (
    <Dialog open={open} onClose={() => setOpen(false)} fullScreen={fullScreen} maxWidth="xs" fullWidth aria-labelledby="ask-signin-title">
      <DialogTitle id="ask-signin-title" sx={{ pr: 7 }}>
        Sign in to keep going
        <IconButton aria-label="Close" onClick={() => setOpen(false)} sx={{ position: 'absolute', right: 8, top: 8, width: 44, height: 44 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Free. Your chat and details move to your account, and your question is answered as soon as you are back.
        </Typography>
        <AuthButtons />
      </DialogContent>
    </Dialog>
  );
  return { start, dialog };
}

export function SignInGateCard({ limit, onSignIn }: { limit: number; onSignIn: () => void }) {
  const benefits = [
    'Unlimited answers, every day',
    'Every college that matches your score, not just the top one',
    'Your details and chats saved on every device',
  ];
  return (
    <Box
      component="section"
      aria-label="Sign in to keep chatting"
      sx={{
        p: { xs: 2, sm: 2.5 },
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: (t) => alpha(t.palette.primary.main, 0.35),
        bgcolor: (t) => alpha(t.palette.primary.main, 0.05),
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <Box
          aria-hidden="true"
          sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'primary.main', bgcolor: (t) => alpha(t.palette.primary.main, 0.12) }}
        >
          <LockOpenOutlinedIcon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="p" sx={{ fontWeight: 700, fontSize: '1.0625rem', lineHeight: 1.35 }}>
            You have used today&apos;s {limit} free answers
          </Typography>
          <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 1, display: 'grid', gap: 0.75 }}>
            {benefits.map((b) => (
              <Box component="li" key={b} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <CheckCircleOutlineRoundedIcon aria-hidden="true" sx={{ fontSize: 20, color: 'success.main', mt: '1px' }} />
                <Typography variant="body2">{b}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={onSignIn}
        sx={{ mt: 2, minHeight: 48, textTransform: 'none', fontWeight: 700, maxWidth: { sm: 360 } }}
      >
        Sign in free and get my answer
      </Button>
      <Typography variant="caption" component="p" sx={{ mt: 1, color: 'text.secondary' }}>
        Google or email. Your question is kept and answered right after.
      </Typography>
    </Box>
  );
}
