'use client';

/**
 * Connect the channel the nightly class-recording backup uploads to.
 *
 * The backup itself has been complete for a while: OAuth, a resumable chunked
 * upload, three nightly schedules, a promotion pass. None of it had ever run,
 * because connecting the account was documented as "visit
 * /api/admin/youtube-oauth/start" and that route needs a bearer token no address
 * bar can send. So the last step of an eight-step setup was the one step with no
 * way to perform it, and the feature sat inert with the kill switch off.
 *
 * This is that step. It also carries the two things an operator needs after it:
 * WHICH channel was actually authorised, because consenting with a personal
 * Google account is the likeliest mistake here and it fails silently, and a dry
 * run, because "did that work" should be answerable now rather than at 1am.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import YouTubeIcon from '@mui/icons-material/YouTube';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import YouTubeBacklogTable from './YouTubeBacklogTable';

interface Props {
  getToken: () => Promise<string | null>;
}

interface Status {
  connected: boolean;
  channelId?: string | null;
  channelTitle?: string | null;
  connectedAt?: string | null;
  revokedAt?: string | null;
  lastError?: string | null;
}

interface RunSummary {
  skipped?: string;
  hint?: string;
  error?: string;
  candidates?: number;
  due?: number;
  started?: number;
  resumed?: number;
  completed?: number;
  partial?: number;
  promoted?: number;
  quotaRemaining?: number;
  quotaBlocked?: boolean;
  reasons?: Record<string, number>;
  dryRunRequested?: boolean;
}

/** Reasons the sweep reports, in words an operator can act on. */
const REASON_HELP: Record<string, string> = {
  oauth_revoked: 'The Google grant is dead. Disconnect and connect again.',
  oauth_error: 'Could not reach Google for a token. Check the client secret.',
};

