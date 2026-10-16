import type { ReactNode } from 'react';
import Image from 'next/image';
import { Box, Typography } from '@neram/ui';
import { tokens as t, v } from './tokens';

export interface PersonCardProps {
  name: string;
  /** Shown before the name (Ar., Dr.) but kept out of the initials. */
  honorific?: string;
  role?: ReactNode;
  detail?: ReactNode;
  photo?: string | null;
  /** Avatar size in px (default 52). */
  size?: number;
  /** Extra lines under the header row (bio, links). */
  children?: ReactNode;
}

export function initials(name: string): string {
  // A title written into the name ("Ar. Ramesh Kumar") never counts as an initial.
  const parts = name.trim().replace(/^(Ar|Dr|Mr|Ms|Mrs|Prof)\.\s*/i, '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Faculty and team cards. Without a photo the avatar is initials on navy700
 * (one colour for everyone, replacing the random AVATAR_COLORS).
 */
export default function PersonCard({ name, honorific, role, detail, photo, size = 52, children }: PersonCardProps) {
  const fullName = [honorific, name].filter(Boolean).join(' ');
  return (
    <Box
      sx={{
        bgcolor: v.card,
        border: `1px solid ${v.line}`,
        borderRadius: `${t.radius}px`,
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        color: v.fg,
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.75, alignItems: 'center' }}>
        <Box
          aria-hidden={!photo}
          sx={{
            width: size,
            height: size,
            borderRadius: '50%',
            overflow: 'hidden',
            position: 'relative',
            flexShrink: 0,
            bgcolor: t.navy700,
            color: t.paper,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: size >= 56 ? '1.125rem' : '1rem',
          }}
        >
          {photo ? <Image src={photo} alt={fullName} fill sizes={`${size}px`} style={{ objectFit: 'cover' }} /> : initials(name)}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
          <Typography component="strong" sx={{ fontSize: '1rem', fontWeight: 700 }}>
            {fullName}
          </Typography>
          {role && (
            <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 600, color: v.eyebrow }}>
              {role}
            </Typography>
          )}
          {detail && (
            <Typography component="span" sx={{ fontSize: '0.875rem', color: v.muted }}>
              {detail}
            </Typography>
          )}
        </Box>
      </Box>
      {children}
    </Box>
  );
}
