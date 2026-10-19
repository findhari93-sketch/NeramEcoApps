'use client';

/**
 * "Phone alerts": turn on Web Push for this device so a new sign-up (name,
 * phone, how they reached us, approximate place) pops up on the phone.
 *
 * Permission is asked only when the staff member taps the button. On iPhone,
 * Web Push works only inside the app added to the Home Screen, so Safari in a
 * tab gets the install steps instead of a button that cannot work.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, IconButton, Paper, Skeleton, Stack, Typography } from '@neram/ui';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import NotificationsOffOutlinedIcon from '@mui/icons-material/NotificationsOffOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import ComputerOutlinedIcon from '@mui/icons-material/ComputerOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface Device {
  id: string;
  endpoint: string;
  device_label: string | null;
  created_at: string;
  last_success_at: string | null;
  failure_count: number;
}

type Status =
  | 'checking'
  | 'unsupported'
  | 'ios-install'
  | 'no-worker'
  | 'server-off'
  | 'blocked'
  | 'off'
  | 'on';

/** The VAPID public key (base64url) as the bytes PushManager.subscribe wants. */
function vapidKeyBytes(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

/** "Android phone, Chrome", "iPhone", "Windows, Edge". */
function deviceLabel(): string {
  const ua = navigator.userAgent;
  const device = /iphone/i.test(ua)
    ? 'iPhone'
    : /ipad/i.test(ua)
      ? 'iPad'
      : /android/i.test(ua)
        ? 'Android phone'
        : /windows/i.test(ua)
          ? 'Windows'
          : /mac os/i.test(ua)
            ? 'Mac'
            : 'Device';
  const browser = /edg\//i.test(ua) ? 'Edge' : /chrome\//i.test(ua) ? 'Chrome' : /firefox\//i.test(ua) ? 'Firefox' : /safari\//i.test(ua) ? 'Safari' : null;
  return browser && !/iphone|ipad/i.test(device) ? `${device}, ${browser}` : device;
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  const found = await navigator.serviceWorker.getRegistration();
  if (!found) return null;
  // Wait for an installing worker, but never hang the card on it.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((resolve) => setTimeout(() => resolve(found), 3000)),
  ]);
}

