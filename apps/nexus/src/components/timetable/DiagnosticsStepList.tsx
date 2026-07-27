'use client';

/**
 * Renders a Graph diagnostics ladder: one line per probe, with the verbatim
 * Graph detail underneath and any remedy in a scrolling code box.
 *
 * Shared by the attendance sheet's "Why not?" button and the Teams backfill
 * dialog. The `<pre>` is load-bearing on mobile: remedies contain PowerShell,
 * and it must scroll inside its own box rather than widening a 375px dialog.
 *
 * Remedies are frequently multi-line PowerShell that a Teams administrator has
 * to run somewhere else entirely, so a copy button is not decoration: reading
 * commands off a phone and retyping them is exactly how the wrong tenant or a
 * missing `Grant-` step gets introduced.
 */

import { useState } from 'react';
import { Box, Typography, IconButton, Tooltip } from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';

export interface DiagnosticStep {
  step: string;
  ok: boolean;
  detail: string;
  remedy?: string;
}

export const STEP_LABELS: Record<string, string> = {
  class: 'Class and meeting link',
  classroom: 'Classroom and Teams link',
  env: 'Microsoft credentials',
  app_token: 'Microsoft sign-in for Nexus',
  app_roles: 'Graph application permissions',
  organizer: 'Meeting organizer',
  delegated_token: 'Your own Microsoft access',
  calendar: 'Teams group calendar',
  nexus_rows: 'Classes already in Nexus',
  recordings: 'Channel recordings folder',
  access_policy: 'Teams application access policy',
  meeting_lookup: 'Finding the meeting in Teams',
  attendance: 'Reading attendance',
  reports: 'Attendance report',
};

interface DiagnosticsStepListProps {
  steps: DiagnosticStep[];
  ok: boolean;
  okTitle?: string;
  failTitle?: string;
}

/**
 * Copy button for a remedy block.
 *
 * `navigator.clipboard` is undefined on insecure origins and on some in-app
 * browsers, so the failure is swallowed and the tick simply never appears. The
 * text stays selectable either way, which is the real fallback.
 */
function CopyRemedyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission or no secure context. Nothing useful to say.
    }
  };

  return (
    <Tooltip title={copied ? 'Copied' : 'Copy'}>
      <IconButton
        onClick={handleCopy}
        size="small"
        aria-label={copied ? 'Remedy copied' : 'Copy remedy'}
        sx={{
          width: 44,
          height: 44,
          flexShrink: 0,
          // Sits over the top-right of the scrolling code box without stealing
          // width from it on a 375px screen.
          position: 'absolute',
          top: 2,
          right: 2,
          bgcolor: 'background.paper',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {copied ? (
          <CheckIcon color="success" sx={{ fontSize: 16 }} />
        ) : (
          <ContentCopyIcon sx={{ fontSize: 16 }} />
        )}
      </IconButton>
    </Tooltip>
  );
}

export default function DiagnosticsStepList({
  steps,
  ok,
  okTitle = 'Teams attendance is reachable for this class.',
  failTitle = 'Teams attendance is blocked here:',
}: DiagnosticsStepListProps) {
  return (
    <Box
      sx={{
        mb: 2,
        p: 1.5,
        borderRadius: 1,
        border: '1px solid',
        borderColor: ok ? 'success.light' : 'warning.light',
        bgcolor: 'action.hover',
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {ok ? okTitle : failTitle}
      </Typography>
      {steps.map((step) => (
        <Box key={step.step} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
          {step.ok ? (
            <CheckCircleOutlineIcon color="success" sx={{ fontSize: 18, mt: 0.2 }} />
          ) : (
            <ErrorOutlineIcon color="warning" sx={{ fontSize: 18, mt: 0.2 }} />
          )}
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: step.ok ? 400 : 600 }}>
              {STEP_LABELS[step.step] || step.step}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', wordBreak: 'break-word' }}
            >
              {step.detail}
            </Typography>
            {step.remedy && (
              <Box sx={{ position: 'relative', mt: 0.5 }}>
                <Box
                  component="pre"
                  sx={{
                    mt: 0,
                    mb: 0,
                    p: 1,
                    // Keeps the last line clear of the copy button.
                    pr: 6,
                    fontSize: 11,
                    lineHeight: 1.5,
                    fontFamily: 'monospace',
                    whiteSpace: 'pre',
                    overflowX: 'auto',
                    maxWidth: '100%',
                    borderRadius: 1,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  {step.remedy}
                </Box>
                <CopyRemedyButton text={step.remedy} />
              </Box>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
