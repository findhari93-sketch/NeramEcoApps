'use client';

import { useState } from 'react';
import { Box, IconButton, Menu, MenuItem, Typography, ListItemText } from '@neram/ui';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import type { TextTrackDescriptor } from '../types';

/**
 * Speed and captions in one gear, the way every video app arranges them.
 *
 * There is no quality section, and that is a decision rather than an omission.
 * The proxied path serves one progressive MP4 with no alternate renditions, and
 * on the YouTube path `setPlaybackQuality` is advisory: YouTube's own adaptive
 * switching overrides it within seconds and `getPlaybackQuality` then disagrees
 * with what was set. A menu that reports a quality nobody is receiving is worse
 * than no menu. Real switching would need HLS renditions of the SharePoint
 * originals, at which point Html5Surface is the single place to add it.
 *
 * Rates above the gate's ceiling are shown but locked rather than hidden, so a
 * student can see that finishing the checkpoint gives something back.
 */

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

export interface SettingsMenuProps {
  speed: number;
  maxRate: number;
  onSpeedChange: (speed: number) => void;
  tracks: ReadonlyArray<TextTrackDescriptor>;
  activeTrack: string | null;
  onTrackChange: (id: string | null) => void;
  /** Keeps the menu inside the fullscreen subtree. */
  container?: HTMLElement | null;
}

export default function SettingsMenu({
  speed,
  maxRate,
  onSpeedChange,
  tracks,
  activeTrack,
  onTrackChange,
  container,
}: SettingsMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <IconButton
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label="Playback settings"
        aria-haspopup="menu"
        sx={{ color: '#fff', width: 48, height: 48 }}
      >
        <SettingsRoundedIcon sx={{ fontSize: 22 }} />
      </IconButton>

      <Menu
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        container={container ?? undefined}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        PaperProps={{ sx: { bgcolor: 'rgba(20,20,20,0.96)', color: '#fff', minWidth: 200 } }}
      >
        <Typography sx={{ px: 2, pt: 1, pb: 0.5, fontSize: 11, opacity: 0.6, fontWeight: 800, letterSpacing: 0.6 }}>
          SPEED
        </Typography>
        {SPEEDS.map((s) => {
          const locked = s > maxRate;
          return (
            <MenuItem
              key={s}
              disabled={locked}
              onClick={() => {
                onSpeedChange(s);
                setAnchor(null);
              }}
              sx={{ minHeight: 44, '&.Mui-disabled': { opacity: 0.4 } }}
            >
              <Box sx={{ width: 24, display: 'flex', alignItems: 'center' }}>
                {speed === s && <CheckRoundedIcon sx={{ fontSize: 16 }} />}
                {locked && <LockRoundedIcon sx={{ fontSize: 14 }} />}
              </Box>
              <ListItemText
                primaryTypographyProps={{ fontSize: 14 }}
                primary={s === 1 ? 'Normal' : `${s}x`}
              />
            </MenuItem>
          );
        })}

        {tracks.length > 0 && (
          <>
            <Typography sx={{ px: 2, pt: 1.5, pb: 0.5, fontSize: 11, opacity: 0.6, fontWeight: 800, letterSpacing: 0.6 }}>
              SUBTITLES
            </Typography>
            <MenuItem
              onClick={() => {
                onTrackChange(null);
                setAnchor(null);
              }}
              sx={{ minHeight: 44 }}
            >
              <Box sx={{ width: 24 }}>{activeTrack === null && <CheckRoundedIcon sx={{ fontSize: 16 }} />}</Box>
              <ListItemText primaryTypographyProps={{ fontSize: 14 }} primary="Off" />
            </MenuItem>
            {tracks.map((t) => (
              <MenuItem
                key={t.id}
                onClick={() => {
                  onTrackChange(t.id);
                  setAnchor(null);
                }}
                sx={{ minHeight: 44 }}
              >
                <Box sx={{ width: 24 }}>{activeTrack === t.id && <CheckRoundedIcon sx={{ fontSize: 16 }} />}</Box>
                <ListItemText primaryTypographyProps={{ fontSize: 14 }} primary={t.label} />
              </MenuItem>
            ))}
          </>
        )}
      </Menu>
    </>
  );
}