export default function PhoneAlertsCard() {
  const [status, setStatus] = useState<Status>('checking');
  const [devices, setDevices] = useState<Device[]>([]);
  const [thisEndpoint, setThisEndpoint] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<'on' | 'off' | 'test' | string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    let list: Device[] = [];
    let key: string | null = null;
    try {
      const res = await fetch('/api/push/subscriptions', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        list = json.devices ?? [];
        key = json.publicKey ?? null;
      }
    } catch {
      // The status below still tells the person what this device can do.
    }
    setDevices(list);
    setPublicKey(key);

    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) {
      setStatus(isIos() && !isStandalone() ? 'ios-install' : 'unsupported');
      return;
    }
    if (isIos() && !isStandalone()) {
      setStatus('ios-install');
      return;
    }
    if (!key) {
      setStatus('server-off');
      return;
    }
    const registration = await getRegistration().catch(() => null);
    if (!registration) {
      setStatus('no-worker');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('blocked');
      return;
    }
    const sub = await registration.pushManager.getSubscription().catch(() => null);
    setThisEndpoint(sub?.endpoint ?? null);
    setStatus(sub && list.some((d) => d.endpoint === sub.endpoint) ? 'on' : 'off');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const turnOn = async () => {
    if (!publicKey) return;
    setBusy('on');
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      const registration = await getRegistration();
      if (!registration) {
        setStatus('no-worker');
        return;
      }
      let sub = await registration.pushManager.getSubscription();
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyBytes(publicKey),
        });
      }
      const json = sub.toJSON();
      const res = await fetch('/api/push/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, label: deviceLabel() }),
      });
      if (!res.ok) throw new Error('save failed');
      setMessage({ type: 'success', text: 'Alerts are on for this device. Send a test alert to check.' });
      await load();
    } catch {
      setMessage({ type: 'error', text: 'Could not turn on alerts. Check your connection and try again.' });
    } finally {
      setBusy(null);
    }
  };

  const removeDevice = async (device: Device) => {
    setBusy(device.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/push/subscriptions?id=${encodeURIComponent(device.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('remove failed');
      if (device.endpoint === thisEndpoint) {
        const registration = await getRegistration().catch(() => null);
        const sub = await registration?.pushManager.getSubscription().catch(() => null);
        await sub?.unsubscribe().catch(() => false);
      }
      await load();
    } catch {
      setMessage({ type: 'error', text: 'Could not remove that device. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async () => {
    setBusy('test');
    setMessage(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Test failed');
      const { sent = 0, devices: total = 0 } = json.result ?? {};
      setMessage(
        sent > 0
          ? { type: 'success', text: `Test alert sent to ${sent} of ${total} device${total === 1 ? '' : 's'}. It should appear in a few seconds.` }
          : { type: 'error', text: 'No device accepted the test alert. Turn alerts off and on again on this device.' },
      );
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setBusy(null);
    }
  };

  const thisDevice = devices.find((d) => d.endpoint === thisEndpoint);
  const thisDeviceOn = status === 'on' && !!thisDevice;

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, mb: 3, borderRadius: 2 }} component="section" aria-labelledby="phone-alerts-title">
      <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2 }}>
        <NotificationsActiveOutlinedIcon color="primary" sx={{ mt: 0.25 }} aria-hidden />
        <Box sx={{ minWidth: 0 }}>
          <Typography id="phone-alerts-title" variant="h6" component="h2" fontWeight={700}>
            Phone alerts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Get a notification the moment a new student signs up: their phone number, how they reached us (Google Ads,
            Google search, ChatGPT and more) and their approximate city and state. Tap it to open their profile. You
            are also alerted when someone is stuck at phone sign-in for 10 minutes, with the likely reason.
          </Typography>
        </Box>
      </Stack>

      {status === 'checking' && (
        <Stack spacing={1} aria-busy="true" aria-label="Checking this device">
          <Skeleton variant="rounded" height={48} />
          <Skeleton variant="text" width="60%" />
        </Stack>
      )}

      {status === 'ios-install' && (
        <Alert severity="info" icon={<PhoneIphoneOutlinedIcon />}>
          On iPhone, alerts work only in the installed app. In Safari, tap Share, then Add to Home Screen. Open Neram Admin
          from your Home Screen and come back to this page.
        </Alert>
      )}

      {status === 'unsupported' && (
        <Alert severity="info" icon={<InfoOutlinedIcon />}>
          This browser cannot show alerts. Use Chrome or Edge on Android or a computer, or the installed app on iPhone.
        </Alert>
      )}

      {status === 'no-worker' && (
        <Alert severity="info" icon={<InfoOutlinedIcon />}>
          Alerts need the installed admin app. Reload this page once; if this message stays, you are on a local
          development build, where alerts are switched off.
        </Alert>
      )}

      {status === 'server-off' && (
        <Alert severity="info" icon={<InfoOutlinedIcon />}>
          Phone alerts are not set up on the server yet: the alert keys (VAPID) still need to be added to the apps on Vercel.
        </Alert>
      )}

      {status === 'blocked' && (
        <Alert severity="warning" icon={<BlockOutlinedIcon />}>
          Notifications are blocked for this site. Open the browser&apos;s site settings for admin.neramclasses.com (on
          Android: the lock icon next to the address, then Permissions), allow Notifications, then reload.
        </Alert>
      )}

      {(status === 'off' || status === 'on') && (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            {thisDeviceOn ? (
              <NotificationsActiveOutlinedIcon color="success" fontSize="small" aria-hidden />
            ) : (
              <NotificationsOffOutlinedIcon color="action" fontSize="small" aria-hidden />
            )}
            <Typography variant="body1" fontWeight={600}>
              {thisDeviceOn ? 'On for this device' : 'Off for this device'}
            </Typography>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {thisDeviceOn ? (
              <>
                <Button variant="contained" onClick={sendTest} disabled={busy !== null} sx={{ minHeight: 48 }}>
                  {busy === 'test' ? 'Sending...' : 'Send a test alert'}
                </Button>
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={() => thisDevice && removeDevice(thisDevice)}
                  disabled={busy !== null}
                  sx={{ minHeight: 48 }}
                >
                  {busy === thisDevice?.id ? 'Turning off...' : 'Turn off on this device'}
                </Button>
              </>
            ) : (
              <Button variant="contained" onClick={turnOn} disabled={busy !== null} sx={{ minHeight: 48 }}>
                {busy === 'on' ? 'Turning on...' : 'Turn on alerts on this device'}
              </Button>
            )}
          </Stack>
        </Stack>
      )}

      {message && (
        <Alert severity={message.type} sx={{ mt: 2 }} role="status" onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {devices.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle2" component="h3" fontWeight={700} sx={{ mb: 1 }}>
            Your devices
          </Typography>
          <Stack component="ul" spacing={1} sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {devices.map((d) => {
              const isPhone = /iphone|ipad|android/i.test(d.device_label ?? '');
              const isThis = d.endpoint === thisEndpoint;
              const lastAlert = shortDate(d.last_success_at);
              return (
                <Stack
                  key={d.id}
                  component="li"
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, pl: 1.5, pr: 0.5, py: 0.5, minHeight: 56 }}
                >
                  {isPhone ? <PhoneIphoneOutlinedIcon color="action" aria-hidden /> : <ComputerOutlinedIcon color="action" aria-hidden />}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {d.device_label || 'Device'}
                      {isThis ? ' (this device)' : ''}
                    </Typography>
                    <Typography variant="caption" color={d.failure_count > 0 ? 'error' : 'text.secondary'}>
                      {d.failure_count > 0
                        ? `Last ${d.failure_count} alert${d.failure_count === 1 ? '' : 's'} failed`
                        : lastAlert
                          ? `Added ${shortDate(d.created_at)}, last alert ${lastAlert}`
                          : `Added ${shortDate(d.created_at)}`}
                    </Typography>
                  </Box>
                  <IconButton
                    aria-label={`Remove ${d.device_label || 'device'}`}
                    onClick={() => removeDevice(d)}
                    disabled={busy !== null}
                    sx={{ width: 48, height: 48 }}
                  >
                    <DeleteOutlineIcon />
                  </IconButton>
                </Stack>
              );
            })}
          </Stack>
        </Box>
      )}
    </Paper>
  );
}
