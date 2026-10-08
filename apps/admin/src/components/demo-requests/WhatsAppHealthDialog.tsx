'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  TextField,
  Typography,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { WhatsAppHealth } from '@neram/database';

type Templates = Record<string, { name: string; params: string[]; button: boolean; body: string }>;

/**
 * What Meta says about our WhatsApp sender, in one place: the number on the
 * Cloud API, token validity, and approval of each demo template, plus the
 * exact template texts to submit and a test send.
 */
export default function WhatsAppHealthDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [health, setHealth] = useState<WhatsAppHealth | null>(null);
  const [templates, setTemplates] = useState<Templates | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch('/api/whatsapp/health')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Failed');
        setHealth(d.health);
        setTemplates(d.templates);
      })
      .catch((e) => setError(e.message || 'Could not reach Meta'))
      .finally(() => setLoading(false));
  }, [open]);

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const d = await r.json();
      setTestResult(r.ok ? { ok: true, text: `Sent. Meta message id ${d.messageId}` } : { ok: false, text: d.error || 'Failed' });
    } catch {
      setTestResult({ ok: false, text: 'Network error' });
    } finally {
      setTesting(false);
    }
  };

  const p = health?.phone as Record<string, string> | null | undefined;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="wa-health-title">
      <DialogTitle id="wa-health-title">WhatsApp (Meta Cloud API) status</DialogTitle>
      <DialogContent dividers>
        {loading && (
          <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress aria-label="Checking with Meta" />
          </Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {health && !loading && (
          <Box sx={{ display: 'grid', gap: 2 }}>
            {health.diagnosis ? (
              <Alert severity="error">{health.diagnosis}</Alert>
            ) : (
              <Alert severity="success">Meta accepts our token and the number is connected.</Alert>
            )}

            {p && (
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  Number on the Cloud API
                </Typography>
                <Typography variant="h6">{p.display_phone_number}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {p.verified_name} · status {p.status || 'unknown'} · quality {p.quality_rating || 'unknown'} · name{' '}
                  {p.name_status || 'unknown'}
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  If this is your main number (+91 91761 37043) and the WhatsApp Business phone app stopped working on it, the
                  number is not in coexistence mode. Students send drawings to the number set in Demo settings.
                </Typography>
              </Box>
            )}
            {health.phoneError && (
              <Typography variant="body2" color="error.main">
                {health.phoneError}
              </Typography>
            )}

            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Demo templates
              </Typography>
              {health.templatesError && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {health.templatesError}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                {health.demoTemplates.map((t) => (
                  <Chip
                    key={t.name}
                    label={`${t.name}: ${t.status.toLowerCase()}`}
                    color={t.status === 'APPROVED' ? 'success' : t.status === 'UNKNOWN' ? 'default' : 'warning'}
                    variant="outlined"
                  />
                ))}
              </Box>
            </Box>

            {templates && (
              <Accordion disableGutters variant="outlined">
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography fontWeight={700}>Template texts to submit in WhatsApp Manager</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Category Utility, language English (en). Templates marked with a button need a URL button &quot;Join or
                    view&quot; with the dynamic URL https://neramclasses.com/d/{'{{1}}'}.
                  </Typography>
                  {Object.values(templates).map((t) => (
                    <Box key={t.name} sx={{ mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography fontWeight={700}>{t.name}</Typography>
                        {t.button && <Chip size="small" label="URL button" />}
                        <Button
                          size="small"
                          startIcon={<ContentCopyIcon fontSize="small" />}
                          onClick={() => navigator.clipboard?.writeText(t.body).catch(() => {})}
                          sx={{ minHeight: 36 }}
                        >
                          Copy
                        </Button>
                      </Box>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                        {t.body}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Samples: {t.params.join(', ')}
                      </Typography>
                    </Box>
                  ))}
                </AccordionDetails>
              </Accordion>
            )}

            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Test send
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Sends Meta&apos;s built-in hello_world template and shows Meta&apos;s exact reply. Admins only.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'flex-start' }}>
                <TextField
                  label="Your mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  size="small"
                  inputProps={{ inputMode: 'numeric' }}
                />
                <Button variant="outlined" onClick={test} disabled={testing || phone.replace(/\D/g, '').length < 10} sx={{ minHeight: 40 }}>
                  {testing ? 'Sending' : 'Send test'}
                </Button>
              </Box>
              {testResult && (
                <Alert severity={testResult.ok ? 'success' : 'error'} sx={{ mt: 1 }}>
                  {testResult.text}
                </Alert>
              )}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