export default function YouTubeBackupCard({ getToken }: Props) {
  const theme = useTheme();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'connect' | 'disconnect' | 'run' | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(
    null,
  );
  const [run, setRun] = useState<RunSummary | null>(null);
  // Bumped after a run so the table below re-reads instead of showing the state
  // from before the button was pressed.
  const [backlogKey, setBacklogKey] = useState(0);

  const authed = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      return fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers || {}),
        },
      });
    },
    [getToken],
  );

  const load = useCallback(async () => {
    try {
      const res = await authed('/api/admin/youtube-oauth/status');
      if (res.ok) setStatus(await res.json());
      else setStatus({ connected: false });
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, [authed]);

  useEffect(() => {
    void load();
  }, [load]);

  // The OAuth callback cannot talk to this component, so it says what happened
  // in the query string on its way back here.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('youtube');
    if (!outcome) return;
    if (outcome === 'connected') {
      setMessage({
        type: 'success',
        text: `Connected to ${params.get('channel') || 'the channel'}. Check that is the Neram channel, not a personal one.`,
      });
    } else {
      setMessage({ type: 'error', text: `Google refused: ${params.get('reason') || 'unknown'}` });
    }
    // Clear it, so a refresh does not replay a message about something that
    // happened five minutes ago.
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  /**
   * Ask for the consent URL, then go there.
   *
   * Two steps rather than one navigation, because the route is bearer
   * authenticated and a browser navigating to it sends no header. The state
   * cookie rides back on this same fetch response, which is what the callback
   * later compares against.
   */
  const connect = async () => {
    setBusy('connect');
    setMessage(null);
    try {
      const res = await authed('/api/admin/youtube-oauth/start?mode=json');
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || 'Could not start the connection');
      window.location.href = json.url;
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not connect' });
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Forget the stored YouTube grant? The nightly backup stops until you reconnect.')) {
      return;
    }
    setBusy('disconnect');
    setMessage(null);
    try {
      const res = await authed('/api/admin/youtube-oauth/disconnect', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not disconnect');
      setStatus({ connected: false });
      setRun(null);
      setMessage({ type: 'info', text: 'Disconnected. Nothing was revoked at Google.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not disconnect' });
    } finally {
      setBusy(null);
    }
  };

  const runSweep = async (dryRun: boolean) => {
    if (
      !dryRun &&
      !window.confirm(
        'This starts a real upload. It spends 1600 of the day\'s 10,000 YouTube quota units, and only 5 uploads fit in a day. Continue?',
      )
    ) {
      return;
    }
    setBusy('run');
    setMessage(null);
    setRun(null);
    try {
      const res = await authed('/api/admin/youtube-backup/run', {
        method: 'POST',
        body: JSON.stringify({ dryRun, limit: 1 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'The run failed');
      setRun(json);
      // A dry run changes nothing, but a real one does, and the table has to
      // agree with the summary printed directly above it.
      if (!dryRun) setBacklogKey((k) => k + 1);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'The run failed' });
    } finally {
      setBusy(null);
    }
  };

  const connected = Boolean(status?.connected);

  return (
    <Paper
      sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}
      elevation={0}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <YouTubeIcon sx={{ color: '#ff0000' }} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            YouTube backup
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Teams deletes a class recording after about six months. This copies each one to the
            Neram channel overnight.
          </Typography>
        </Box>
        {!loading && (
          <Chip
            size="small"
            label={connected ? 'Connected' : 'Not connected'}
            color={connected ? 'success' : 'default'}
          />
        )}
      </Box>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          {message && (
            <Alert severity={message.type} sx={{ mb: 2, borderRadius: 2 }}>
              {message.text}
            </Alert>
          )}

          {connected ? (
            <Box
              sx={{
                p: 1.5,
                mb: 2,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.success.main, 0.06),
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {status?.channelTitle || 'Unnamed channel'}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Uploads go here. If that is not the Neram channel, disconnect and consent again with
                the account that owns it.
              </Typography>
              {status?.lastError && (
                <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                  Last error: {status.lastError}
                </Typography>
              )}
            </Box>
          ) : (
            <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
              No account is connected, so nothing has ever been backed up. Consent with the Google
              account that owns the Neram channel.
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Button
              variant={connected ? 'outlined' : 'contained'}
              onClick={() => void connect()}
              disabled={busy !== null}
              startIcon={busy === 'connect' ? <CircularProgress size={16} color="inherit" /> : <YouTubeIcon />}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, minHeight: 44 }}
            >
              {connected ? 'Reconnect' : 'Connect YouTube'}
            </Button>

            {connected && (
              <>
                <Button
                  variant="outlined"
                  onClick={() => void runSweep(true)}
                  disabled={busy !== null}
                  startIcon={
                    busy === 'run' ? <CircularProgress size={16} color="inherit" /> : <PlayArrowOutlinedIcon />
                  }
                  sx={{ textTransform: 'none', borderRadius: 2, minHeight: 44 }}
                >
                  Dry run
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => void disconnect()}
                  disabled={busy !== null}
                  startIcon={<LinkOffIcon />}
                  sx={{ textTransform: 'none', borderRadius: 2, minHeight: 44 }}
                >
                  Disconnect
                </Button>
              </>
            )}
          </Box>

          {run && (
            <Box sx={{ mt: 2 }}>
              {run.skipped ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  {run.hint || run.skipped}
                </Alert>
              ) : (
                <>
                  <Alert severity="success" sx={{ borderRadius: 2, mb: 1 }}>
                    {run.dryRunRequested
                      ? `${run.due ?? 0} class${run.due === 1 ? '' : 'es'} queued, out of ${run.candidates ?? 0} with a recording. Room for ${run.quotaRemaining ?? 0} more upload${run.quotaRemaining === 1 ? '' : 's'} today.`
                      : `Started ${run.started ?? 0}, resumed ${run.resumed ?? 0}, finished ${run.completed ?? 0}, part done ${run.partial ?? 0}.`}
                  </Alert>
                  {run.promoted ? (
                    <Alert severity="info" sx={{ borderRadius: 2, mb: 1 }}>
                      {run.promoted} video{run.promoted === 1 ? '' : 's'} you flipped off private
                      went into the Library.
                    </Alert>
                  ) : null}
                  {Object.entries(run.reasons || {}).map(([reason, count]) => (
                    <Alert key={reason} severity="warning" sx={{ borderRadius: 2, mb: 1 }}>
                      {REASON_HELP[reason] || reason} ({count})
                    </Alert>
                  ))}
                </>
              )}

              {/* Only offered after a dry run has shown what would happen. A real
                  run is the expensive one, so it must never be the first button
                  anybody reaches for. */}
              {run.dryRunRequested && (run.due ?? 0) > 0 && (
                <Button
                  variant="contained"
                  onClick={() => void runSweep(false)}
                  disabled={busy !== null}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, minHeight: 44 }}
                >
                  Upload one now, for real
                </Button>
              )}
            </Box>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Uploads land private until Google&apos;s compliance audit passes. Each one shows in the
            class panel with a link into Studio, and flipping it to Unlisted there is what publishes
            it to the student Library.
          </Typography>

          {/* The list the dry run's count refers to. Shown whether or not an
              account is connected: seeing what is waiting is the reason somebody
              connects one. */}
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              Every recorded class
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              A class already on the channel is left alone. To mark one, paste its link in the class
              panel and the backup skips it from then on.
            </Typography>
            <YouTubeBacklogTable getToken={getToken} refreshKey={backlogKey} />
          </Box>
        </>
      )}
    </Paper>
  );
}
