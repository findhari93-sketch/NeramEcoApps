'use client';

import { useState } from 'react';
import { Button } from '@neram/ui';
import ShareRoundedIcon from '@mui/icons-material/ShareRounded';
import { shareTextFor, type AskCard } from '@/lib/ask/cards';

/**
 * Share a result with a friend or a parent: the phone's own share sheet
 * (WhatsApp, Telegram, Messages) where there is one, otherwise WhatsApp in a
 * new tab. The link opens the tool with the same values filled in, which is
 * how a shared result brings the next student in.
 */
export default function ShareResultButton({ card }: { card: AskCard }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = new URL(card.href, window.location.origin).toString();
    const text = shareTextFor(card);
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'aiArchitek', text, url });
        return;
      } catch (err) {
        // Closing the sheet is not an error worth showing.
        if ((err as Error)?.name === 'AbortError') return;
      }
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
    const opened = window.open(wa, '_blank', 'noopener,noreferrer');
    if (!opened) {
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // Nothing else to try; the link is still on the card.
      }
    }
  };
  return (
    <Button
      onClick={share}
      size="small"
      startIcon={<ShareRoundedIcon />}
      aria-label="Share this result"
      sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
    >
      {copied ? 'Link copied' : 'Share'}
    </Button>
  );
}
