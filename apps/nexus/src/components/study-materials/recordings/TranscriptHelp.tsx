'use client';

/**
 * "Where do I get one?": how a teacher makes a transcript for free.
 *
 * Microsoft Stream cannot transcribe Tamil (it is not on Stream's language
 * list), so for a Tamil class the only good transcript is one an AI writes from
 * the video. Google AI Studio does that for free in a browser. The hard part for
 * a teacher is the prompt, so Nexus writes it: one Copy button per part, because
 * a class over about an hour does not fit in one answer.
 *
 * The prompt comes from lib/transcript-prompt.ts, the same rules Nexus would use
 * itself, so a transcript made here cuts into the same checkpoints.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Link, TextField, Typography } from '@neram/ui';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { buildAiStudioPrompt, planAiStudioParts } from '@/lib/transcript-prompt';

export interface TranscriptHelpProps {
  /** The track's language, e.g. 'ta' or 'en'. */
  language: string;
  /** The video's length, which decides how many parts the prompt is split into. */
  durationSeconds: number;
}

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  border: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

const listSx = { m: 0, mt: 0.75, pl: 2.5, color: 'text.secondary', typography: 'body2', lineHeight: 1.6 } as const;

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <Typography component="h4" sx={{ fontWeight: 700, fontSize: '0.875rem', mt: 1.5, color: 'text.primary' }}>
      {children}
    </Typography>
  );
}

export default function TranscriptHelp({ language, durationSeconds }: TranscriptHelpProps) {
  const parts = useMemo(() => planAiStudioParts(durationSeconds || 0), [durationSeconds]);
  const many = parts.length > 1;
  const tamil = language === 'ta' || language === 'ta_en';

  const [copied, setCopied] = useState<number | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copyLabel = (i: number) => (many ? `Copy prompt, part ${i + 1}` : 'Copy prompt');
  const copiedLabel = (i: number) => (many ? `Copied, part ${i + 1}` : 'Copied');

  const copy = async (i: number) => {
    const text = buildAiStudioPrompt({ part: parts[i], parts, durationSeconds, spokenLanguage: language });
    try {
      await navigator.clipboard.writeText(text);
      setManual(null);
      setCopied(i);
      setAnnouncement(many ? `Prompt for part ${i + 1} copied.` : 'Prompt copied.');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 2500);
    } catch {
      // No clipboard (an insecure page, or the permission was refused). Show the
      // prompt itself, so the teacher can still select it and copy by hand.
      setCopied(null);
      setManual(text);
      setAnnouncement('The browser would not copy the prompt. Select the text in the box and copy it.');
    }
  };

  const aiStudioSteps = (
    <Box component="ol" sx={listSx}>
      <li>On a laptop, open the video in SharePoint (use the link beside the video) and download it.</li>
      <li>
        Open Google AI Studio at{' '}
        <Link href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer">
          aistudio.google.com
        </Link>
        , sign in with a Google account and start a new chat. It is free.
      </li>
      <li>In Run settings, set Media resolution to Low. Then add the video to the chat.</li>
      <li>
        {many
          ? `Press Copy prompt, part 1 below, paste it into the chat and run it.`
          : 'Press Copy prompt below, paste it into the chat and run it.'}
      </li>
      <li>
        Copy the answer, paste it into Notepad and save it{many ? ', for example as part 1.txt' : ''}.
      </li>
      {many && (
        <li>
          In the same chat, do the same for {parts.length === 2 ? 'part 2' : `parts 2 to ${parts.length}`}, saving each
          answer as its own file.
        </li>
      )}
      <li>
        Press Upload transcript and choose {many ? 'all the saved files together' : 'the saved file'}. Nexus puts the
        parts in order.
      </li>
    </Box>
  );

  return (
    <Box sx={{ mt: 1 }}>
      {!tamil && (
        <>
          <Heading>From Stream, for a class taught in English</Heading>
          <Box component="ol" sx={listSx}>
            <li>Open the video in SharePoint (use the link beside the video).</li>
            <li>Open the Transcript panel. If there is none, create one there and choose the language spoken.</li>
            <li>Choose Download and pick the .vtt format.</li>
            <li>Upload that file here. It stays with this recording only.</li>
          </Box>
          <Heading>Or with Google AI Studio, free</Heading>
        </>
      )}
      {tamil && <Heading>With Google AI Studio, free</Heading>}
      {aiStudioSteps}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.25 }}>
        {parts.map((part, i) => (
          <Button
            key={part.index}
            variant="outlined"
            size="small"
            onClick={() => copy(i)}
            startIcon={copied === i ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />}
            color={copied === i ? 'success' : 'primary'}
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}
          >
            {copied === i ? copiedLabel(i) : copyLabel(i)}
          </Button>
        ))}
      </Box>

      {manual && (
        <TextField
          value={manual}
          multiline
          minRows={4}
          maxRows={10}
          fullWidth
          onFocus={(e) => e.target.select()}
          inputProps={{ readOnly: true, 'aria-label': 'Prompt to copy' }}
          helperText="Select all of this text and copy it."
          sx={{ mt: 1.25 }}
        />
      )}

      {tamil && (
        <Typography variant="body2" sx={{ mt: 1.25, color: 'text.secondary', lineHeight: 1.55 }}>
          Do not use the transcript from Stream for a Tamil class. Stream cannot transcribe Tamil, so its words come out
          wrong.
        </Typography>
      )}

      <Box component="span" role="status" aria-live="polite" sx={visuallyHidden}>
        {announcement}
      </Box>
    </Box>
  );
}
