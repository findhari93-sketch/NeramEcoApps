'use client';

import { useState } from 'react';
import { Box, Chip, Collapse, Typography } from '@neram/ui';
import ButtonBase from '@mui/material/ButtonBase';
import PhoneIcon from '@mui/icons-material/Phone';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { DemoFollowUpAttempt } from '@neram/database';
import { FOLLOW_UP_TOPIC_LABELS } from '@neram/database/demo-follow-up';
import { formatDemoDateTime } from '@neram/database/demo-schedule';

/** What an attempt came to, in a few words. */
export function attemptLabel(a: Pick<DemoFollowUpAttempt, 'outcome' | 'channel'>): string {
  const whatsapp = a.channel === 'whatsapp';
  switch (a.outcome) {
    case 'message_sent':
      return 'Sent a message';
    case 'not_picked_up':
      return whatsapp ? 'No reply' : 'No answer';
    case 'thinking':
      return whatsapp ? 'Replied: thinking it over' : 'Thinking it over';
    case 'will_join':
      return whatsapp ? 'Replied: will join' : 'Will join on a date';
    case 'not_interested':
      return whatsapp ? 'Replied: not interested' : 'Not interested';
    case 'joined':
      return whatsapp ? 'Replied: joined' : 'Joined';
    default:
      return a.outcome.replace(/_/g, ' ');
  }
}

function Row({ a }: { a: DemoFollowUpAttempt }) {
  const [open, setOpen] = useState(false);
  const hasText = !!(a.message_sent || a.reply || a.comments);
  const Icon = a.channel === 'whatsapp' ? WhatsAppIcon : PhoneIcon;
  const head = (
    <Box sx={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 1, alignItems: 'start', width: '100%', textAlign: 'left' }}>
      <Icon aria-label={a.channel === 'whatsapp' ? 'WhatsApp' : 'Call'} sx={{ fontSize: 18, mt: 0.25, color: a.channel === 'whatsapp' ? 'success.dark' : 'text.secondary' }} />
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2" fontWeight={600}>{attemptLabel(a)}</Typography>
          {a.topic && <Chip size="small" variant="outlined" label={FOLLOW_UP_TOPIC_LABELS[a.topic]} />}
        </Box>
        <Typography variant="caption" color="text.secondary">
          {formatDemoDateTime(new Date(a.attempted_at))}, {a.admin_name}
        </Typography>
      </Box>
      {hasText && (
        <ExpandMoreIcon aria-hidden sx={{ fontSize: 20, mt: 0.25, color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }} />
      )}
    </Box>
  );
  return (
    <Box component="li" sx={{ borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      {hasText ? (
        <ButtonBase
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          sx={{ width: '100%', minHeight: 44, py: 1, px: 0.5, borderRadius: 1, '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' } }}
        >
          {head}
        </ButtonBase>
      ) : (
        <Box sx={{ py: 1, px: 0.5 }}>{head}</Box>
      )}
      {hasText && (
        <Collapse in={open} unmountOnExit>
          <Box sx={{ pl: 4, pr: 0.5, pb: 1.5, display: 'grid', gap: 1 }}>
            {a.message_sent && <Quote label="We sent" text={a.message_sent} />}
            {a.reply && <Quote label="They replied" text={a.reply} />}
            {a.comments && (
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                {a.comments}
              </Typography>
            )}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

function Quote({ label, text }: { label: string; text: string }) {
  return (
    <Box sx={{ borderLeft: 3, borderColor: 'divider', pl: 1.5 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>{label}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{text}</Typography>
    </Box>
  );
}

/** Every call and WhatsApp message on this demo's follow-ups, newest first; tap one to read what was said. */
export default function FollowUpHistory({ attempts }: { attempts: DemoFollowUpAttempt[] }) {
  if (!attempts.length) return null;
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
        Follow-up history ({attempts.length})
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {attempts.map((a) => (
          <Row key={a.id} a={a} />
        ))}
      </Box>
    </Box>
  );
}
