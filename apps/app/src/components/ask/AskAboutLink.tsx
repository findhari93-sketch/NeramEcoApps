import Link from 'next/link';
import { Box, Button, Typography } from '@neram/ui';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';

/**
 * "Ask about this result": opens Ask aiArchitek with a question about what the
 * tool just showed, the values carried in the link (so the chat remembers them)
 * and the tool's name as context.
 */
export default function AskAboutLink({ question, query, from, label }: { question: string; query?: string; from: string; label: string }) {
  const params = new URLSearchParams({ q: question, from });
  const href = `/ask?${params.toString()}${query ? `&${query}` : ''}`;
  return (
    <Box sx={{ mt: 1.5 }}>
      <Button
        component={Link}
        href={href}
        variant="text"
        startIcon={<AutoAwesomeRoundedIcon />}
        sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, px: 1 }}
      >
        {label}
      </Button>
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', pl: 1 }}>
        Ask aiArchitek answers from last year&apos;s official allotments.
      </Typography>
    </Box>
  );
}
