'use client';

/**
 * Quick Add: copy an interview prompt into ChatGPT / Gemini / Claude, answer its
 * questions, then paste the JSON back here to auto-fill the topic's content. The
 * teacher reviews the preview before applying; nothing is published (they still
 * hit "Mark class ready" themselves).
 */
import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  Button,
  TextField,
  Typography,
  Stack,
  Box,
  Chip,
  Alert,
  IconButton,
} from '@neram/ui';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import {
  TOPIC_QUICK_ADD_PROMPT,
  parseTopicQuickAdd,
  type TopicQuickAddData,
} from '@/lib/topic-quick-add';

export default function QuickAddDialog({
  open,
  onClose,
  onApply,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (data: TopicQuickAddData) => Promise<void>;
  busy: boolean;
}) {
  const [tab, setTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState('');

  const result = useMemo(() => (pasted.trim() ? parseTopicQuickAdd(pasted) : null), [pasted]);
  const data = result?.data ?? null;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(TOPIC_QUICK_ADD_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const reset = () => {
    setPasted('');
    setTab(0);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoAwesomeOutlinedIcon color="primary" />
        Quick Add with AI
        <IconButton aria-label="Close" onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="1. Get the prompt" sx={{ minHeight: 48 }} />
        <Tab label="2. Paste result" sx={{ minHeight: 48 }} />
      </Tabs>

      <DialogContent>
        {tab === 0 ? (
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Copy this prompt, open ChatGPT, Gemini or Claude, and paste it. The AI interviews you, one question at a
              time. Answer them, then copy the JSON it gives you and come back to tab 2.
            </Typography>
            <Button
              variant="contained"
              startIcon={copied ? <CheckIcon /> : <ContentCopyOutlinedIcon />}
              onClick={copyPrompt}
              sx={{ minHeight: 48, alignSelf: 'flex-start' }}
            >
              {copied ? 'Copied' : 'Copy prompt'}
            </Button>
            <TextField
              value={TOPIC_QUICK_ADD_PROMPT}
              multiline
              minRows={6}
              maxRows={10}
              fullWidth
              InputProps={{ readOnly: true, sx: { fontSize: '0.78rem', fontFamily: 'monospace' } }}
            />
          </Stack>
        ) : (
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              label="Paste the JSON from the AI"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              multiline
              minRows={5}
              fullWidth
              autoFocus
              placeholder='{ "summary": "...", "activities": "...", ... }'
            />

            {result && !result.valid && result.errors.length > 0 && (
              <Alert severity="error">{result.errors.join(' ')}</Alert>
            )}
            {result && result.warnings.length > 0 && (
              <Alert severity="warning">{result.warnings.join(' ')}</Alert>
            )}

            {data && (
              <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2.5, p: 1.75 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  This will fill:
                </Typography>
                <Stack spacing={1}>
                  <PreviewRow label="Summary" value={data.summary} />
                  <PreviewRow label="Activities" value={data.activities} />
                  <PreviewRow label="Drills" value={data.drills} />
                  {(data.priority || data.intended_delivery || data.estimated_sessions) && (
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                      {data.priority && <Chip size="small" label={`Priority: ${data.priority}`} />}
                      {data.intended_delivery && <Chip size="small" label={`Delivery: ${data.intended_delivery}`} />}
                      {data.estimated_sessions && <Chip size="small" label={`${data.estimated_sessions} sessions`} />}
                    </Stack>
                  )}
                  {data.resources.length > 0 && (
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                        {data.resources.length} resource{data.resources.length > 1 ? 's' : ''}
                      </Typography>
                      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                        {data.resources.map((r, i) => (
                          <Typography key={i} variant="caption" color="text.secondary" noWrap>
                            {r.kind === 'youtube' ? '▶' : '🔗'} {r.title}
                            {r.section === 'drill' ? ' (drill)' : ''}
                          </Typography>
                        ))}
                      </Stack>
                    </Box>
                  )}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        {tab === 0 ? (
          <Button variant="contained" onClick={() => setTab(1)} sx={{ minHeight: 44 }}>
            I have the JSON, next
          </Button>
        ) : (
          <>
            <Button onClick={reset} disabled={busy}>
              Clear
            </Button>
            <Button
              variant="contained"
              disabled={busy || !data}
              onClick={async () => {
                if (!data) return;
                await onApply(data);
              }}
              sx={{ minHeight: 44 }}
            >
              {busy ? 'Applying...' : 'Apply to topic'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.82rem' }}>
        {value.length > 240 ? `${value.slice(0, 240)}...` : value}
      </Typography>
    </Box>
  );
}
