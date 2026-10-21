import { Box, IconButton } from '@neram/ui';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';

/**
 * "Ask anything" box that opens Aintra (Tools app) with the question. A plain GET
 * form to /ask?q=…, so it works before any JavaScript loads and needs no
 * client code. `tone="dark"` sits on the navy hero of the tools hub.
 */
export default function AskBar({ tone = 'light', placeholder = 'Ask Aintra: my cutoff, which colleges, nearest NATA centre' }: { tone?: 'light' | 'dark'; placeholder?: string }) {
  const dark = tone === 'dark';
  return (
    <Box
      component="form"
      action="/ask"
      method="get"
      role="search"
      aria-label="Ask Aintra"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: 0.75,
        pl: 1.75,
        borderRadius: 3,
        maxWidth: 640,
        bgcolor: dark ? 'rgba(255,255,255,0.96)' : 'background.paper',
        border: '1px solid',
        borderColor: dark ? 'transparent' : 'divider',
        '&:focus-within': { outline: '3px solid', outlineColor: 'secondary.main', outlineOffset: 2 },
      }}
    >
      <AutoAwesomeRoundedIcon aria-hidden="true" sx={{ color: 'primary.main', fontSize: 22 }} />
      <Box
        component="input"
        name="q"
        type="text"
        required
        maxLength={1000}
        placeholder={placeholder}
        aria-label="Your question for Aintra"
        enterKeyHint="send"
        sx={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: 0,
          bgcolor: 'transparent',
          font: 'inherit',
          fontSize: '1rem',
          lineHeight: 1.5,
          py: 1.25,
          color: '#1A1A2E',
          '&::placeholder': { color: '#5A5A6E', opacity: 1 },
        }}
      />
      <IconButton
        type="submit"
        aria-label="Ask"
        sx={{ width: 48, height: 48, flexShrink: 0, color: 'primary.contrastText', bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
      >
        <ArrowUpwardRoundedIcon />
      </IconButton>
    </Box>
  );
}
