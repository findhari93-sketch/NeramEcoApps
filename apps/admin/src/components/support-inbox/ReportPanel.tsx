'use client';

/**
 * What the reporter captured: their words, the page, the likely file, the
 * device, screenshots (with a keyboard-friendly lightbox), the console log and
 * any "still happening" snapshots. Everything shown is scrubbed of secrets.
 */
import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Chip, Collapse, Dialog, IconButton, Link, Tooltip, Typography } from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { SupportTicketDetail } from '@neram/database';
import {
  deviceLine,
  formatIst,
  guessSourceFiles,
  normalizeConsoleEntries,
  reopenSnapshotsOf,
  scrubSecrets,
  type ConsoleEntry,
} from '@/lib/support-inbox/report-markdown';
import { normalizeScreenshotUrl, screenshotUrlsOf } from '@/lib/support-inbox/screenshots';
import { usePrefersReducedMotion } from '@/components/ops/OpsUi';
import { Section, WARNING_CHIP_SX } from './bits';

const APP_ORIGINS: Record<string, string> = {
  app: process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com',
  nexus: process.env.NEXT_PUBLIC_NEXUS_URL || 'https://nexus.neramclasses.com',
  marketing: process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com',
};

/** An absolute link for a reported page, or null when it is not a URL. */
export function pageHref(sourceApp: string | null, pageUrl: string | null): string | null {
  if (!pageUrl) return null;
  if (/^https?:\/\//i.test(pageUrl)) return pageUrl;
  if (!pageUrl.startsWith('/')) return null;
  return `${(APP_ORIGINS[sourceApp || 'app'] || APP_ORIGINS.app).replace(/\/+$/, '')}${pageUrl}`;
}

const LEVEL_COLOR: Record<ConsoleEntry['level'], 'error' | 'warning' | 'default'> = { error: 'error', warn: 'warning', log: 'default' };

export function ConsoleLogList({ raw, title = 'Console' }: { raw: unknown; title?: string }) {
  const entries = normalizeConsoleEntries(raw);
  const reduce = usePrefersReducedMotion();
  const [open, setOpen] = useState(entries.length > 0 && entries.length <= 5);
  const [stack, setStack] = useState<number | null>(null);
  const errors = entries.filter((e) => e.level === 'error').length;

  if (entries.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No console errors were captured.
      </Typography>
    );
  }

  return (
    <Box>
      <Button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        sx={{ minHeight: 44, fontWeight: 600, px: 1, color: 'text.primary' }}
      >
        {title}: {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        {errors > 0 ? `, ${errors} ${errors === 1 ? 'error' : 'errors'}` : ''}
      </Button>
      <Collapse in={open} timeout={reduce ? 0 : 'auto'}>
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1 }}>
          {entries.map((e, i) => (
            <Box component="li" key={i} sx={{ border: 1, borderColor: 'divider', borderRadius: 1.5, p: 1, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <Chip
                  size="small"
                  color={e.level === 'warn' ? 'default' : LEVEL_COLOR[e.level]}
                  label={e.level}
                  sx={{ height: 20, fontSize: 11, fontWeight: 700, flexShrink: 0, ...(e.level === 'warn' ? WARNING_CHIP_SX : {}) }}
                />
                {e.status ? <Chip size="small" variant="outlined" label={`HTTP ${e.status}`} sx={{ height: 20, fontSize: 11, flexShrink: 0 }} /> : null}
                <Box
                  component="pre"
                  sx={{ m: 0, flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'text.primary' }}
                >
                  {e.message}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mt: 0.5, flexWrap: 'wrap' }}>
                {e.at && (
                  <Typography component="span" sx={{ fontSize: 11, color: 'text.secondary' }}>
                    {formatIst(e.at)}
                  </Typography>
                )}
                {e.url && !e.message.includes(e.url) && (
                  <Typography component="span" sx={{ fontSize: 11, color: 'text.secondary', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {e.url}
                  </Typography>
                )}
                {e.stack && (
                  <Button size="small" onClick={() => setStack(stack === i ? null : i)} aria-expanded={stack === i} sx={{ minHeight: 44, fontSize: 12 }}>
                    {stack === i ? 'Hide stack' : 'Show stack'}
                  </Button>
                )}
              </Box>
              {e.stack && stack === i && (
                <Box component="pre" sx={{ m: 0, mt: 0.5, p: 1, bgcolor: 'background.paper', borderRadius: 1, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 260, overflow: 'auto' }}>
                  {e.stack}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

export function ScreenshotGallery({ urls, label }: { urls: string[]; label: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const go = useCallback((d: 1 | -1) => setIndex((i) => (i === null ? i : (i + d + urls.length) % urls.length)), [urls.length]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go]);

  if (urls.length === 0) return null;
  return (
    <>
      <Box role="list" aria-label={label} sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {urls.map((url, i) => (
          <Box
            role="listitem"
            key={url}
            component="button"
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Open screenshot ${i + 1} of ${urls.length}`}
            sx={{
              all: 'unset',
              cursor: 'zoom-in',
              width: 120,
              height: 90,
              borderRadius: 1.5,
              overflow: 'hidden',
              border: 1,
              borderColor: 'divider',
              bgcolor: 'grey.100',
              '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Screenshot ${i + 1}`} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </Box>
        ))}
      </Box>
      <Dialog open={index !== null} onClose={() => setIndex(null)} maxWidth="lg" fullWidth aria-label={`Screenshot ${index !== null ? index + 1 : ''} of ${urls.length}`}>
        {index !== null && (
          <Box sx={{ position: 'relative', bgcolor: 'grey.900', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.5, color: 'common.white' }}>
              <Typography sx={{ fontSize: 13, flex: 1, pl: 1 }}>
                Screenshot {index + 1} of {urls.length}
                {urls.length > 1 ? ' (arrow keys move)' : ''}
              </Typography>
              <Tooltip title="Open the original">
                <IconButton component="a" href={urls[index]} target="_blank" rel="noopener noreferrer" aria-label="Open the original image in a new tab" sx={{ color: 'common.white', width: 44, height: 44 }}>
                  <OpenInNewIcon />
                </IconButton>
              </Tooltip>
              <IconButton onClick={() => setIndex(null)} aria-label="Close" autoFocus sx={{ color: 'common.white', width: 44, height: 44 }}>
                <CloseIcon />
              </IconButton>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, maxHeight: '80vh', overflow: 'auto', p: 1 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[index]} alt={`Screenshot ${index + 1}`} style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain' }} />
            </Box>
            {urls.length > 1 && (
              <>
                <IconButton onClick={() => go(-1)} aria-label="Previous screenshot" sx={{ position: 'absolute', left: 8, top: '50%', bgcolor: 'background.paper', width: 44, height: 44, '&:hover': { bgcolor: 'grey.200' } }}>
                  <ChevronLeftIcon />
                </IconButton>
                <IconButton onClick={() => go(1)} aria-label="Next screenshot" sx={{ position: 'absolute', right: 8, top: '50%', bgcolor: 'background.paper', width: 44, height: 44, '&:hover': { bgcolor: 'grey.200' } }}>
                  <ChevronRightIcon />
                </IconButton>
              </>
            )}
          </Box>
        )}
      </Dialog>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '110px minmax(0,1fr)' }, gap: { xs: 0.25, sm: 1.5 }, py: 0.75 }}>
      <Typography component="span" sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 600 }}>
        {label}
      </Typography>
      <Box sx={{ fontSize: 14, minWidth: 0, wordBreak: 'break-word' }}>{children}</Box>
    </Box>
  );
}

export function ReportPanel({ ticket }: { ticket: SupportTicketDetail }) {
  const href = pageHref(ticket.source_app, ticket.page_url);
  const files = guessSourceFiles(ticket.source_app, ticket.page_url);
  const device = deviceLine(ticket.device_info);
  const shots = screenshotUrlsOf(ticket);
  const reopens = reopenSnapshotsOf(ticket).slice().reverse();
  const description = ticket.description?.trim() && ticket.description.trim() !== ticket.subject.trim() ? ticket.description.trim() : null;

  return (
    <Section title="Report">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box>
          <Typography component="p" sx={{ fontSize: 15, fontWeight: 600, m: 0 }}>
            {ticket.subject}
          </Typography>
          {description && (
            <Typography component="p" sx={{ fontSize: 14, whiteSpace: 'pre-wrap', mt: 0.75, mb: 0, color: 'text.primary', lineHeight: 1.6 }}>
              {description}
            </Typography>
          )}
        </Box>

        <Box>
          {ticket.page_url && (
            <Row label="Page">
              {href ? (
                <Link href={href} target="_blank" rel="noopener noreferrer" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 32, wordBreak: 'break-all' }}>
                  {scrubSecrets(ticket.page_url)}
                  <OpenInNewIcon sx={{ fontSize: 14 }} aria-hidden />
                </Link>
              ) : (
                scrubSecrets(ticket.page_url)
              )}
            </Row>
          )}
          {files.length > 0 && (
            <Row label={files.length > 1 ? 'Likely file, one of' : 'Likely file'}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {files.map((f) => (
                  <Box key={f} component="code" sx={{ fontFamily: 'monospace', fontSize: 12, bgcolor: 'grey.100', px: 0.75, py: 0.25, borderRadius: 1, width: 'fit-content', maxWidth: '100%', wordBreak: 'break-all' }}>
                    {f}
                  </Box>
                ))}
              </Box>
            </Row>
          )}
          {device && <Row label="Device">{device}</Row>}
          <Row label="Reported">{formatIst(ticket.created_at)} IST</Row>
        </Box>

        {shots.length > 0 && (
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary', mb: 0.75 }}>Screenshots ({shots.length})</Typography>
            <ScreenshotGallery urls={shots} label="Screenshots" />
          </Box>
        )}

        <ConsoleLogList raw={ticket.console_logs} />

        {reopens.map((r, i) => (
          <Box key={`${r.at}-${i}`} sx={{ borderLeft: 3, borderColor: 'error.main', pl: 1.5, py: 0.5 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Still happening, {formatIst(r.at)} IST</Typography>
            {r.reason && <Typography sx={{ fontSize: 14, whiteSpace: 'pre-wrap', my: 0.5 }}>{r.reason}</Typography>}
            {r.page_url && <Row label="Sent from">{scrubSecrets(r.page_url)}</Row>}
            {deviceLine(r.device_info) && <Row label="Device">{deviceLine(r.device_info)}</Row>}
            {(r.screenshot_urls || []).length > 0 && (
              <Box sx={{ my: 1 }}>
                <ScreenshotGallery urls={(r.screenshot_urls || []).map((u) => normalizeScreenshotUrl(u))} label="Screenshots at reopen" />
              </Box>
            )}
            <ConsoleLogList raw={r.console_logs} title="Console at reopen" />
          </Box>
        ))}
      </Box>
    </Section>
  );
}
